(() => {
  const view = () => WT.qs("#adminView");
  const esc = (v = "") => WT.escapeHTML(String(v ?? ""));
  const header = (title, create = null) => {
    WT.qs("#adminTitle").textContent = title;
    const btn = WT.qs("#adminCreateBtn");
    btn.classList.toggle("hidden", !create);
    btn.onclick = create || null;
    btn.textContent = "Crear";
  };
  const field = (label, name, value = "", type = "text", attrs = "") => `<label>${esc(label)}<input class="input" type="${type}" name="${name}" value="${esc(value)}" ${attrs}></label>`;
  const textarea = (label, name, value = "") => `<label>${esc(label)}<textarea class="input" name="${name}" rows="4">${esc(value)}</textarea></label>`;
  const audienceSelect = (value = "all") => `<label>Segmento<select class="input" name="audience_type"><option value="all" ${value === "all" ? "selected" : ""}>Todos</option><option value="first_year" ${value === "first_year" ? "selected" : ""}>Primer año</option><option value="repeaters" ${value === "repeaters" ? "selected" : ""}>Repitentes</option></select></label>`;
  const bool = (label, name, checked = true) => `<label>${esc(label)}<select class="input" name="${name}"><option value="true" ${checked ? "selected" : ""}>Sí</option><option value="false" ${!checked ? "selected" : ""}>No</option></select></label>`;

  const ROLE_RANKS = { user: 0, member: 0, moderator: 1, moderador: 1, admin: 2, superadmin: 3, owner: 4 };
  const roleRank = role => ROLE_RANKS[String(role || "user").toLowerCase()] ?? 0;
  const isOwnerRole = role => String(role || "").toLowerCase() === "owner";
  const isWithinMinutes = (dateValue, minutes = 5) => { const time = new Date(dateValue || 0).getTime(); return !!time && Date.now() - time <= minutes * 60 * 1000; };
  const isWithinHours = (dateValue, hours = 1) => { const time = new Date(dateValue || 0).getTime(); return !!time && Date.now() - time <= hours * 60 * 60 * 1000; };
  function moderationDeleteHoursForRole(role = "user") {
    const r = String(role || "user").toLowerCase();
    if (r === "owner") return Infinity;
    if (r === "superadmin") return 48;
    if (r === "admin") return 24;
    if (r === "moderator" || r === "moderador") return 5;
    return 0;
  }
  function canDeleteSharedPracticeCard(item = {}, owner = {}, myProfile = {}) {
    const myId = String(myProfile?.id || "");
    const ownerId = String(item?.owner_id || "");
    if (!myId || !ownerId) return false;
    if (myId === ownerId) return isOwnerRole(myProfile.role) || isWithinMinutes(item.created_at, 5);
    if (isOwnerRole(owner.role)) return false;
    if (isOwnerRole(myProfile.role)) return true;
    if (roleRank(myProfile.role) <= roleRank(owner.role || "user")) return false;
    const hours = moderationDeleteHoursForRole(myProfile.role);
    return hours === Infinity || (hours > 0 && isWithinHours(item.created_at, hours));
  }

  function injectSidebar() {
    const sidebar = WT.qs("#adminSidebar");
    if (!sidebar || WT.qs('[data-section="practice-voices"]')) return;
    const anchor = WT.qs('[data-section="practice-settings"]', sidebar);
    anchor?.insertAdjacentHTML("afterend", `<button data-section="practice-voices">Audio práctica</button><button data-section="practice-wilberforce">Wilberforce</button><button data-section="practice-glossary">Glosario</button><button data-section="practice-shared">Prácticas compartidas</button>`);
  }

  async function saveSetting(key, value, label = key, description = "", type = "text") {
    const { error } = await WT.supabase.from("practice_settings").upsert({ key, value: String(value), label, description, type }, { onConflict: "key" });
    if (error) throw error;
  }

  async function loadBrowserVoices() {
    if (!window.speechSynthesis) return [];
    const current = window.speechSynthesis.getVoices();
    if (current.length) return current;
    return await new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve(window.speechSynthesis.getVoices());
      };
      window.speechSynthesis.onvoiceschanged = finish;
      setTimeout(finish, 900);
    });
  }

  function findVoiceFromForm(fd) {
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    const uri = String(fd.get("voice_uri") || "").trim();
    const manual = String(fd.get("voice_name_manual") || "").trim().toLowerCase();
    const lang = String(fd.get("voice_language") || "en-US").trim().toLowerCase();
    let voice = null;
    if (uri) voice = voices.find(v => v.voiceURI === uri);
    if (!voice && manual) voice = voices.find(v => String(v.name || "").toLowerCase() === manual);
    if (!voice && manual) voice = voices.find(v => String(v.name || "").toLowerCase().includes(manual));
    if (!voice && lang) voice = voices.find(v => String(v.lang || "").toLowerCase() === lang);
    if (!voice && lang) voice = voices.find(v => String(v.lang || "").toLowerCase().startsWith(lang.split("-")[0]));
    return voice || voices.find(v => /^en[-_]/i.test(v.lang || "")) || voices[0] || null;
  }

  async function renderVoices() {
    header("Audio de práctica", null);
    const voices = await loadBrowserVoices();
    const { data } = await WT.supabase.from("practice_settings").select("key,value");
    const settings = Object.fromEntries((data || []).map(r => [r.key, r.value]));
    const options = voices.map(v => {
      const selected = v.voiceURI === settings.voice_uri || (!settings.voice_uri && settings.voice_name && v.name === settings.voice_name);
      return `<option value="${esc(v.voiceURI)}" data-name="${esc(v.name)}" data-lang="${esc(v.lang)}" ${selected ? "selected" : ""}>${esc(v.name)} — ${esc(v.lang)}</option>`;
    }).join("");

    view().innerHTML = `<form class="admin-form" id="voiceSettingsForm">
      <div class="toolbar-card"><p><strong>¿Para qué sirve?</strong> Este apartado controla la voz que lee las preguntas, la velocidad, el tono, el tiempo para responder y la pausa entre una pregunta y otra.</p><p><strong>Importante:</strong> Si una pregunta tiene un audio MP3/WAV cargado, se reproduce ese audio y no la voz automática. La voz automática se usa cuando la pregunta no tiene audio cargado.</p><p><strong>iPhone:</strong> las voces pueden aparecer después de unos segundos y pueden variar entre Safari y la web app instalada.</p></div>
      <label>Voz preferida<select class="input" name="voice_uri"><option value="">Automática recomendada</option>${options}</select></label>
      ${field("Nombre de voz manual opcional", "voice_name_manual", settings.voice_name || "", "text", "placeholder='Ej: Samantha, Ava, Daniel, Google US English'")}
      <div class="three">
        <label>Idioma<select class="input" name="voice_language"><option value="en-US" ${settings.voice_language === "en-US" ? "selected" : ""}>Inglés americano</option><option value="en-GB" ${settings.voice_language === "en-GB" ? "selected" : ""}>Inglés británico</option><option value="en" ${settings.voice_language === "en" ? "selected" : ""}>Inglés general</option></select></label>
        ${field("Velocidad", "voice_rate", settings.voice_rate || "0.88", "number", "step='0.05' min='0.5' max='1.4'")}
        ${field("Tono", "voice_pitch", settings.voice_pitch || "1", "number", "step='0.05' min='0.5' max='1.5'")}
      </div>
      <div class="two">
        ${field("Tiempo para responder (segundos)", "response_time_seconds", settings.response_time_seconds || "18", "number", "min='3' max='120'")}
        ${field("Transición entre preguntas (segundos)", "transition_seconds", settings.transition_seconds || "2", "number", "min='0' max='20'")}
      </div>
      <label>Segmento por defecto<select class="input" name="default_audience_type"><option value="all" ${settings.default_audience_type === "all" ? "selected" : ""}>Todos</option><option value="first_year" ${settings.default_audience_type === "first_year" ? "selected" : ""}>Primer año</option><option value="repeaters" ${settings.default_audience_type === "repeaters" ? "selected" : ""}>Repitentes</option></select></label>
      <div class="record-actions"><button class="btn btn-soft" type="button" id="testVoiceBtn">Probar voz</button><button class="btn btn-primary">Guardar</button></div>
    </form>`;

    WT.qs("#testVoiceBtn")?.addEventListener("click", async () => {
      if (!window.speechSynthesis) return WT.toast("Este navegador no soporta voces automáticas.", "warning");
      await loadBrowserVoices();
      window.speechSynthesis.cancel();
      const form = WT.qs("#voiceSettingsForm");
      const fd = new FormData(form);
      const u = new SpeechSynthesisUtterance("What is the purpose of your Summer Work and Travel program?");
      const voice = findVoiceFromForm(fd);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || fd.get("voice_language") || "en-US";
      u.rate = Number(fd.get("voice_rate") || 0.88);
      u.pitch = Number(fd.get("voice_pitch") || 1);
      window.speechSynthesis.speak(u);
    });

    WT.qs("#voiceSettingsForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      await loadBrowserVoices();
      const fd = new FormData(e.currentTarget);
      const voice = findVoiceFromForm(fd);
      const manualVoiceName = String(fd.get("voice_name_manual") || "").trim();
      try {
        await saveSetting("enable_speech_synthesis", "true", "Pronunciación automática", "Permite leer preguntas con la voz del navegador.", "boolean");
        await saveSetting("voice_uri", fd.get("voice_uri") || "", "URI de voz preferida", "Identificador interno de la voz seleccionada.", "text");
        await saveSetting("voice_name", manualVoiceName || voice?.name || "", "Voz preferida", "Nombre de la voz seleccionada o escrita manualmente.", "text");
        await saveSetting("voice_language", fd.get("voice_language") || voice?.lang || "en-US", "Idioma de voz", "Idioma base de la voz.", "select");
        await saveSetting("voice_rate", fd.get("voice_rate"), "Velocidad de voz", "Velocidad de pronunciación.", "number");
        await saveSetting("voice_pitch", fd.get("voice_pitch"), "Tono de voz", "Tono de pronunciación.", "number");
        await saveSetting("response_time_seconds", fd.get("response_time_seconds"), "Tiempo para responder", "Segundos disponibles para responder.", "number");
        await saveSetting("transition_seconds", fd.get("transition_seconds"), "Transición", "Pausa entre preguntas.", "number");
        await saveSetting("default_audience_type", fd.get("default_audience_type"), "Segmento por defecto", "Segmento predeterminado.", "select");
        WT.toast("Configuración de audio guardada", "success");
      } catch (err) { WT.toast(err.message, "error"); }
    });
  }

  async function renderInfoSections() {
    header("Apartado Wilberforce", () => openInfoForm());
    const { data, error } = await WT.supabase.from("practice_info_sections").select("*").eq("section_type", "wilberforce").order("sort_order");
    if (error) return view().innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    view().innerHTML = `<div class="admin-card-list">${(data || []).map(item => `<article class="admin-record"><h3>${esc(item.icon || "⚖️")} ${esc(item.title)}</h3><p>${esc(item.body)}</p><p>${audienceLabel(item.audience_type)} • ${item.active ? "Activo" : "Inactivo"}</p><div class="record-actions"><button class="btn btn-soft btn-small" data-edit-info="${item.id}">Editar</button><button class="btn btn-danger btn-small" data-delete-info="${item.id}">Eliminar</button></div></article>`).join("") || `<div class="empty-state">No hay contenido de Wilberforce.</div>`}</div>`;
    WT.qsa("[data-edit-info]").forEach(btn => btn.addEventListener("click", () => openInfoForm(data.find(x => x.id === btn.dataset.editInfo))));
  }

  function openInfoForm(item = {}) {
    const body = `<form class="admin-form" id="infoForm">${field("Icono", "icon", item.icon || "⚖️")}${field("Título", "title", item.title || "", "text", "required")}${textarea("Contenido", "body", item.body || "")}${audienceSelect(item.audience_type || "all")}<div class="two">${field("Orden", "sort_order", item.sort_order || 0, "number")}${bool("Activo", "active", item.active ?? true)}</div><button class="btn btn-primary">Guardar</button></form>`;
    const modal = WT.showModal({ title: item.id ? "Editar Wilberforce" : "Crear Wilberforce", body });
    WT.qs("#infoForm", modal.element).addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const payload = Object.fromEntries(fd.entries());
      payload.section_type = "wilberforce";
      payload.active = payload.active === "true";
      payload.sort_order = Number(payload.sort_order || 0);
      const res = item.id ? await WT.supabase.from("practice_info_sections").update(payload).eq("id", item.id) : await WT.supabase.from("practice_info_sections").insert(payload);
      if (res.error) return WT.toast(res.error.message, "error");
      WT.toast("Contenido guardado", "success"); modal.close(); renderInfoSections();
    });
  }

  async function renderGlossary() {
    header("Glosario de práctica", () => openGlossaryForm());
    const { data, error } = await WT.supabase.from("practice_glossary_terms").select("*").order("sort_order");
    if (error) return view().innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    view().innerHTML = `<div class="admin-card-list">${(data || []).map(item => `<article class="admin-record"><h3>${esc(item.term)}</h3><p>${esc(item.definition)}</p>${item.example ? `<p><strong>Ejemplo:</strong> ${esc(item.example)}</p>` : ""}<p>${audienceLabel(item.audience_type)} • ${item.active ? "Activo" : "Inactivo"}</p><div class="record-actions"><button class="btn btn-soft btn-small" data-edit-glossary="${item.id}">Editar</button><button class="btn btn-danger btn-small" data-delete-glossary="${item.id}">Eliminar</button></div></article>`).join("") || `<div class="empty-state">No hay términos.</div>`}</div>`;
    WT.qsa("[data-edit-glossary]").forEach(btn => btn.addEventListener("click", () => openGlossaryForm(data.find(x => x.id === btn.dataset.editGlossary))));
  }

  function openGlossaryForm(item = {}) {
    const body = `<form class="admin-form" id="glossaryForm">${field("Término", "term", item.term || "", "text", "required")}${textarea("Definición", "definition", item.definition || "")}${textarea("Ejemplo", "example", item.example || "")}${audienceSelect(item.audience_type || "all")}<div class="two">${field("Orden", "sort_order", item.sort_order || 0, "number")}${bool("Activo", "active", item.active ?? true)}</div><button class="btn btn-primary">Guardar</button></form>`;
    const modal = WT.showModal({ title: item.id ? "Editar término" : "Crear término", body });
    WT.qs("#glossaryForm", modal.element).addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const payload = Object.fromEntries(fd.entries());
      payload.active = payload.active === "true";
      payload.sort_order = Number(payload.sort_order || 0);
      const res = item.id ? await WT.supabase.from("practice_glossary_terms").update(payload).eq("id", item.id) : await WT.supabase.from("practice_glossary_terms").insert(payload);
      if (res.error) return WT.toast(res.error.message, "error");
      WT.toast("Término guardado", "success"); modal.close(); renderGlossary();
    });
  }

  async function renderSharedPractices() {
    header("Prácticas compartidas", null);
    const { data, error } = await WT.supabase.from("practice_shared_configs").select("*").order("created_at", { ascending: false }).limit(150);
    if (error) return view().innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    const practices = data || [];
    const myProfile = await WT.getMyProfile?.().catch(() => null);
    const ownerIds = [...new Set(practices.map(x => x.owner_id).filter(Boolean))];
    const ownerMap = {};
    if (ownerIds.length) {
      const users = await WT.supabase.from("user_profiles").select("id,full_name,email,role").in("id", ownerIds);
      (users.data || []).forEach(u => ownerMap[u.id] = u);
    }
    view().innerHTML = `<div class="toolbar-card"><input class="input" id="sharedPracticeSearch" placeholder="Buscar por título, autor o descripción..."></div><div class="admin-card-list" id="sharedPracticeList">${practices.map(item => renderSharedPracticeCard(item, ownerMap[item.owner_id], myProfile)).join("") || `<div class="empty-state">No hay prácticas compartidas.</div>`}</div>`;
    WT.qs("#sharedPracticeSearch")?.addEventListener("input", e => {
      const q = String(e.target.value || "").toLowerCase();
      WT.qsa("[data-shared-practice-card]").forEach(card => card.classList.toggle("hidden", q && !(card.dataset.search || "").includes(q)));
    });
  }

  function roleLabel(role = "user") {
    const map = { owner: "★★★★★", superadmin: "Director", admin: "Administrador", moderator: "Moderador", moderador: "Moderador", user: "Usuario" };
    return map[String(role || "user").toLowerCase()] || String(role || "Usuario");
  }

  function renderSharedPracticeCard(item, owner = {}, myProfile = {}) {
    const questions = Array.isArray(item.question_ids) ? item.question_ids.length : 0;
    const created = item.created_at ? new Date(item.created_at).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" }) : "Sin fecha";
    const ownerName = owner.full_name || owner.email || "Autor no disponible";
    const search = `${item.title || ""} ${item.description || ""} ${ownerName}`.toLowerCase();
    return `<article class="admin-record shared-practice-admin-card" data-shared-practice-card data-search="${esc(search)}">
      <h3>${esc(item.title || "Práctica sin título")}</h3>
      <p>${esc(item.description || "")}</p>
      <div class="content-meta-grid">
        <span>${questions} preguntas</span>
        <span>${audienceLabel(item.audience_type)}</span>
        <span>${item.active ? "Activa" : "Oculta"}</span>
        <span>${esc(created)}</span>
        <span>Autor: ${esc(ownerName)}</span>
        <span>Rol: ${esc(roleLabel(owner.role || "user"))}</span>
      </div>
      <div class="record-actions">
        <button class="btn btn-soft btn-small" data-toggle-shared="${esc(item.id)}" data-active="${item.active}">${item.active ? "Ocultar" : "Activar"}</button>
        ${canDeleteSharedPracticeCard(item, owner, myProfile) ? `<button class="btn btn-danger btn-small" data-delete-shared="${esc(item.id)}">Eliminar</button>` : ""}
      </div>
    </article>`;
  }

  function audienceLabel(v) { return v === "first_year" ? "Primer año" : v === "repeaters" ? "Repitentes" : "Todos"; }

  document.addEventListener("click", async e => {
    const delInfo = e.target.closest("[data-delete-info]");
    if (delInfo) { await WT.supabase.from("practice_info_sections").delete().eq("id", delInfo.dataset.deleteInfo); renderInfoSections(); }
    const delGloss = e.target.closest("[data-delete-glossary]");
    if (delGloss) { await WT.supabase.from("practice_glossary_terms").delete().eq("id", delGloss.dataset.deleteGlossary); renderGlossary(); }
    const tog = e.target.closest("[data-toggle-shared]");
    if (tog) { const res = await WT.supabase.from("practice_shared_configs").update({ active: tog.dataset.active !== "true" }).eq("id", tog.dataset.toggleShared); if (res.error) return WT.toast(res.error.message, "error"); WT.toast("Práctica actualizada", "success"); renderSharedPractices(); }
    const delShared = e.target.closest("[data-delete-shared]");
    if (delShared) {
      const ok = await WT.confirmDialog({ title: "Eliminar práctica compartida", message: "Esta práctica compartida se eliminará definitivamente.", confirmText: "Eliminar", danger: true });
      if (!ok) return;
      const res = await WT.supabase.rpc("admin_delete_shared_practice", { shared_practice_id: delShared.dataset.deleteShared });
      if (res.error) return WT.toast(res.error.message || "No se pudo eliminar la práctica.", "error");
      WT.toast("Práctica compartida eliminada.", "success");
      renderSharedPractices();
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (WT.page !== "admin") return;
    injectSidebar();
    const oldRender = window.WTAdmin?.render;
    const wait = setInterval(() => {
      if (!window.WTAdmin?.render || window.WTAdmin.__advancedPracticePatched) return;
      const original = window.WTAdmin.render;
      window.WTAdmin.render = async (section) => {
        if (section === "practice-voices") return renderVoices();
        if (section === "practice-wilberforce") return renderInfoSections();
        if (section === "practice-glossary") return renderGlossary();
        if (section === "practice-shared") return renderSharedPractices();
        return original(section);
      };
      window.WTAdmin.__advancedPracticePatched = true;
      WT.qsa("#adminSidebar button").forEach(btn => {
        if (btn.dataset.advancedBound === "1") return;
        btn.dataset.advancedBound = "1";
        btn.addEventListener("click", () => {
          const s = btn.dataset.section;
          if (["practice-voices","practice-wilberforce","practice-glossary","practice-shared"].includes(s)) {
            WT.qsa("#adminSidebar button").forEach(b => b.classList.toggle("active", b === btn));
            location.hash = s;
            window.WTAdmin.render(s);
          }
        });
      });
      clearInterval(wait);
    }, 200);
    setTimeout(() => clearInterval(wait), 5000);
  });

  window.WTAdminPracticeAdvanced = { renderVoices, renderInfoSections, renderGlossary, renderSharedPractices };
})();
