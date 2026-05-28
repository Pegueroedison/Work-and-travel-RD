(() => {
  const view = () => WT.qs("#adminView");
  const text = (value = "") => WT.escapeHTML(value ?? "");

  function header(title, onCreate = null, label = "Crear") {
    WT.qs("#adminTitle").textContent = title;
    const btn = WT.qs("#adminCreateBtn");
    if (!btn) return;
    btn.textContent = label;
    btn.classList.toggle("hidden", !onCreate);
    btn.onclick = onCreate || null;
  }

  function input(label, name, value = "", attrs = "") {
    return `<label>${text(label)}<input class="input" name="${name}" value="${text(value)}" ${attrs}></label>`;
  }
  function textarea(label, name, value = "", attrs = "") {
    return `<label>${text(label)}<textarea class="input" name="${name}" ${attrs}>${text(value)}</textarea></label>`;
  }
  function activeField(value = true) {
    return `<label>Estado<select class="input" name="active"><option value="true" ${value ? "selected" : ""}>Activo / publicado</option><option value="false" ${!value ? "selected" : ""}>Inactivo / oculto</option></select></label>`;
  }
  function section(title, body, help = "") {
    return `<section class="admin-form-section"><div class="admin-form-section-head"><h3>${text(title)}</h3>${help ? `<p>${text(help)}</p>` : ""}</div><div class="admin-form-section-body">${body}</div></section>`;
  }
  async function log(action, tableName, recordId = null, details = {}) {
    try { await WTAdminContent?.log?.(action, tableName, recordId, details); } catch (_) {}
  }

  async function upsertSetting(key, value, label = "") {
    const payload = { key, value, label, type: "text", is_public: true, updated_at: new Date().toISOString() };
    const { error } = await WT.supabase.from("site_settings").upsert(payload, { onConflict: "key" });
    if (error) throw error;
  }

  async function getSetting(key, fallback = "") {
    try {
      const { data } = await WT.supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
      return data?.value ?? fallback;
    } catch (_) { return fallback; }
  }

  async function renderAbout() {
    header("Nosotros", () => openAboutBlock(), "Crear bloque");
    const [{ data, error }, eyebrow, title, textBody, btnText, btnUrl] = await Promise.all([
      WT.supabase.from("site_about_blocks").select("*").order("sort_order", { ascending: true }),
      getSetting("home_about_eyebrow", "Sobre nosotros"),
      getSetting("home_about_title", "Una comunidad dominicana para prepararte mejor"),
      getSetting("home_about_text", "Work and Travel RD reúne orientación, práctica consular, servicios, cursos y experiencias reales para estudiantes dominicanos que quieren vivir su proceso J1 con más claridad."),
      getSetting("home_about_button_text", "Conocer servicios"),
      getSetting("home_about_button_url", "servicios.html")
    ]);
    if (error) return view().innerHTML = `<div class="empty-state"><h3>Herramienta no disponible</h3><p>${text(error.message)}</p><p>Revisa la configuración del panel antes de usar esta sección.</p></div>`;
    const items = data || [];
    view().innerHTML = `<form class="admin-form dynamic-settings-form" id="aboutHeaderForm">
      ${section("Encabezado de la sección Nosotros", `${input("Etiqueta pequeña", "home_about_eyebrow", eyebrow)}${input("Título principal", "home_about_title", title)}${textarea("Texto introductorio", "home_about_text", textBody, "rows='4'")}<div class="two compact-grid">${input("Texto del botón", "home_about_button_text", btnText)}${input("URL del botón", "home_about_button_url", btnUrl)}</div>`)}
      <button class="btn btn-primary">Guardar encabezado</button>
    </form>
    <div class="admin-summary-strip"><span><strong>${items.length}</strong> bloques</span><span><strong>${items.filter(x => x.active).length}</strong> activos</span></div>
    <div class="admin-content-grid dynamic-admin-grid">${items.map(renderAboutBlockCard).join("") || `<div class="empty-state">No hay bloques. Crea Quiénes somos, Objetivo, Visión y Metas.</div>`}</div>`;
    WT.qs("#aboutHeaderForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      try {
        await Promise.all(["home_about_eyebrow", "home_about_title", "home_about_text", "home_about_button_text", "home_about_button_url"].map(k => upsertSetting(k, String(fd.get(k) || ""), k)));
        await log("actualizar_nosotros_encabezado", "site_settings", null);
        WT.toast("Encabezado guardado", "success");
      } catch (err) { WT.toast(err.message, "error"); }
    });
    bindDynamicButtons();
  }

  function renderAboutBlockCard(item) {
    return `<article class="content-record-card dynamic-record-card"><div class="content-record-body"><div class="content-record-head"><div><span class="dynamic-icon">${text(item.icon || "✨")}</span><h3>${text(item.title || "Sin título")}</h3></div><div class="content-record-actions"><button class="btn btn-soft btn-small" data-edit-about="${item.id}">Editar</button><button class="btn btn-danger btn-small" data-delete-dynamic="site_about_blocks:${item.id}">Eliminar</button></div></div><p>${text(item.body || "")}</p><div class="content-meta-grid"><span>Clave: ${text(item.key || "")}</span><span>${item.active ? "Activo" : "Inactivo"}</span><span>Orden: ${Number(item.sort_order || 0)}</span>${item.featured ? "<span>Destacado</span>" : ""}</div></div></article>`;
  }

  function openAboutBlock(item = {}) {
    const body = `<form class="admin-form" id="aboutBlockForm">
      ${section("Contenido", `${div2(input("Clave interna", "key", item.key || "", "placeholder='quienes_somos'") + input("Icono emoji", "icon", item.icon || "✨", "maxlength='4'"))}${input("Título", "title", item.title || "", "required")}${textarea("Texto", "body", item.body || "", "rows='5' required")}`)}
      ${section("Publicación", `<div class="three compact-grid">${activeField(item.active ?? true)}${input("Orden", "sort_order", item.sort_order ?? 0, "type='number'")}<label>Destacado<select class="input" name="featured"><option value="false" ${!item.featured ? "selected" : ""}>No</option><option value="true" ${item.featured ? "selected" : ""}>Sí</option></select></label></div>`)}
      <button class="btn btn-primary">Guardar bloque</button>
    </form>`;
    const modal = WT.showModal({ title: item.id ? "Editar bloque Nosotros" : "Crear bloque Nosotros", body, className: "admin-edit-modal" });
    WT.qs("#aboutBlockForm", modal.element).addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const payload = { key: String(fd.get("key") || "").trim(), icon: fd.get("icon") || "✨", title: String(fd.get("title") || "").trim(), body: String(fd.get("body") || "").trim(), active: fd.get("active") === "true", featured: fd.get("featured") === "true", sort_order: Number(fd.get("sort_order") || 0), updated_at: new Date().toISOString() };
      try {
        const result = item.id ? await WT.supabase.from("site_about_blocks").update(payload).eq("id", item.id).select("id").single() : await WT.supabase.from("site_about_blocks").insert(payload).select("id").single();
        if (result.error) throw result.error;
        await log(item.id ? "editar_bloque_nosotros" : "crear_bloque_nosotros", "site_about_blocks", item.id || result.data.id, payload);
        WT.toast("Bloque guardado", "success"); modal.close(); renderAbout();
      } catch (err) { WT.toast(err.message, "error"); }
    });
  }

  function div2(inner) { return `<div class="two compact-grid">${inner}</div>`; }

  async function renderLegal() {
    header("Políticas legales", () => openLegalPage(), "Crear política");
    const { data, error } = await WT.supabase.from("legal_pages").select("*").order("sort_order", { ascending: true });
    if (error) return view().innerHTML = `<div class="empty-state"><h3>Herramienta no disponible</h3><p>${text(error.message)}</p></div>`;
    view().innerHTML = `<div class="toolbar-card"><p>Administra términos, privacidad, aviso legal y cualquier política. Se publican en <strong>legal.html?slug=...</strong>.</p></div><div class="admin-content-grid dynamic-admin-grid">${(data || []).map(renderLegalCard).join("") || `<div class="empty-state">No hay políticas legales.</div>`}</div>`;
    bindDynamicButtons();
  }

  function renderLegalCard(item) {
    return `<article class="content-record-card dynamic-record-card"><div class="content-record-body"><div class="content-record-head"><div><span class="eyebrow">/${text(item.slug)}</span><h3>${text(item.title)}</h3></div><div class="content-record-actions"><a class="btn btn-soft btn-small" href="legal.html?slug=${encodeURIComponent(item.slug)}" target="_blank">Ver</a><button class="btn btn-soft btn-small" data-edit-legal="${item.id}">Editar</button><button class="btn btn-danger btn-small" data-delete-dynamic="legal_pages:${item.id}">Eliminar</button></div></div><p>${text(item.summary || "")}</p><div class="content-meta-grid"><span>${item.active ? "Publicado" : "Oculto"}</span><span>Orden: ${Number(item.sort_order || 0)}</span><span>Actualizado: ${item.updated_at ? new Date(item.updated_at).toLocaleDateString("es-DO") : ""}</span></div></div></article>`;
  }

  function openLegalPage(item = {}) {
    const body = `<form class="admin-form" id="legalForm">
      ${section("Documento legal", `${div2(input("Slug URL", "slug", item.slug || "terminos", "required placeholder='terminos'") + input("Título", "title", item.title || "", "required"))}${textarea("Resumen", "summary", item.summary || "", "rows='3'")}${textarea("Contenido completo", "content", item.content || "", "rows='12' required")}`)}
      ${section("Publicación", `<div class="two compact-grid">${activeField(item.active ?? true)}${input("Orden", "sort_order", item.sort_order ?? 0, "type='number'")}</div>`)}
      <button class="btn btn-primary">Guardar política</button>
    </form>`;
    const modal = WT.showModal({ title: item.id ? "Editar política" : "Crear política legal", body, className: "admin-edit-modal legal-edit-modal" });
    WT.qs("#legalForm", modal.element).addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const payload = { slug: String(fd.get("slug") || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"), title: String(fd.get("title") || "").trim(), summary: String(fd.get("summary") || "").trim(), content: String(fd.get("content") || "").trim(), active: fd.get("active") === "true", sort_order: Number(fd.get("sort_order") || 0), updated_at: new Date().toISOString() };
      try {
        const result = item.id ? await WT.supabase.from("legal_pages").update(payload).eq("id", item.id).select("id").single() : await WT.supabase.from("legal_pages").insert(payload).select("id").single();
        if (result.error) throw result.error;
        await log(item.id ? "editar_politica" : "crear_politica", "legal_pages", item.id || result.data.id, payload);
        WT.toast("Política guardada", "success"); modal.close(); renderLegal();
      } catch (err) { WT.toast(err.message, "error"); }
    });
  }

  async function renderSocial() {
    header("Redes y comunidades", () => openSocialLink(), "Crear enlace");
    const { data, error } = await WT.supabase.from("social_links").select("*").order("sort_order", { ascending: true });
    if (error) return view().innerHTML = `<div class="empty-state"><h3>Herramienta no disponible</h3><p>${text(error.message)}</p></div>`;
    view().innerHTML = `<div class="toolbar-card"><p>Agrega Instagram, WhatsApp, Telegram, grupos o comunidades. Los enlaces activos aparecen en Inicio y en páginas legales.</p></div><div class="admin-content-grid dynamic-admin-grid">${(data || []).map(renderSocialCard).join("") || `<div class="empty-state">No hay enlaces sociales.</div>`}</div>`;
    bindDynamicButtons();
  }

  function renderSocialCard(item) {
    return `<article class="content-record-card dynamic-record-card"><div class="content-record-body"><div class="content-record-head"><div><span class="dynamic-icon">${text(item.icon || "🔗")}</span><h3>${text(item.label || item.platform)}</h3></div><div class="content-record-actions"><button class="btn btn-soft btn-small" data-edit-social="${item.id}">Editar</button><button class="btn btn-danger btn-small" data-delete-dynamic="social_links:${item.id}">Eliminar</button></div></div><p class="content-record-description">${text(item.url || "Sin URL")}</p><div class="content-meta-grid"><span>${text(item.platform || "")}</span><span>${item.active ? "Activo" : "Inactivo"}</span><span>Orden: ${Number(item.sort_order || 0)}</span></div></div></article>`;
  }

  function openSocialLink(item = {}) {
    const body = `<form class="admin-form" id="socialForm">
      ${section("Enlace", `${div2(input("Plataforma", "platform", item.platform || "Instagram", "required") + input("Icono", "icon", item.icon || "🔗", "maxlength='4'"))}${input("Texto visible", "label", item.label || item.platform || "", "required")}${input("URL", "url", item.url || "", "required placeholder='https://...'")}`)}
      ${section("Publicación", `<div class="two compact-grid">${activeField(item.active ?? true)}${input("Orden", "sort_order", item.sort_order ?? 0, "type='number'")}</div>`)}
      <button class="btn btn-primary">Guardar enlace</button>
    </form>`;
    const modal = WT.showModal({ title: item.id ? "Editar enlace" : "Crear enlace social", body, className: "admin-edit-modal" });
    WT.qs("#socialForm", modal.element).addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const payload = { platform: String(fd.get("platform") || "").trim(), icon: fd.get("icon") || "🔗", label: String(fd.get("label") || "").trim(), url: String(fd.get("url") || "").trim(), active: fd.get("active") === "true", sort_order: Number(fd.get("sort_order") || 0), updated_at: new Date().toISOString() };
      try {
        const result = item.id ? await WT.supabase.from("social_links").update(payload).eq("id", item.id).select("id").single() : await WT.supabase.from("social_links").insert(payload).select("id").single();
        if (result.error) throw result.error;
        await log(item.id ? "editar_red_social" : "crear_red_social", "social_links", item.id || result.data.id, payload);
        WT.toast("Enlace guardado", "success"); modal.close(); renderSocial();
      } catch (err) { WT.toast(err.message, "error"); }
    });
  }

  async function safeSelect(table) {
    try { return await WT.supabase.from(table).select("*"); }
    catch (_) { return { data: [] }; }
  }

  async function bindDynamicButtons() {
    const [about, legal, social] = await Promise.all([
      safeSelect("site_about_blocks"),
      safeSelect("legal_pages"),
      safeSelect("social_links")
    ]);
    const aboutById = Object.fromEntries((about.data || []).map(x => [x.id, x]));
    const legalById = Object.fromEntries((legal.data || []).map(x => [x.id, x]));
    const socialById = Object.fromEntries((social.data || []).map(x => [x.id, x]));
    WT.qsa("[data-edit-about]").forEach(btn => btn.addEventListener("click", () => openAboutBlock(aboutById[btn.dataset.editAbout] || {})));
    WT.qsa("[data-edit-legal]").forEach(btn => btn.addEventListener("click", () => openLegalPage(legalById[btn.dataset.editLegal] || {})));
    WT.qsa("[data-edit-social]").forEach(btn => btn.addEventListener("click", () => openSocialLink(socialById[btn.dataset.editSocial] || {})));
    WT.qsa("[data-delete-dynamic]").forEach(btn => btn.addEventListener("click", async () => {
      const [table, id] = btn.dataset.deleteDynamic.split(":");
      const ok = await WT.confirmDialog({ title: "Confirmar eliminación", message: "Este registro se borrará definitivamente.", confirmText: "Eliminar", danger: true });
      if (!ok) return;
      const { error } = await WT.supabase.from(table).delete().eq("id", id);
      if (error) return WT.toast(error.message, "error");
      await log("eliminar_dinamico", table, id);
      WT.toast("Eliminado", "success");
      if (table === "site_about_blocks") renderAbout();
      if (table === "legal_pages") renderLegal();
      if (table === "social_links") renderSocial();
    }));
  }

  window.WTAdminDynamic = { renderAbout, renderLegal, renderSocial };
})();
