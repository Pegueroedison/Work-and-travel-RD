(() => {
  const defaults = {
    about: [
      { key: "quienes_somos", title: "Quiénes somos", icon: "👥", body: "Somos una comunidad dominicana creada para orientar estudiantes del programa Summer Work and Travel con información clara, experiencias reales y herramientas prácticas.", featured: true, sort_order: 1 },
      { key: "objetivo", title: "Objetivo", icon: "🎯", body: "Ayudar a cada estudiante a prepararse mejor, resolver dudas y tomar decisiones con más seguridad durante su proceso J1.", featured: false, sort_order: 2 },
      { key: "vision", title: "Visión", icon: "🚀", body: "Ser una plataforma de referencia para la preparación, comunidad y acompañamiento de estudiantes dominicanos que participan en Work and Travel.", featured: false, sort_order: 3 },
      { key: "metas", title: "Metas", icon: "🏁", body: "Unir cursos, foro, práctica consular, servicios y experiencias reales en un solo lugar fácil de usar desde el celular.", featured: false, sort_order: 4 }
    ],
    social: [
      { platform: "Instagram", icon: "📸", url: "", label: "Instagram", active: false, sort_order: 1 },
      { platform: "WhatsApp", icon: "💬", url: "", label: "WhatsApp", active: false, sort_order: 2 }
    ]
  };

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const safe = (value = "") => (window.WT?.escapeHTML ? WT.escapeHTML(value) : String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c])));

  async function getSetting(key, fallback = "") {
    if (!window.WT?.canConnect) return fallback;
    try {
      const { data, error } = await WT.supabase.from("site_settings").select("value").eq("key", key).eq("is_public", true).maybeSingle();
      if (error || !data) return fallback;
      return WT.parseSettingValue ? WT.parseSettingValue(data.value) : data.value;
    } catch (_) { return fallback; }
  }

  async function listAboutBlocks() {
    if (!window.WT?.canConnect) return defaults.about;
    try {
      const { data, error } = await WT.supabase.from("site_about_blocks").select("*").eq("active", true).order("sort_order", { ascending: true });
      if (error || !(data || []).length) return defaults.about;
      return data;
    } catch (_) { return defaults.about; }
  }

  async function listSocialLinks({ activeOnly = true } = {}) {
    if (!window.WT?.canConnect) return defaults.social.filter(x => x.active || !activeOnly);
    try {
      let query = WT.supabase.from("social_links").select("*").order("sort_order", { ascending: true });
      if (activeOnly) query = query.eq("active", true);
      const { data, error } = await query;
      if (error) return defaults.social.filter(x => x.active || !activeOnly);
      return (data || []).filter(x => !activeOnly || x.url);
    } catch (_) { return defaults.social.filter(x => x.active || !activeOnly); }
  }

  async function listLegalPages({ activeOnly = true } = {}) {
    if (!window.WT?.canConnect) return [];
    try {
      let query = WT.supabase.from("legal_pages").select("id,slug,title,summary,content,active,updated_at,sort_order").order("sort_order", { ascending: true });
      if (activeOnly) query = query.eq("active", true);
      const { data, error } = await query;
      return error ? [] : (data || []);
    } catch (_) { return []; }
  }

  async function getLegalPage(slug) {
    if (!window.WT?.canConnect || !slug) return null;
    try {
      const { data, error } = await WT.supabase.from("legal_pages").select("*").eq("slug", slug).eq("active", true).maybeSingle();
      return error ? null : data;
    } catch (_) { return null; }
  }

  function renderAboutCards(items = []) {
    const root = q("#aboutDynamicGrid");
    if (!root) return;
    root.innerHTML = items.map(item => `<article class="about-dynamic-card ${item.featured ? "featured" : ""}">
      <span class="about-card-icon">${safe(item.icon || "✨")}</span>
      <h3>${safe(item.title || "Apartado")}</h3>
      <p>${safe(item.body || item.description || "")}</p>
    </article>`).join("");
  }

  function renderSocialLinks(items = []) {
    const containers = [q("#homeSocialLinks"), ...qa("[data-social-links]")].filter(Boolean);
    if (!containers.length) return;
    const html = items.length ? items.map(item => `<a class="social-link-pill" href="${safe(item.url || "#")}" target="_blank" rel="noopener">
      <span>${safe(item.icon || "🔗")}</span><b>${safe(item.label || item.platform || "Comunidad")}</b>
    </a>`).join("") : "";
    containers.forEach(root => { root.innerHTML = html; root.hidden = !html; });
  }

  async function renderLegalFooterLinks() {
    const pages = await listLegalPages();
    if (!pages.length) return;
    const footer = q(".footer-links");
    if (!footer || footer.dataset.legalReady === "true") return;
    footer.dataset.legalReady = "true";
    pages.slice(0, 4).forEach(page => {
      const a = document.createElement("a");
      a.href = `legal.html?slug=${encodeURIComponent(page.slug)}`;
      a.textContent = page.title;
      footer.appendChild(a);
    });
  }

  async function initHomeAbout() {
    if (!q("#aboutSection")) return;
    const [eyebrow, title, text, btnText, btnUrl, blocks, socials] = await Promise.all([
      getSetting("home_about_eyebrow", "Sobre nosotros"),
      getSetting("home_about_title", "Una comunidad dominicana para prepararte mejor"),
      getSetting("home_about_text", "Work and Travel RD reúne orientación, práctica consular, servicios, cursos y experiencias reales para estudiantes dominicanos que quieren vivir su proceso J1 con más claridad."),
      getSetting("home_about_button_text", "Conocer servicios"),
      getSetting("home_about_button_url", "servicios.html"),
      listAboutBlocks(),
      listSocialLinks()
    ]);
    if (q("#aboutEyebrow")) q("#aboutEyebrow").textContent = eyebrow;
    if (q("#aboutTitle")) q("#aboutTitle").textContent = title;
    if (q("#aboutText")) q("#aboutText").textContent = text;
    const btn = q("#aboutBtn");
    if (btn) { btn.textContent = btnText; btn.href = btnUrl || "servicios.html"; }
    renderAboutCards(blocks);
    renderSocialLinks(socials);
  }

  async function initLegalPage() {
    const root = q("#legalPageRoot");
    if (!root) return;
    const slug = new URLSearchParams(location.search).get("slug") || "terminos";
    const [page, pages, socials] = await Promise.all([getLegalPage(slug), listLegalPages(), listSocialLinks()]);
    if (!page) {
      root.innerHTML = `<div class="empty-state"><h2>Documento no disponible</h2><p>Esta política todavía no está publicada.</p><a class="btn btn-primary" href="index.html">Volver al inicio</a></div>`;
      return;
    }
    document.title = `${page.title} | Work and Travel RD`;
    root.innerHTML = `<article class="legal-document-card">
      <span class="eyebrow">Políticas legales</span>
      <h1>${safe(page.title)}</h1>
      ${page.summary ? `<p class="legal-summary">${safe(page.summary)}</p>` : ""}
      <div class="legal-content">${safe(page.content || "").replace(/\n/g, "<br>")}</div>
      <small>Última actualización: ${page.updated_at ? new Date(page.updated_at).toLocaleDateString("es-DO") : "Sin fecha"}</small>
    </article>
    <aside class="legal-side-card">
      <h3>Otros documentos</h3>
      ${pages.map(p => `<a class="legal-side-link ${p.slug === page.slug ? "active" : ""}" href="legal.html?slug=${encodeURIComponent(p.slug)}">${safe(p.title)}</a>`).join("")}
      <div class="about-social-row" data-social-links></div>
    </aside>`;
    renderSocialLinks(socials);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initHomeAbout();
    renderLegalFooterLinks();
    renderSocialLinks(defaults.social.filter(x => x.active));
    initLegalPage();
  });

  window.WTDynamicSite = { listAboutBlocks, listSocialLinks, listLegalPages, getLegalPage, initHomeAbout, renderSocialLinks };
})();
