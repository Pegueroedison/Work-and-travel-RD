// Work and Travel RD — correo de bloqueo manual/automático — v3971
// Variables recomendadas en Supabase Edge Functions:
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// BREVO_API_KEY o BREVO_MODERATION_API_KEY
// BREVO_SENDER_EMAIL, BREVO_SENDER_NAME
// APP_PUBLIC_URL o SITE_URL es opcional para mostrar el botón de la plataforma.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function multilineHtml(value: unknown) {
  const escaped = escapeHtml(value || "");
  return escaped
    .replace(/ {2,}/g, (match) => "&nbsp;".repeat(match.length))
    .split(/\r?\n/)
    .map((line) => line.trim() ? line : "&nbsp;")
    .join("<br>");
}

function normalizeUrl(value: string) {
  const clean = String(value || "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  if (!/^https?:\/\//i.test(clean)) return `https://${clean}`;
  return clean;
}

function splitBlockReason(rawReason: string) {
  const raw = String(rawReason || "").trim();
  const marker = /\n?\s*Advertencias tomadas en cuenta:\s*/i;
  const parts = raw.split(marker);
  if (parts.length <= 1) return { mainReason: raw, warningsText: "" };
  return {
    mainReason: parts[0].trim() || "Tu cuenta fue bloqueada por moderación.",
    warningsText: parts.slice(1).join("\n").trim(),
  };
}

function normalizeWarningsFromPayload(value: unknown) {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (typeof item === "string") return `${index + 1}. ${item}`;
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const title = String(obj.type || obj.type_label || obj.title || "Advertencia").trim();
          const reason = String(obj.reason || obj.summary || obj.message || "").trim();
          const date = String(obj.created_at || obj.date || obj.time || "").trim();
          return `${index + 1}. ${title}${reason ? ` — ${reason}` : ""}${date ? ` — ${date}` : ""}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(value || "").trim();
}

function buildBlockedAccountEmail(params: {
  name: string;
  reason: string;
  senderName: string;
  appUrl: string;
  supportEmail: string;
  warningSummary?: string;
}) {
  const name = escapeHtml(params.name || "usuario");
  const split = splitBlockReason(params.reason || "Tu cuenta fue bloqueada por moderación.");
  const mainReason = multilineHtml(split.mainReason || "Tu cuenta fue bloqueada por moderación.");
  const warningSummaryText = normalizeWarningsFromPayload(params.warningSummary) || split.warningsText;
  const warningSummary = multilineHtml(warningSummaryText);
  const appUrl = normalizeUrl(params.appUrl);
  const supportEmail = escapeHtml(params.supportEmail || "workandtravelrd@peguerocrespo.com");
  const supportMailto = `mailto:${supportEmail}`;
  const logoUrl = appUrl ? `${appUrl}/images/logo-email.png` : "https://drive.google.com/uc?export=view&id=17XNN13tWFfsc6A_3LBk1Y-eYKbyG7IBa";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>Tu cuenta ha sido bloqueada</title>
</head>
<body style="margin:0;padding:0;background:#eef3fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Tu cuenta ha sido bloqueada en Work and Travel RD por moderación.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef3fb;margin:0;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #dbe4f0;box-shadow:0 12px 35px rgba(15,23,42,0.10);">
          <tr>
            <td align="center" style="background:#f8fbff;padding:32px 28px 26px 28px;text-align:center;border-bottom:6px solid #0b2a5b;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:0 auto;">
                <tr>
                  <td align="center" style="text-align:center;padding:0 0 16px 0;margin:0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;border-collapse:separate;">
                      <tr>
                        <td align="center" valign="middle" width="138" height="138" bgcolor="#ffffff" style="width:138px;height:138px;text-align:center;vertical-align:middle;background:#ffffff;border:1px solid #d8e3f5;border-radius:999px;box-shadow:0 10px 24px rgba(11,42,91,0.12);overflow:hidden;padding:0;margin:0;">
                          ${appUrl ? `<a href="${escapeHtml(appUrl)}" style="display:block;width:138px;height:138px;text-decoration:none;border:0;line-height:138px;text-align:center;margin:0 auto;">` : ""}<img src="${escapeHtml(logoUrl)}" width="112" alt="Work and Travel RD" style="display:inline-block;width:112px;max-width:112px;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto;padding:0;vertical-align:middle;line-height:normal;">${appUrl ? `</a>` : ""}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="text-align:center;padding:0 0 14px 0;margin:0;">
                    <span style="display:inline-block;padding:9px 16px;border-radius:999px;background:#eaf1ff;border:1px solid #c7d7f2;color:#0b2a5b;font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;text-align:center;">Moderación</span>
                  </td>
                </tr>
              </table>
              <div style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#1f4f8f;font-weight:800;clear:both;text-align:center;">Work and Travel RD</div>
              <h1 style="margin:10px 0 0 0;font-size:30px;line-height:1.18;color:#0b1220;font-weight:800;">Tu cuenta ha sido bloqueada</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:30px 28px 8px 28px;background:#ffffff;">
              <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#111827;">Hola <strong style="color:#111827;">${name}</strong>,</p>
              <p style="margin:0 0 22px 0;font-size:17px;line-height:1.7;color:#273244;">
                Te informamos que tu cuenta en <strong style="color:#0b2a5b;">Work and Travel RD</strong> ha sido bloqueada por moderación.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0;border-collapse:separate;">
                <tr>
                  <td style="border-left:7px solid #dc2626;background:#fff5f5;border-radius:18px;padding:18px 20px;border-top:1px solid #fecaca;border-right:1px solid #fecaca;border-bottom:1px solid #fecaca;">
                    <div style="font-size:15px;line-height:1.4;color:#991b1b;font-weight:800;margin-bottom:8px;">Motivo del bloqueo</div>
                    <div style="font-size:17px;line-height:1.65;color:#111827;font-weight:500;">${mainReason}</div>
                  </td>
                </tr>
              </table>

              ${warningSummaryText ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0;border-collapse:separate;">
                <tr>
                  <td style="background:#f8fafc;border:1px solid #dbe4f0;border-radius:18px;padding:18px 20px;">
                    <div style="font-size:15px;line-height:1.4;color:#0b2a5b;font-weight:800;margin-bottom:10px;">Advertencias tomadas en cuenta</div>
                    <div style="font-size:15px;line-height:1.7;color:#273244;font-weight:500;">${warningSummary}</div>
                  </td>
                </tr>
              </table>` : ""}

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0 0;border-collapse:separate;">
                <tr>
                  <td style="background:#f0f6ff;border:1px solid #cfe0fb;border-radius:18px;padding:18px 20px;">
                    <p style="margin:0;font-size:16px;line-height:1.7;color:#1f2937;">
                      Si necesitas asistencia o deseas comunicarte con nuestro equipo, puedes escribirnos a <a href="${supportMailto}" style="color:#0b2a5b;text-decoration:none;font-weight:800;">${supportEmail}</a>.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${appUrl ? `<tr>
            <td align="center" style="padding:22px 28px 4px 28px;background:#ffffff;">
              <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#0b2a5b;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 22px;border-radius:999px;">Ir a Work and Travel RD</a>
            </td>
          </tr>` : ""}

          <tr>
            <td style="padding:26px 28px 30px 28px;background:#ffffff;">
              <p style="margin:0;font-size:16px;line-height:1.6;color:#273244;">Atentamente,<br><strong style="color:#111827;">Equipo de Work and Travel RD</strong></p>
            </td>
          </tr>
        </table>

        <p style="max-width:620px;margin:16px auto 0 auto;font-size:12px;line-height:1.5;color:#475569;text-align:center;">
Este correo fue enviado automáticamente por Work and Travel RD. Correo general de contacto: <a href="${supportMailto}" style="color:#0b2a5b;text-decoration:none;font-weight:700;">${supportEmail}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const brevoKey =
    Deno.env.get("BREVO_MODERATION_API_KEY") ||
    Deno.env.get("BREVO_API_KEY") ||
    Deno.env.get("BREVO_KEY") ||
    Deno.env.get("SENDINBLUE_API_KEY") ||
    "";
  const senderEmail =
    Deno.env.get("BREVO_MODERATION_SENDER_EMAIL") ||
    Deno.env.get("BREVO_SENDER_EMAIL") ||
    Deno.env.get("BREVO_FROM_EMAIL") ||
    Deno.env.get("SENDER_EMAIL") ||
    Deno.env.get("FROM_EMAIL") ||
    "";
  const senderName =
    Deno.env.get("BREVO_MODERATION_SENDER_NAME") ||
    Deno.env.get("BREVO_SENDER_NAME") ||
    Deno.env.get("BREVO_FROM_NAME") ||
    Deno.env.get("SENDER_NAME") ||
    "Work and Travel RD Moderación";
  const appUrl = Deno.env.get("APP_PUBLIC_URL") || Deno.env.get("SITE_URL") || "";
  const supportEmail = Deno.env.get("SUPPORT_EMAIL") || "workandtravelrd@peguerocrespo.com";

  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "El servicio de correo no está configurado completamente." }, 500);
  if (!brevoKey || !senderEmail) return json({ ok: false, error: "El servicio de correo no está configurado completamente." }, 500);

  let payload: { user_id?: string; userId?: string; target_user_id?: string; to?: string; block_reason?: string; reason?: string; automatic?: boolean; warning_summary?: unknown; warningSummary?: unknown; warnings?: unknown } = {};
  try { payload = await req.json(); } catch (_) {}

  const userId = String(payload.user_id || payload.userId || payload.target_user_id || payload.to || "").trim();
  let reason = String(payload.block_reason || payload.reason || "").trim();
  const payloadWarningSummary = normalizeWarningsFromPayload(payload.warning_summary || payload.warningSummary || payload.warnings);
  if (!userId) return json({ ok: false, error: "Falta user_id." }, 400);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("id,email,full_name,block_reason")
    .eq("id", userId)
    .maybeSingle();

  if (error) return json({ ok: false, error: error.message || "No se pudo buscar el perfil del usuario." }, 500);

  let targetEmail = String(profile?.email || "").trim();
  let targetName = String(profile?.full_name || "usuario").trim() || "usuario";

  if (!targetEmail) {
    const authResult = await supabase.auth.admin.getUserById(userId).catch(() => null);
    const authEmail = String(authResult?.data?.user?.email || "").trim();
    const authName = String(authResult?.data?.user?.user_metadata?.full_name || authResult?.data?.user?.user_metadata?.name || "").trim();
    targetEmail = authEmail;
    if (authName) targetName = authName;
  }

  if (!reason) reason = String(profile?.block_reason || "Tu cuenta fue bloqueada por moderación.").trim();
  if (!targetEmail) return json({ ok: false, error: "No se encontró el correo del usuario." }, 404);

  const subject = "Tu cuenta ha sido bloqueada en Work and Travel RD";
  const html = buildBlockedAccountEmail({ name: targetName, reason, senderName, appUrl, supportEmail, warningSummary: payloadWarningSummary });

  const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": brevoKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: targetEmail, name: targetName }],
      subject,
      htmlContent: html,
    }),
  });

  const brevoPayload = await brevoRes.json().catch(() => ({}));
  if (!brevoRes.ok) {
    return json({
      ok: false,
      error: brevoPayload?.message || brevoPayload?.error || "No se pudo enviar el correo.",
      brevo_status: brevoRes.status,
      brevo_response: brevoPayload,
    }, 502);
  }

  const now = new Date().toISOString();
  await supabase.from("user_profiles").update({ block_email_sent_at: now }).eq("id", userId);
  await supabase.from("user_moderation_logs")
    .update({ email_sent: true, email_sent_at: now })
    .eq("user_id", userId)
    .in("action", ["blocked", "auto_blocked"])
    .is("email_sent_at", null);

  return json({ ok: true, sent_to: targetEmail, automatic: Boolean(payload.automatic) });
});
