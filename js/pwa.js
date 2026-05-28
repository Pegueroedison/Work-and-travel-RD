(() => {
  const STORAGE_KEY = "wt_install_prompt_dismissed";
  let deferredPrompt = null;
  let hiddenAt = 0;
  let recovering = false;

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (txt = "") => String(txt).replace(/[&<>\"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));

  function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }

  function showInstallHint() {
    if (isStandalone() || localStorage.getItem(STORAGE_KEY) === "true") return;
    if (!deferredPrompt && !isIOS()) return;
    if (qs(".wt-install-card")) return;
    const card = document.createElement("div");
    card.className = "wt-install-card";
    card.innerHTML = `<button class="wt-install-close" type="button" aria-label="Cerrar">×</button>
      <div class="wt-install-icon">📲</div>
      <div class="wt-install-copy"><strong>Usar como app</strong><span>${isIOS() ? "En iPhone: toca Compartir y luego ‘Agregar a pantalla de inicio’." : "Instala esta web como app para abrirla rápido desde tu pantalla de inicio."}</span></div>
      ${deferredPrompt ? '<button class="wt-install-action" type="button">Instalar</button>' : ''}`;
    document.body.appendChild(card);
    qs(".wt-install-close", card)?.addEventListener("click", () => { localStorage.setItem(STORAGE_KEY, "true"); card.remove(); });
    qs(".wt-install-action", card)?.addEventListener("click", async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; card.remove(); });
  }

  function installReplyContextLabels() {
    const cleanName = (txt = "") => String(txt).replace(/\s*(Moderador|Administradoristrador|Director|Usuario|★★★★★)\s*$/i, "").trim() || "este usuario";
    const applyLabels = () => {
      qsa(".comment-card .comment-replies > .comment-card").forEach(reply => {
        if (qs(":scope > .comment-reply-context", reply)) return;
        const parent = reply.parentElement?.closest(".comment-card");
        const parentName = cleanName(parent?.querySelector(":scope > .comment-head .author-meta strong, :scope > .comment-head strong")?.textContent || "");
        const label = document.createElement("div"); label.className = "comment-reply-context"; label.innerHTML = `↩️ Respondiendo a <b>${esc(parentName)}</b>`; reply.insertBefore(label, reply.firstElementChild);
      });
    };
    applyLabels(); new MutationObserver(() => applyLabels()).observe(document.body, { childList:true, subtree:true });
  }

  function hasUnsavedUserInput() { return qsa("textarea,input[type='text'],input[type='email'],input:not([type])").some(el => !el.disabled && String(el.value || "").trim().length > 0 && el.offsetParent !== null); }
  function installAppResumeRecovery() {
    const pagesThatUseDB = /(?:index|foro|post|admin|servicios|servicio|cursos|curso|practica-consular)\.html$|\/$/i;
    let checkTimer = null;
    let hiddenAt = 0;

    const hasActiveFileFlow = () => {
      const text = String(document.body?.textContent || "").toLowerCase();
      return Boolean(
        qs(".forum-upload-progress,.image-editor-backdrop,.cropper-modal") ||
        text.includes("publicando") ||
        text.includes("subiendo") ||
        text.includes("procesando") ||
        text.includes("analizando")
      );
    };

    const wakeSupabase = async (reason = "resume") => {
      if (!window.WT?.supabase || !pagesThatUseDB.test(location.pathname || "/")) return null;
      if (hasActiveFileFlow()) return null;
      try {
        if (window.WT?.wakeSupabaseSession) return await window.WT.wakeSupabaseSession({ reason, force: false });
        if (window.WT?.ensureSessionFresh) return await window.WT.ensureSessionFresh({ force: false, silent: true });
        const { data } = await window.WT.supabase.auth.getSession();
        return data?.session || null;
      } catch (_) {
        return null;
      }
    };

    const scheduleWake = (delay = 700, reason = "resume") => {
      if (document.hidden) return;
      clearTimeout(checkTimer);
      checkTimer = setTimeout(() => {
        wakeSupabase(reason).then(() => window.dispatchEvent(new CustomEvent("wt:app-resumed"))).catch(() => {});
      }, delay);
    };

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else {
        const slept = hiddenAt ? Date.now() - hiddenAt : 0;
        scheduleWake(slept > 15000 ? 450 : 900, "visibility");
        hiddenAt = 0;
      }
    });
    window.addEventListener("pageshow", () => scheduleWake(500, "pageshow"));
    window.addEventListener("focus", () => scheduleWake(850, "focus"));
    window.addEventListener("online", () => scheduleWake(350, "online"));
  }

  function installFreezeProtection() {
    const unlock = () => {
      const hasOverlay = qs(".modal-backdrop,.notification-top-backdrop,.forum-image-viewer,.image-editor-backdrop,.cropper-modal");
      if (!hasOverlay) { document.body.classList.remove("wt-modal-open"); document.documentElement.style.overflow = document.documentElement.dataset.wtLockOverflow || ""; document.body.style.overflow = document.body.dataset.wtLockOverflow || ""; document.body.style.touchAction = ""; }
      qsa(".forum-upload-progress").forEach(box => { if (/100%|lista/i.test(box.textContent || "")) { box.dataset.complete = "true"; setTimeout(() => box.remove(), 1800); } });
    };
    window.addEventListener("pageshow", unlock); window.addEventListener("focus", unlock); window.addEventListener("error", () => setTimeout(unlock, 80)); window.addEventListener("unhandledrejection", () => setTimeout(unlock, 80)); document.addEventListener("visibilitychange", () => { if (!document.hidden) unlock(); }); setInterval(unlock, 2500);
  }


  function installZoomLock() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');

    let lastTouchEnd = 0;
    document.addEventListener('touchend', function(event) {
      const now = Date.now();
      if (now - lastTouchEnd <= 320) event.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });

    document.addEventListener('gesturestart', function(event) { event.preventDefault(); }, { passive: false });
    document.addEventListener('gesturechange', function(event) { event.preventDefault(); }, { passive: false });
    document.addEventListener('gestureend', function(event) { event.preventDefault(); }, { passive: false });
  }

  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredPrompt = event; setTimeout(showInstallHint, 1600); });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; localStorage.setItem(STORAGE_KEY, "true"); qs(".wt-install-card")?.remove(); });
  document.addEventListener("DOMContentLoaded", () => { installZoomLock(); installReplyContextLabels(); installFreezeProtection(); installAppResumeRecovery(); });
  if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("./service-worker.js").catch(() => {}); setTimeout(showInstallHint, 2200); });
})();
