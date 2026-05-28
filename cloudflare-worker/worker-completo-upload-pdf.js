// archivo: cloudflare/worker.js
// Worker para Work and Travel RD
// - /upload: subir imágenes a Cloudflare R2
// - /delete: eliminar imágenes de R2
// - /send-forum-email: enviar correos no críticos con Sender
// - /upload-pdf: proxy CORS hacia Google Apps Script para guardar PDFs en Google Drive
// - /: prueba del Worker

const DEFAULT_PDF_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzg3ZAXDTdH7rDx9YTxq0eXSfeyY2hFM7xlgfenb1KmTPlbvCehIE7LXlY7s8FHD7hczg/exec";

// Mapa por defecto para varias cuentas de Google Drive.
// También puedes sobrescribirlo desde la variable de entorno PDF_APPS_SCRIPT_URLS.
const DEFAULT_PDF_APPS_SCRIPT_URLS = {
  principal: "https://script.google.com/macros/s/AKfycbzg3ZAXDTdH7rDx9YTxq0eXSfeyY2hFM7xlgfenb1KmTPlbvCehIE7LXlY7s8FHD7hczg/exec",
  drive1: "https://script.google.com/macros/s/AKfycbwvaXJJOits_bpyyoYupUzgUmBLsJ7tSf5seXyMQ3X_MTLCSm-KDSFEhlnyz7EFoM2Lfg/exec",
  drive2: "https://script.google.com/macros/s/AKfycbzKf8x7l-GL4ftI2mIBcUHhXx65hteN640AXA5ZjfAOAD_e8Hkuw8PlWPcIqLb2o0wR_w/exec",
  drive3: "https://script.google.com/macros/s/AKfycbyeYP_sJawSJ7wLESDs1lXIbXeQOBX21qJUcvZWuZlE40OA1t9Xofzhfien-tvNaTCl/exec"
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://workandtravelrd.peguerocrespo.com",
  "https://pegueroedison.github.io",
  "https://peguerocrespo.com",
  "https://www.peguerocrespo.com"
];

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
  const allowOrigin = allowed.includes("*") ? "*" : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...cors
    }
  });
}

function parsePdfScriptMap(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {}
  return raw.split(",").reduce((acc, part) => {
    const [key, ...rest] = part.split("=");
    const id = String(key || "").trim();
    const url = rest.join("=").trim();
    if (id && url) acc[id] = url;
    return acc;
  }, {});
}

function cleanFileName(name = "image") {
  return String(name)
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "image";
}

function getExtensionFromMime(mime = "") {
  const type = String(mime).toLowerCase();
  if (type.includes("webp")) return "webp";
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("gif")) return "gif";
  return "jpg";
}

function cleanPath(value = "") {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/\.\.+/g, "")
    .replace(/[^a-zA-Z0-9/_.,=-]/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .slice(0, 260);
}

function normalizeFolder(folder = "") {
  const raw = String(folder || "").replace(/^\/+/, "").split("/")[0];
  const allowed = new Set([
    "profile-photos",
    "forum-posts",
    "forum-comments",
    "hero-images",
    "announcements",
    "courses",
    "services",
    "site-assets"
  ]);
  return allowed.has(raw) ? raw : "";
}

async function getUserFromSupabase(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: auth,
        apikey: env.SUPABASE_ANON_KEY
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}


async function getUserRoleFromSupabase(userId, request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!userId || !auth.toLowerCase().startsWith("bearer ")) return "user";
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return "user";

  try {
    const url = `${String(env.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/user_profiles?select=role&id=eq.${encodeURIComponent(userId)}&limit=1`;
    const res = await fetch(url, {
      headers: {
        Authorization: auth,
        apikey: env.SUPABASE_ANON_KEY,
        Accept: "application/json"
      }
    });
    if (!res.ok) return "user";
    const rows = await res.json();
    return String(rows?.[0]?.role || "user").toLowerCase();
  } catch (_) {
    return "user";
  }
}

function isAdminRole(role = "") {
  return ["moderator", "moderador", "admin", "superadmin"].includes(String(role || "").toLowerCase());
}

async function handleUpload(request, env, cors) {
  const bucket = env.MEDIA_BUCKET;
  if (!bucket) return json({ ok: false, error: "No está conectado el bucket R2. Revisa el binding MEDIA_BUCKET." }, 500, cors);

  const user = await getUserFromSupabase(request, env);
  if (!user?.id) return json({ ok: false, error: "Debes iniciar sesión para subir imágenes." }, 401, cors);

  let form;
  try {
    form = await request.formData();
  } catch (_) {
    return json({ ok: false, error: "La solicitud debe enviarse como FormData." }, 400, cors);
  }

  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return json({ ok: false, error: "No se recibió imagen." }, 400, cors);

  const allowedTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
  const mime = file.type || String(form.get("content_type") || "image/jpeg");
  if (!allowedTypes.has(mime)) return json({ ok: false, error: "Solo se permiten imágenes JPG, PNG, WebP o GIF." }, 400, cors);

  const maxSize = Number(env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024);
  if (file.size > maxSize) {
    return json({ ok: false, error: `La imagen pesa demasiado. Máximo permitido: ${Math.round(maxSize / 1024 / 1024)} MB.` }, 413, cors);
  }

  const requestedPath = cleanPath(form.get("path") || "");
  const folder = normalizeFolder(form.get("folder") || requestedPath || form.get("asset_kind") || "");
  if (!folder) {
    return json({ ok: false, error: "Carpeta no permitida. Usa profile-photos, forum-posts, forum-comments, hero-images, announcements, courses, services o site-assets." }, 400, cors);
  }
  const originalName = cleanFileName(file.name || "image");
  const ext = getExtensionFromMime(mime);
  const now = new Date();
  const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const safeRequestedPath = requestedPath && requestedPath.startsWith(`${folder}/`) ? requestedPath : "";
  const key = safeRequestedPath || `${folder}/${datePath}/${user.id}/${crypto.randomUUID()}-${originalName}.${ext}`;

  let body;
  try {
    body = await file.arrayBuffer();
  } catch (_) {
    return json({ ok: false, error: "No se pudo leer la imagen recibida." }, 400, cors);
  }

  try {
    await bucket.put(key, body, {
      httpMetadata: {
        contentType: mime,
        cacheControl: "public, max-age=31536000, immutable"
      },
      customMetadata: {
        user_id: user.id,
        folder,
        original_name: file.name || "",
        uploaded_at: now.toISOString()
      }
    });
  } catch (error) {
    return json({ ok: false, error: "No se pudo subir la imagen a R2.", details: error.message }, 500, cors);
  }

  const base = String(env.R2_PUBLIC_BASE_URL || "https://media.peguerocrespo.com").replace(/\/$/, "");
  const url = `${base}/${key}`;

  return json({
    ok: true,
    provider: "cloudflare_r2",
    key,
    path: key,
    url,
    publicUrl: url,
    size: file.size,
    type: mime,
    contentType: mime,
    folder
  }, 200, cors);
}

async function handleDelete(request, env, cors) {
  const bucket = env.MEDIA_BUCKET;
  if (!bucket) return json({ ok: false, error: "No está conectado el bucket R2." }, 500, cors);

  const user = await getUserFromSupabase(request, env);
  if (!user?.id) return json({ ok: false, error: "Debes iniciar sesión." }, 401, cors);

  const body = await request.json().catch(() => ({}));
  const key = cleanPath(body.key || body.path || "");
  if (!key) return json({ ok: false, error: "Falta key." }, 400, cors);

  const role = await getUserRoleFromSupabase(user.id, request, env);
  const isAdmin = isAdminRole(role);
  const head = await bucket.head(key).catch(() => null);
  const ownerId = head?.customMetadata?.user_id || "";

  // Si el objeto existe, solo lo puede borrar el dueño o un moderador/admin.
  // Si no existe, se responde ok para no bloquear la eliminación de la publicación.
  if (head && ownerId && ownerId !== user.id && !isAdmin) {
    return json({ ok: false, error: "No tienes permisos para borrar esta imagen." }, 403, cors);
  }
  if (head && !ownerId && !isAdmin) {
    return json({ ok: false, error: "No se pudo confirmar el dueño de la imagen." }, 403, cors);
  }

  await bucket.delete(key);
  return json({ ok: true, deleted: key, key, role }, 200, cors);
}

async function handleForumEmail(request, env, cors) {
  if (!env.SENDER_API_KEY) return json({ ok: false, error: "Sender no está configurado. Falta SENDER_API_KEY." }, 501, cors);

  const user = await getUserFromSupabase(request, env);
  if (!user?.id) return json({ ok: false, error: "No autorizado." }, 401, cors);

  const body = await request.json().catch(() => ({}));
  const to = body.to;
  const subject = body.subject || "Notificación de Work and Travel RD";
  const html = body.html || "";
  const text = body.text || "";
  if (!to || (!html && !text)) return json({ ok: false, error: "Faltan datos del correo." }, 400, cors);

  const res = await fetch("https://api.sender.net/v2/email/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SENDER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: {
        email: env.SENDER_FROM_EMAIL || "no-reply@peguerocrespo.com",
        name: env.SENDER_FROM_NAME || "Work and Travel RD"
      },
      to: Array.isArray(to) ? to : [{ email: to }],
      subject,
      html,
      text
    })
  });

  const responseText = await res.text();
  if (!res.ok) return json({ ok: false, error: "Sender rechazó el correo.", details: responseText }, 502, cors);
  return json({ ok: true, details: responseText }, 200, cors);
}


async function handlePdfUploadProxy(request, env, cors) {
  const bodyText = await request.text();
  let payload = {};
  try { payload = JSON.parse(bodyText || "{}"); } catch (_) {}

  const scriptMap = { ...DEFAULT_PDF_APPS_SCRIPT_URLS, ...parsePdfScriptMap(env.PDF_APPS_SCRIPT_URLS || "") };
  const requestedDrive = String(payload.drive_id || payload.driveId || "principal").trim() || "principal";
  const pdfAppsScriptUrl = scriptMap[requestedDrive] || env.PDF_APPS_SCRIPT_URL || DEFAULT_PDF_APPS_SCRIPT_URL;

  if (!pdfAppsScriptUrl) {
    return json(
      { ok: false, error: "Falta PDF_APPS_SCRIPT_URL o PDF_APPS_SCRIPT_URLS en Cloudflare Worker." },
      500,
      cors
    );
  }

  const response = await fetch(pdfAppsScriptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: bodyText
  });

  const text = await response.text();

  return new Response(text, {
    status: response.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...cors
    }
  });
}

export default {
  async fetch(request, env) {
    const cors = getCorsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (url.pathname === "/" && request.method === "GET") return json({ ok: true, service: "Work and Travel RD Worker" }, 200, cors);
      if (url.pathname === "/upload" && request.method === "POST") return handleUpload(request, env, cors);
      if (url.pathname === "/delete" && request.method === "POST") return handleDelete(request, env, cors);
      if (url.pathname === "/upload-pdf" && request.method === "POST") return handlePdfUploadProxy(request, env, cors);
      if (url.pathname === "/send-forum-email" && request.method === "POST") return handleForumEmail(request, env, cors);
      return json({ ok: false, error: "Ruta no encontrada." }, 404, cors);
    } catch (error) {
      return json({ ok: false, error: "Error interno del Worker.", details: error.message }, 500, cors);
    }
  }
};
