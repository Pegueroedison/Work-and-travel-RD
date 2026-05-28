(() => {
  const cfg = window.WT_SUPABASE_CONFIG || {};
  const canConnect = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const client = canConnect ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "wt-guide-rd-auth-token",
      flowType: "pkce"
    }
  }) : null;

  let lastSessionCheck = 0;
  let sessionRefreshPromise = null;

  function authErrorLooksExpired(errorLike) {
    const message = String(errorLike?.message || errorLike || "").toLowerCase();
    return Boolean(
      message.includes("jwt") ||
      message.includes("expired") ||
      message.includes("refresh") ||
      message.includes("session") ||
      message.includes("auth") ||
      message.includes("invalid token") ||
      message.includes("not authenticated")
    );
  }

  function withTimeout(promise, ms = 6500, label = "operación") {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} tardó demasiado`)), ms))
    ]);
  }

  function hasActiveCriticalFlow() {
    try {
      if (document.body?.dataset?.wtCriticalFlow === "1") return true;
      return Array.from(document.querySelectorAll("button[disabled]")).some(btn =>
        /publicando|subiendo|guardando|procesando|analizando/i.test(String(btn.textContent || ""))
      );
    } catch (_) {
      return false;
    }
  }

  async function ensureSessionFresh({ force = false } = {}) {
    if (!client) return null;
    const now = Date.now();

    if (!force && now - lastSessionCheck < 25000) {
      try {
        const { data } = await withTimeout(client.auth.getSession(), 4500, "getSession");
        return data?.session || null;
      } catch (_) {
        return null;
      }
    }

    if (sessionRefreshPromise) return sessionRefreshPromise;

    sessionRefreshPromise = (async () => {
      try {
        lastSessionCheck = Date.now();
        const { data, error } = await withTimeout(client.auth.getSession(), 6500, "getSession");
        if (error) throw error;

        const session = data?.session || null;
        const expiresAt = Number(session?.expires_at || 0) * 1000;
        const nearExpiry = Boolean(expiresAt && expiresAt - Date.now() < 4 * 60 * 1000);

        if (session && (force || nearExpiry)) {
          const refreshed = await withTimeout(client.auth.refreshSession(), 6500, "refreshSession");
          if (refreshed?.error) throw refreshed.error;
          return refreshed?.data?.session || session;
        }

        return session;
      } catch (error) {
        console.warn("No se pudo refrescar la sesión de Supabase:", error);
        return null;
      } finally {
        sessionRefreshPromise = null;
      }
    })();

    return sessionRefreshPromise;
  }

  async function wakeSupabaseSession({ reason = "manual" } = {}) {
    if (!client || hasActiveCriticalFlow()) return null;
    const session = await ensureSessionFresh({ force: false });
    try {
      window.dispatchEvent(new CustomEvent("wt:session-wake", { detail: { reason, hasSession: Boolean(session) } }));
    } catch (_) {}
    return session;
  }

  async function runWithSession(action, { retry = true } = {}) {
    try {
      if (!hasActiveCriticalFlow()) {
        await withTimeout(ensureSessionFresh({ force: false }), 6500, "preparar sesión");
      }
    } catch (_) {}

    try {
      const result = await action();
      if (result?.error && retry && authErrorLooksExpired(result.error)) {
        try { await withTimeout(ensureSessionFresh({ force: true }), 6500, "refrescar sesión"); } catch (_) {}
        return action();
      }
      return result;
    } catch (error) {
      if (retry && authErrorLooksExpired(error)) {
        try { await withTimeout(ensureSessionFresh({ force: true }), 6500, "refrescar sesión"); } catch (_) {}
        return action();
      }
      throw error;
    }
  }

  function bindSessionKeepAlive() {
    if (!client || window.__WT_SESSION_KEEPALIVE_BOUND__) return;
    window.__WT_SESSION_KEEPALIVE_BOUND__ = true;

    const softWake = () => {
      if (document.visibilityState !== "visible") return;
      if (hasActiveCriticalFlow()) return;
      wakeSupabaseSession({ reason: "resume" }).catch(() => {});
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") setTimeout(softWake, 500);
    });
    window.addEventListener("pageshow", () => setTimeout(softWake, 350));
    window.addEventListener("focus", () => setTimeout(softWake, 900));
    window.addEventListener("online", () => setTimeout(softWake, 350));

    setInterval(() => {
      if (document.visibilityState === "visible" && !hasActiveCriticalFlow()) ensureSessionFresh({ force: false });
    }, 120000);
  }

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const page = document.body?.dataset?.page || "";

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    } catch (_) { return value; }
  }

  function parseSettingValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (["true", "false"].includes(trimmed)) return trimmed === "true";
    if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
    try { return JSON.parse(trimmed); } catch (_) { return value; }
  }

  function toast(message, type = "info", title = "") {
    let root = qs("#toastRoot");
    if (!root) {
      root = Object.assign(document.createElement("div"), { id: "toastRoot", className: "toast-root" });
    }
    root.classList.add("toast-root");

    // Siempre al final del body y con z-index máximo para que no quede detrás
    // de login, Mi perfil, recuperar contraseña, tabs, paneles o nav inferior.
    if (root.parentElement !== document.body || document.body.lastElementChild !== root) {
      document.body.appendChild(root);
    }
    Object.assign(root.style, {
      position: "fixed",
      zIndex: "2147483647",
      top: "max(12px, env(safe-area-inset-top))",
      bottom: "auto",
      left: "12px",
      right: "12px",
      pointerEvents: "none"
    });

    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.setAttribute("role", type === "error" ? "alert" : "status");
    el.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    Object.assign(el.style, {
      position: "relative",
      zIndex: "2147483647",
      pointerEvents: "auto"
    });
    el.innerHTML = `<div>${title ? `<strong>${escapeHTML(title)}</strong>` : ""}<span>${escapeHTML(message)}</span></div>`;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(-8px)"; }, 4200);
    setTimeout(() => el.remove(), 4800);
  }

  function showModal({ title = "", body = "", actions = [], closeOnBackdrop = true, className = "" } = {}) {
    const root = qs("#modalRoot") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "modalRoot" }));
    document.body.classList.add("wt-modal-open");
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const actionHtml = actions.map((a, idx) => `<button type="button" class="btn ${a.className || "btn-soft"}" data-action="${idx}">${escapeHTML(a.label || "Aceptar")}</button>`).join("");
    backdrop.innerHTML = `<div class="modal-card ${className}" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${escapeHTML(title)}</h2><button class="modal-close" aria-label="Cerrar">×</button></div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-actions">${actionHtml}</div>` : ""}
    </div>`;
    const close = () => {
      backdrop.remove();
      setTimeout(() => {
        if (!document.querySelector(".modal-backdrop, .notification-top-backdrop")) {
          document.body.classList.remove("wt-modal-open");
        }
      }, 0);
    };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop && closeOnBackdrop) close();
      const closeBtn = event.target.closest(".modal-close");
      if (closeBtn) close();
      const actionBtn = event.target.closest("[data-action]");
      if (actionBtn) {
        const action = actions[Number(actionBtn.dataset.action)];
        if (action?.onClick) action.onClick({ close, modal: backdrop, button: actionBtn });
        if (action?.close !== false) close();
      }
    });
    root.appendChild(backdrop);
    setTimeout(() => qs("input, textarea, select, button", backdrop)?.focus?.(), 20);
    return { element: backdrop, close };
  }

  function confirmDialog({ title = "Confirmar", message = "¿Seguro?", confirmText = "Confirmar", danger = false } = {}) {
    return new Promise((resolve) => {
      showModal({
        title,
        body: `<p>${escapeHTML(message)}</p>`,
        actions: [
          { label: "Cancelar", className: "btn-soft", onClick: () => resolve(false) },
          { label: confirmText, className: danger ? "btn-danger" : "btn-primary", onClick: () => resolve(true) }
        ]
      });
    });
  }

  function renderRoleBadge(role = "user") {
    const normalizedRole = String(role || "user").toLowerCase();
    if (!normalizedRole || normalizedRole === "user") return "";
    if (normalizedRole === "owner") return `<span class="role-badge owner-stars" title="Cuenta principal" aria-label="Cuenta principal">★★★★★</span>`;
    const labels = { superadmin: "Director", admin: "Administrador", moderator: "Moderador", moderador: "Moderador" };
    return `<span class="role-badge ${escapeHTML(normalizedRole)}">${escapeHTML(labels[normalizedRole] || normalizedRole)}</span>`;
  }

  function renderUserBadges(badges = []) {
    if (!Array.isArray(badges) || !badges.length) return "";
    return `<span class="public-badges">${badges.map(b => `<span class="public-badge" style="--badge-color:${escapeHTML(b.color || "#0b2f6b")}">${escapeHTML(b.icon || "🏅")} ${escapeHTML(b.name || "Insignia")}</span>`).join("")}</span>`;
  }

  function getPublicBaseUrl() {
    return String(getR2Config().PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  }

  function isImageBucket(bucket) {
    const imageBuckets = new Set([
      cfg?.BUCKETS?.site_assets,
      cfg?.BUCKETS?.profile_photos,
      cfg?.BUCKETS?.content_images,
      cfg?.BUCKETS?.hero_images,
      cfg?.BUCKETS?.course_images,
      cfg?.BUCKETS?.service_images,
      cfg?.BUCKETS?.announcement_images
    ].filter(Boolean));
    return imageBuckets.has(bucket);
  }

  function isSupabaseStorageUrl(value = "") {
    const url = String(value || "").trim();
    if (!url) return false;
    const base = String(cfg?.SUPABASE_URL || "").trim().replace(/\/$/, "");
    return Boolean(
      /\/storage\/v1\/object\//i.test(url)
      || (base && url.startsWith(`${base}/storage/v1/object/`))
      || /\.supabase\.co\/storage\/v1\/object\//i.test(url)
    );
  }

  function sanitizeImageUrl(value = "", fallback = "") {
    const url = String(value || "").trim();
    if (!url) return fallback;
    const blockLegacy = getR2Config().BLOCK_LEGACY_SUPABASE_IMAGES !== false;
    if (blockLegacy && isSupabaseStorageUrl(url)) return fallback;
    return url;
  }

  function publicUrl(bucket, path) {
    if (!bucket || !path) return "";
    const r2Base = getPublicBaseUrl();
    if (r2Base && isImageBucket(bucket)) return `${r2Base}/${String(path).replace(/^\/+/, "")}`;
    if (!client) return "";
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, data] = dataUrl.split(",");
    const mime = /data:(.*);base64/.exec(meta)?.[1] || "image/png";
    const bytes = atob(data);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
    return new Blob([buffer], { type: mime });
  }

  function isImageBlob(blob) {
    return Boolean(blob?.type && String(blob.type).startsWith("image/"));
  }

  function getR2Config() {
    return cfg.CLOUDFLARE_R2 || cfg.R2 || {};
  }

  function shouldUseR2(bucket, blob, options = {}) {
    const r2 = getR2Config();
    if (!isImageBlob(blob)) return false;
    if (options.forceSupabase) return false;
    if (options.forceR2) return true;
    return Boolean(r2.ENABLED && r2.UPLOAD_WORKER_URL);
  }


  let imageCompressionSettingsCache = null;
  let imageCompressionSettingsAt = 0;

  async function getImageCompressionSettings() {
    const defaults = {
      enabled: true,
      required: true,
      maxUploadMb: Number(cfg?.FORUM_LIMITS?.IMAGE_ORIGINAL_MAX_MB || 6),
      finalMaxMb: Number(cfg?.FORUM_LIMITS?.IMAGE_FINAL_MAX_MB || 3),
      showProgress: true
    };
    const now = Date.now();
    if (imageCompressionSettingsCache && (now - imageCompressionSettingsAt) < 60000) return imageCompressionSettingsCache;
    if (!client) return defaults;
    try {
      const { data, error } = await client
        .from("site_settings")
        .select("key,value")
        .in("key", ["image_compression_enabled", "image_compression_required", "image_compression_max_upload_mb", "image_compression_final_max_mb", "image_compression_show_progress"]);
      if (error) throw error;
      const map = Object.fromEntries((data || []).map(r => [r.key, parseSettingValue(r.value)]));
      imageCompressionSettingsCache = {
        enabled: map.image_compression_enabled !== undefined ? Boolean(map.image_compression_enabled) : defaults.enabled,
        required: map.image_compression_required !== undefined ? Boolean(map.image_compression_required) : defaults.required,
        maxUploadMb: Number(map.image_compression_max_upload_mb || defaults.maxUploadMb) || defaults.maxUploadMb,
        finalMaxMb: Number(map.image_compression_final_max_mb || defaults.finalMaxMb) || defaults.finalMaxMb,
        showProgress: map.image_compression_show_progress !== undefined ? Boolean(map.image_compression_show_progress) : defaults.showProgress
      };
    } catch (_) {
      imageCompressionSettingsCache = defaults;
    }
    imageCompressionSettingsAt = now;
    return imageCompressionSettingsCache;
  }

  function clearImageCompressionSettingsCache() {
    imageCompressionSettingsCache = null;
    imageCompressionSettingsAt = 0;
  }

  async function compressImageForUpload(blob, options = {}) {
    const settings = await getImageCompressionSettings();
    if (!settings.enabled || !isImageBlob(blob)) {
      if (isImageBlob(blob)) {
        const finalMaxMb = Math.max(1, Number(settings.finalMaxMb || cfg?.FORUM_LIMITS?.IMAGE_FINAL_MAX_MB || 3));
        if ((blob.size || 0) > finalMaxMb * 1024 * 1024) {
          throw new Error(`La imagen supera el límite final de ${finalMaxMb} MB. Recórtala o elige una más ligera.`);
        }
      }
      return {
        blob,
        fileName: options.fileName || "image.jpg",
        compressed: false,
        originalSize: blob.size || 0,
        size: blob.size || 0
      };
    }

    const maxBytes = Math.max(1, settings.maxUploadMb || 6) * 1024 * 1024;
    const finalMaxMb = Math.max(1, Number(settings.finalMaxMb || cfg?.FORUM_LIMITS?.IMAGE_FINAL_MAX_MB || 3));
    const finalMaxBytes = finalMaxMb * 1024 * 1024;
    if ((blob.size || 0) > maxBytes) {
      throw new Error(`La imagen es muy pesada para procesarla. Máximo original permitido: ${settings.maxUploadMb || 6} MB.`);
    }
    const assertFinalSize = (candidate) => {
      if ((candidate?.size || 0) > finalMaxBytes) {
        throw new Error(`La imagen supera el límite final de ${finalMaxMb} MB. Recórtala o elige una más ligera.`);
      }
    };

    // Si el módulo del foro/perfil ya entregó WebP real, no comprimir otra vez.
    // Esto evita que en móviles se quede repitiendo el proceso después del 18%.
    if (String(blob.type || "").toLowerCase() === "image/webp") {
      assertFinalSize(blob);
      const base = String(options.fileName || "image.webp").replace(/\.[a-z0-9]{2,6}$/i, "");
      return {
        blob,
        fileName: `${base}.webp`,
        compressed: true,
        originalSize: blob.size || 0,
        size: blob.size || 0,
        mime: "image/webp",
        extension: "webp"
      };
    }

    if (!window.WTImageCompressor?.optimizeForUse) {
      if (settings.required) throw new Error("El compresor WebP no cargó. Actualiza la página y vuelve a intentarlo.");
      assertFinalSize(blob);
      return { blob, fileName: options.fileName || "image.jpg", compressed: false, originalSize: blob.size || 0, size: blob.size || 0 };
    }

    const use = options.assetKind === "forum_comment_image"
      ? "comment"
      : options.assetKind === "profile_photo" || options.use === "profile" || options.bucket === cfg?.BUCKETS?.profile_photos
        ? "profile"
        : options.assetKind && !String(options.assetKind).includes("forum")
          ? "admin"
          : "forum";

    const optimized = await WTImageCompressor.optimizeForUse(blob, use, {
      fallbackToOriginal: !settings.required,
      onlyIfSmaller: false,
      timeoutMs: settings.required ? 32000 : 14000,
      force: true,
      requireWebP: settings.required,
      allowJpegFallback: !settings.required
    });

    const optimizedType = String(optimized?.blob?.type || optimized?.mime || "").toLowerCase();
    if (!optimized?.blob || !optimized.compressed || optimized.fallback) {
      if (settings.required) throw new Error("No se pudo comprimir la imagen en este dispositivo. La subida fue bloqueada para evitar guardar el original.");
      assertFinalSize(blob);
      return { blob, fileName: options.fileName || "image.jpg", compressed: false, originalSize: blob.size || 0, size: blob.size || 0 };
    }
    if (settings.required && !optimizedType.includes("webp")) {
      throw new Error("La imagen no se convirtió a WebP real en este móvil. No se permite subir JPEG/PNG cuando la compresión es obligatoria.");
    }

    assertFinalSize(optimized.blob);
    const baseName = window.WTImageCompressor?.safeName?.(String(options.fileName || "image").replace(/\.[a-z0-9]{2,6}$/i, "")) || "image";
    const ext = settings.required ? "webp" : (window.WTImageCompressor?.extensionFromType?.(optimized.blob.type || optimized.mime) || "jpg");
    return {
      blob: optimized.blob,
      fileName: `${baseName}.${ext}`,
      compressed: true,
      originalSize: blob.size || 0,
      size: optimized.blob.size || 0,
      width: optimized.width,
      height: optimized.height,
      mime: optimized.blob.type || optimized.mime,
      extension: ext
    };
  }

  function uploadToWorker({ url, token, formData, onProgress, timeoutMs = 90000 }) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.timeout = timeoutMs;
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && typeof onProgress === "function") {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText || "{}"); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300) return resolve(data || {});
        reject(new Error(data?.error || data?.message || `Error al subir imagen (${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error("No se pudo conectar con el servidor de imágenes."));
      xhr.ontimeout = () => reject(new Error("La subida tardó demasiado. Intenta con una imagen más liviana o revisa tu conexión."));
      xhr.send(formData);
    });
  }

  async function uploadBlob(bucket, path, blob, options = {}) {
    if (!client) throw new Error("La conexión de la plataforma no está configurada.");

    const r2 = getR2Config();
    const imageUpload = isImageBlob(blob);

    if (imageUpload) {
      if (!r2.ENABLED || !r2.UPLOAD_WORKER_URL) {
        throw new Error("La subida de imágenes todavía no está configurada correctamente.");
      }

      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData?.session?.access_token || "";
      if (!token) throw new Error("Debes iniciar sesión para subir imágenes.");

      let blobToUpload = blob;
      let fileName = options.fileName || path.split("/").pop() || "image.jpg";
      let pathToUpload = path;

      // Barrera obligatoria controlada desde Panel Admin.
      // Si image_compression_required = true, ninguna imagen se sube sin convertirse a WebP.
      const compressed = await compressImageForUpload(blobToUpload, { ...options, fileName, bucket });
      blobToUpload = compressed.blob;
      fileName = compressed.fileName || fileName;
      const compressionSettingsForGuard = await getImageCompressionSettings();
      if (compressionSettingsForGuard.required && String(blobToUpload.type || "").toLowerCase() !== "image/webp") {
        throw new Error("Bloqueado: la imagen no salió como WebP real. No se subirá JPEG/PNG desde móvil.");
      }
      const finalMaxMb = Math.max(1, Number(compressionSettingsForGuard.finalMaxMb || cfg?.FORUM_LIMITS?.IMAGE_FINAL_MAX_MB || 3));
      if ((blobToUpload.size || 0) > finalMaxMb * 1024 * 1024) {
        throw new Error(`La imagen supera el límite final de ${finalMaxMb} MB. Recórtala o elige una más ligera.`);
      }
      if (compressed.compressed) {
        const ext = compressionSettingsForGuard.required ? "webp" : (compressed.extension || (blobToUpload.type === "image/webp" ? "webp" : blobToUpload.type === "image/png" ? "png" : "jpg"));
        fileName = fileName.replace(/\.[a-z0-9]{2,6}$/i, `.${ext}`);
        pathToUpload = String(pathToUpload || fileName).replace(/\.[a-z0-9]{2,6}$/i, `.${ext}`);
      }

      const formData = new FormData();
      const bucketFolderMap = {
        [cfg?.BUCKETS?.profile_photos]: "profile-photos",
        [cfg?.BUCKETS?.content_images]: "forum-posts",
        [cfg?.BUCKETS?.hero_images]: "hero-images",
        [cfg?.BUCKETS?.announcement_images]: "announcements",
        [cfg?.BUCKETS?.course_images]: "courses",
        [cfg?.BUCKETS?.service_images]: "services",
        [cfg?.BUCKETS?.site_assets]: "site-assets"
      };
      const folder = options.folder
        || (options.assetKind === "forum_comment_image" ? "forum-comments" : options.assetKind === "forum_post_image" ? "forum-posts" : "")
        || bucketFolderMap[bucket]
        || "site-assets";
      const cleanOriginalPath = String(pathToUpload || fileName).replace(/^\/+/, "");
      const allowedFolders = new Set(["profile-photos", "forum-posts", "forum-comments", "hero-images", "announcements", "courses", "services", "site-assets"]);
      const firstSegment = cleanOriginalPath.split("/")[0] || "";
      const r2Path = allowedFolders.has(firstSegment)
        ? cleanOriginalPath
        : (cleanOriginalPath.startsWith(`${folder}/`) ? cleanOriginalPath : `${folder}/${cleanOriginalPath}`);

      formData.append("file", blobToUpload, fileName);
      formData.append("path", r2Path);
      formData.append("folder", folder);
      formData.append("bucket", bucket || "images");
      formData.append("asset_kind", options.assetKind || bucket || "image");
      formData.append("content_type", blobToUpload.type || options.contentType || "image/webp");

      const response = await uploadToWorker({
        url: r2.UPLOAD_WORKER_URL,
        token,
        formData,
        onProgress: options.onProgress
      });

      return {
        path: response.key || response.path || path,
        key: response.key || response.path || path,
        url: sanitizeImageUrl(response.url || response.publicUrl || response.public_url || ""),
        publicUrl: sanitizeImageUrl(response.url || response.publicUrl || response.public_url || ""),
        provider: "cloudflare_r2",
        size: response.size || blobToUpload.size,
        type: response.contentType || response.type || blobToUpload.type
      };
    }

    const { error } = await client.storage.from(bucket).upload(path, blob, { upsert: true, cacheControl: "3600", contentType: blob.type || options.contentType });
    if (error) throw error;
    return { path, key: path, url: publicUrl(bucket, path), publicUrl: publicUrl(bucket, path), provider: "supabase_storage", size: blob.size, type: blob.type };
  }


  function r2KeyFromUrl(url = "") {
    const value = String(url || "").trim();
    if (!value) return "";
    const base = getPublicBaseUrl();
    if (base && value.startsWith(`${base}/`)) return decodeURIComponent(value.slice(base.length + 1).split("?")[0]);
    try {
      const parsed = new URL(value);
      if (/media\.peguerocrespo\.com$/i.test(parsed.hostname)) return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    } catch (_) {}
    return "";
  }

  async function deleteR2Image(keyOrUrl) {
    const r2 = getR2Config();
    const key = cleanPathForDelete(keyOrUrl) || r2KeyFromUrl(keyOrUrl);
    if (!key) return { ok: true, skipped: true };
    if (!r2.ENABLED || !r2.UPLOAD_WORKER_URL) throw new Error("La eliminación de imágenes todavía no está configurada correctamente.");

    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData?.session?.access_token || "";
    if (!token) throw new Error("Debes iniciar sesión para borrar imágenes.");

    const deleteUrl = String(r2.UPLOAD_WORKER_URL).replace(/\/upload\/?$/, "/delete");
    const response = await fetch(deleteUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ key })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || "No se pudo borrar la imagen.");
    return result;
  }

  function cleanPathForDelete(value = "") {
    const raw = String(value || "").trim();
    if (!raw || /^https?:\/\//i.test(raw)) return "";
    return raw.replace(/\\/g, "/").replace(/\.\.+/g, "").replace(/^\/+/, "");
  }

  function collectImageKeysFromRecord(record = {}) {
    const keys = new Set();
    const add = (value) => {
      if (!value) return;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === "object") return add(parsed);
        } catch (_) {}
        const key = cleanPathForDelete(value) || r2KeyFromUrl(value);
        if (key && !isSupabaseStorageUrl(value)) keys.add(key);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      if (typeof value === "object") {
        add(value.key);
        add(value.path);
        add(value.image_key);
        add(value.image_path);
        add(value.object_key);
        add(value.public_url);
        add(value.publicUrl);
        add(value.url);
        add(value.src);
        add(value.href);
        add(value.image_url);
        add(value.photo_url);
        add(value.attachments);
        add(value.images);
        add(value.image_urls);
        add(value.media);
        add(value.files);
      }
    };
    add(record.image_key);
    add(record.image_path);
    add(record.photo_path);
    add(record.object_key);
    add(record.public_url);
    add(record.image_url);
    add(record.photo_url);
    add(record.attachments);
    add(record.images);
    add(record.image_urls);
    add(record.media);
    add(record.files);
    return [...keys];
  }

  async function deleteR2ImagesFromRecords(records = []) {
    const keys = [...new Set((Array.isArray(records) ? records : [records]).flatMap(collectImageKeysFromRecord))];
    const results = [];
    for (const key of keys) {
      try { results.push(await deleteR2Image(key)); }
      catch (error) { console.warn("No se pudo borrar imagen R2", key, error); }
    }
    return results;
  }

  async function recordDriveAccountUsage(driveId = "", bytes = 0, ok = true, errorText = "") {
    if (!driveId || !client?.rpc) return;
    try {
      await client.rpc("record_drive_account_usage", {
        drive_id_text: driveId,
        file_size_bytes: Math.trunc(Number(bytes || 0)),
        ok,
        error_text: errorText || null
      });
    } catch (error) {
      const msg = String(error?.message || "").toLowerCase();
      if (!msg.includes("function") && !msg.includes("schema cache") && !msg.includes("not found")) {
        console.warn("No se pudo actualizar el uso de Drive", driveId, error);
      }
    }
  }

  function normalizePdfAttachmentsForDelete(record = {}) {
    const out = [];
    const add = (value) => {
      if (!value) return;
      if (typeof value === "string") {
        try { return add(JSON.parse(value)); } catch (_) { return; }
      }
      if (Array.isArray(value)) return value.forEach(add);
      if (typeof value === "object") {
        const fileId = String(value.drive_file_id || value.fileId || value.file_id || "").trim();
        if (fileId) out.push({
          fileId,
          driveId: value.drive_id || value.driveId || "",
          size: Number(value.size || value.fileSize || value.bytes || 0) || 0,
          endpoint: value.delete_url || value.deleteUrl || value.upload_url || value.uploadUrl || ""
        });
      }
    };
    add(record.pdf_attachments);
    add(record.pdfs);
    return out;
  }

  async function deleteGoogleDrivePdfsFromRecords(records = []) {
    const cfgPdf = cfg?.GOOGLE_DRIVE_PDF || {};
    const list = Array.isArray(records) ? records : [records];
    const map = new Map();
    list.flatMap(normalizePdfAttachmentsForDelete).forEach(item => {
      if (item.fileId) map.set(`${item.driveId || "default"}:${item.fileId}`, item);
    });
    const items = [...map.values()];
    if (!items.length) return [];
    if (!cfgPdf.ENABLED || !cfgPdf.UPLOAD_ENDPOINT) {
      console.warn("No se puede borrar PDF: falta GOOGLE_DRIVE_PDF.UPLOAD_ENDPOINT.");
      return [];
    }
    const token = await getAccessToken({ force: true });
    if (!token) {
      console.warn("No se puede borrar PDF: sesión no disponible.");
      return [];
    }
    const results = [];
    for (const item of items) {
      try {
        const endpoint = item.endpoint || cfgPdf.UPLOAD_ENDPOINT;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "delete", token, drive_file_id: item.fileId, fileId: item.fileId, drive_id: item.driveId || "" })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "No se pudo borrar el PDF de Google Drive.");
        await recordDriveAccountUsage(item.driveId || payload.drive_id || "", -Math.abs(Number(item.size || 0)), true, "");
        results.push(payload);
      } catch (error) {
        console.warn("No se pudo borrar PDF de Google Drive", item.fileId, error);
      }
    }
    return results;
  }

  async function getAccessToken({ force = false } = {}) {
    if (!client) return "";
    const session = await ensureSessionFresh({ force });
    if (session?.access_token) return session.access_token;

    try {
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || "";
    } catch (_) {
      return "";
    }
  }

  async function getCurrentUser() {
    if (!client) return null;
    const session = await ensureSessionFresh({ force: false });
    if (session?.user) return session.user;

    try {
      const { data } = await client.auth.getUser();
      return data?.user || null;
    } catch (_) {
      return null;
    }
  }

  async function getMyProfile() {
    const user = await getCurrentUser();
    if (!user || !client) return null;
    const { data, error } = await client.from("user_profiles").select("*").eq("id", user.id).single();
    if (error) return null;
    return data;
  }

  function bindCommonUI() {
    const navToggle = qs("#navToggle");
    const nav = qs("#mainNav");
    navToggle?.addEventListener("click", () => nav?.classList.toggle("open"));
    qsa(".main-nav a").forEach((a) => {
      const current = location.pathname.split("/").pop() || "index.html";
      if (a.getAttribute("href") === current) a.classList.add("active");
    });
    if (!canConnect) {
      setTimeout(() => toast("La conexión de la plataforma todavía no está lista", "warning", "Conexión pendiente"), 600);
    }
  }

  bindSessionKeepAlive();

  window.WT = {
    cfg, supabase: client, canConnect, qs, qsa, page, ensureSessionFresh, wakeSupabaseSession, getAccessToken, runWithSession, bindSessionKeepAlive,
    escapeHTML, formatDate, parseSettingValue, toast, showModal, confirmDialog,
    renderRoleBadge, renderUserBadges, publicUrl, isSupabaseStorageUrl, sanitizeImageUrl, r2KeyFromUrl, collectImageKeysFromRecord, deleteR2Image, deleteR2ImagesFromRecords, deleteGoogleDrivePdfsFromRecords, dataUrlToBlob, uploadBlob, getImageCompressionSettings, clearImageCompressionSettingsCache, getCurrentUser, getMyProfile, bindCommonUI
  };
  document.addEventListener("DOMContentLoaded", bindCommonUI);
})();
