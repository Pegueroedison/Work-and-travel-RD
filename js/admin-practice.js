(() => {
  const view = () => WT.qs("#adminView");
  let categories = [];

  function header(title, create = null) {
    WT.qs("#adminTitle").textContent = title;
    const btn = WT.qs("#adminCreateBtn");
    btn.classList.toggle("hidden", !create); btn.onclick = create || null; btn.textContent = "Crear";
  }
  function field(label, name, value = "", type = "text", attrs = "") { return `<label>${WT.escapeHTML(label)}<input class="input" type="${type}" name="${name}" value="${WT.escapeHTML(value ?? "")}" ${attrs}></label>`; }
  function textarea(label, name, value = "") { return `<label>${WT.escapeHTML(label)}<textarea class="input" name="${name}">${WT.escapeHTML(value ?? "")}</textarea></label>`; }
  function bool(label, name, checked = false) { return `<label>${WT.escapeHTML(label)}<select class="input" name="${name}"><option value="true" ${checked ? "selected" : ""}>Sí</option><option value="false" ${!checked ? "selected" : ""}>No</option></select></label>`; }
  function select(label, name, value, opts) { return `<label>${WT.escapeHTML(label)}<select class="input" name="${name}">${opts.map(o => `<option value="${WT.escapeHTML(o.value)}" ${String(o.value) === String(value ?? "") ? "selected" : ""}>${WT.escapeHTML(o.label)}</option>`).join("")}</select></label>`; }

  async function loadCategories() {
    const { data } = await WT.supabase.from("practice_question_categories").select("*").order("sort_order", { ascending: true });
    categories = data || [];
  }

  async function renderQuestions() {
    header("Preguntas de práctica", () => openQuestionForm());
    await loadCategories();
    view().innerHTML = `<div class="toolbar-card"><input class="input" id="practiceAdminSearch" placeholder="Buscar pregunta"><select class="input" id="practiceAdminCategory"><option value="">Todas las categorías</option>${categories.map(c => `<option value="${c.id}">${WT.escapeHTML(c.name)}</option>`).join("")}</select></div><div id="practiceAdminList" class="admin-card-list"></div>`;
    WT.qs("#practiceAdminSearch").addEventListener("input", loadQuestions);
    WT.qs("#practiceAdminCategory").addEventListener("change", loadQuestions);
    await loadQuestions();
  }

  async function loadQuestions() {
    const search = WT.qs("#practiceAdminSearch")?.value?.trim() || "";
    const cat = WT.qs("#practiceAdminCategory")?.value || "";
    let q = WT.supabase.from("practice_questions").select("*, practice_question_categories(name)").order("sort_order", { ascending: true }).limit(120);
    if (search) q = q.or(`question_text.ilike.%${search}%,suggested_answer.ilike.%${search}%,spanish_translation.ilike.%${search}%`);
    if (cat) q = q.eq("category_id", cat);
    const { data, error } = await q;
    const list = WT.qs("#practiceAdminList");
    if (error) return list.innerHTML = `<div class="empty-state">${WT.escapeHTML(error.message)}</div>`;
    list.innerHTML = (data || []).map(renderQuestionRecord).join("") || `<div class="empty-state">No hay preguntas.</div>`;
    WT.qsa("[data-edit-question]").forEach(b => b.addEventListener("click", () => openQuestionForm(data.find(x => x.id === b.dataset.editQuestion))));
  }

  function renderQuestionRecord(q) {
    return `<article class="admin-record"><h3>${WT.escapeHTML(q.question_text)}</h3><p><strong>Categoría:</strong> ${WT.escapeHTML(q.practice_question_categories?.name || "")} • <strong>Dificultad:</strong> ${WT.escapeHTML(q.difficulty || "Media")}</p><p><strong>Activo:</strong> ${q.active ? "Sí" : "No"} • <strong>Rápida:</strong> ${q.quick_practice ? "Sí" : "No"} • <strong>Destacada:</strong> ${q.featured ? "Sí" : "No"}</p><div class="record-actions"><button class="btn btn-soft btn-small" data-edit-question="${q.id}">Editar</button><button class="btn btn-primary btn-small" data-test-audio="${q.id}">Probar audio</button><button class="btn btn-danger btn-small" data-delete-question="${q.id}">Eliminar</button></div></article>`;
  }

  async function openQuestionForm(item = {}) {
    await loadCategories();
    const body = `<form class="admin-form" id="questionForm">
      ${textarea("Pregunta en inglés", "question_text", item.question_text || "")}
      <div class="two">${select("Categoría", "category_id", item.category_id || categories[0]?.id || "", categories.map(c => ({value:c.id,label:c.name})))}${select("Dificultad", "difficulty", item.difficulty || "Media", [{value:"Fácil",label:"Fácil"},{value:"Media",label:"Media"},{value:"Difícil",label:"Difícil"}])}</div>
      ${textarea("Respuesta sugerida", "suggested_answer", item.suggested_answer || "")}
      ${textarea("Traducción al español", "spanish_translation", item.spanish_translation || "")}
      <label>Audio MP3/WAV<input class="input" type="file" name="audio_file" accept="audio/*"></label>${field("URL de audio", "question_audio_url", item.question_audio_url || "", "url")}
      <div class="three">${bool("Activa", "active", item.active ?? true)}${bool("Destacada", "featured", item.featured ?? false)}${bool("Práctica rápida", "quick_practice", item.quick_practice ?? false)}</div>
      ${field("Orden", "sort_order", item.sort_order || 0, "number")}${textarea("Notas internas", "notes", item.notes || "")}
      <button class="btn btn-primary">Guardar pregunta</button>
    </form>`;
    const modal = WT.showModal({ title: item.id ? "Editar pregunta" : "Crear pregunta", body });
    WT.qs("#questionForm", modal.element).addEventListener("submit", async e => {
      e.preventDefault(); const fd = new FormData(e.currentTarget); const payload = Object.fromEntries(fd.entries()); const file = fd.get("audio_file"); delete payload.audio_file;
      ["active", "featured", "quick_practice"].forEach(k => payload[k] = payload[k] === "true"); payload.sort_order = Number(payload.sort_order || 0);
      try {
        if (file && file.size) {
          const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
          const path = `questions/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
          const uploaded = await WT.uploadBlob(WT.cfg.BUCKETS.practice_audio, path, file, { contentType: file.type });
          payload.question_audio_path = uploaded.path; payload.question_audio_url = uploaded.url;
        }
        const result = item.id ? await WT.supabase.from("practice_questions").update(payload).eq("id", item.id).select("id").single() : await WT.supabase.from("practice_questions").insert(payload).select("id").single();
        if (result.error) throw result.error;
        await WTAdminContent.log(item.id ? "editar_pregunta" : "crear_pregunta", "practice_questions", item.id || result.data.id, payload);
        WT.toast("Pregunta guardada", "success"); modal.close(); renderQuestions();
      } catch (err) { WT.toast(err.message, "error"); }
    });
  }

  async function deleteQuestion(id) {
    const ok = await WT.confirmDialog({ title: "Eliminar pregunta", message: "La pregunta se borrará definitivamente.", confirmText: "Eliminar", danger: true }); if (!ok) return;
    const { error } = await WT.supabase.from("practice_questions").delete().eq("id", id);
    if (error) return WT.toast(error.message, "error");
    await WTAdminContent.log("eliminar_pregunta", "practice_questions", id); WT.toast("Pregunta eliminada", "success"); loadQuestions();
  }

  async function testAudio(id) {
    const { data } = await WT.supabase.from("practice_questions").select("*").eq("id", id).single();
    if (!data) return;
    if (data.question_audio_url) new Audio(data.question_audio_url).play();
    else if (window.speechSynthesis) { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(data.question_text); u.lang = "en-US"; window.speechSynthesis.speak(u); }
    else WT.toast("No hay audio ni speechSynthesis", "warning");
  }

  const PRACTICE_SETTING_DEFS = [
    { key: "active", label: "Estado de la práctica", description: "Activa o desactiva toda la sección de práctica consular.", type: "boolean" },
    { key: "enable_question_bank", label: "Banco completo de preguntas", description: "Permite mostrar la lista completa de preguntas a los estudiantes.", type: "boolean" },
    { key: "enable_quick_practice", label: "Práctica rápida", description: "Permite practicar una cantidad limitada de preguntas una por una.", type: "boolean" },
    { key: "quick_practice_count", label: "Cantidad de preguntas en práctica rápida", description: "Número de preguntas que saldrán en la práctica rápida.", type: "select", options: [3,5,10,15,20].map(n => ({ value: String(n), label: `${n} preguntas` })) },
    { key: "enable_audio", label: "Usar audios cargados", description: "Si una pregunta tiene audio en Storage, se reproducirá ese audio.", type: "boolean" },
    { key: "enable_speech_synthesis", label: "Pronunciación automática", description: "Si no hay audio cargado, el navegador leerá la pregunta en inglés.", type: "boolean" },
    { key: "show_translation", label: "Mostrar traducción", description: "Permite que el estudiante vea la traducción al español.", type: "boolean" },
    { key: "show_suggested_answer", label: "Mostrar respuesta sugerida", description: "Permite ver una respuesta sugerida para practicar.", type: "boolean" },
    { key: "show_category", label: "Mostrar categoría", description: "Muestra la categoría debajo de cada pregunta.", type: "boolean" },
    { key: "show_difficulty", label: "Mostrar dificultad", description: "Muestra si la pregunta es fácil, media o difícil.", type: "boolean" },
    { key: "voice_language", label: "Idioma de pronunciación", description: "Idioma usado por la voz automática del navegador.", type: "select", options: [{value:"en-US",label:"Inglés americano"},{value:"en-GB",label:"Inglés británico"},{value:"en",label:"Inglés general"}] },
    { key: "voice_rate", label: "Velocidad de pronunciación", description: "Velocidad normal recomendada para practicar entrevista.", type: "select", options: [{value:"0.75",label:"Lenta"},{value:"0.9",label:"Un poco lenta"},{value:"1",label:"Normal"},{value:"1.1",label:"Un poco rápida"}] }
  ];

  function settingInput(def, value) {
    if (def.type === "boolean") {
      const v = String(value ?? "true");
      return `<select class="input" name="${WT.escapeHTML(def.key)}"><option value="true" ${v === "true" ? "selected" : ""}>Activado</option><option value="false" ${v === "false" ? "selected" : ""}>Desactivado</option></select>`;
    }
    if (def.type === "select") return `<select class="input" name="${WT.escapeHTML(def.key)}">${def.options.map(o => `<option value="${WT.escapeHTML(o.value)}" ${String(o.value) === String(value ?? "") ? "selected" : ""}>${WT.escapeHTML(o.label)}</option>`).join("")}</select>`;
    return `<input class="input" name="${WT.escapeHTML(def.key)}" value="${WT.escapeHTML(value ?? "")}">`;
  }

  async function renderPracticeSettings() {
    header("Configuración de práctica", null);
    const { data, error } = await WT.supabase.from("practice_settings").select("*").order("key");
    if (error) return view().innerHTML = `<div class="empty-state">${WT.escapeHTML(error.message)}</div>`;
    const byKey = Object.fromEntries((data || []).map(row => [row.key, row]));
    const used = new Set(PRACTICE_SETTING_DEFS.map(d => d.key));
    const extras = (data || []).filter(row => !used.has(row.key));
    view().innerHTML = `<form class="admin-form practice-settings-form" id="practiceSettingsForm">
      <div class="admin-settings-grid">
        ${PRACTICE_SETTING_DEFS.map(def => {
          const row = byKey[def.key] || {};
          return `<label class="admin-setting-card">
            <span class="admin-setting-title">${WT.escapeHTML(def.label)}</span>
            <span class="admin-setting-help">${WT.escapeHTML(def.description || row.description || "")}</span>
            ${settingInput(def, row.value)}
          </label>`;
        }).join("")}
      </div>
      ${extras.length ? `<details class="admin-advanced"><summary>Configuraciones avanzadas</summary><div class="admin-settings-grid admin-settings-grid-small">${extras.map(row => `<label class="admin-setting-card"><span class="admin-setting-title">${WT.escapeHTML(row.key)}</span><span class="admin-setting-help">${WT.escapeHTML(row.description || "Configuración avanzada")}</span><input class="input" name="${WT.escapeHTML(row.key)}" value="${WT.escapeHTML(row.value || "")}"></label>`).join("")}</div></details>` : ""}
      <div class="sticky-save-bar"><button class="btn btn-primary">Guardar configuración</button></div>
    </form>`;
    WT.qs("#practiceSettingsForm").addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const rows = [...fd.entries()].map(([key, value]) => ({ key, value }));
      const { error } = await WT.supabase.from("practice_settings").upsert(rows, { onConflict: "key" });
      if (error) return WT.toast(error.message, "error");
      await WTAdminContent.log("actualizar_configuracion_practica", "practice_settings", null, rows);
      WT.toast("Configuración guardada", "success");
    });
  }

  async function renderCategories() {
    header("Categorías de preguntas", () => openCategoryForm());
    await loadCategories();
    view().innerHTML = `<div class="admin-card-list">${categories.map(c => `<article class="admin-record"><h3>${WT.escapeHTML(c.name)}</h3><p>${WT.escapeHTML(c.description || "")}</p><p><strong>Activo:</strong> ${c.active ? "Sí" : "No"} • <strong>Orden:</strong> ${c.sort_order}</p><div class="record-actions"><button class="btn btn-soft btn-small" data-edit-practice-cat="${c.id}">Editar</button><button class="btn btn-danger btn-small" data-delete-practice-cat="${c.id}">Eliminar</button></div></article>`).join("") || `<div class="empty-state">Sin categorías.</div>`}</div>`;
    WT.qsa("[data-edit-practice-cat]").forEach(b => b.addEventListener("click", () => openCategoryForm(categories.find(c => c.id === b.dataset.editPracticeCat))));
  }
  function openCategoryForm(item = {}) {
    const body = `<form class="admin-form" id="practiceCatForm">${field("Nombre", "name", item.name || "", "text", "required")}${textarea("Descripción", "description", item.description || "")}${field("Orden", "sort_order", item.sort_order || 0, "number")}${bool("Activa", "active", item.active ?? true)}<button class="btn btn-primary">Guardar categoría</button></form>`;
    const modal = WT.showModal({ title: item.id ? "Editar categoría" : "Crear categoría", body });
    WT.qs("#practiceCatForm", modal.element).addEventListener("submit", async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); const payload = Object.fromEntries(fd.entries()); payload.active = payload.active === "true"; payload.sort_order = Number(payload.sort_order || 0); const result = item.id ? await WT.supabase.from("practice_question_categories").update(payload).eq("id", item.id).select("id").single() : await WT.supabase.from("practice_question_categories").insert(payload).select("id").single(); if (result.error) return WT.toast(result.error.message, "error"); WT.toast("Categoría guardada", "success"); modal.close(); renderCategories(); });
  }
  async function deleteCategory(id) {
    const ok = await WT.confirmDialog({ title: "Eliminar categoría", message: "Se borrará la categoría si no tiene preguntas asociadas.", confirmText: "Eliminar", danger: true }); if (!ok) return;
    const { error } = await WT.supabase.from("practice_question_categories").delete().eq("id", id); if (error) return WT.toast(error.message, "error"); WT.toast("Categoría eliminada", "success"); renderCategories();
  }

  document.addEventListener("click", e => {
    const dq = e.target.closest("[data-delete-question]"); if (dq) deleteQuestion(dq.dataset.deleteQuestion);
    const ta = e.target.closest("[data-test-audio]"); if (ta) testAudio(ta.dataset.testAudio);
    const dc = e.target.closest("[data-delete-practice-cat]"); if (dc) deleteCategory(dc.dataset.deletePracticeCat);
  });

  window.WTAdminPractice = { renderQuestions, renderPracticeSettings, renderCategories };
})();
