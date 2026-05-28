import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@workandtravelrd.com";

    if (!supabaseUrl || !serviceRole) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    if (!vapidPublic || !vapidPrivate) throw new Error("Faltan VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY.");

    const body = await req.json().catch(() => ({}));
    const userId = String(body.user_id || body.userId || body.to || "").trim();
    if (!userId) return json({ ok: false, error: "Falta user_id." }, 400);

    const payload = {
      title: String(body.title || "Work and Travel RD"),
      body: String(body.body || body.message || "Tienes una nueva notificación."),
      url: String(body.url || body.link || "/foro.html"),
      type: String(body.type || "general"),
      icon: String(body.icon || "/images/icon-192.png"),
      badge: String(body.badge || "/images/icon-144.png"),
      tag: String(body.tag || body.type || "work-travel-rd"),
    };

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", userId)
      .eq("is_active", true);
    if (error) throw error;

    const rows = Array.isArray(subscriptions) ? subscriptions : [];
    let sent = 0;
    let disabled = 0;
    const errors: string[] = [];

    for (const sub of rows) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        sent += 1;
        await supabase.from("push_subscriptions").update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sub.id);
      } catch (err) {
        const statusCode = Number((err as any)?.statusCode || 0);
        const message = String((err as Error)?.message || "Error enviando push");
        errors.push(message);
        if (statusCode === 404 || statusCode === 410) {
          disabled += 1;
          await supabase.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        }
      }
    }

    return json({ ok: true, sent, disabled, total: rows.length, errors: errors.slice(0, 3) });
  } catch (err) {
    return json({ ok: false, error: (err as Error)?.message || "No se pudo enviar la notificación push." }, 500);
  }
});
