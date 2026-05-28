(() => {
  const routes = {
    dashboard: () => WTAdminContent.renderDashboard(),
    home: () => renderHomeHub(),
    hero: () => WTAdminContent.renderHero(),
    announcements: () => WTAdminContent.renderAnnouncements(),
    about: () => WTAdminDynamic.renderAbout(),
    legal: () => WTAdminDynamic.renderLegal(),
    social: () => WTAdminDynamic.renderSocial(),
    services: () => WTAdminContent.renderServices(),
    courses: () => WTAdminContent.renderCourses(),
    forum: () => WTAdminForum.renderModeration(),
    storage: () => WTAdminForum.renderDriveStorage(),
    "practice-hub": () => renderPracticeHub(),
    practice: () => WTAdminPractice.renderQuestions(),
    "practice-settings": () => WTAdminPractice.renderPracticeSettings(),
    "practice-categories": () => WTAdminPractice.renderCategories(),
    "practice-voices": () => WTAdminPracticeAdvanced.renderVoices(),
    "practice-wilberforce": () => WTAdminPracticeAdvanced.renderInfoSections(),
    "practice-glossary": () => WTAdminPracticeAdvanced.renderGlossary(),
    "practice-shared": () => WTAdminPracticeAdvanced.renderSharedPractices(),
    users: () => WTAdminContent.renderUsers(),
    appearance: () => WTAdminContent.renderAppearance(),
    settings: () => WTAdminContent.renderSettings(),
    logs: () => WTAdminContent.renderLogs()
  };

  const ALL_SECTIONS = Object.keys(routes);
  const SECTION_LABELS = {
    dashboard: "Dashboard", home: "Inicio", hero: "Slides", announcements: "Anuncios",
    about: "Nosotros", legal: "Políticas legales", social: "Redes y comunidades",
    services: "Servicios", courses: "Cursos", forum: "Foro", storage: "Almacenamiento",
    "practice-hub": "Práctica consular", practice: "Preguntas", "practice-settings": "Configuración",
    "practice-categories": "Categorías", "practice-voices": "Audio", "practice-wilberforce": "Wilberforce",
    "practice-glossary": "Glosario", "practice-shared": "Prácticas compartidas",
    users: "Usuarios", appearance: "Apariencia", settings: "Configuración", logs: "Logs"
  };
  const SECTION_REQUIREMENTS = {
    dashboard: ["__panel__"], home: ["manage_sliders", "manage_site_settings"], hero: ["manage_sliders"],
    announcements: ["manage_announcements"], about: ["manage_site_settings"], legal: ["manage_site_settings"],
    social: ["manage_site_settings"], services: ["manage_services"], courses: ["manage_courses"],
    forum: ["approve_forum_posts", "manage_forum_reports", "delete_forum_lower_roles", "delete_forum_same_role"],
    storage: ["manage_storage"], "practice-hub": ["manage_practice", "manage_shared_practices"],
    practice: ["manage_practice"], "practice-settings": ["manage_practice"], "practice-categories": ["manage_practice"],
    "practice-voices": ["manage_practice"], "practice-wilberforce": ["manage_practice"], "practice-glossary": ["manage_practice"],
    "practice-shared": ["manage_shared_practices", "manage_practice"],
    users: ["manage_permissions_lower_roles", "manage_permissions_same_role", "block_lower_roles", "block_same_role", "warn_lower_roles", "warn_same_role", "view_warnings_lower_roles", "view_warnings_same_role", "change_role_lower_roles", "change_role_same_role"],
    appearance: ["manage_appearance"], settings: ["manage_site_settings"], logs: ["view_logs"]
  };
  const BASE_ROLE_SECTIONS = {
    owner: ALL_SECTIONS,
    superadmin: ALL_SECTIONS,
    admin: ["dashboard", "home", "hero", "announcements", "about", "legal", "social", "services", "courses", "forum", "storage", "practice-hub", "practice", "practice-settings", "practice-categories", "practice-voices", "practice-wilberforce", "practice-glossary", "practice-shared", "users", "logs"],
    moderator: ["forum"],
    moderador: ["forum"]
  };
  const BASE_ROLE_PERMISSIONS = {
    owner: ["__all__"],
    superadmin: ["manage_sliders","manage_announcements","manage_services","manage_courses","manage_storage","manage_appearance","manage_site_settings","manage_practice","manage_shared_practices","manage_badges","approve_forum_posts","manage_forum_reports","delete_forum_lower_roles","delete_forum_same_role","warn_lower_roles","warn_same_role","block_lower_roles","block_same_role","view_warnings_lower_roles","view_warnings_same_role","change_role_lower_roles","change_role_same_role","view_logs"],
    admin: ["manage_sliders","manage_announcements","manage_services","manage_courses","manage_storage","manage_practice","manage_shared_practices","approve_forum_posts","manage_forum_reports","delete_forum_lower_roles","warn_lower_roles","block_lower_roles","view_warnings_lower_roles","change_role_lower_roles","view_logs"],
    moderator: ["approve_forum_posts","manage_forum_reports","delete_forum_lower_roles","warn_lower_roles","block_lower_roles","view_warnings_lower_roles"],
    moderador: ["approve_forum_posts","manage_forum_reports","delete_forum_lower_roles","warn_lower_roles","block_lower_roles","view_warnings_lower_roles"]
  };
  const HUB_CHILDREN = {
    home: ["hero", "about"],
    "practice-hub": ["practice","practice-categories","practice-settings","practice-voices","practice-wilberforce","practice-glossary","practice-shared"]
  };
  let current = "dashboard";
  let allowedSections = new Set(["dashboard"]);
  let actorPermissions = new Set();

  function roleKey(profile = {}) { return String(profile?.role || "user").toLowerCase(); }
  function isOwner(profile = {}) { return roleKey(profile) === "owner"; }
  function isPrivilegedRole(role = "") { return ["owner","superadmin","admin","moderator","moderador"].includes(String(role || "").toLowerCase()); }
  async function loadDirectPermissions(userId = "") {
    if (!userId || !WT.supabase) return new Set();
    try {
      const { data, error } = await WT.supabase.from("user_permissions").select("permission_key,expires_at").eq("user_id", userId);
      if (error) return new Set();
      const now = Date.now();
      return new Set((data || []).filter(row => !row.expires_at || new Date(row.expires_at).getTime() > now).map(row => row.permission_key).filter(Boolean));
    } catch (_) { return new Set(); }
  }
  function hasSectionPermission(section, role, permissions, direct) {
    return (SECTION_REQUIREMENTS[section] || []).some(req => req === "__panel__" ? direct.size > 0 || isPrivilegedRole(role) : permissions.has(req));
  }
  async function buildAccess(profile = {}) {
    const role = roleKey(profile);
    const direct = await loadDirectPermissions(profile?.id);
    const permissions = new Set([...(BASE_ROLE_PERMISSIONS[role] || []), ...direct]);
    actorPermissions = permissions;
    if (permissions.has("__all__") || isOwner(profile)) {
      allowedSections = new Set(ALL_SECTIONS);
      return allowedSections;
    }
    const result = new Set(BASE_ROLE_SECTIONS[role] || []);
    Object.keys(SECTION_REQUIREMENTS).forEach(section => { if (hasSectionPermission(section, role, permissions, direct)) result.add(section); });
    Object.entries(HUB_CHILDREN).forEach(([hub, children]) => { if (children.some(child => result.has(child))) result.add(hub); });
    if (direct.size > 0 || result.size > 0 || isPrivilegedRole(role)) result.add("dashboard");
    allowedSections = result;
    return result;
  }
  function firstAllowedSection(profile = {}) {
    const role = roleKey(profile);
    if (role === "moderator" || role === "moderador") return allowedSections.has("forum") ? "forum" : [...allowedSections][0];
    const preferred = ["dashboard","forum","users","home","announcements","services","courses","practice-hub","storage","settings"];
    return preferred.find(section => allowedSections.has(section)) || [...allowedSections][0] || "";
  }
  function sectionIsVisibleInSidebar(section = "") {
    return !["hero","practice","practice-settings","practice-categories","practice-voices","practice-wilberforce","practice-glossary","practice-shared","about","legal","social"].includes(section);
  }
  function mobileAdminQuery() {
    return window.matchMedia ? window.matchMedia("(max-width: 1024px)") : { matches: false };
  }

  function groupForSection(section = "") {
    const active = visibleActiveSection(section);
    const btn = WT.qs(`#adminSidebar button[data-section="${CSS.escape(active)}"]`);
    return btn?.closest(".admin-nav-group") || WT.qs("#adminSidebar .admin-nav-group:not(.hidden)");
  }

  function closeOtherMobileGroups(activeGroup = null) {
    const isMobile = mobileAdminQuery().matches;
    document.body.classList.toggle("wt-admin-mobile-nav", isMobile);

    WT.qsa("#adminSidebar .admin-nav-group").forEach(group => {
      if (group.hidden || group.classList.contains("hidden")) return;
      if (!isMobile) {
        group.classList.add("admin-nav-group-open");
        group.classList.remove("admin-nav-group-collapsed");
        return;
      }

      const open = group === activeGroup;
      group.classList.toggle("admin-nav-group-open", open);
      group.classList.toggle("admin-nav-group-collapsed", !open);
    });

    WT.qsa("#adminSidebar .admin-nav-group-title").forEach(title => {
      title.setAttribute("aria-expanded", String(title.closest(".admin-nav-group")?.classList.contains("admin-nav-group-open")));
    });
  }

  function updateMobileAdminAccordion(section = current) {
    const activeGroup = groupForSection(section);
    closeOtherMobileGroups(activeGroup);
  }

  function setupMobileAdminAccordion() {
    WT.qsa("#adminSidebar .admin-nav-group-title").forEach(title => {
      if (title.dataset.accordionBound === "1") return;
      title.dataset.accordionBound = "1";
      title.setAttribute("role", "button");
      title.setAttribute("tabindex", "0");
      title.setAttribute("aria-expanded", "false");

      const toggle = () => {
        if (!mobileAdminQuery().matches) return;
        const group = title.closest(".admin-nav-group");
        const isOpen = group?.classList.contains("admin-nav-group-open");
        closeOtherMobileGroups(isOpen ? group : group);
        WT.qsa("#adminSidebar .admin-nav-group-title").forEach(t => {
          t.setAttribute("aria-expanded", String(t.closest(".admin-nav-group")?.classList.contains("admin-nav-group-open")));
        });
      };

      title.addEventListener("click", toggle);
      title.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
    });

    if (!window.__wtAdminAccordionResizeBound) {
      window.__wtAdminAccordionResizeBound = true;
      window.addEventListener("resize", () => updateMobileAdminAccordion(current));
    }
  }

  function adminMobileQuery() {
    return window.matchMedia ? window.matchMedia("(max-width: 1024px)") : { matches: false };
  }

  function getVisibleAdminGroups() {
    return Array.from(WT.qsa("#adminSidebar .admin-nav-group"))
      .filter(group => !group.hidden && !group.classList.contains("hidden"));
  }

  function getCurrentSectionLabel(section = current) {
    const active = visibleActiveSection(section);
    const btn = WT.qs(`#adminSidebar button[data-section="${CSS.escape(active)}"]`);
    return (btn?.textContent || SECTION_LABELS[active] || SECTION_LABELS[section] || "Panel admin").trim();
  }

  function ensureMobileAdminSwitcher() {
    const panel = WT.qs("#adminPanel");
    const sidebar = WT.qs("#adminSidebar");
    if (!panel || !sidebar) return;

    let switcher = WT.qs("#adminMobileSwitcher");
    if (!switcher) {
      switcher = document.createElement("div");
      switcher.id = "adminMobileSwitcher";
      switcher.className = "admin-mobile-switcher";
      switcher.innerHTML = `
        <div class="admin-mobile-switcher-copy">
          <span>Panel admin</span>
          <strong id="adminMobileCurrent">Dashboard</strong>
        </div>
        <button type="button" class="admin-mobile-menu-btn" id="adminMobileMenuBtn" aria-expanded="false">Cambiar sección</button>
      `;
      panel.insertBefore(switcher, panel.firstChild);
      switcher.querySelector("#adminMobileMenuBtn")?.addEventListener("click", openMobileAdminSheet);
    }

    let overlay = WT.qs("#adminMobileOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "adminMobileOverlay";
      overlay.className = "admin-mobile-overlay";
      overlay.innerHTML = `
        <div class="admin-mobile-sheet" role="dialog" aria-modal="true" aria-label="Menú del panel admin">
          <div class="admin-mobile-sheet-head">
            <div>
              <span>Panel admin</span>
              <strong>Cambiar sección</strong>
            </div>
            <button type="button" class="admin-mobile-sheet-close" id="adminMobileSheetClose" aria-label="Cerrar">×</button>
          </div>
          <div class="admin-mobile-sheet-body" id="adminMobileSheetBody"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.addEventListener("click", event => {
        if (event.target === overlay) closeMobileAdminSheet();
      });
      overlay.querySelector("#adminMobileSheetClose")?.addEventListener("click", closeMobileAdminSheet);
    }

    updateMobileAdminSwitcher(current);
  }

  function updateMobileAdminSwitcher(section = current) {
    const isMobile = adminMobileQuery().matches;
    document.body.classList.toggle("wt-admin-mobile-sheet-mode", isMobile);

    const switcher = WT.qs("#adminMobileSwitcher");
    if (switcher) switcher.hidden = !isMobile;

    const currentLabel = WT.qs("#adminMobileCurrent");
    if (currentLabel) currentLabel.textContent = getCurrentSectionLabel(section);

    if (!isMobile) closeMobileAdminSheet(false);
  }

  function buildMobileAdminSheet() {
    const body = WT.qs("#adminMobileSheetBody");
    if (!body) return;

    const groups = getVisibleAdminGroups();
    body.innerHTML = groups.map(group => {
      const title = group.querySelector(".admin-nav-group-title")?.textContent?.trim() || "";
      const buttons = Array.from(group.querySelectorAll("button"))
        .filter(btn => !btn.hidden && !btn.disabled)
        .map(btn => {
          const section = btn.dataset.section || "";
          const active = visibleActiveSection(current) === section;
          return `<button type="button" class="admin-mobile-sheet-option ${active ? "active" : ""}" data-mobile-section="${WT.escapeHTML(section)}">${WT.escapeHTML(btn.textContent.trim())}</button>`;
        }).join("");
      if (!buttons) return "";
      return `<div class="admin-mobile-sheet-group"><span>${WT.escapeHTML(title)}</span>${buttons}</div>`;
    }).join("");

    WT.qsa("[data-mobile-section]", body).forEach(btn => {
      btn.addEventListener("click", () => {
        closeMobileAdminSheet();
        render(btn.dataset.mobileSection);
      });
    });
  }

  function openMobileAdminSheet() {
    ensureMobileAdminSwitcher();
    buildMobileAdminSheet();
    document.body.classList.add("admin-mobile-sheet-open");
    WT.qs("#adminMobileMenuBtn")?.setAttribute("aria-expanded", "true");
  }

  function closeMobileAdminSheet(updateButton = true) {
    document.body.classList.remove("admin-mobile-sheet-open");
    if (updateButton) WT.qs("#adminMobileMenuBtn")?.setAttribute("aria-expanded", "false");
  }

  function applySidebarAccess() {
    WT.qsa("#adminSidebar button").forEach(btn => {
      const section = btn.dataset.section;
      const allowed = allowedSections.has(section) && sectionIsVisibleInSidebar(section);
      btn.classList.toggle("hidden", !allowed);
      btn.hidden = !allowed;
      btn.disabled = !allowed;
      if (SECTION_LABELS[section]) btn.textContent = SECTION_LABELS[section];
    });
    WT.qsa("#adminSidebar .admin-nav-group").forEach(group => {
      const hasVisible = Array.from(group.querySelectorAll("button")).some(btn => !btn.hidden);
      group.classList.toggle("hidden", !hasVisible);
      group.hidden = !hasVisible;
    });
    setupMobileAdminAccordion();
    updateMobileAdminAccordion(current);
    ensureMobileAdminSwitcher();
    updateMobileAdminSwitcher(current);
  }
  function canOpenAdmin(profile = {}) { return isPrivilegedRole(roleKey(profile)) || allowedSections.size > 0; }
  function visibleActiveSection(section = "") {
    if (section === "hero" || section === "about") return "home";
    if (["practice","practice-settings","practice-categories","practice-voices","practice-wilberforce","practice-glossary","practice-shared"].includes(section)) return "practice-hub";
    return section;
  }
  function renderHubCards(title, eyebrow, items) {
    WT.qs("#adminTitle").textContent = title;
    const btn = WT.qs("#adminCreateBtn");
    if (btn) { btn.classList.add("hidden"); btn.onclick = null; }
    const visibleItems = items.filter(item => item.disabled || allowedSections.has(item.section));
    WT.qs("#adminView").innerHTML = `<div class="admin-hub-shell admin-hub-shell-compact"><div class="admin-hub-grid">${visibleItems.map(item => item.disabled ? `<div class="admin-hub-card admin-hub-card-disabled" aria-disabled="true"><span>${WT.escapeHTML(item.label)}</span><small>${WT.escapeHTML(item.description || "")}</small></div>` : `<button type="button" class="admin-hub-card" data-hub-section="${WT.escapeHTML(item.section)}"><span>${WT.escapeHTML(item.label)}</span><small>${WT.escapeHTML(item.description || "")}</small></button>`).join("") || `<div class="empty-state">No hay opciones habilitadas en este módulo.</div>`}</div></div>`;
    WT.qsa("[data-hub-section]").forEach(card => card.addEventListener("click", () => render(card.dataset.hubSection)));
  }
  function renderHomeHub() {
    renderHubCards("Inicio", "Contenido", [
      { section: "hero", label: "Slides", description: "Administra el carrusel principal del inicio." },
      { section: "about", label: "Presentación, misión y visión", description: "Edita la información principal de la plataforma." },
      { section: "", label: "Bloques informativos", description: "Próximamente: tarjetas y secciones propias del inicio.", disabled: true },
      { section: "", label: "Avisos del inicio", description: "Próximamente: mensajes destacados de la portada.", disabled: true }
    ]);
  }
  function renderPracticeHub() {
    renderHubCards("Práctica consular", "Herramientas", [
      { section: "practice", label: "Preguntas", description: "Administra las preguntas de práctica." },
      { section: "practice-categories", label: "Categorías", description: "Organiza preguntas por categorías." },
      { section: "practice-settings", label: "Configuración", description: "Ajustes generales de la práctica." },
      { section: "practice-voices", label: "Audio", description: "Voces y configuración de audio." },
      { section: "practice-wilberforce", label: "Wilberforce", description: "Secciones informativas especiales." },
      { section: "practice-glossary", label: "Glosario", description: "Términos importantes para estudiantes." },
      { section: "practice-shared", label: "Prácticas compartidas", description: "Gestiona prácticas compartidas por usuarios." }
    ]);
  }
  const CHILD_PARENT = {
    hero: { section: "home", label: "Inicio" },
    about: { section: "home", label: "Inicio" },
    practice: { section: "practice-hub", label: "Práctica consular" },
    "practice-categories": { section: "practice-hub", label: "Práctica consular" },
    "practice-settings": { section: "practice-hub", label: "Práctica consular" },
    "practice-voices": { section: "practice-hub", label: "Práctica consular" },
    "practice-wilberforce": { section: "practice-hub", label: "Práctica consular" },
    "practice-glossary": { section: "practice-hub", label: "Práctica consular" },
    "practice-shared": { section: "practice-hub", label: "Práctica consular" }
  };

  function addBackButtonIfNeeded(section = "") {
    const parent = CHILD_PARENT[section];
    if (!parent) return;
    const view = WT.qs("#adminView");
    if (!view || WT.qs(".admin-back-row", view)) return;
    const row = document.createElement("div");
    row.className = "admin-back-row";
    row.innerHTML = `<button type="button" class="btn btn-soft btn-small admin-back-btn">← Volver a ${WT.escapeHTML(parent.label)}</button>`;
    row.querySelector("button")?.addEventListener("click", () => render(parent.section));
    view.prepend(row);
  }

  function finishAdminBoot() {
    document.body.classList.remove("admin-booting");
    const bootCss = document.getElementById("adminBootCSS");
    // Lo dejamos unos milisegundos para que el repaint termine limpio.
    setTimeout(() => bootCss?.remove?.(), 180);
  }

  async function guard() {
    const guardEl = WT.qs("#adminGuard");
    const panel = WT.qs("#adminPanel");
    if (!WT.canConnect) { guardEl.textContent = "La conexión de la plataforma todavía no está lista."; finishAdminBoot(); return false; }
    const user = await WTAuth.requireAuth();
    if (!user) { guardEl.textContent = "Debes iniciar sesión."; finishAdminBoot(); return false; }
    const profile = await WT.getMyProfile();
    await buildAccess(profile);
    if (!canOpenAdmin(profile)) {
      guardEl.innerHTML = `<h2>Acceso restringido</h2><p>Tu cuenta no tiene permisos para abrir el panel administrativo.</p>`;
      finishAdminBoot();
      return false;
    }
    applySidebarAccess();
    guardEl.classList.add("hidden");
    panel.classList.remove("hidden");
    return true;
  }
  async function render(section = current) {
    const profile = WTAuth.profile || await WT.getMyProfile().catch(() => null);
    if (!allowedSections.size) await buildAccess(profile || {});
    const fallback = firstAllowedSection(profile || {});
    if (!allowedSections.has(section)) {
      if (fallback) {
        WT.toast("Ese módulo no está habilitado para tu cuenta.", "warning");
        section = fallback;
      } else {
        WT.qs("#adminView").innerHTML = `<div class="empty-state">Tu cuenta no tiene módulos habilitados.</div>`;
        return;
      }
    }
    current = section;
    WT.qsa("#adminSidebar button").forEach(btn => btn.classList.toggle("active", btn.dataset.section === visibleActiveSection(section)));
    updateMobileAdminAccordion(section);
    updateMobileAdminSwitcher(section);
    location.hash = section;
    try {
      await (routes[section] || routes[fallback] || routes.dashboard)();
      addBackButtonIfNeeded(section);
    }
    catch (err) {
      WT.toast(err.message || "Error en el panel", "error");
      WT.qs("#adminView").innerHTML = `<div class="empty-state">${WT.escapeHTML(err.message || "Error")}</div>`;
    }
  }
  function bind() {
    WT.qsa("#adminSidebar button").forEach(btn => btn.addEventListener("click", () => {
      if (btn.disabled || btn.hidden) return;
      render(btn.dataset.section);
    }));
  }
  document.addEventListener("DOMContentLoaded", async () => {
    if (WT.page !== "admin") return;
    setTimeout(() => finishAdminBoot(), 4500);
    bind();
    const ok = await guard(); if (!ok) return;
    if (!window.__wtAdminMobileSheetResizeBound) {
      window.__wtAdminMobileSheetResizeBound = true;
      window.addEventListener("resize", () => updateMobileAdminSwitcher(current));
    }
    const profile = await WT.getMyProfile();
    const requested = location.hash.replace("#", "");
    const section = requested && allowedSections.has(requested) ? requested : firstAllowedSection(profile);
    await render(routes[section] ? section : firstAllowedSection(profile));
    finishAdminBoot();
  });
  window.WTAdmin = { render, renderCurrent: () => render(current), canAccessSection: section => allowedSections.has(section), get current() { return current; }, get allowedSections() { return new Set(allowedSections); }, get permissions() { return new Set(actorPermissions); } };
})();
