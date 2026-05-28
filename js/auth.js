(() => {
  let sessionUser = null;
  let profile = null;
  let passwordRecoveryMode = false;
  let pendingRecoveryInfo = null;

  function avatar(url) { return WT.sanitizeImageUrl(url, "images/placeholder-avatar.png"); }
  function isAdminRole(role) { return ["moderator", "moderador", "admin", "superadmin", "owner"].includes(String(role || "").toLowerCase()); }
  function isSuperAdmin(role) { return ["superadmin", "owner"].includes(String(role || "").toLowerCase()); }

  async function hasActiveGranularAdminPermission(userId = "") {
    if (!userId || !WT.supabase) return false;
    try {
      const { data, error } = await WT.supabase
        .from("user_permissions")
        .select("permission_key,expires_at")
        .eq("user_id", userId)
        .limit(1);
      if (error) return false;
      const now = Date.now();
      return (data || []).some(row => row?.permission_key && (!row.expires_at || new Date(row.expires_at).getTime() > now));
    } catch (_) {
      return false;
    }
  }

  async function canOpenAdminPanel(profileLike = profile, userLike = sessionUser) {
    if (isAdminRole(profileLike?.role)) return true;
    return hasActiveGranularAdminPermission(profileLike?.id || userLike?.id || "");
  }

  function appBaseUrl() {
    const pathname = window.location.pathname || "/";
    const folder = pathname.endsWith("/") ? pathname : pathname.replace(/\/[^/]*$/, "/");
    return `${window.location.origin}${folder}`;
  }

  const PREF_KEY = "wt_user_preferences";

  function normalizePreferences(prefs = {}) {
    const legacyDark = prefs.dark_mode === true || prefs.dark_mode === "true";
    return {
      dark_mode: false,
      forum_dark_mode: prefs.forum_dark_mode === true || prefs.forum_dark_mode === "true" || legacyDark,
      hide_quick_nav: prefs.hide_quick_nav === true || prefs.hide_quick_nav === "true"
    };
  }

  function readLocalPreferences() {
    try {
      return normalizePreferences(JSON.parse(localStorage.getItem(PREF_KEY) || "{}"));
    } catch (_) {
      return {};
    }
  }

  function writeLocalPreferences(values = {}) {
    const next = normalizePreferences({ ...readLocalPreferences(), ...values });
    localStorage.setItem(PREF_KEY, JSON.stringify(next));
    return next;
  }

  function readPreferences() {
    return normalizePreferences({ ...readLocalPreferences(), ...(profile?.user_preferences || {}) });
  }

  function applyPreferences(prefs = readPreferences()) {
    const normalized = normalizePreferences(prefs);
    const pageName = location.pathname.split("/").pop() || "index.html";
    const isForumPage = pageName === "foro.html" || pageName === "post.html";

    // El modo oscuro ya no afecta toda la página. Solo se aplica al foro.
    const forumDarkActive = Boolean(normalized.forum_dark_mode && isForumPage);
    document.documentElement.classList.remove("wt-dark-mode");
    document.documentElement.classList.toggle("wt-forum-dark", forumDarkActive);
    document.body?.classList.toggle("wt-forum-dark-page", forumDarkActive);
    document.body?.classList.toggle("wt-hide-quick-nav", normalized.hide_quick_nav);

    // Cambiar color de la barra del navegador/PWA solo dentro del foro oscuro.
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", forumDarkActive ? "#0b0f14" : "#062b63");
    const appleStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleStatus) appleStatus.setAttribute("content", "black-translucent");
    return normalized;
  }

  async function savePreferences(values = {}, options = {}) {
    const next = normalizePreferences({ ...readPreferences(), ...values });
    writeLocalPreferences(next);
    applyPreferences(next);
    buildMobileQuickNav(isAdminRole(profile?.role) || document.body.classList.contains("wt-has-admin-access"));

    const shouldSync = options.sync !== false && sessionUser && WT.supabase;
    if (shouldSync) {
      const { error } = await WT.supabase
        .from("user_profiles")
        .update({ user_preferences: next })
        .eq("id", sessionUser.id);
      if (error) {
        WT.toast("La configuración se aplicó en este dispositivo, pero no se pudo sincronizar con tu cuenta.", "warning");
      } else if (profile) {
        profile.user_preferences = next;
      }
    }

    return next;
  }

  applyPreferences(readLocalPreferences());

  function navIcon(name) {
    const icons = {
      home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8"/><path d="M5.4 10.2V21h13.2V10.2"/><path d="M9.4 21v-6h5.2v6"/></svg>',
      services: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/><path d="M12 3.5v5"/><path d="m16.5 5.8-3.1 8.1-5.9 2.3 2.3-5.9 8.1-3.1Z"/></svg>',
      courses: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h10.8A3.2 3.2 0 0 1 19 7.7V21H7.2A3.2 3.2 0 0 1 4 17.8V5.5a1 1 0 0 1 1-1Z"/><path d="M7.5 8h8"/><path d="M7.5 11.5h8"/><path d="M7.2 17.5H19"/></svg>',
      forum: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2H10l-5.5 3v-3a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z"/><path d="M7.8 10.2h8.4"/><path d="M7.8 13.4h5.6"/></svg>',
      practice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3.3 3.3 0 0 0-3.3 3.3v5.4a3.3 3.3 0 0 0 6.6 0V6.3A3.3 3.3 0 0 0 12 3Z"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/><path d="M8.5 21h7"/></svg>',
      admin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/><path d="M19.4 15.2a8 8 0 0 0 .1-1.1 8 8 0 0 0-.1-1.3l2-1.5-2-3.5-2.4 1a8.4 8.4 0 0 0-2.1-1.2L14.5 5h-4l-.4 2.6A8.4 8.4 0 0 0 8 8.8l-2.4-1-2 3.5 2 1.5a8 8 0 0 0-.1 1.3 8 8 0 0 0 .1 1.1l-2 1.6 2 3.4 2.4-1a8.4 8.4 0 0 0 2.1 1.2l.4 2.6h4l.4-2.6a8.4 8.4 0 0 0 2.1-1.2l2.4 1 2-3.4-2-1.6Z"/></svg>'
    };
    return icons[name] || icons.home;
  }

  function buildMobileQuickNav(showAdmin = false) {
    const prefs = readPreferences();
    const existingNav = WT.qs(".mobile-quick-nav");
    if (prefs.hide_quick_nav) {
      existingNav?.remove();
      document.body?.classList.add("wt-hide-quick-nav");
      return;
    }

    const current = location.pathname.split("/").pop() || "index.html";
    const links = [
      ["index.html", "home", "Inicio"],
      ["servicios.html", "services", "Guía"],
      ["cursos.html", "courses", "Servicios"],
      ["foro.html", "forum", "Foro"],
      ["practica-consular.html", "practice", "Práctica"]
    ];
    const admin = showAdmin ? `<a href="admin.html" class="quick-nav-admin ${current === "admin.html" ? "active" : ""}"><span class="quick-nav-icon">${navIcon("admin")}</span><b>Admin</b></a>` : "";
    const html = `<nav class="mobile-quick-nav ${showAdmin ? "has-admin" : ""}" aria-label="Navegación rápida">
      ${links.map(([href, icon, label]) => `<a href="${href}" class="${current === href ? "active" : ""}"><span class="quick-nav-icon">${navIcon(icon)}</span><b>${label}</b></a>`).join("")}
      ${admin}
    </nav>`;
    if (!existingNav) {
      document.body.insertAdjacentHTML("beforeend", html);
    } else {
      existingNav.outerHTML = html;
    }
  }

  function decorateMainMenu() {
    const nav = WT.qs("#mainNav");
    if (!nav || nav.dataset.decorated === "true") return;
    nav.dataset.decorated = "true";
    const labels = {
      "index.html": ["home", "Inicio", "Portada y novedades"],
      "servicios.html": ["services", "Guía", "Taxes, asesoría y apoyo"],
      "cursos.html": ["courses", "Servicios", "Inglés y preparación"],
      "foro.html": ["forum", "Foro", "Dudas y experiencias"],
      "practica-consular.html": ["practice", "Práctica", "Preguntas consulares"],
      "admin.html": ["admin", "Panel Admin", "Administrar plataforma"]
    };
    WT.qsa("a", nav).forEach(a => {
      const href = a.getAttribute("href") || "";
      const data = labels[href];
      if (!data || a.dataset.rich === "true") return;
      a.dataset.rich = "true";
      a.innerHTML = `<span class="nav-icon">${navIcon(data[0])}</span><span class="nav-label"><b>${data[1]}</b><small>${data[2]}</small></span>`;
    });
  }

  function syncAdminMenuLink(show) {
    const nav = WT.qs("#mainNav");
    if (!nav) return;
    const existing = WT.qs('[data-admin-menu="true"]', nav);
    if (!show) {
      existing?.remove();
      return;
    }
    if (!existing) {
      const link = document.createElement("a");
      link.href = "admin.html";
      link.textContent = "Panel Admin";
      link.dataset.adminMenu = "true";
      nav.appendChild(link);
    }
    decorateMainMenu();
  }



  function notificationTargetUrl(item) {
    if (item?.post_id) return `post.html?id=${encodeURIComponent(item.post_id)}`;
    return "foro.html";
  }


  function googleProfilePhotoFromUser(user = sessionUser) {
    const meta = user?.user_metadata || {};
    return WT.sanitizeImageUrl(meta.avatar_url || meta.picture || meta.photo_url || "", "");
  }

  function authDisplayNameFromUser(user = sessionUser) {
    const meta = user?.user_metadata || {};
    return String(meta.full_name || meta.name || meta.display_name || user?.email?.split("@")[0] || "Estudiante").trim();
  }


  const USERNAME_RESERVED = new Set([
    "admin", "administrator", "administrador", "owner", "superadmin", "moderador", "moderator", "soporte", "support", "ayuda", "help",
    "oficial", "official", "sistema", "system", "workandtravelrd", "workandtravel", "wt_rd", "wtrd", "notificaciones", "notifications",
    "embajada", "consulado", "visa", "visas", "greenheart", "ace", "aceinternational", "staff", "equipo", "director"
  ]);

  const USERNAME_BLOCKED_PARTS = [
    "puta", "puto", "mierda", "maldito", "maldita", "coño", "cono", "pene", "vagina", "sexo", "porno", "porn", "xxx", "nude", "desnudo", "desnuda"
  ];

  const USERNAME_MAX_LENGTH = 16;
  const FULL_NAME_MAX_LENGTH = 22;

  const PROFILE_SPANISH_COUNTRIES = [
    "República Dominicana",
    "México",
    "Colombia",
    "Venezuela",
    "Perú",
    "Ecuador",
    "Chile",
    "Argentina",
    "Bolivia",
    "Paraguay",
    "Uruguay",
    "España",
    "Guatemala",
    "Honduras",
    "El Salvador",
    "Nicaragua",
    "Costa Rica",
    "Panamá",
    "Cuba",
    "Guinea Ecuatorial"
  ];

  function normalizeProfileCountry(value = "") {
    const raw = String(value || "").normalize("NFC").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    const found = PROFILE_SPANISH_COUNTRIES.find(country => country.toLowerCase() === raw.toLowerCase());
    return found || "";
  }

  function profileCountryOptionsHTML() {
    return PROFILE_SPANISH_COUNTRIES.map(country => `<option value="${WT.escapeHTML(country)}"></option>`).join("");
  }

  function normalizeFullNameText(value = "") {
    let normalized = String(value || "")
      .normalize("NFC")
      .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'-]/g, "")
      .replace(/\s{2,}/g, " ")
      .trimStart();
    if (normalized.length > FULL_NAME_MAX_LENGTH) normalized = normalized.slice(0, FULL_NAME_MAX_LENGTH).trimEnd();
    return normalized;
  }

  function validateFullName(value = "") {
    const normalized = normalizeFullNameText(value).trim();
    if (!normalized) return { ok: false, fullName: normalized, message: "Escribe tu nombre completo." };
    if (normalized.length > FULL_NAME_MAX_LENGTH) return { ok: false, fullName: normalized, message: `El nombre no puede pasar de ${FULL_NAME_MAX_LENGTH} caracteres.` };
    return { ok: true, fullName: normalized, message: "Nombre válido." };
  }

  function normalizeUsernameText(value = "") {
    return String(value || "")
      .trim()
      .replace(/^@+/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, USERNAME_MAX_LENGTH);
  }

  function usernameCandidateFrom({ name = "", email = "", id = "" } = {}) {
    const suffix = String(id || Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/gi, "").slice(0, 4).toLowerCase();
    const base = normalizeUsernameText(name || String(email || "").split("@")[0] || `usuario${suffix}`);
    let candidate = base.length >= 3 ? base : `usuario${suffix}`;
    candidate = normalizeUsernameText(candidate).slice(0, USERNAME_MAX_LENGTH);
    if (USERNAME_RESERVED.has(candidate) || USERNAME_BLOCKED_PARTS.some(term => candidate.includes(term))) {
      candidate = normalizeUsernameText(`usuario${suffix}`).slice(0, USERNAME_MAX_LENGTH);
    }
    return candidate || normalizeUsernameText(`usuario${suffix}`).slice(0, USERNAME_MAX_LENGTH);
  }

  function validateUsername(username = "") {
    const normalized = normalizeUsernameText(username);
    if (!normalized) return { ok: false, username: normalized, message: "Escribe un @usuario." };
    if (normalized.length < 3) return { ok: false, username: normalized, message: "El @usuario debe tener al menos 3 caracteres." };
    if (normalized.length > USERNAME_MAX_LENGTH) return { ok: false, username: normalized, message: `El @usuario no puede pasar de ${USERNAME_MAX_LENGTH} caracteres.` };
    if (!/^[a-z0-9_]+$/.test(normalized)) return { ok: false, username: normalized, message: "Usa solo letras, números y guion bajo." };
    if (/^\d+$/.test(normalized)) return { ok: false, username: normalized, message: "El @usuario no puede ser solo números." };
    if (USERNAME_RESERVED.has(normalized)) return { ok: false, username: normalized, message: "Ese @usuario está reservado." };
    const bad = USERNAME_BLOCKED_PARTS.find(term => normalized.includes(term));
    if (bad) return { ok: false, username: normalized, message: "Ese @usuario contiene una palabra no permitida." };
    return { ok: true, username: normalized, message: "Formato válido." };
  }

  async function checkUsernameAvailability(username = "", currentUserId = sessionUser?.id || "") {
    const validation = validateUsername(username);
    if (!validation.ok) return { ...validation, available: false };
    if (!WT.supabase) return { ...validation, available: false, message: "La conexión no está lista." };

    try {
      if (WT.supabase.rpc) {
        const { data, error } = await WT.supabase.rpc("username_is_available", { p_username: validation.username });
        if (!error && typeof data === "boolean") {
          return { ...validation, available: data, message: data ? "@usuario disponible." : "Ese @usuario ya está en uso." };
        }
      }
    } catch (_) {}

    try {
      const { data, error } = await WT.supabase
        .from("user_profiles")
        .select("id,username_normalized")
        .eq("username_normalized", validation.username)
        .maybeSingle();
      if (error) throw error;
      const available = !data || data.id === currentUserId;
      return { ...validation, available, message: available ? "@usuario disponible." : "Ese @usuario ya está en uso." };
    } catch (error) {
      return { ...validation, available: false, message: "No se pudo verificar el @usuario. Revisa que las funciones de usuario estén instaladas en Supabase." };
    }
  }

  function renderUsernameTag(username = "") {
    const clean = normalizeUsernameText(username);
    return clean ? `@${WT.escapeHTML(clean)}` : "@usuario-pendiente";
  }

  async function ensureProfileFromAuth(user = sessionUser) {
    if (!user || !WT.supabase) return null;
    const googlePhoto = googleProfilePhotoFromUser(user);
    const fullName = authDisplayNameFromUser(user);
    const email = user.email || "";

    const { data: existing } = await WT.supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
      const insert = {
        id: user.id,
        email,
        full_name: fullName,
        username: usernameCandidateFrom({ name: fullName, email, id: user.id }),
        photo_url: googlePhoto || null,
        role: "user",
        status: "active"
      };
      const { error } = await WT.supabase.from("user_profiles").insert(insert);
      if (error) {
        WT.toast("La sesión se inició, pero no se pudo crear el perfil público.", "warning");
        return null;
      }
      return insert;
    }

    const updates = {};
    if (!existing.email && email) updates.email = email;
    if (!existing.username) updates.username = usernameCandidateFrom({ name: existing.full_name || fullName, email: existing.email || email, id: user.id });
    if ((!existing.full_name || existing.full_name === "Usuario" || existing.full_name === "Estudiante") && fullName) updates.full_name = fullName;
    if (!existing.photo_url && googlePhoto) {
      updates.photo_url = googlePhoto;
      updates.photo_path = null;
    }
    if (Object.keys(updates).length) {
      await WT.supabase.from("user_profiles").update(updates).eq("id", user.id);
      return { ...existing, ...updates };
    }
    return existing;
  }

  async function signInWithGoogle() {
    if (!WT.canConnect) return WT.toast("La conexión de la plataforma no está configurada.", "error");
    const { error } = await WT.supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${appBaseUrl()}index.html?auth=google`,
        queryParams: { prompt: "select_account" }
      }
    });
    if (error) WT.toast(error.message, "error", "No se pudo iniciar con Google");
  }

  async function finishOAuthReturnIfNeeded() {
    if (!WT.supabase) return false;

    const params = new URLSearchParams(window.location.search || "");
    const hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    const get = key => params.get(key) || hash.get(key) || "";
    const isGoogleReturn = get("auth") === "google" || Boolean(get("provider_token") || get("provider_refresh_token"));

    if (!isGoogleReturn) {
      const { data } = await WT.supabase.auth.getSession();
      if (data?.session?.user) await ensureProfileFromAuth(data.session.user);
      return false;
    }

    try {
      const code = get("code");
      if (code) {
        await WT.supabase.auth.exchangeCodeForSession(code);
      }

      await WT.ensureSessionFresh?.({ force: true });
      const { data } = await WT.supabase.auth.getSession();
      if (data?.session?.user) {
        await ensureProfileFromAuth(data.session.user);
        const clean = `${location.origin}${location.pathname}`;
        history.replaceState({}, document.title, clean);
        WT.toast("Sesión iniciada con Google", "success");
        return true;
      }
    } catch (err) {
      const clean = `${location.origin}${location.pathname}`;
      history.replaceState({}, document.title, clean);
      WT.toast(err.message || "No se pudo iniciar sesión con Google.", "error");
      return true;
    }

    return false;
  }

  async function getNotificationSummary() {
    if (!WT.supabase || !sessionUser) return { unread: 0, items: [] };
    try {
      const [{ count }, { data }] = await Promise.all([
        WT.supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", sessionUser.id).is("read_at", null),
        WT.supabase.from("notifications").select("id,type,title,message,post_id,comment_id,actor_id,read_at,created_at").eq("user_id", sessionUser.id).order("created_at", { ascending: false }).limit(60)
      ]);
      return { unread: count || 0, items: data || [] };
    } catch (_) {
      return { unread: 0, items: [] };
    }
  }

  function notificationIcon(type) {
    const icons = {
      post_like: "❤️",
      comment_like: "❤️",
      post_comment: "💬",
      comment_reply: "↩️",
      forum_warning: "⚠️",
      account_blocked: "⛔",
      post_approved: "✅",
      post_rejected: "🚫",
      pdf_summary_ready: "📄",
      forum_mention: "@",
      friend_request: "👥",
      friend_accepted: "🤝"
    };
    return icons[type] || "🔔";
  }

  async function showNotificationsModal() {
    const user = await WT.getCurrentUser();
    if (!user) return showLoginModal();

    WT.qs(".notification-top-backdrop")?.remove();
    document.body.classList.add("wt-modal-open");
    const { items } = await getNotificationSummary();
    const backdrop = document.createElement("div");
    backdrop.className = "notification-top-backdrop";
    backdrop.innerHTML = `<section class="notification-top-panel" role="dialog" aria-modal="true" aria-label="Notificaciones">
      <header class="notification-top-head">
        <div>
          <span>Centro de actividad</span>
          <h2>Notificaciones</h2>
        </div>
        <button class="notification-close" type="button" aria-label="Cerrar">×</button>
      </header>
      <div class="notification-top-body">
        ${items.length ? `<div class="notification-list">
          ${items.map(item => `<a class="notification-item ${item.read_at ? "" : "unread"}" href="${WT.escapeHTML(notificationTargetUrl(item))}" data-notification-id="${WT.escapeHTML(item.id)}">
            <span class="notification-item-icon">${notificationIcon(item.type)}</span>
            <span class="notification-item-body">
              <strong>${WT.escapeHTML(item.title || "Notificación")}</strong>
              <small>${WT.escapeHTML(item.message || "")}</small>
              <em>${WT.escapeHTML(WT.formatDate(item.created_at))}</em>
            </span>
          </a>`).join("")}
        </div><div class="notification-hint">Mostrando las notificaciones más recientes. Desliza para ver más.</div>` : `<div class="empty-state compact"><h3>No tienes notificaciones</h3><p>Aquí aparecerán likes, comentarios, respuestas y menciones del foro.</p></div>`}
      </div>
    </section>`;
    document.body.appendChild(backdrop);

    const close = () => {
      backdrop.remove();
      setTimeout(() => {
        if (!document.querySelector(".modal-backdrop, .notification-top-backdrop")) {
          document.body.classList.remove("wt-modal-open");
        }
      }, 0);
    };

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop || event.target.closest(".notification-close")) close();
    });
    WT.qsa(".notification-item", backdrop).forEach(link => {
      link.addEventListener("click", async () => {
        const id = link.dataset.notificationId;
        if (id && WT.supabase) {
          await WT.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
        }
      });
    });
    if (WT.supabase) {
      await WT.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
      refreshNotificationBadge(0);
    }
  }

  function refreshNotificationBadge(count) {
    const badge = WT.qs("#notificationCount");
    if (!badge) return;
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count > 99 ? "99+" : String(count);
    } else {
      badge.hidden = true;
      badge.textContent = "";
    }
  }

  async function bindNotificationButton() {
    const btn = WT.qs("#notificationsBtn");
    if (!btn) return;
    btn.addEventListener("click", showNotificationsModal);
    const { unread } = await getNotificationSummary();
    refreshNotificationBadge(unread);
  }


  async function getFriendSummary() {
    if (!WT.supabase || !sessionUser) return { pending: 0 };
    try {
      const { count } = await WT.supabase
        .from("user_friendships")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", sessionUser.id)
        .eq("status", "pending");
      return { pending: count || 0 };
    } catch (_) {
      return { pending: 0 };
    }
  }

  function refreshFriendBadge(count) {
    const badge = WT.qs("#friendRequestCount");
    if (!badge) return;
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count > 99 ? "99+" : String(count);
    } else {
      badge.hidden = true;
      badge.textContent = "";
    }
  }


  async function sendFriendPush(userId, payload = {}) {
    if (!userId || !window.WTPush?.sendPushNotification) return;
    try {
      await window.WTPush.sendPushNotification(userId, payload);
    } catch (error) {
      console.warn("No se pudo enviar push de amigos", error);
    }
  }

  async function bindFriendsButton() {
    const btn = WT.qs("#friendsBtn");
    if (!btn) return;
    btn.addEventListener("click", showFriendsModal);
    const { pending } = await getFriendSummary();
    refreshFriendBadge(pending);
  }

  function friendAvatar(profile = {}) {
    return WT.escapeHTML(WT.sanitizeImageUrl(profile.photo_url, "images/placeholder-avatar.png"));
  }

  function friendName(profile = {}) {
    return WT.escapeHTML(profile.full_name || profile.username || "Usuario");
  }

  function friendUsername(profile = {}) {
    return profile.username ? `@${WT.escapeHTML(profile.username)}` : "";
  }

  async function loadFriendsData(userId = sessionUser?.id) {
    if (!WT.supabase || !userId) return { friends: [], incoming: [], outgoing: [] };

    const { data, error } = await WT.supabase
      .from("user_friendships")
      .select("id, requester_id, receiver_id, status, created_at, accepted_at")
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = data || [];
    const profileIds = [...new Set(rows.flatMap(row => [row.requester_id, row.receiver_id]).filter(Boolean))];

    let profilesById = {};
    if (profileIds.length) {
      const { data: profilesData, error: profilesError } = await WT.supabase
        .from("public_profiles")
        .select("id,full_name,username,photo_url,role,bio,city,sponsor,program_year")
        .in("id", profileIds);
      if (profilesError) throw profilesError;
      profilesById = Object.fromEntries((profilesData || []).map(item => [item.id, item]));
    }

    const friends = [];
    const incoming = [];
    const outgoing = [];

    rows.forEach(row => {
      const requester = profilesById[row.requester_id] || { id: row.requester_id, full_name: "Usuario" };
      const receiver = profilesById[row.receiver_id] || { id: row.receiver_id, full_name: "Usuario" };

      if (row.status === "accepted") {
        friends.push({
          ...row,
          profile: String(row.requester_id) === String(userId) ? receiver : requester
        });
      } else if (row.status === "pending" && String(row.receiver_id) === String(userId)) {
        incoming.push({ ...row, profile: requester });
      } else if (row.status === "pending" && String(row.requester_id) === String(userId)) {
        outgoing.push({ ...row, profile: receiver });
      }
    });

    return { friends, incoming, outgoing };
  }

  function renderFriendRow(item = {}, kind = "friend") {
    const profile = item.profile || {};
    const actions = kind === "incoming"
      ? `<button class="friend-action accept" data-accept-friend="${WT.escapeHTML(item.id)}" type="button">Aceptar</button><button class="friend-action soft" data-reject-friend="${WT.escapeHTML(item.id)}" type="button">Rechazar</button>`
      : kind === "outgoing"
        ? `<button class="friend-action soft" data-cancel-friend="${WT.escapeHTML(item.id)}" type="button">Cancelar</button>`
        : `<button class="friend-action soft" data-remove-friend="${WT.escapeHTML(item.id)}" type="button">Eliminar</button>`;

    const payload = encodeURIComponent(JSON.stringify({
      id: profile.id || "",
      full_name: profile.full_name || profile.username || "Usuario",
      username: profile.username || "",
      photo_url: profile.photo_url || "",
      role: profile.role || "user",
      bio: profile.bio || "",
      city: profile.city || "",
      sponsor: profile.sponsor || "",
      program_year: profile.program_year || ""
    }));

    return `<article class="friend-row">
      <button class="friend-profile-mini" type="button" data-open-public-profile="${payload}" aria-label="Ver perfil de ${friendName(profile)}">
        <img src="${friendAvatar(profile)}" alt="">
      </button>
      <button class="friend-row-main friend-profile-mini" type="button" data-open-public-profile="${payload}">
        <b>${friendName(profile)}</b><small>${friendUsername(profile) || "Sin @usuario"}</small>
      </button>
      <span class="friend-row-actions">${actions}</span>
    </article>`;
  }

  function renderFriendEmpty(text = "No hay resultados.") {
    return `<div class="friend-empty">${WT.escapeHTML(text)}</div>`;
  }

  async function renderFriendsPanel(container) {
    if (!container) return;
    try {
      const data = await loadFriendsData();
      container.innerHTML = `
        <section class="friends-section">
          <h4>Solicitudes recibidas ${data.incoming.length ? `<span>${data.incoming.length}</span>` : ""}</h4>
          <div class="friends-list">${data.incoming.length ? data.incoming.map(x => renderFriendRow(x, "incoming")).join("") : renderFriendEmpty("No tienes solicitudes pendientes.")}</div>
        </section>
        <section class="friends-section">
          <h4>Mis amigos</h4>
          <div class="friends-list">${data.friends.length ? data.friends.map(x => renderFriendRow(x, "friend")).join("") : renderFriendEmpty("Todavía no tienes amigos agregados.")}</div>
        </section>
        <section class="friends-section">
          <h4>Solicitudes enviadas</h4>
          <div class="friends-list">${data.outgoing.length ? data.outgoing.map(x => renderFriendRow(x, "outgoing")).join("") : renderFriendEmpty("No tienes solicitudes enviadas.")}</div>
        </section>`;
      refreshFriendBadge(data.incoming.length);
      if (window.bindPublicProfileTriggers) window.bindPublicProfileTriggers(container);
    } catch (error) {
      container.innerHTML = renderFriendEmpty(error.message || "No se pudieron cargar tus amigos.");
    }
  }

  async function searchFriendCandidates(query = "") {
    query = normalizeUsernameText(query);
    if (!WT.supabase || query.length < 2) return [];
    const currentUser = sessionUser || await WT.getCurrentUser().catch(() => null);
    const currentId = String(currentUser?.id || profile?.id || "");
    const currentUsername = String(profile?.username || "").toLowerCase();

    try {
      const { data, error } = await WT.supabase
        .from("public_profiles")
        .select("id,full_name,username,photo_url,role")
        .or(`username.ilike.${query}%,full_name.ilike.%${query}%`)
        .limit(10);
      if (error) throw error;

      return (data || []).filter(item => {
        const itemId = String(item.id || "");
        const itemUsername = String(item.username || "").toLowerCase();
        if (!itemId) return false;
        if (currentId && itemId === currentId) return false;
        if (currentUsername && itemUsername === currentUsername) return false;
        return true;
      });
    } catch (error) {
      WT.toast(error.message || "No se pudo buscar usuarios.", "error");
      return [];
    }
  }

  async function renderFriendSearchResults(container, query) {
    if (!container) return;
    const rows = await searchFriendCandidates(query);
    if (!rows.length) {
      container.innerHTML = renderFriendEmpty(query?.length >= 2 ? "No encontramos usuarios con esa búsqueda." : "Escribe al menos 2 letras del @usuario o nombre.");
      return;
    }
    container.innerHTML = rows.map(profile => {
      const payload = encodeURIComponent(JSON.stringify({
        id: profile.id || "",
        full_name: profile.full_name || profile.username || "Usuario",
        username: profile.username || "",
        photo_url: profile.photo_url || "",
        role: profile.role || "user"
      }));
      return `<article class="friend-row">
        <button class="friend-profile-mini" type="button" data-open-public-profile="${payload}" aria-label="Ver perfil de ${friendName(profile)}">
          <img src="${friendAvatar(profile)}" alt="">
        </button>
        <button class="friend-row-main friend-profile-mini" type="button" data-open-public-profile="${payload}">
          <b>${friendName(profile)}</b><small>${friendUsername(profile)}</small>
        </button>
        <span class="friend-row-actions"><button class="friend-action accept" data-send-friend="${WT.escapeHTML(profile.id)}" type="button">Agregar</button></span>
      </article>`;
    }).join("");
    if (window.bindPublicProfileTriggers) window.bindPublicProfileTriggers(container);
  }

  async function showFriendsModal() {
    const user = await WT.getCurrentUser();
    if (!user) return showLoginModal();

    const modal = WT.showModal({
      title: "Amigos",
      className: "friends-modal",
      body: `<div class="friends-shell">
        <div class="friends-search">
          <label>Buscar usuario</label>
          <div class="friends-search-row">
            <input class="input" id="friendSearchInput" placeholder="Buscar por @usuario o nombre" autocomplete="off">
          </div>
          <div class="friends-search-results" id="friendSearchResults">${renderFriendEmpty("Escribe al menos 2 letras para buscar.")}</div>
        </div>
        <div class="friends-panel" id="friendsPanel">${renderFriendEmpty("Cargando...")}</div>
      </div>`,
      actions: [{ label: "Cerrar", className: "btn-primary" }]
    });

    const panel = WT.qs("#friendsPanel", modal.element);
    const results = WT.qs("#friendSearchResults", modal.element);
    const input = WT.qs("#friendSearchInput", modal.element);

    await renderFriendsPanel(panel);
    if (window.bindPublicProfileTriggers) window.bindPublicProfileTriggers(modal.element);

    let searchTimer = null;
    input?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderFriendSearchResults(results, input.value), 250);
    });

    modal.element.addEventListener("click", async (event) => {
      const send = event.target.closest("[data-send-friend]");
      const accept = event.target.closest("[data-accept-friend]");
      const reject = event.target.closest("[data-reject-friend]");
      const cancel = event.target.closest("[data-cancel-friend]");
      const remove = event.target.closest("[data-remove-friend]");

      try {
        if (send) {
          send.disabled = true;
          const { data, error } = await WT.supabase.rpc("send_friend_request", { target_user_id: send.dataset.sendFriend });
          if (error) throw error;
          const result = typeof data === "string" ? JSON.parse(data) : (data || {});
          await sendFriendPush(result.notify_user_id || send.dataset.sendFriend, {
            title: "Nueva solicitud de amistad",
            body: result.actor_name ? `${result.actor_name} quiere agregarte como amigo.` : "Tienes una nueva solicitud de amistad.",
            url: "index.html",
            type: "friend_request",
            tag: `friend-request-${result.id || send.dataset.sendFriend}`
          });
          WT.toast("Solicitud enviada.", "success");
          await renderFriendSearchResults(results, input.value);
          await renderFriendsPanel(panel);
    if (window.bindPublicProfileTriggers) window.bindPublicProfileTriggers(modal.element);
        }
        if (accept) {
          const { data, error } = await WT.supabase.rpc("respond_friend_request", { friendship_id: accept.dataset.acceptFriend, response_status: "accepted" });
          if (error) throw error;
          const result = typeof data === "string" ? JSON.parse(data) : (data || {});
          await sendFriendPush(result.notify_user_id, {
            title: "Solicitud aceptada",
            body: result.actor_name ? `${result.actor_name} aceptó tu solicitud de amistad.` : "Tu solicitud de amistad fue aceptada.",
            url: "index.html",
            type: "friend_accepted",
            tag: `friend-accepted-${accept.dataset.acceptFriend}`
          });
          WT.toast("Solicitud aceptada.", "success");
          await renderFriendsPanel(panel);
    if (window.bindPublicProfileTriggers) window.bindPublicProfileTriggers(modal.element);
        }
        if (reject) {
          const { error } = await WT.supabase.rpc("respond_friend_request", { friendship_id: reject.dataset.rejectFriend, response_status: "rejected" });
          if (error) throw error;
          WT.toast("Solicitud rechazada.", "success");
          await renderFriendsPanel(panel);
    if (window.bindPublicProfileTriggers) window.bindPublicProfileTriggers(modal.element);
        }
        if (cancel) {
          const { error } = await WT.supabase.rpc("cancel_friend_request", { friendship_id: cancel.dataset.cancelFriend });
          if (error) throw error;
          WT.toast("Solicitud cancelada.", "success");
          await renderFriendsPanel(panel);
    if (window.bindPublicProfileTriggers) window.bindPublicProfileTriggers(modal.element);
        }
        if (remove) {
          const ok = await WT.confirmDialog({ title: "Eliminar amigo", message: "¿Quieres eliminar esta amistad?", confirmText: "Eliminar", danger: true });
          if (!ok) return;
          const { error } = await WT.supabase.rpc("remove_friendship", { friendship_id: remove.dataset.removeFriend });
          if (error) throw error;
          WT.toast("Amigo eliminado.", "success");
          await renderFriendsPanel(panel);
    if (window.bindPublicProfileTriggers) window.bindPublicProfileTriggers(modal.element);
        }
      } catch (error) {
        WT.toast(error.message || "No se pudo completar la acción.", "error");
        await renderFriendsPanel(panel);
    if (window.bindPublicProfileTriggers) window.bindPublicProfileTriggers(modal.element);
      }
    });
  }


  function renderLoggedOutAuthUI(area = WT.qs("#authArea")) {
    if (!area) return;
    syncAdminMenuLink(false);
    decorateMainMenu();
    buildMobileQuickNav(false);
    area.innerHTML = `<button class="btn btn-soft btn-small" id="loginBtn">Login</button><button class="btn btn-primary btn-small" id="registerBtn">Registro</button>`;
    WT.qs("#loginBtn")?.addEventListener("click", showLoginModal);
    WT.qs("#registerBtn")?.addEventListener("click", showRegisterModal);
  }

  async function refreshAuthUI() {
    const area = WT.qs("#authArea");
    if (!area) return;
    if (passwordRecoveryMode || document.body.classList.contains("password-recovery-mode")) {
      pendingRecoveryInfo = null;
      sessionUser = null;
      profile = null;
      renderLoggedOutAuthUI(area);
      return;
    }
    sessionUser = await WT.getCurrentUser();
    if (sessionUser) await ensureProfileFromAuth(sessionUser);
    profile = await WT.getMyProfile();
    if (profile?.user_preferences) {
      writeLocalPreferences(profile.user_preferences);
      applyPreferences(profile.user_preferences);
    } else {
      applyPreferences(readLocalPreferences());
    }
    if (profile?.status === "blocked") {
      await WT.supabase.auth.signOut();
      showBlockedModal(profile.block_reason || "Tu cuenta fue bloqueada por un administrador.");
      sessionUser = null; profile = null;
    }
    if (!sessionUser) {
      renderLoggedOutAuthUI(area);
      return;
    }
    const name = profile?.full_name || sessionUser.email || "Usuario";
    const hasAdminAccess = await canOpenAdminPanel(profile, sessionUser);
    document.body.classList.toggle("wt-has-admin-access", hasAdminAccess);
    syncAdminMenuLink(hasAdminAccess);
    decorateMainMenu();
    buildMobileQuickNav(hasAdminAccess);
    area.innerHTML = `<button class="notifications-btn" id="notificationsBtn" title="Notificaciones" aria-label="Notificaciones">🔔<span id="notificationCount" class="notification-count" hidden></span></button><button class="friends-btn" id="friendsBtn" title="Amigos" aria-label="Amigos"><svg class="friends-icon-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16.5 3.13a4 4 0 0 1 0 7.75"/></svg><span id="friendRequestCount" class="notification-count" hidden></span></button><button class="user-chip" id="profileBtn" title="Mi perfil"><img src="${WT.escapeHTML(avatar(profile?.photo_url))}" alt="Avatar"><span>${WT.escapeHTML(name)}</span></button>`;
    WT.qs("#profileBtn")?.addEventListener("click", showProfileModal);
    await bindFriendsButton();
    await bindNotificationButton();
  }

  function showBlockedModal(reason) {
    WT.showModal({ title: "Cuenta bloqueada", body: `<p>${WT.escapeHTML(reason)}</p>`, actions: [{ label: "Entendido", className: "btn-primary" }] });
  }

  function googleIconSvg() {
    return `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5Z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.2 4 9.4 8.5 6.3 14.7Z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.3 35.1 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.2 39.5 16 44 24 44Z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.5-.4-3.5Z"/></svg>`;
  }

  function authFormHTML(type) {
    const isLogin = type === "login";
    return `<div class="auth-oauth-panel">
      <button type="button" class="auth-google-btn" id="googleAuthBtn">${googleIconSvg()}<span>${isLogin ? "Continuar con Google" : "Registrarme con Google"}</span></button>
      <div class="auth-divider"><span>o usa tu correo</span></div>
    </div>
    <form class="form-grid auth-modern-form" id="authForm">
      ${!isLogin ? `<label>Nombre completo<input class="input" name="full_name" required placeholder="Nombre completo" maxlength="22" inputmode="text" autocomplete="name"><small class="form-help">Máximo 22 caracteres.</small></label>` : ""}
      <label>Correo<input class="input" type="email" name="email" required placeholder="correo@ejemplo.com"></label>
      <label>Contraseña<input class="input" type="password" name="password" required minlength="6" placeholder="Mínimo 6 caracteres"></label>
      <button class="btn btn-primary auth-submit" type="submit">${isLogin ? "Iniciar sesión" : "Crear cuenta"}</button>
      ${isLogin ? `<button type="button" class="btn btn-soft auth-link-btn" id="forgotPasswordBtn">Recuperar contraseña</button><button type="button" class="btn btn-soft auth-create-btn" id="createAccountBtn">Crear cuenta</button>` : `<button type="button" class="btn btn-soft auth-link-btn" id="goLoginBtn">Ya tengo cuenta</button>`}
    </form>`;
  }

  function showLoginModal() {
    const modal = WT.showModal({ title: "Iniciar sesión", body: authFormHTML("login"), className: "auth-liquid-modal login-liquid-modal" });
    const form = WT.qs("#authForm", modal.element);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!WT.canConnect) return WT.toast("La conexión de la plataforma no está configurada.", "error");
      const fd = new FormData(form);
      const { error } = await WT.supabase.auth.signInWithPassword({ email: fd.get("email"), password: fd.get("password") });
      if (error) return WT.toast(error.message, "error", "No se pudo iniciar sesión");
      WT.toast("Sesión iniciada correctamente", "success");
      modal.close(); await refreshAuthUI();
    });
    WT.qs("#googleAuthBtn", modal.element)?.addEventListener("click", signInWithGoogle);
    WT.qs("#forgotPasswordBtn", modal.element)?.addEventListener("click", showForgotPasswordModal);
    WT.qs("#createAccountBtn", modal.element)?.addEventListener("click", () => { modal.close(); showRegisterModal(); });
  }

  function showRegisterModal() {
    const modal = WT.showModal({ title: "Crear cuenta", body: authFormHTML("register"), className: "auth-liquid-modal register-liquid-modal" });
    const form = WT.qs("#authForm", modal.element);
    const fullNameInput = form?.elements?.full_name;
    fullNameInput?.addEventListener("input", () => {
      const clean = normalizeFullNameText(fullNameInput.value);
      if (fullNameInput.value !== clean) fullNameInput.value = clean;
    });
    fullNameInput?.addEventListener("blur", () => {
      fullNameInput.value = normalizeFullNameText(fullNameInput.value).trim();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!WT.canConnect) return WT.toast("La conexión de la plataforma no está configurada.", "error");
      const fd = new FormData(form);
      const nameCheck = validateFullName(fd.get("full_name") || "");
      if (!nameCheck.ok) return WT.toast(nameCheck.message, "error", "Nombre inválido");
      if (fullNameInput) fullNameInput.value = nameCheck.fullName;
      fd.set("full_name", nameCheck.fullName);
      const redirectTo = `${appBaseUrl()}index.html?type=signup`;
      const { data, error } = await WT.supabase.auth.signUp({
        email: fd.get("email"),
        password: fd.get("password"),
        options: {
          emailRedirectTo: redirectTo,
          data: { full_name: fd.get("full_name") }
        }
      });
      if (error) return WT.toast(error.message || "No pudimos crear la cuenta. Intenta nuevamente.", "error", "No se pudo registrar");
      if (data.user) await WT.supabase.from("user_profiles").upsert({
        id: data.user.id,
        email: fd.get("email"),
        full_name: fd.get("full_name"),
        username: usernameCandidateFrom({ name: fd.get("full_name"), email: fd.get("email"), id: data.user.id }),
        role: "user",
        status: "active"
      });
      modal.close();
      WT.toast("Cuenta creada correctamente. Revisa tu correo para verificarla.", "success");
      await refreshAuthUI();
    });
    WT.qs("#googleAuthBtn", modal.element)?.addEventListener("click", signInWithGoogle);
    WT.qs("#goLoginBtn", modal.element)?.addEventListener("click", () => { modal.close(); showLoginModal(); });
  }

  async function reservePasswordReset(email = "") {
    const limits = WT.cfg?.FORUM_LIMITS || {};
    const max = Number(limits.PASSWORD_RESETS_PER_DAY || 2);
    const cooldown = Number(limits.PASSWORD_RESET_COOLDOWN_MINUTES || 15);
    if (!email || !WT.supabase?.rpc) return { allowed: true };
    try {
      const { data, error } = await WT.supabase.rpc("reserve_password_reset", {
        email_text: String(email || "").trim().toLowerCase(),
        max_allowed: max,
        cooldown_minutes: cooldown
      });
      if (error) throw error;
      const payload = Array.isArray(data) ? data[0] : data;
      if (payload?.allowed === false) {
        throw new Error(payload.message || `Solo puedes solicitar ${max} correos de recuperación por día.`);
      }
      return payload || { allowed: true };
    } catch (error) {
      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("function") || msg.includes("schema cache") || msg.includes("not found")) {
        console.warn("Falta ejecutar el SQL de límites de recuperación:", error);
        return { allowed: true, missingSql: true };
      }
      throw error;
    }
  }

  function showForgotPasswordModal() {
    const modal = WT.showModal({ title: "Recuperar contraseña", className: "auth-liquid-modal forgot-liquid-modal", body: `<form class="form-grid" id="forgotForm"><label>Correo<input class="input" type="email" name="email" required></label><button class="btn btn-primary">Enviar enlace</button></form>` });
    WT.qs("#forgotForm", modal.element).addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = new FormData(event.currentTarget).get("email");
      try { await reservePasswordReset(email); }
      catch (limitError) { return WT.toast(limitError.message || "Límite de recuperación alcanzado.", "warning"); }
      const { error } = await WT.supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appBaseUrl()}index.html?type=recovery` });
      if (error) return WT.toast("No pudimos enviar el correo de recuperación. Verifica el correo o intenta más tarde.", "error");
      modal.close();
      WT.toast("Te enviamos un enlace para recuperar tu contraseña.", "success");
    });
  }

  function recoveryUrlInfo() {
    const params = new URLSearchParams(window.location.search || "");
    const hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    const get = key => params.get(key) || hash.get(key) || "";
    const type = get("type");
    const hasExplicitRecoveryType = type === "recovery" || /(?:[?&#])type=recovery(?:&|$)/i.test(window.location.href);
    const hasRecovery = hasExplicitRecoveryType;
    return {
      hasRecovery,
      type,
      code: get("code"),
      accessToken: get("access_token"),
      refreshToken: get("refresh_token"),
      error: get("error"),
      errorDescription: get("error_description")
    };
  }

  function cleanRecoveryUrl() {
    try {
      const clean = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, document.title, clean);
    } catch (_) {}
  }

  async function establishRecoverySessionIfNeeded() {
    if (!WT.supabase) throw new Error("La conexión de la plataforma no está configurada.");

    const current = await WT.supabase.auth.getSession();
    if (current?.data?.session?.user) return current.data.session;

    const info = pendingRecoveryInfo || recoveryUrlInfo();

    if (info?.code) {
      const { data, error } = await WT.supabase.auth.exchangeCodeForSession(info.code);
      if (error) throw error;
      return data?.session || null;
    }

    if (info?.accessToken && info?.refreshToken) {
      const { data, error } = await WT.supabase.auth.setSession({
        access_token: info.accessToken,
        refresh_token: info.refreshToken
      });
      if (error) throw error;
      return data?.session || null;
    }

    throw new Error("No se encontró una sesión válida de recuperación.");
  }

  function showUpdatePasswordModal({ force = false } = {}) {
    const existing = document.querySelector("#updatePasswordForm");
    if (existing) return;

    const modal = WT.showModal({
      title: "Crear nueva contraseña",
      className: "auth-liquid-modal forgot-liquid-modal update-password-modal",
      closeOnBackdrop: !force,
      body: `<form class="form-grid" id="updatePasswordForm">
        <p class="auth-help-text">Escribe tu nueva contraseña para terminar la recuperación de tu cuenta.</p>
        <label>Nueva contraseña<input class="input" type="password" name="password" required minlength="6" placeholder="Mínimo 6 caracteres" autocomplete="new-password"></label>
        <label>Confirmar contraseña<input class="input" type="password" name="confirm_password" required minlength="6" placeholder="Repite la contraseña" autocomplete="new-password"></label>
        <button class="btn btn-primary">Guardar nueva contraseña</button>
      </form>`
    });

    const form = WT.qs("#updatePasswordForm", modal.element);
    form?.addEventListener("submit", async event => {
      event.preventDefault();
      if (!WT.supabase) return WT.toast("La conexión de la plataforma no está configurada.", "error");

      const fd = new FormData(form);
      const password = String(fd.get("password") || "");
      const confirm = String(fd.get("confirm_password") || "");
      if (password.length < 6) return WT.toast("La contraseña debe tener mínimo 6 caracteres.", "warning");
      if (password !== confirm) return WT.toast("Las contraseñas no coinciden.", "warning");

      const button = form.querySelector("button");
      const originalText = button?.textContent || "Guardar nueva contraseña";
      if (button) {
        button.disabled = true;
        button.textContent = "Guardando...";
      }

      try {
        await establishRecoverySessionIfNeeded();
      } catch (_) {
        if (button) {
          button.disabled = false;
          button.textContent = originalText;
        }
        return WT.toast("El enlace de recuperación expiró o no es válido. Solicita otro correo.", "error");
      }

      const { error } = await WT.supabase.auth.updateUser({ password });
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }

      if (error) {
        return WT.toast("No pudimos cambiar la contraseña. Abre nuevamente el enlace de recuperación o solicita otro correo.", "error");
      }

      cleanRecoveryUrl();

      // Supabase abre una sesión temporal cuando el usuario entra desde el enlace
      // de recuperación. La cerramos para que NO quede iniciado automáticamente.
      try {
        await WT.supabase.auth.signOut();
        localStorage.removeItem("wt-guide-rd-auth-token");
        sessionStorage.removeItem("wt-guide-rd-auth-token");
      } catch (_) {}

      sessionUser = null;
      profile = null;
      WT.toast("Contraseña actualizada correctamente. Inicia sesión con tu nueva contraseña.", "success");
      passwordRecoveryMode = false;
      document.body.classList.remove("password-recovery-mode");
      modal.close();
      await refreshAuthUI();
      setTimeout(() => showLoginModal(), 350);
    });
  }

  function isAuthCallbackButNotRecovery() {
    const params = new URLSearchParams(window.location.search || "");
    const hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    const get = key => params.get(key) || hash.get(key) || "";
    const type = get("type");
    const hasCodeOrToken = Boolean(get("code") || get("access_token") || get("refresh_token"));
    const isGoogleReturn = get("auth") === "google" || Boolean(get("provider_token") || get("provider_refresh_token"));
    return hasCodeOrToken && !isGoogleReturn && (type === "signup" || type === "email_confirmation" || type === "invite");
  }

  async function handleSignupConfirmationReturn() {
    if (!WT.supabase || !isAuthCallbackButNotRecovery()) return false;
    try {
      const params = new URLSearchParams(window.location.search || "");
      const code = params.get("code");
      if (code) {
        try { await WT.supabase.auth.exchangeCodeForSession(code); } catch (_) {}
      }
      cleanRecoveryUrl();
      WT.toast("Cuenta verificada correctamente. Ya puedes iniciar sesión.", "success");
      try {
        await WT.supabase.auth.signOut();
        localStorage.removeItem("wt-guide-rd-auth-token");
        sessionStorage.removeItem("wt-guide-rd-auth-token");
      } catch (_) {}
      sessionUser = null;
      profile = null;
      setTimeout(() => showLoginModal(), 350);
      return true;
    } catch (_) {
      cleanRecoveryUrl();
      WT.toast("Cuenta verificada. Inicia sesión para continuar.", "success");
      setTimeout(() => showLoginModal(), 350);
      return true;
    }
  }

  async function handlePasswordRecoveryReturn() {
    if (!WT.supabase) return false;

    const info = recoveryUrlInfo();
    if (info.error || info.errorDescription) {
      cleanRecoveryUrl();
      WT.toast(info.errorDescription || "El enlace de recuperación no es válido o expiró.", "error");
      return true;
    }

    if (!info.hasRecovery) return false;

    // Importante: NO intercambiamos el código ni guardamos la sesión aquí.
    // Supabase necesita una sesión temporal para cambiar la contraseña, pero
    // la creamos solamente al presionar "Guardar nueva contraseña". Así la app
    // nunca se muestra como iniciada automáticamente.
    pendingRecoveryInfo = info;
    passwordRecoveryMode = true;
    document.body.classList.add("password-recovery-mode");
    cleanRecoveryUrl();
    renderLoggedOutAuthUI();
    setTimeout(() => showUpdatePasswordModal({ force: true }), 250);
    return true;
  }

  function fileExtensionFromBlob(blob) {
    const mime = blob?.type || "image/webp";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("png")) return "png";
    if (mime.includes("webp")) return "webp";
    return "webp";
  }

  async function getCurrentProfilePhotoFile() {
    const currentUrl = WT.sanitizeImageUrl(profile?.photo_url || "", "");
    if (!currentUrl) return null;

    try {
      const response = await fetch(currentUrl, { mode: "cors", cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo cargar la foto actual.");
      const blob = await response.blob();
      return new File([blob], `avatar-actual.${fileExtensionFromBlob(blob)}`, { type: blob.type || "image/webp" });
    } catch (_) {
      return null;
    }
  }

  async function sendAutoBlockEmailIfNeeded(accountStatus = {}) {
    if (!sessionUser || !WT.supabase?.functions?.invoke) return;
    const isBlocked = String(accountStatus.status || "active").toLowerCase() === "blocked" || accountStatus.blocked === true;
    const needsEmail = accountStatus.needs_block_email === true || (isBlocked && !accountStatus.block_email_sent_at);
    if (!isBlocked || !needsEmail) return;
    try {
      const reason = accountStatus.reason || accountStatus.block_reason || "Tu cuenta fue bloqueada automáticamente por incumplir las normas de la comunidad.";
      await WT.supabase.functions.invoke("send-ban-email", {
        body: {
          user_id: sessionUser.id,
          target_user_id: sessionUser.id,
          block_reason: reason,
          reason,
          automatic: true
        }
      });
      if (window.WTPush?.sendPushNotification) {
        await window.WTPush.sendPushNotification(sessionUser.id, {
          title: "Cuenta bloqueada",
          body: reason,
          url: "foro.html",
          type: "account_blocked",
          tag: "account-blocked"
        }).catch(() => null);
      }
    } catch (error) {
      console.warn("No se pudo enviar el correo de bloqueo automático", error);
    }
  }

  async function fetchAccountStatus() {
    if (!sessionUser || !WT.supabase) return { activeWarnings: 0, status: profile?.status || "active" };
    try {
      if (WT.supabase.rpc) {
        const { data, error } = await WT.supabase.rpc("get_forum_account_status", { target_user_id: sessionUser.id });
        if (!error && data) {
          const payload = typeof data === "string" ? JSON.parse(data) : data;
          const normalized = payload?.data && typeof payload.data === "object" ? payload.data : payload;
          const status = String(normalized.status || (normalized.blocked ? "blocked" : profile?.status || "active")).toLowerCase();
          const activeWarnings = Number(normalized.warnings_active || normalized.activeWarnings || 0);
          const result = {
            activeWarnings,
            status,
            blocked: normalized.blocked === true || status === "blocked",
            reason: normalized.reason || normalized.block_reason || "",
            block_reason: normalized.block_reason || normalized.reason || "",
            block_email_sent_at: normalized.block_email_sent_at || null,
            needs_block_email: Boolean(normalized.needs_block_email)
          };
          if (result.blocked) {
            profile = { ...(profile || {}), status: "blocked", block_reason: result.block_reason || result.reason };
            await sendAutoBlockEmailIfNeeded(result);
          }
          return result;
        }
      }
    } catch (error) {
      console.warn("No se pudo consultar el estado de cuenta por RPC", error);
    }

    try {
      const { count } = await WT.supabase
        .from("forum_warnings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", sessionUser.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString());
      const fallbackStatus = String(profile?.status || "active").toLowerCase();
      return { activeWarnings: count || 0, status: fallbackStatus, blocked: fallbackStatus === "blocked", reason: profile?.block_reason || "" };
    } catch (_) {
      return { activeWarnings: 0, status: profile?.status || "active", blocked: String(profile?.status || "active").toLowerCase() === "blocked" };
    }
  }

  function renderAccountStatusCard(accountStatus = {}) {
    const activeWarnings = Number(accountStatus.activeWarnings || 0);
    const isBlocked = accountStatus.blocked === true || String(accountStatus.status || "active").toLowerCase() === "blocked";
    const good = activeWarnings <= 0 && !isBlocked;
    const stateLabel = isBlocked ? "Bloqueada" : good ? "Activa" : "En observación";
    const helpText = isBlocked
      ? "Contacta soporte si necesitas que tu caso sea revisado."
      : good
        ? "Tu cuenta está en buen estado."
        : "Tu cuenta tiene advertencias activas. Mantén una participación respetuosa.";
    return `<section class="settings-group account-status-group account-status-modern">
      <div class="account-status-modern-head">
        <span class="account-status-kicker">Estado de cuenta</span>
        <strong>${WT.escapeHTML(stateLabel)}</strong>
      </div>
      <div class="account-status-card ${isBlocked ? "is-blocked" : good ? "is-good" : "has-warning"}">
        <div class="account-status-metric"><span>Advertencias activas</span><b>${WT.escapeHTML(String(activeWarnings))}</b></div>
        <p>${WT.escapeHTML(helpText)}</p>
        ${isBlocked ? `<details class="account-block-help"><summary>Ver información del bloqueo</summary><p>Tu cuenta fue bloqueada por incumplimiento de las normas de la comunidad. Para más detalles, comunícate con soporte.</p></details>` : ""}
      </div>
    </section>`;
  }



  function getPushConfig() {
    return window.WT_SUPABASE_CONFIG?.PUSH_NOTIFICATIONS || {};
  }

  function pushSupported() {
    return Boolean("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function getPushStatus() {
    const cfg = getPushConfig();
    if (!cfg.ENABLED) return { supported: false, enabled: false, reason: "Las notificaciones push no están activadas." };
    if (!pushSupported()) return { supported: false, enabled: false, reason: "Este navegador no soporta notificaciones push." };
    const permission = Notification.permission;
    let hasSubscription = false;
    try {
      const reg = await navigator.serviceWorker.ready;
      hasSubscription = Boolean(await reg.pushManager.getSubscription());
    } catch (_) {}
    return { supported: true, enabled: permission === "granted" && hasSubscription, permission };
  }

  function pushNotificationNote() {
    const cfg = getPushConfig();
    const vapidReady = Boolean(String(cfg.VAPID_PUBLIC_KEY || "").trim());
    const supported = pushSupported();
    if (!supported) return "Este navegador no permite notificaciones push. En iPhone, abre la web app instalada para activarlas.";
    if (!vapidReady) return "Las notificaciones todavía no están disponibles en este momento.";
    return "Activa avisos importantes del foro, moderación y PDFs listos.";
  }

  function renderPushNotificationCard() {
    const cfg = getPushConfig();
    const vapidReady = Boolean(String(cfg.VAPID_PUBLIC_KEY || "").trim());
    const supported = pushSupported();
    const title = "Notificaciones del dispositivo";
    const note = pushNotificationNote();
    return `<section class="settings-group push-settings-group">
      <h4>${WT.escapeHTML(title)}</h4>
      <div class="settings-list">
        <div class="settings-row push-single-row ${supported && vapidReady ? "" : "is-disabled"}">
          <span class="settings-icon">🔔</span>
          <span class="settings-row-text"><b>Push en este dispositivo</b><small id="pushStatusText">${WT.escapeHTML(note)}</small></span>
          <button type="button" class="btn btn-soft push-single-button" id="pushDeviceButton" ${supported && vapidReady ? "" : "disabled"}>Abrir ventana</button>
        </div>
      </div>
    </section>`;
  }

  const PUSH_PROMPT_HIDE_UNTIL_KEY = "wt_push_prompt_hide_until";

  async function getPublicSiteSetting(key, fallback = null) {
    if (!WT.canConnect) return fallback;
    try {
      const { data, error } = await WT.supabase
        .from("site_settings")
        .select("value")
        .eq("key", key)
        .eq("is_public", true)
        .maybeSingle();
      if (error || !data) return fallback;
      return WT.parseSettingValue ? WT.parseSettingValue(data.value) : data.value;
    } catch (_) { return fallback; }
  }

  async function getPushPromptHideDays() {
    const value = await getPublicSiteSetting("notification_prompt_hide_days", 15);
    const days = Number(value);
    if (!Number.isFinite(days) || days <= 0) return 15;
    return Math.min(Math.max(days, 1), 365);
  }

  async function hidePushPromptForConfiguredTime() {
    const days = await getPushPromptHideDays();
    const until = Date.now() + days * 24 * 60 * 60 * 1000;
    try { localStorage.setItem(PUSH_PROMPT_HIDE_UNTIL_KEY, String(until)); } catch (_) {}
    try { sessionStorage.setItem("wt_push_prompt_seen", "1"); } catch (_) {}
  }

  function pushPromptHiddenByUser() {
    try {
      const until = Number(localStorage.getItem(PUSH_PROMPT_HIDE_UNTIL_KEY) || 0);
      if (!until) return false;
      if (Date.now() < until) return true;
      localStorage.removeItem(PUSH_PROMPT_HIDE_UNTIL_KEY);
      return false;
    } catch (_) { return false; }
  }

  async function showPushNotificationPrompt(sourceElement = document, { auto = false } = {}) {
    const user = await WT.getCurrentUser();
    if (!user) return null;
    const cfg = getPushConfig();
    const vapidReady = Boolean(String(cfg.VAPID_PUBLIC_KEY || "").trim());
    const supported = pushSupported();
    const status = supported && vapidReady ? await getPushStatus().catch(() => ({ enabled: false })) : { enabled: false };
    const enabled = Boolean(status.enabled);
    const title = enabled ? "Notificaciones activadas" : "Activar notificaciones";
    const note = enabled
      ? "Este dispositivo ya está registrado para recibir avisos de Work and Travel RD."
      : "Actívalas para recibir avisos importantes de tu cuenta y del foro.";
    const body = `<section class="push-permission-prompt ${enabled ? "is-enabled" : ""}">
      <div class="push-permission-icon" aria-hidden="true">🔔</div>
      <h3>${WT.escapeHTML(title)}</h3>
      <p>${WT.escapeHTML(note)}</p>
      <div class="push-permission-summary" role="list" aria-label="Avisos incluidos">
        <span role="listitem">Foro: comentarios y respuestas</span>
        <span role="listitem">Cuenta: aprobaciones, advertencias y bloqueos</span>
        <span role="listitem">Archivos: resúmenes PDF listos</span>
      </div>
      <p class="push-permission-status" id="pushPromptStatus">${enabled ? "Notificaciones activadas en este dispositivo." : "Puedes activarlas ahora o más tarde desde Mi perfil."}</p>
    </section>`;
    const actions = enabled
      ? [{ label: "Cerrar", className: "btn-primary" }]
      : [
          { label: "Ahora no", className: "btn-soft" },
          {
            label: "No volver a mostrar",
            className: "btn-soft",
            close: false,
            onClick: async ({ close }) => {
              await hidePushPromptForConfiguredTime();
              close();
              WT.toast("Listo. Puedes activar las notificaciones cuando quieras desde Mi perfil.", "success");
            }
          },
          {
            label: "Activar notificaciones",
            className: "btn-primary",
            close: false,
            onClick: async ({ close, modal, button }) => {
              const statusEl = WT.qs("#pushPromptStatus", modal);
              button.disabled = true;
              try {
                if (statusEl) statusEl.textContent = "Solicitando permiso del dispositivo...";
                await enablePushNotificationsForDevice(sourceElement || modal);
                if (statusEl) statusEl.textContent = "Notificaciones activadas correctamente.";
                setTimeout(() => close(), 650);
              } catch (err) {
                if (statusEl) statusEl.textContent = err.message || "No se pudieron activar las notificaciones.";
                WT.toast(err.message || "No se pudieron activar las notificaciones.", "error");
                button.disabled = false;
              }
            }
          }
        ];
    return WT.showModal({ title: "Permiso de notificaciones", body, actions, className: `push-permission-modal ${auto ? "is-auto" : ""}` });
  }

  async function maybeShowPushNotificationPrompt() {
    try {
      if (sessionStorage.getItem("wt_push_prompt_seen") === "1") return;
      if (pushPromptHiddenByUser()) return;
      const cfg = getPushConfig();
      if (!cfg.ENABLED || !pushSupported()) return;
      const status = await getPushStatus();
      if (status.enabled || status.permission === "denied") return;
      sessionStorage.setItem("wt_push_prompt_seen", "1");
      setTimeout(() => {
        if (!document.querySelector(".modal-backdrop, .notification-top-backdrop")) {
          showPushNotificationPrompt(document, { auto: true });
        }
      }, 1200);
    } catch (_) {}
  }

  async function enablePushNotificationsForDevice(modalElement = document) {
    const user = await WT.getCurrentUser();
    if (!user) return WT.toast("Debes iniciar sesión para activar notificaciones.", "warning");
    const cfg = getPushConfig();
    const publicKey = String(cfg.VAPID_PUBLIC_KEY || "").trim();
    if (!pushSupported()) return WT.toast("Este navegador no soporta notificaciones push.", "warning");
    if (!publicKey) return WT.toast("Las notificaciones todavía no están disponibles en este momento.", "warning");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return WT.toast("Permiso de notificaciones no concedido.", "warning");

    const registration = await navigator.serviceWorker.register("./service-worker.js");
    const readyRegistration = await navigator.serviceWorker.ready;
    let subscription = await readyRegistration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }
    const json = subscription.toJSON();
    const payload = {
      endpoint_text: json.endpoint,
      p256dh_text: json.keys?.p256dh || "",
      auth_text: json.keys?.auth || "",
      device_name_text: /iphone|ipad/i.test(navigator.userAgent) ? "iPhone/iPad" : /android/i.test(navigator.userAgent) ? "Android" : "PC/Navegador",
      user_agent_text: navigator.userAgent
    };
    const row = {
      user_id: user.id,
      endpoint: payload.endpoint_text,
      p256dh: payload.p256dh_text,
      auth: payload.auth_text,
      device_name: payload.device_name_text,
      user_agent: payload.user_agent_text,
      is_active: true,
      updated_at: new Date().toISOString()
    };
    const { error: insertError } = await WT.supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "user_id,endpoint" });
    if (insertError) {
      const { error: rpcError } = await WT.supabase.rpc("save_push_subscription", payload);
      if (rpcError) throw insertError;
    }
    const statusEl = WT.qs("#pushStatusText", modalElement);
    const button = WT.qs("#pushDeviceButton", modalElement);
    if (statusEl) statusEl.textContent = "Notificaciones activadas en este dispositivo.";
    if (button) {
      button.textContent = "Desactivar";
      button.dataset.pushEnabled = "true";
      button.classList.add("is-active");
    }
    WT.toast("Notificaciones activadas en este dispositivo.", "success");
  }

  async function disablePushNotificationsForDevice(modalElement = document) {
    const user = await WT.getCurrentUser();
    if (!user) return WT.toast("Debes iniciar sesión para desactivar notificaciones.", "warning");

    let endpoint = "";
    let unsubscribed = false;

    if (pushSupported()) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          endpoint = subscription.endpoint || "";
          try { unsubscribed = await subscription.unsubscribe(); } catch (_) { unsubscribed = false; }
        }
      } catch (_) {}
    }

    const now = new Date().toISOString();
    let saved = false;
    let lastError = null;

    try {
      const { error } = await WT.supabase.rpc("disable_current_device_push_subscription", {
        endpoint_text: endpoint || null,
        user_agent_text: navigator.userAgent || null
      });
      if (error) throw error;
      saved = true;
    } catch (error) {
      lastError = error;
    }

    if (!saved && endpoint) {
      try {
        const { error } = await WT.supabase
          .from("push_subscriptions")
          .update({ is_active: false, updated_at: now })
          .eq("user_id", user.id)
          .eq("endpoint", endpoint);
        if (error) throw error;
        saved = true;
      } catch (error) {
        lastError = error;
      }
    }

    if (!saved) {
      try {
        const { error } = await WT.supabase
          .from("push_subscriptions")
          .update({ is_active: false, updated_at: now })
          .eq("user_id", user.id)
          .eq("user_agent", navigator.userAgent || "");
        if (error) throw error;
        saved = true;
      } catch (error) {
        lastError = error;
      }
    }

    if (!saved) {
      throw new Error(lastError?.message || "No se pudo desactivar la suscripción en este momento.");
    }

    const statusEl = WT.qs("#pushStatusText", modalElement);
    const button = WT.qs("#pushDeviceButton", modalElement);
    if (statusEl) statusEl.textContent = "Notificaciones desactivadas en este dispositivo.";
    if (button) {
      button.textContent = "Activar notificaciones";
      button.dataset.pushEnabled = "false";
      button.classList.remove("is-active");
    }
    WT.toast(unsubscribed || endpoint ? "Notificaciones desactivadas en este dispositivo." : "Notificaciones desactivadas para este dispositivo.", "success");
  }

  async function sendPushNotification(userId, { title = "Work and Travel RD", body = "Tienes una nueva notificación.", url = "foro.html", type = "general", tag = "work-travel-rd" } = {}) {
    if (!userId || !WT.supabase?.functions?.invoke) return { skipped: true };
    try {
      return await WT.supabase.functions.invoke(getPushConfig().EDGE_FUNCTION || "send-push-notification", {
        body: { user_id: userId, title, body, url, type, tag }
      });
    } catch (error) {
      console.warn("No se pudo enviar push", error);
      return { error };
    }
  }

  window.WTPush = { enablePushNotificationsForDevice, disablePushNotificationsForDevice, sendPushNotification, getPushStatus, showPushNotificationPrompt, maybeShowPushNotificationPrompt };

  async function showProfileModal() {
    profile = await WT.getMyProfile();
    const accountStatus = await fetchAccountStatus();
    const prefs = readPreferences();
    const displayName = profile?.full_name || sessionUser?.email || "Usuario";
    const currentUsername = normalizeUsernameText(profile?.username || usernameCandidateFrom({ name: displayName, email: profile?.email || sessionUser?.email, id: profile?.id || sessionUser?.id }));
    const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "U";

    const body = `<form class="account-settings-form" id="profileForm">
      <section class="account-profile-header">
        <div class="account-avatar-wrap">
          <img class="account-avatar-img" id="profilePhotoPreview" src="${WT.escapeHTML(avatar(profile?.photo_url))}" alt="Foto de perfil" onerror="this.hidden=true; this.nextElementSibling.hidden=false;">
          <span class="account-avatar-fallback" hidden>${WT.escapeHTML(initials)}</span>
          <button type="button" class="account-avatar-edit" id="chooseProfilePhotoBtn" aria-label="Cambiar foto">✎</button>
          <input class="sr-only" id="profilePhotoInput" type="file" name="photo" accept="image/png,image/jpeg,image/webp,image/*">
        </div>
        <h3>${WT.escapeHTML(displayName)}</h3>
        <p>${WT.escapeHTML(profile?.email || sessionUser?.email || "")}</p>
        <p class="account-username-preview" id="profileUsernamePreview">${renderUsernameTag(currentUsername)}</p>
        <div class="account-role-line">${WT.renderRoleBadge(profile?.role || "user")}</div>
      </section>

      <section class="settings-group">
        <h4>Cuenta</h4>
        <div class="settings-list">
          <div class="settings-row static-row">
            <span class="settings-icon">✉️</span>
            <span class="settings-row-text"><b>Correo electrónico</b><small>${WT.escapeHTML(profile?.email || sessionUser?.email || "")}</small></span>
          </div>
          <div class="settings-row static-row">
            <span class="settings-icon">🏅</span>
            <span class="settings-row-text"><b>Rol</b><small>${WT.escapeHTML(profile?.role || "user")}</small></span>
          </div>
        </div>
      </section>

      ${renderAccountStatusCard(accountStatus)}
      ${renderPushNotificationCard()}

      <section class="settings-group">
        <h4>Perfil público</h4>
        <div class="settings-list settings-edit-list">
          <label class="settings-field username-field"><span>@usuario</span><div class="username-input-wrap wt-username-final"><span class="username-at">@</span><input class="input" name="username" id="profileUsernameInput" value="${WT.escapeHTML(currentUsername)}" placeholder="tu_usuario" autocomplete="off" maxlength="16"></div><small class="username-status" id="profileUsernameStatus">Tu @usuario será único y visible en tu perfil.</small></label>
          <label class="settings-field"><span>Nombre completo</span><input class="input" name="full_name" id="profileFullNameInput" value="${WT.escapeHTML(normalizeFullNameText(profile?.full_name || ""))}" placeholder="Nombre completo" maxlength="22" autocomplete="name"><small>Máximo 22 caracteres.</small></label>
          <label class="settings-field"><span>Biografía</span><textarea class="input" name="bio" rows="3" placeholder="Cuéntale a la comunidad quién eres...">${WT.escapeHTML(profile?.bio || "")}</textarea></label>
          <div class="two compact-two">
            <label class="settings-field"><span>Ciudad</span><input class="input" name="city" value="${WT.escapeHTML(profile?.city || "")}" placeholder="Ej: Mao"></label>
            <label class="settings-field"><span>Año del programa</span><input class="input" name="program_year" value="${WT.escapeHTML(profile?.program_year || "")}" placeholder="Ej: 2026"></label>
          </div>
          <label class="settings-field country-select-field"><span>País</span><input class="input" name="country" id="profileCountryInput" list="profileCountryList" value="${WT.escapeHTML(normalizeProfileCountry(profile?.country || ""))}" placeholder="Buscar o seleccionar país" autocomplete="off"><datalist id="profileCountryList">${profileCountryOptionsHTML()}</datalist><small>Selecciona un país de habla hispana.</small></label>
          <label class="settings-field"><span>Sponsor</span><input class="input" name="sponsor" value="${WT.escapeHTML(profile?.sponsor || "")}" placeholder="Ej: Greenheart"></label>
        </div>
      </section>

      <section class="settings-group">
        <h4>Tema y navegación</h4>
        <div class="settings-list">
          <label class="settings-row setting-switch-row">
            <span class="settings-icon">🌙</span>
            <span class="settings-row-text"><b>Modo oscuro del foro</b><small>Solo cambia el foro y las publicaciones.</small></span>
            <input type="checkbox" name="forum_dark_mode" id="forumDarkModeToggle">
          </label>
          <label class="settings-row setting-switch-row">
            <span class="settings-icon">📱</span>
            <span class="settings-row-text"><b>Ocultar barra inferior</b><small>Si la ocultas, vuelve el menú de tres rayas.</small></span>
            <input type="checkbox" name="hide_quick_nav" id="hideQuickNavToggle">
          </label>
        </div>
      </section>

      <section class="settings-group">
        <h4>Foto de perfil</h4>
        <div class="settings-list">
          <button type="button" class="settings-row button-row" id="chooseProfilePhotoRow"><span class="settings-icon">📷</span><span class="settings-row-text"><b>Cambiar foto</b><small>Selecciona y ajusta una nueva imagen.</small></span><span class="settings-chevron">›</span></button>
          <button type="button" class="settings-row button-row" id="useGooglePhotoBtn" ${googleProfilePhotoFromUser() ? "" : "hidden"}><span class="settings-icon google-mini-icon">G</span><span class="settings-row-text"><b>Usar foto de Google</b><small>Toma la foto de tu cuenta Google como foto pública.</small></span><span class="settings-chevron">›</span></button>
          <button type="button" class="settings-row button-row danger-row" id="removeProfilePhotoBtn" ${profile?.photo_url ? "" : "hidden"}><span class="settings-icon">🗑️</span><span class="settings-row-text"><b>Eliminar foto actual</b><small>Quita tu foto y usa el avatar por defecto.</small></span><span class="settings-chevron">›</span></button>
        </div>
      </section>

      <div class="profile-final-actions" data-profile-final-actions>
        <button type="button" class="btn btn-soft profile-logout-action" id="logoutBtn">Cerrar sesión</button>
        <button class="btn btn-primary profile-save-action" type="submit">Guardar cambios</button>
      </div>
    </form>`;

    const modal = WT.showModal({ title: "Mi perfil", body, className: "profile-settings-modal account-settings-modal" });
    const form = WT.qs("#profileForm", modal.element);
    const input = WT.qs("#profilePhotoInput", modal.element);
    const chooseBtn = WT.qs("#chooseProfilePhotoBtn", modal.element);
    const chooseRow = WT.qs("#chooseProfilePhotoRow", modal.element);
    const removePhotoBtn = WT.qs("#removeProfilePhotoBtn", modal.element);
    const useGooglePhotoBtn = WT.qs("#useGooglePhotoBtn", modal.element);
    const preview = WT.qs("#profilePhotoPreview", modal.element);
    let editedPhoto = null;
    let originalFile = null;
    let removePhoto = false;
    let useGooglePhoto = false;
    const forumDarkToggle = WT.qs("#forumDarkModeToggle", modal.element);
    const quickNavToggle = WT.qs("#hideQuickNavToggle", modal.element);
    const usernameInput = WT.qs("#profileUsernameInput", modal.element);
    const usernameStatus = WT.qs("#profileUsernameStatus", modal.element);
    const usernamePreview = WT.qs("#profileUsernamePreview", modal.element);
    const fullNameInput = WT.qs("#profileFullNameInput", modal.element);
    const countryInput = WT.qs("#profileCountryInput", modal.element);
    let usernameCheckTimer = null;
    let lastUsernameAvailability = null;

    function setUsernameStatus(text, state = "neutral") {
      if (!usernameStatus) return;
      usernameStatus.textContent = text;
      usernameStatus.dataset.state = state;
    }

    async function refreshUsernameAvailability({ immediate = false } = {}) {
      const value = normalizeUsernameText(usernameInput?.value || "");
      if (usernameInput && usernameInput.value !== value) usernameInput.value = value;
      if (usernamePreview) usernamePreview.textContent = `@${value || "usuario"}`;
      const validation = validateUsername(value);
      if (!validation.ok) {
        lastUsernameAvailability = { ...validation, available: false };
        setUsernameStatus(validation.message, "error");
        return lastUsernameAvailability;
      }
      setUsernameStatus("Verificando disponibilidad...", "checking");
      const result = await checkUsernameAvailability(value, sessionUser?.id);
      lastUsernameAvailability = result;
      setUsernameStatus(result.message, result.available ? "ok" : "error");
      return result;
    }

    usernameInput?.addEventListener("input", () => {
      const clean = normalizeUsernameText(usernameInput.value);
      if (usernameInput.value !== clean) usernameInput.value = clean;
      if (usernamePreview) usernamePreview.textContent = `@${clean || "usuario"}`;
      clearTimeout(usernameCheckTimer);
      usernameCheckTimer = setTimeout(() => refreshUsernameAvailability(), 450);
    });
    usernameInput?.addEventListener("blur", () => refreshUsernameAvailability({ immediate: true }));
    refreshUsernameAvailability();

    fullNameInput?.addEventListener("input", () => {
      const clean = normalizeFullNameText(fullNameInput.value);
      if (fullNameInput.value !== clean) fullNameInput.value = clean;
    });
    fullNameInput?.addEventListener("blur", () => {
      fullNameInput.value = normalizeFullNameText(fullNameInput.value).trim();
    });

    countryInput?.addEventListener("blur", () => {
      const normalizedCountry = normalizeProfileCountry(countryInput.value);
      if (countryInput.value.trim() && !normalizedCountry) {
        countryInput.value = "";
        WT.toast("Selecciona un país válido de la lista.", "warning");
        return;
      }
      countryInput.value = normalizedCountry;
    });

    if (forumDarkToggle) forumDarkToggle.checked = prefs.forum_dark_mode === true || prefs.forum_dark_mode === "true";
    if (quickNavToggle) quickNavToggle.checked = prefs.hide_quick_nav === true || prefs.hide_quick_nav === "true";
    forumDarkToggle?.addEventListener("change", () => savePreferences({ forum_dark_mode: forumDarkToggle.checked, dark_mode: false }));
    quickNavToggle?.addEventListener("change", () => savePreferences({ hide_quick_nav: quickNavToggle.checked }));

    const pushButton = WT.qs("#pushDeviceButton", modal.element);
    if (pushButton) {
      getPushStatus().then((status) => {
        const enabled = Boolean(status.enabled);
        pushButton.dataset.pushEnabled = enabled ? "true" : "false";
        pushButton.textContent = enabled ? "Desactivar" : "Abrir ventana";
        pushButton.classList.toggle("is-active", enabled);
        const statusEl = WT.qs("#pushStatusText", modal.element);
        if (statusEl && enabled) statusEl.textContent = "Notificaciones activadas en este dispositivo.";
      }).catch(() => {});
      pushButton.addEventListener("click", async () => {
        const enabled = pushButton.dataset.pushEnabled === "true";
        if (!enabled) {
          await showPushNotificationPrompt(modal.element);
          return;
        }
        pushButton.disabled = true;
        const statusEl = WT.qs("#pushStatusText", modal.element);
        try {
          if (statusEl) statusEl.textContent = "Desactivando notificaciones...";
          await disablePushNotificationsForDevice(modal.element);
        } catch (err) {
          if (statusEl) statusEl.textContent = err.message || "No se pudo cambiar el estado de las notificaciones.";
          WT.toast(err.message || "No se pudo cambiar el estado de las notificaciones.", "error");
        } finally {
          pushButton.disabled = false;
        }
      });
    }

    async function openEditorForFile(file) {
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        WT.toast("La imagen es demasiado grande. Usa una imagen menor de 10 MB.", "warning");
        return;
      }
      try {
        const edited = await WTImageEditor.open({
          file,
          aspectRatio: "1:1",
          title: "Ajustar foto de perfil",
          maxOutputWidth: 900,
          maxBytes: 1900000
        });
        editedPhoto = edited;
        preview.hidden = false;
        const fallback = WT.qs(".account-avatar-fallback", modal.element);
        if (fallback) fallback.hidden = true;
        preview.src = edited.dataUrl;
        removePhoto = false;
        if (removePhotoBtn) removePhotoBtn.hidden = false;
        WT.toast("Imagen ajustada correctamente. Ahora guarda el perfil.", "success");
      } catch (error) {
        if (error.message !== "Edición cancelada") WT.toast(error.message || "No se pudo editar la imagen", "error");
      }
    }

    const triggerPhotoPicker = (event) => {
      event.preventDefault();
      input.click();
    };
    chooseBtn?.addEventListener("click", triggerPhotoPicker);
    chooseRow?.addEventListener("click", triggerPhotoPicker);

    removePhotoBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      removePhoto = true;
      editedPhoto = null;
      originalFile = null;
      preview.src = "images/placeholder-avatar.png";
      preview.hidden = false;
      const fallback = WT.qs(".account-avatar-fallback", modal.element);
      if (fallback) fallback.hidden = true;
      if (input) input.value = "";
      WT.toast("Foto marcada para eliminar. Toca Guardar cambios para confirmar.", "info");
    });
    useGooglePhotoBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      const googlePhoto = googleProfilePhotoFromUser();
      if (!googlePhoto) return WT.toast("Tu cuenta no tiene foto de Google disponible.", "warning");
      useGooglePhoto = true;
      removePhoto = false;
      editedPhoto = null;
      originalFile = null;
      preview.src = googlePhoto;
      preview.hidden = false;
      const fallback = WT.qs(".account-avatar-fallback", modal.element);
      if (fallback) fallback.hidden = true;
      if (removePhotoBtn) removePhotoBtn.hidden = false;
      WT.toast("Foto de Google seleccionada. Toca Guardar cambios para confirmar.", "success");
    });


    input.addEventListener("change", async () => {
      removePhoto = false;
      useGooglePhoto = false;
      originalFile = input.files?.[0] || null;
      await openEditorForFile(originalFile);
    });

    async function logoutCurrentUser() {
      const logoutBtn = WT.qs("#logoutBtn", modal.element);
      const originalText = logoutBtn?.textContent || "Cerrar sesión";

      function clearLocalAuthState() {
        sessionUser = null;
        profile = null;
        syncAdminMenuLink(false);
        try {
          sessionStorage.setItem("wt_logout_done", "1");
          localStorage.removeItem("wt_current_user_cache");
          localStorage.removeItem("wt_profile_cache");
          Object.keys(localStorage).forEach((key) => {
            if (/^sb-.+-auth-token$/.test(key) || key.includes("supabase.auth.token")) {
              localStorage.removeItem(key);
            }
          });
          Object.keys(sessionStorage).forEach((key) => {
            if (/^sb-.+-auth-token$/.test(key) || key.includes("supabase.auth.token")) {
              sessionStorage.removeItem(key);
            }
          });
        } catch (_) {}
      }

      function finishLogout() {
        clearLocalAuthState();
        try { modal.close(); } catch (_) {}
        try { refreshAuthUI(); } catch (_) {}
        const cleanUrl = window.location.origin + window.location.pathname + "?logout=" + Date.now();
        window.location.replace(cleanUrl);
        setTimeout(() => {
          try { window.location.href = cleanUrl; } catch (_) {}
          try { window.location.reload(); } catch (_) {}
        }, 700);
      }

      try {
        if (logoutBtn) {
          logoutBtn.disabled = true;
          logoutBtn.textContent = "Cerrando sesión...";
        }

        if (WT.supabase?.auth?.signOut) {
          const signOutPromise = WT.supabase.auth.signOut();
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 2500));
          const result = await Promise.race([signOutPromise, timeoutPromise]);
          if (result?.error) throw result.error;
        }

        finishLogout();
      } catch (error) {
        console.warn("Logout fallback:", error);
        WT.toast("Cerrando sesión localmente...", "info");
        finishLogout();
        setTimeout(() => {
          if (logoutBtn) {
            logoutBtn.disabled = false;
            logoutBtn.textContent = originalText;
          }
        }, 1200);
      }
    }

    WT.qs("#logoutBtn", modal.element)?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await logoutCurrentUser();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const user = await WT.getCurrentUser();
      if (!user) return WT.toast("Debes iniciar sesión para guardar tu perfil.", "warning");

      const fd = new FormData(form);
      const usernameCheck = await checkUsernameAvailability(fd.get("username") || "", user.id);
      if (!usernameCheck.ok || !usernameCheck.available) {
        setUsernameStatus(usernameCheck.message || "Ese @usuario no está disponible.", "error");
        return WT.toast(usernameCheck.message || "Ese @usuario no está disponible.", "error", "@usuario inválido");
      }

      const fullNameCheck = validateFullName(fd.get("full_name") || "");
      if (!fullNameCheck.ok) {
        if (fullNameInput) fullNameInput.value = fullNameCheck.fullName;
        return WT.toast(fullNameCheck.message, "error", "Nombre inválido");
      }
      if (fullNameInput) fullNameInput.value = fullNameCheck.fullName;

      const updates = {
        username: usernameCheck.username,
        full_name: fullNameCheck.fullName,
        bio: String(fd.get("bio") || "").trim(),
        city: String(fd.get("city") || "").trim(),
        country: normalizeProfileCountry(fd.get("country") || ""),
        program_year: String(fd.get("program_year") || "").trim(),
        sponsor: String(fd.get("sponsor") || "").trim()
      };

      const preferencesToSave = normalizePreferences({
        forum_dark_mode: fd.get("forum_dark_mode") === "on",
        hide_quick_nav: fd.get("hide_quick_nav") === "on",
        dark_mode: false
      });
      await savePreferences(preferencesToSave, { sync: false });
      updates.user_preferences = preferencesToSave;

      try {
        if (removePhoto) {
          updates.photo_url = null;
          updates.photo_path = null;
          updates.image_position_x = null;
          updates.image_position_y = null;
          updates.image_zoom = null;
          updates.image_rotation = null;
          updates.image_aspect_ratio = null;
          updates.image_crop_data = null;
          updates.image_fit = null;
        }

        if (!removePhoto && useGooglePhoto) {
          const googlePhoto = googleProfilePhotoFromUser();
          if (googlePhoto) {
            updates.photo_url = googlePhoto;
            updates.photo_path = null;
            updates.image_position_x = null;
            updates.image_position_y = null;
            updates.image_zoom = null;
            updates.image_rotation = null;
            updates.image_aspect_ratio = null;
            updates.image_crop_data = null;
            updates.image_fit = null;
          }
        }

        if (!removePhoto && !useGooglePhoto && editedPhoto?.blob) {
          updates.image_position_x = editedPhoto.cropData.x;
          updates.image_position_y = editedPhoto.cropData.y;
          updates.image_zoom = editedPhoto.cropData.zoom;
          updates.image_rotation = editedPhoto.cropData.rotation;
          updates.image_aspect_ratio = "1:1";
          updates.image_crop_data = editedPhoto.cropData;
          updates.image_fit = "cover";

          let profileBlob = editedPhoto.blob;
          let profileFileName = `avatar-${Date.now()}.${fileExtensionFromBlob(profileBlob)}`;
          if (window.WTImageCompressor?.optimize) {
            const sourceFile = new File([editedPhoto.blob], profileFileName, { type: editedPhoto.blob.type || "image/jpeg" });
            const optimized = await WTImageCompressor.optimizeForUse(sourceFile, "profile", { fallbackToOriginal: true, onlyIfSmaller: false });
            profileBlob = optimized.blob || editedPhoto.blob;
            profileFileName = optimized.fileName || profileFileName;
          }
          const ext = fileExtensionFromBlob(profileBlob);
          const path = `profile-photos/${user.id}/avatar-${Date.now()}.${ext}`;
          const uploaded = await WT.uploadBlob(WT.cfg.BUCKETS.profile_photos, path, profileBlob, { contentType: profileBlob.type, fileName: profileFileName });
          updates.photo_path = uploaded.path;
          updates.photo_url = uploaded.url;
        }

        const { error } = await WT.supabase.from("user_profiles").update(updates).eq("id", user.id);
        if (error) throw error;

        WT.toast("Perfil actualizado", "success");
        modal.close();
        await refreshAuthUI();
      } catch (err) {
        WT.toast(err.message || "No se pudo guardar el perfil", "error", "Error al guardar");
      }
    });
  }

  async function fetchPublicProfileDetails(profileLike = {}) {
    let id = profileLike?.id || "";
    const username = String(profileLike?.username || "").replace(/^@+/, "").trim().toLowerCase();
    let merged = { ...(profileLike || {}) };

    // Si el perfil viene desde una mención @usuario sin id, resolvemos primero por username.
    if (!id && username && WT.supabase) {
      try {
        const { data } = await WT.supabase
          .from("public_profiles")
          .select("id,username,full_name,photo_url,role,status,bio,city,country,program_year,sponsor")
          .eq("username", username)
          .maybeSingle();
        if (data?.id) {
          id = data.id;
          merged = { ...merged, ...data };
        }
      } catch (_) {}
    }

    // Si todavía no hay id, intentar resolver por nombre/foto cuando el payload viene incompleto.
    if (!id && WT.supabase && (merged.full_name || merged.photo_url)) {
      try {
        let request = WT.supabase
          .from("public_profiles")
          .select("id,username,full_name,photo_url,role,status,bio,city,country,program_year,sponsor")
          .limit(5);
        if (merged.full_name) request = request.ilike("full_name", String(merged.full_name).trim());
        const { data } = await request;
        const rows = data || [];
        const match = rows.find(row => {
          const samePhoto = merged.photo_url && row.photo_url && String(row.photo_url) === String(merged.photo_url);
          const sameName = merged.full_name && row.full_name && String(row.full_name).trim().toLowerCase() === String(merged.full_name).trim().toLowerCase();
          return samePhoto || sameName;
        }) || rows[0];
        if (match?.id) {
          id = match.id;
          merged = { ...merged, ...match };
        }
      } catch (_) {}
    }

    // Vista pública básica: nombre, foto y rol. No rompe aunque el usuario no tenga detalles públicos.
    if (id && WT.supabase) {
      try {
        const { data } = await WT.supabase
          .from("public_profiles")
          .select("id,username,full_name,photo_url,role,status,bio,city,country,program_year,sponsor")
          .eq("id", id)
          .maybeSingle();
        if (data) merged = { ...merged, ...data };
      } catch (_) {}
    }

    // Detalles visibles SOLO para usuarios autenticados, si ejecutaste el SQL 022.
    if (id && WT.supabase) {
      try {
        const { data, error } = await WT.supabase
          .from("public_profile_details")
          .select("id,bio,city,country,program_year,sponsor")
          .eq("id", id)
          .maybeSingle();
        if (!error && data) merged = { ...merged, ...data };
      } catch (_) {}
    }

    // Fallback: si la política de user_profiles permite lectura entre usuarios registrados,
    // también tomamos los detalles desde ahí. Si Supabase lo bloquea, no se rompe nada.
    if (id && WT.supabase) {
      try {
        const { data, error } = await WT.supabase
          .from("user_profiles")
          .select("id,username,full_name,photo_url,role,status,bio,city,country,program_year,sponsor")
          .eq("id", id)
          .maybeSingle();
        if (!error && data) merged = { ...merged, ...data };
      } catch (_) {}
    }

    // Para el propio usuario siempre intentamos leer su perfil completo.
    try {
      const currentUser = await WT.getCurrentUser();
      if (currentUser?.id && (!id || currentUser.id === id)) {
        const myProfile = await WT.getMyProfile();
        if (myProfile) {
          merged = { ...merged, ...myProfile };
          if (!id && myProfile.id) id = myProfile.id;
        }
      }
    } catch (_) {}

    return merged;
  }


  async function getFriendshipWithUser(targetUserId) {
    const viewer = await WT.getCurrentUser().catch(() => null);
    if (!WT.supabase || !viewer?.id || !targetUserId) {
      return { state: "unavailable", row: null };
    }
    if (String(viewer.id) === String(targetUserId)) {
      return { state: "self", row: null };
    }

    try {
      const { data, error } = await WT.supabase
        .from("user_friendships")
        .select("id,requester_id,receiver_id,status")
        .or(`and(requester_id.eq.${viewer.id},receiver_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},receiver_id.eq.${viewer.id})`)
        .in("status", ["pending", "accepted"])
        .maybeSingle();

      if (error) throw error;
      if (!data) return { state: "none", row: null };
      if (data.status === "accepted") return { state: "friends", row: data };
      if (data.status === "pending" && String(data.requester_id) === String(viewer.id)) return { state: "outgoing", row: data };
      if (data.status === "pending" && String(data.receiver_id) === String(viewer.id)) return { state: "incoming", row: data };
      return { state: "none", row: data };
    } catch (error) {
      console.warn("No se pudo leer amistad", error);
      return { state: "unknown", row: null };
    }
  }

  function renderPublicProfileFriendAction(status = {}) {
    if (status.state === "self") return "";
    if (status.state === "unavailable") return "";
    if (status.state === "friends") return `<button class="public-profile-friend-btn soft compact" type="button" data-public-remove-friend="${WT.escapeHTML(status.row?.id || "")}" title="Eliminar amigo"><span aria-hidden="true">✓</span><b>Amigos</b></button>`;
    if (status.state === "outgoing") return `<button class="public-profile-friend-btn soft compact" type="button" data-public-cancel-friend="${WT.escapeHTML(status.row?.id || "")}" title="Cancelar solicitud"><span aria-hidden="true">⏳</span><b>Enviada</b></button>`;
    if (status.state === "incoming") return `<div class="public-profile-friend-actions compact"><button class="public-profile-friend-btn compact" type="button" data-public-accept-friend="${WT.escapeHTML(status.row?.id || "")}" title="Aceptar solicitud"><span aria-hidden="true">✓</span><b>Aceptar</b></button><button class="public-profile-friend-btn soft compact" type="button" data-public-reject-friend="${WT.escapeHTML(status.row?.id || "")}" title="Rechazar solicitud"><span aria-hidden="true">×</span><b>Rechazar</b></button></div>`;
    return `<button class="public-profile-friend-btn compact" type="button" data-public-send-friend title="Agregar amigo"><span aria-hidden="true">＋</span><b>Agregar</b></button>`;
  }

  async function bindPublicProfileFriendActions(modal, publicProfile, status) {
    if (!modal?.element || !publicProfile?.id) return;
    const updateAction = async () => {
      const fresh = await getFriendshipWithUser(publicProfile.id);
      const box = WT.qs("[data-public-friend-box]", modal.element);
      if (box) box.innerHTML = renderPublicProfileFriendAction(fresh);
      bindPublicProfileFriendActions(modal, publicProfile, fresh);
    };

    modal.element.querySelectorAll("[data-public-send-friend]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          const { data, error } = await WT.supabase.rpc("send_friend_request", { target_user_id: publicProfile.id });
          if (error) throw error;
          const result = typeof data === "string" ? JSON.parse(data) : (data || {});
          await sendFriendPush(result.notify_user_id || publicProfile.id, {
            title: "Nueva solicitud de amistad",
            body: result.actor_name ? `${result.actor_name} quiere agregarte como amigo.` : "Tienes una nueva solicitud de amistad.",
            url: "index.html",
            type: "friend_request",
            tag: `friend-request-${result.id || publicProfile.id}`
          });
          WT.toast("Solicitud enviada.", "success");
          await updateAction();
        } catch (error) {
          btn.disabled = false;
          WT.toast(error.message || "No se pudo enviar la solicitud.", "error");
        }
      });
    });

    modal.element.querySelectorAll("[data-public-accept-friend]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          const { data, error } = await WT.supabase.rpc("respond_friend_request", { friendship_id: btn.dataset.publicAcceptFriend, response_status: "accepted" });
          if (error) throw error;
          const result = typeof data === "string" ? JSON.parse(data) : (data || {});
          await sendFriendPush(result.notify_user_id, {
            title: "Solicitud aceptada",
            body: result.actor_name ? `${result.actor_name} aceptó tu solicitud de amistad.` : "Tu solicitud de amistad fue aceptada.",
            url: "index.html",
            type: "friend_accepted",
            tag: `friend-accepted-${btn.dataset.publicAcceptFriend}`
          });
          WT.toast("Solicitud aceptada.", "success");
          await updateAction();
        } catch (error) {
          btn.disabled = false;
          WT.toast(error.message || "No se pudo aceptar la solicitud.", "error");
        }
      });
    });

    modal.element.querySelectorAll("[data-public-reject-friend]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          const { error } = await WT.supabase.rpc("respond_friend_request", { friendship_id: btn.dataset.publicRejectFriend, response_status: "rejected" });
          if (error) throw error;
          WT.toast("Solicitud rechazada.", "success");
          await updateAction();
        } catch (error) {
          btn.disabled = false;
          WT.toast(error.message || "No se pudo rechazar la solicitud.", "error");
        }
      });
    });

    modal.element.querySelectorAll("[data-public-cancel-friend]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          const { error } = await WT.supabase.rpc("cancel_friend_request", { friendship_id: btn.dataset.publicCancelFriend });
          if (error) throw error;
          WT.toast("Solicitud cancelada.", "success");
          await updateAction();
        } catch (error) {
          btn.disabled = false;
          WT.toast(error.message || "No se pudo cancelar la solicitud.", "error");
        }
      });
    });

    modal.element.querySelectorAll("[data-public-remove-friend]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          const ok = await WT.confirmDialog({ title: "Eliminar amigo", message: "¿Quieres eliminar esta amistad?", confirmText: "Eliminar", danger: true });
          if (!ok) return;
          btn.disabled = true;
          const { error } = await WT.supabase.rpc("remove_friendship", { friendship_id: btn.dataset.publicRemoveFriend });
          if (error) throw error;
          WT.toast("Amigo eliminado.", "success");
          await updateAction();
        } catch (error) {
          btn.disabled = false;
          WT.toast(error.message || "No se pudo eliminar la amistad.", "error");
        }
      });
    });
  }


  async function showPublicProfileModal(profileLike = {}) {
    const viewer = await WT.getCurrentUser();
    if (!viewer) {
      WT.toast("Debes iniciar sesión para ver el perfil público de otros usuarios.", "warning");
      showLoginModal();
      return;
    }

    const publicProfile = await fetchPublicProfileDetails(profileLike);
    const isSelfProfile = String(publicProfile?.id || profileLike?.id || "") === String(viewer?.id || "");
    const friendshipStatus = isSelfProfile ? { state: "self" } : await getFriendshipWithUser(publicProfile?.id || profileLike?.id || "");
    const displayName = publicProfile?.full_name || "Estudiante";
    const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "U";
    const avatarUrl = avatar(publicProfile?.photo_url);
    const roleBadge = WT.renderRoleBadge(publicProfile?.role || "user");
    const badges = WT.renderUserBadges(publicProfile?.badges || []);
    const bio = String(publicProfile?.bio || "").trim();
    const city = String(publicProfile?.city || "").trim();
    const sponsor = String(publicProfile?.sponsor || "").trim();
    const year = String(publicProfile?.program_year || "").trim();
    const country = String(publicProfile?.country || "").trim();
    const meta = [
      city ? `<div class="public-profile-chip">📍 ${WT.escapeHTML(city)}</div>` : "",
      country ? `<div class="public-profile-chip">🌎 ${WT.escapeHTML(country)}</div>` : "",
      sponsor ? `<div class="public-profile-chip">🤝 ${WT.escapeHTML(sponsor)}</div>` : "",
      year ? `<div class="public-profile-chip">✈️ ${WT.escapeHTML(year)}</div>` : ""
    ].filter(Boolean).join("");

    const modal = WT.showModal({
      title: "Perfil público",
      className: `public-profile-modal wt-profile-final-modal ${isSelfProfile ? "public-profile-self" : "public-profile-other"}`, 
      body: `<section class="public-profile-card">
        <div class="public-profile-hero">
          <div class="public-profile-avatar-wrap">
            <img class="public-profile-avatar" src="${WT.escapeHTML(avatarUrl)}" alt="Foto de ${WT.escapeHTML(displayName)}" onerror="this.hidden=true; this.nextElementSibling.hidden=false;">
            <span class="public-profile-avatar-fallback" hidden>${WT.escapeHTML(initials)}</span>
          </div>
          <div class="public-profile-headtext">
            <div class="public-profile-title-row">
              <h3>${WT.escapeHTML(displayName)}</h3>
              ${isSelfProfile ? "" : `<div class="public-profile-friend-box" data-public-friend-box>${renderPublicProfileFriendAction(friendshipStatus)}</div>`}
            </div>
            ${publicProfile?.username ? `<p class="public-profile-username">${renderUsernameTag(publicProfile.username)}</p>` : ""}
            <div class="public-profile-role">${roleBadge}</div>
            ${badges ? `<div class="public-profile-badges">${badges}</div>` : ""}
          </div>
        </div>
        <div class="public-profile-bio-card">
          ${bio ? `<p class="public-profile-bio">${WT.escapeHTML(bio)}</p>` : `<p class="public-profile-bio is-empty">Este usuario todavía no ha agregado una biografía pública.</p>`}
        </div>
        ${meta ? `<div class="public-profile-meta">${meta}</div>` : `<div class="public-profile-meta is-empty">Sin ciudad, sponsor o año agregado.</div>`}
      </section>`,
      actions: [{ label: "Cerrar", className: "btn-primary" }]
    });
    if (!isSelfProfile) await bindPublicProfileFriendActions(modal, publicProfile, friendshipStatus);
  }

  async function requireAuth() {
    const user = await WT.getCurrentUser();
    if (!user) { showLoginModal(); return null; }
    return user;
  }

  function bindAuthShortcuts() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!target?.closest) return;
      const login = target.closest('#loginBtn, #forumLoginBtn, #forumLoginTop, a[href*="login.html"], a[href="#supabase-login"]');
      const register = target.closest('#registerBtn, #forumRegisterBtn, #forumRegisterTop, a[href="#supabase-register"]');
      if (login) {
        event.preventDefault();
        event.stopPropagation();
        showLoginModal();
        return;
      }
      if (register) {
        event.preventDefault();
        event.stopPropagation();
        showRegisterModal();
      }
    }, true);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    decorateMainMenu();
    bindAuthShortcuts();
    try {
      if (sessionStorage.getItem("wt_logout_done") === "1") {
        sessionStorage.removeItem("wt_logout_done");
        setTimeout(() => WT.toast("Sesión cerrada correctamente", "success"), 250);
      }
    } catch (_) {}
    const googleHandled = await finishOAuthReturnIfNeeded();
    const signupHandled = googleHandled ? false : await handleSignupConfirmationReturn();
    const recoveryHandled = (googleHandled || signupHandled) ? false : await handlePasswordRecoveryReturn();
    if (!signupHandled && !recoveryHandled) {
      await WT.ensureSessionFresh?.({ force: true });
      await refreshAuthUI();
      maybeShowPushNotificationPrompt();
    } else {
      renderLoggedOutAuthUI();
    }
    if (WT.supabase) {
      WT.supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          pendingRecoveryInfo = recoveryUrlInfo();
          passwordRecoveryMode = true;
          document.body.classList.add("password-recovery-mode");
          cleanRecoveryUrl();
          renderLoggedOutAuthUI();
          setTimeout(() => showUpdatePasswordModal({ force: true }), 150);
          return;
        }
        if (passwordRecoveryMode || document.body.classList.contains("password-recovery-mode")) {
          renderLoggedOutAuthUI();
          return;
        }
        if (session?.user) await ensureProfileFromAuth(session.user);
        await refreshAuthUI();
        if (session?.user) maybeShowPushNotificationPrompt();
      });

      const refreshAfterReturn = async () => {
        if (passwordRecoveryMode || document.body.classList.contains("password-recovery-mode")) {
          renderLoggedOutAuthUI();
          return;
        }
        await WT.ensureSessionFresh?.({ force: true });
        await refreshAuthUI();
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") refreshAfterReturn();
      });
      window.addEventListener("focus", refreshAfterReturn);
    }
  });

  window.WTAuth = { refreshAuthUI, showLoginModal, showRegisterModal, showProfileModal, showPublicProfileModal, showNotificationsModal, requireAuth, signInWithGoogle, showUpdatePasswordModal, get profile() { return profile; }, isAdminRole, isSuperAdmin, canOpenAdminPanel, hasActiveGranularAdminPermission };
})();
