(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v = "") => (window.WT?.escapeHTML ? WT.escapeHTML(String(v ?? "")) : String(v ?? ""));

  const state = {
    selected: new Set(),
    settings: {},
    customQuestionMap: new Map(),
    voicesReady: false
  };

  function addStyles() {
    if ($("#practiceCustomV3729")) return;
    const style = document.createElement("style");
    style.id = "practiceCustomV3729";
    style.textContent = `
      .practice-control-board{grid-template-columns:repeat(auto-fit,minmax(155px,1fr))!important;gap:12px!important;}
      .practice-action-btn{min-height:58px!important;border-radius:22px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;font-weight:900!important;letter-spacing:-.02em!important;}
      .practice-action-btn.practice-create-pro{background:linear-gradient(180deg,#2f63d6,#173a85)!important;color:#fff!important;border:1px solid rgba(23,58,133,.20)!important;box-shadow:0 12px 24px rgba(37,87,203,.18)!important;}
      .practice-action-btn.practice-soft-pro{background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(240,245,255,.86))!important;color:#16325f!important;border:1px solid rgba(148,163,184,.24)!important;box-shadow:0 10px 20px rgba(15,23,42,.05)!important;}
      .practice-count-pill{background:rgba(255,255,255,.96);color:#173a85;border:1px solid rgba(148,163,184,.20);border-radius:999px;min-width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;font-weight:950;box-shadow:inset 0 1px 0 rgba(255,255,255,.9);}
      .custom-question-check{position:absolute!important;left:18px!important;bottom:14px!important;display:inline-flex!important;align-items:center!important;gap:8px!important;padding:8px 12px!important;border-radius:999px!important;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(240,245,255,.9))!important;border:1px solid rgba(148,163,184,.24)!important;box-shadow:0 8px 18px rgba(15,23,42,.06)!important;font-weight:850!important;color:#16325f!important;z-index:3!important;}
      .custom-question-check input{position:absolute!important;opacity:0!important;pointer-events:none!important;}
      .custom-question-check .check-ui{width:22px;height:22px;border-radius:50%;border:2px solid #a9b6ca;display:inline-grid;place-items:center;background:rgba(255,255,255,.96);}
      .custom-question-check input:checked+.check-ui{background:#2f63d6;border-color:#2f63d6;color:#fff;}
      .custom-question-check input:checked+.check-ui:after{content:'✓';font-size:13px;font-weight:900;}
      .practice-question-row{position:relative!important;padding-bottom:64px!important;}
      .practice-question-row.is-selected-for-custom{outline:2px solid rgba(47,99,214,.18)!important;background:linear-gradient(180deg,#fff,rgba(239,245,255,.95))!important;}
      .practice-builder-box,.practice-preview-box{display:grid;gap:10px;padding:12px;border-radius:18px;background:rgba(245,248,255,.95);border:1px solid rgba(148,163,184,.20);}
      .manual-pill{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.96);border:1px solid rgba(148,163,184,.20);font-weight:800;}
      .share-switch-card{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;padding:14px!important;border-radius:18px!important;background:rgba(245,248,255,.96)!important;border:1px solid rgba(148,163,184,.18)!important;color:#142442!important;}
      .share-switch-card strong{display:block!important;font-size:.98rem!important;line-height:1.1!important;}
      .share-switch-card small{display:block!important;color:#6b7b93!important;margin-top:4px!important;line-height:1.25!important;}
      .share-switch-card input{position:absolute!important;opacity:0!important;}
      .share-switch-ui{width:54px!important;height:32px!important;border-radius:999px!important;background:#dbe3f2!important;position:relative!important;flex:0 0 54px!important;transition:.2s!important;}
      .share-switch-ui::after{content:'';position:absolute;width:26px;height:26px;border-radius:50%;background:#fff;left:3px;top:3px;box-shadow:0 4px 12px rgba(15,35,75,.18);transition:.2s;}
      .share-switch-card input:checked+.share-switch-ui{background:#2f63d6!important;}
      .share-switch-card input:checked+.share-switch-ui::after{transform:translateX(22px);}
      .practice-modal-tools{display:grid;gap:10px;margin-bottom:12px;}
      .practice-modal-filters{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
      .practice-card-list{display:grid!important;gap:12px!important;}
      .practice-list-card{display:grid!important;gap:12px!important;padding:14px!important;border-radius:22px!important;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(247,250,255,.92))!important;border:1px solid rgba(148,163,184,.20)!important;box-shadow:0 12px 24px rgba(15,23,42,.05)!important;}
      .practice-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
      .practice-card-title{display:grid;gap:4px;min-width:0;}
      .practice-card-title h3{margin:0!important;font-size:1.08rem!important;line-height:1.18!important;color:#10203d!important;}
      .practice-card-title p{margin:0!important;color:#62708a!important;font-size:.9rem!important;line-height:1.35!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
      .practice-pill-row{display:flex;flex-wrap:wrap;gap:7px;align-items:center;}
      .practice-mini-pill{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;background:rgba(232,240,255,.92);color:#173a85;font-weight:850;font-size:.78rem;border:1px solid rgba(148,163,184,.18);}
      .practice-preview-box{display:none;gap:7px;padding:11px;border-radius:16px;}
      .practice-list-card.is-open .practice-preview-box{display:grid;}
      .practice-preview-box span{font-weight:800;color:#24334d;font-size:.84rem;line-height:1.3;}
      .practice-card-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;}
      .practice-card-actions .btn{min-height:44px!important;border-radius:15px!important;}
      .practice-like-btn{border:1px solid rgba(148,163,184,.18);border-radius:999px;background:rgba(255,255,255,.96);color:#173a85;font-weight:950;padding:8px 11px;display:inline-flex;align-items:center;gap:5px;box-shadow:0 6px 14px rgba(15,23,42,.05);}
      .practice-like-btn.is-liked{background:#2f63d6;color:#fff;border-color:#2f63d6;}
      .practice-shared-author{display:flex;gap:10px;align-items:center;padding-bottom:8px;border-bottom:1px solid rgba(18,45,92,.08);}
      .practice-shared-author img{width:40px;height:40px;border-radius:50%;object-fit:cover;}
      .practice-shared-author div{display:grid;gap:2px;min-width:0;}
      .practice-shared-author strong{font-size:.95rem;color:#10203d;line-height:1.1;}
      .modal-card:has(.practice-card-list){max-width:min(540px,calc(100vw - 24px))!important;}
      .modal-card:has(.practice-card-list) .modal-body{padding:14px!important;}
      @media(max-width:520px){.practice-modal-filters{grid-template-columns:1fr}.practice-card-actions{grid-template-columns:1fr!important}}
      html.wt-forum-dark .practice-list-card,body.dark .practice-list-card{background:#0f1728!important;color:#eef5ff!important;border-color:rgba(201,218,255,.14)!important;}
      html.wt-forum-dark .practice-card-title h3,body.dark .practice-card-title h3,html.wt-forum-dark .practice-shared-author strong,body.dark .practice-shared-author strong{color:#fff!important;}
      html.wt-forum-dark .practice-card-title p,body.dark .practice-card-title p{color:#b8c7e3!important;}
      html.wt-forum-dark .practice-preview-box,body.dark .practice-preview-box,html.wt-forum-dark .practice-builder-box,body.dark .practice-builder-box{background:#121c2e!important;border-color:rgba(201,218,255,.14)!important;}
      html.wt-forum-dark .practice-preview-box span,body.dark .practice-preview-box span{color:#eef5ff!important;}
      html.wt-forum-dark .share-switch-card, body.dark .share-switch-card{background:#121c2e!important;color:#eef5ff!important;border-color:rgba(201,218,255,.16)!important;}
      html.wt-forum-dark .share-switch-card small, body.dark .share-switch-card small{color:#b8c7e3!important;}
    `;
    document.head.appendChild(style);
  }

  async function getUser() {
    const user = await WT.getCurrentUser();
    if (!user) WTAuth.showLoginModal();
    return user;
  }

  const ROLE_RANKS = { user: 0, moderator: 1, moderador: 1, admin: 2, superadmin: 3, owner: 4 };
  function roleRank(role = "user") { return ROLE_RANKS[String(role || "user").toLowerCase()] ?? 0; }
  function isOwnerProfile(profile = {}) { return String(profile?.role || "").toLowerCase() === "owner"; }
  function isStaffRole(role = "") { return roleRank(role) >= 1; }
  function canManageAuthor(authorRole = "user", myProfile = {}) { const targetRole = String(authorRole || "user").toLowerCase(); if (targetRole === "owner") return false; return roleRank(myProfile?.role || "user") > roleRank(targetRole); }
  function isWithinMinutes(dateValue, minutes = 5) { const time = new Date(dateValue || 0).getTime(); return !!time && Date.now() - time <= minutes * 60 * 1000; }
  function normalizePracticeText(text = "") { return String(text || "").toLowerCase().replace(/ñ/g, "__enie__").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/__enie__/g, "ñ").replace(/[@4]/g, "a").replace(/[!1|]/g, "i").replace(/[0]/g, "o").replace(/[3]/g, "e").replace(/[$5]/g, "s"); }
  function compactPracticeText(text = "") { return normalizePracticeText(text).replace(/[^a-z0-9ñ]/g, ""); }
  function detectPracticeViolation(...parts) {
    const raw = parts.map(x => String(x || "")).join(" ");
    if (window.WTForumModeration?.testText) return window.WTForumModeration.testText(raw);
    const normal = normalizePracticeText(raw); const compact = compactPracticeText(raw);
    const adult = /(porn|porno|pornografia|pornography|xxx|sexcam|camgirl|only\s*fans|onlyfans|xvideos|xnxx|redtube|pornhub|youporn|spankbang|xhamster|brazzers|escort|nudes|adult\s*video|video\s*sexual|contenido\s*adulto)/i;
    if (adult.test(normal) || adult.test(compact)) return { type: "adult_link", reason: "Intentó compartir una práctica con enlace o referencia de contenido adulto.", userMessage: "No se puede guardar o compartir una práctica con contenido no permitido." };
    const terms = ["mmg","mamaguevo","mama huevo","mama guevo","mamabicho","mama bicho","hijo de puta","hijoputa","hputa","hdp","comemierda","come mierda","singao","singar","cabron","cabrón","coño","pinga","ñema","nema","culo","toto","cuero","puta","puto","verga"];
    for (const term of terms) { const t = normalizePracticeText(term); const c = compactPracticeText(term); if ((t && normal.includes(t)) || (c && compact.includes(c))) return { type: "offensive_language", reason: "Intentó compartir una práctica con lenguaje ofensivo o una palabra bloqueada.", userMessage: "No se puede guardar o compartir una práctica con contenido no permitido." }; }
    return null;
  }
  async function registerPracticeWarning(userId, violation) {
    if (!userId || !WT.supabase?.rpc) return;
    try { await WT.supabase.rpc("register_forum_warning", { target_user_id: userId, target_type_text: "custom_practice", target_id_value: null, reason_text: violation?.reason || "Práctica bloqueada por contenido no permitido.", rule_code_text: violation?.type || "custom_practice_rule" }); } catch (_) {}
  }
  async function blockPracticeViolation(userId, violation) {
    const profile = await WT.getMyProfile?.().catch(() => null);
    if (!isOwnerProfile(profile)) await registerPracticeWarning(userId, violation);
    WT.toast(violation?.userMessage || "No se puede guardar o compartir una práctica con contenido no permitido.", "warning");
    return false;
  }

  async function loadSettings() {
    if (!WT.canConnect) return {};
    const { data } = await WT.supabase.from("practice_settings").select("key,value");
    state.settings = {};
    (data || []).forEach(row => state.settings[row.key] = WT.parseSettingValue(row.value));
    state.settings.voice_rate ??= 0.88;
    state.settings.voice_pitch ??= 1;
    state.settings.voice_language ||= "en-US";
    state.settings.transition_seconds ??= 2;
    state.settings.default_audience_type ||= "all";
    return state.settings;
  }

  function getVoices() {
    return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  function pickVoice(utterance) {
    if (window.WTPractice?.applyPracticeVoice) {
      window.WTPractice.applyPracticeVoice(utterance);
      return;
    }
    const voices = getVoices();
    let selected = null;
    const savedUri = String(state.settings.voice_uri || "").trim();
    const savedName = String(state.settings.voice_name || "").trim().toLowerCase();
    const savedLang = String(state.settings.voice_language || "en-US").trim().toLowerCase();
    if (savedUri) selected = voices.find(v => v.voiceURI === savedUri);
    if (!selected && savedName) selected = voices.find(v => String(v.name || "").toLowerCase() === savedName);
    if (!selected && savedName) selected = voices.find(v => String(v.name || "").toLowerCase().includes(savedName));
    if (!selected && savedLang) selected = voices.find(v => String(v.lang || "").toLowerCase() === savedLang);
    if (!selected && savedLang) selected = voices.find(v => String(v.lang || "").toLowerCase().startsWith(savedLang.split("-")[0]));
    if (!selected) selected = voices.find(v => /^en[-_]/i.test(v.lang || "")) || voices[0];
    if (selected) {
      utterance.voice = selected;
      utterance.lang = selected.lang || state.settings.voice_language || "en-US";
    } else {
      utterance.lang = state.settings.voice_language || "en-US";
    }
    utterance.rate = Number(state.settings.voice_rate || 0.88);
    utterance.pitch = Number(state.settings.voice_pitch || 1);
  }

  function patchSpeech() {
    if (!window.speechSynthesis || window.speechSynthesis.__wtVoicePatchedV3729) return;
    const originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = utterance => {
      if (utterance instanceof SpeechSynthesisUtterance) pickVoice(utterance);
      return originalSpeak(utterance);
    };
    window.speechSynthesis.__wtVoicePatchedV3729 = true;
  }

  function speakText(text) {
    const value = String(text || "").trim();
    if (!value || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    pickVoice(utterance);
    window.speechSynthesis.speak(utterance);
  }

  function updateSelectedCount() {
    const el = $("#customPracticeCount");
    if (el) el.textContent = String(state.selected.size);
  }

  function installToolbar() {
    const board = $(".practice-control-board");
    if (!board || $("#customPracticeBtn")) return;
    board.insertAdjacentHTML("beforeend", `
      <button class="practice-action-btn practice-create-pro" id="customPracticeBtn" type="button">⭐ Crear personalizada <span class="practice-count-pill" id="customPracticeCount">0</span></button>
      <button class="practice-action-btn practice-soft-pro" id="myPracticesBtn" type="button">📂 Mis prácticas</button>
      <button class="practice-action-btn practice-soft-pro" id="sharedPracticesBtn" type="button">🌐 Compartidas</button>
    `);
    $("#customPracticeBtn")?.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openBuilder(); });
    $("#myPracticesBtn")?.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openMine(); });
    $("#sharedPracticesBtn")?.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openShared(); });
  }

  function installAudienceFilter() {
    const row = $(".practice-filter-row");
    if (!row || $("#practiceAudience")) return;
    row.insertAdjacentHTML("beforeend", `<select class="input" id="practiceAudience"><option value="all">Todos</option><option value="first_year">Primer año</option><option value="repeaters">Repitentes</option></select>`);
    const select = $("#practiceAudience");
    select.value = state.settings.default_audience_type || "all";
    select.addEventListener("change", () => { filterAudience(); loadDynamicInfo(); });
  }

  function filterAudience() {
    const audience = $("#practiceAudience")?.value || "all";
    $$("#questionList [data-question-id], #questionList [data-custom-row]").forEach(card => {
      const type = card.dataset.audienceType || "all";
      card.hidden = !(audience === "all" || type === "all" || type === audience);
    });
  }

  function addQuestionSelectors() {
    $$("#questionList [data-question-id]").forEach(row => {
      if ($(".custom-question-check", row)) return;
      const id = row.dataset.questionId;
      row.insertAdjacentHTML("beforeend", `<label class="custom-question-check"><input type="checkbox" data-custom-question="${esc(id)}"><span class="check-ui"></span><span>Seleccionar</span></label>`);
      const label = $(".custom-question-check", row);
      const input = $("input", label);
      label.addEventListener("click", event => event.stopPropagation());
      input.addEventListener("change", () => {
        row.classList.toggle("is-selected-for-custom", input.checked);
        if (input.checked) state.selected.add(id); else state.selected.delete(id);
        updateSelectedCount();
      });
    });
    updateSelectedCount();
    filterAudience();
  }

  async function createManualQuestion(userId, text, audience) {
    const res = await WT.supabase.from("user_practice_questions").insert({ user_id: userId, question_text: text, audience_type: audience }).select("id").single();
    if (res.error) throw res.error;
    return res.data.id;
  }

  const SHARED_MANUAL_MARKER = "\n\n<!--WT_SHARED_MANUAL:";

  function encodeSharedManualQuestions(description = "", questions = []) {
    const clean = stripSharedManualQuestions(description);
    const list = (questions || []).map(x => String(x || "").trim()).filter(Boolean);
    if (!list.length) return clean;
    let encoded = "";
    try {
      encoded = btoa(unescape(encodeURIComponent(JSON.stringify(list))));
    } catch (_) {
      encoded = btoa(JSON.stringify(list));
    }
    return `${clean}${SHARED_MANUAL_MARKER}${encoded}-->`;
  }

  function getSharedManualQuestions(description = "") {
    const text = String(description || "");
    const match = text.match(/<!--WT_SHARED_MANUAL:([A-Za-z0-9+/=]+)-->/);
    if (!match) return [];
    try {
      return JSON.parse(decodeURIComponent(escape(atob(match[1])))) || [];
    } catch (_) {
      try { return JSON.parse(atob(match[1])) || []; } catch (_) { return []; }
    }
  }

  function stripSharedManualQuestions(description = "") {
    return String(description || "").replace(/\n?\n?<!--WT_SHARED_MANUAL:[A-Za-z0-9+/=]+-->/g, "").trim();
  }

  async function sharedPayloadFromPractice(practice, user, items = null) {
    const list = items || await itemsOf(practice.id).catch(() => []);
    const qids = list.map(x => x.question_id).filter(Boolean);
    const cids = list.map(x => x.custom_question_id).filter(Boolean);
    const custom = await customMap(cids);
    const manualTexts = list
      .filter(x => x.custom_question_id)
      .map(x => custom[x.custom_question_id]?.question_text)
      .filter(Boolean);
    return {
      custom_practice_id: practice.id,
      owner_id: user.id,
      title: practice.title,
      description: encodeSharedManualQuestions(practice.description || "", manualTexts),
      audience_type: practice.audience_type || "all",
      question_ids: qids,
      active: true
    };
  }

  async function openBuilder() {
    const user = await getUser();
    if (!user) return;
    const manual = [];
    const body = `<form class="admin-form" id="customPracticeBuilder">
      <label>Título<input class="input" name="title" required placeholder="Ej: Mi práctica para entrevista"></label>
      <label>Descripción<textarea class="input" name="description" placeholder="Descripción corta"></textarea></label>
      <label>Segmento<select class="input" name="audience_type"><option value="all">General</option><option value="first_year">Primer año</option><option value="repeaters">Repitentes</option></select></label>
      <div class="practice-builder-box"><strong>Crear mis propias preguntas</strong><small>Estas preguntas se guardan para tu autoaprendizaje. Si compartes la práctica, también se compartirán las preguntas creadas por ti.</small><textarea class="input" id="manualQuestionText" placeholder="Escribe una pregunta creada por ti"></textarea><button class="btn btn-soft" type="button" id="addManualQuestion">Añadir pregunta propia</button><div id="manualQuestionList"></div></div>
      <label class="share-switch-card"><span><strong>Compartir con la comunidad</strong><small>Otros estudiantes podrán añadir esta práctica. Las prácticas compartidas quedan bloqueadas y no se pueden recompartir.</small></span><input type="checkbox" name="is_shared"><span class="share-switch-ui" aria-hidden="true"></span></label>
      <button class="btn btn-primary">Guardar práctica</button>
    </form>`;
    const modal = WT.showModal({ title: "Crear práctica personalizada", body });
    const renderManual = () => $("#manualQuestionList", modal.element).innerHTML = manual.map((x, i) => `<div class="manual-pill"><span>${esc(x)}</span><button class="btn btn-danger btn-small" type="button" data-rm-manual="${i}">Quitar</button></div>`).join("");
    $("#addManualQuestion", modal.element).addEventListener("click", () => {
      const input = $("#manualQuestionText", modal.element);
      const text = input.value.trim();
      if (!text) return WT.toast("Escribe la pregunta primero.", "warning");
      const violation = detectPracticeViolation(text);
      if (violation) { blockPracticeViolation(user.id, violation); return; }
      manual.push(text);
      input.value = "";
      renderManual();
    });
    modal.element.addEventListener("click", event => {
      const btn = event.target.closest("[data-rm-manual]");
      if (!btn) return;
      manual.splice(Number(btn.dataset.rmManual), 1);
      renderManual();
    });
    $("#customPracticeBuilder", modal.element).addEventListener("submit", async event => {
      event.preventDefault();
      const chosen = Array.from(state.selected);
      if (!chosen.length && !manual.length) return WT.toast("Selecciona preguntas o crea preguntas propias.", "warning");
      const fd = new FormData(event.currentTarget);
      const audience = fd.get("audience_type") || "all";
      const payload = { user_id: user.id, title: String(fd.get("title") || "").trim(), description: String(fd.get("description") || "").trim(), audience_type: audience, is_shared: fd.get("is_shared") === "on" };
      const violation = detectPracticeViolation(payload.title, payload.description, manual.join(" "));
      if (violation) return blockPracticeViolation(user.id, violation);
      const created = await WT.supabase.from("user_custom_practices").insert(payload).select("id,title,description,audience_type,is_shared,source_shared_id").single();
      if (created.error) return WT.toast(created.error.message, "error");
      const rows = chosen.map((question_id, i) => ({ custom_practice_id: created.data.id, question_id, custom_question_id: null, sort_order: i }));
      for (let i = 0; i < manual.length; i++) rows.push({ custom_practice_id: created.data.id, question_id: null, custom_question_id: await createManualQuestion(user.id, manual[i], audience), sort_order: chosen.length + i });
      if (rows.length) {
        const res = await WT.supabase.from("user_custom_practice_items").insert(rows);
        if (res.error) return WT.toast(res.error.message, "error");
      }
      if (payload.is_shared) {
        const sharePayload = {
          custom_practice_id: created.data.id,
          owner_id: user.id,
          title: created.data.title,
          description: encodeSharedManualQuestions(created.data.description || "", manual),
          audience_type: created.data.audience_type,
          question_ids: chosen,
          active: true
        };
        const shared = await WT.supabase.from("practice_shared_configs").insert(sharePayload);
        if (shared.error) WT.toast("La práctica se guardó, pero no se pudo compartir. Intenta compartirla desde Mis prácticas.", "warning");
      }
      WT.toast(payload.is_shared ? "Práctica guardada y compartida" : "Práctica guardada", "success");
      modal.close();
      state.selected.clear();
      $$("[data-custom-question]").forEach(input => { input.checked = false; input.closest(".practice-question-row")?.classList.remove("is-selected-for-custom"); });
      updateSelectedCount();
    });
  }

  async function itemsOf(id) {
    const r = await WT.supabase.from("user_custom_practice_items").select("question_id,custom_question_id,sort_order").eq("custom_practice_id", id).order("sort_order");
    if (r.error) throw r.error;
    return r.data || [];
  }

  async function questionMap(ids) {
    const out = {};
    if (!ids.length) return out;
    const r = await WT.supabase.from("practice_questions").select("id,question_text,practice_question_categories(name)").in("id", ids);
    (r.data || []).forEach(x => out[x.id] = x);
    return out;
  }

  async function customMap(ids) {
    const out = {};
    if (!ids.length) return out;
    const r = await WT.supabase.from("user_practice_questions").select("id,question_text,audience_type").in("id", ids);
    (r.data || []).forEach(x => out[x.id] = x);
    return out;
  }

  async function hydratePractice(practice) {
    const items = await itemsOf(practice.id);
    const qids = items.map(x => x.question_id).filter(Boolean);
    const cids = items.map(x => x.custom_question_id).filter(Boolean);
    const [bank, custom] = await Promise.all([questionMap(qids), customMap(cids)]);
    return items.map(x => {
      const item = x.question_id ? bank[x.question_id] : custom[x.custom_question_id];
      return item ? { ...item, isCustom: Boolean(x.custom_question_id) } : null;
    }).filter(Boolean);
  }

  async function runPractice(practice, options = {}) {
    const rows = await hydratePractice(practice);
    if (!rows.length) return WT.toast("Esta práctica no tiene preguntas.", "warning");
    state.customQuestionMap.clear();
    const root = $("#questionList");
    if (!root) return;
    root.innerHTML = rows.map((q, i) => {
      if (q.isCustom) state.customQuestionMap.set(q.id, q);
      const attrs = q.isCustom ? `data-custom-row="${esc(q.id)}"` : `data-question-id="${esc(q.id)}"`;
      return `<article class="practice-question-row" ${attrs} data-audience-type="${esc(q.audience_type || 'all')}"><span class="practice-number">${i + 1}</span><span class="question-main-text"><h3>${esc(q.question_text)}</h3><p>${esc(q.isCustom ? 'Pregunta creada por ti' : (q.practice_question_categories?.name || 'Práctica personalizada'))}</p></span><button class="question-detail-btn" ${q.isCustom ? `data-custom-detail="${esc(q.id)}"` : `data-question-detail="${esc(q.id)}"`} type="button">i</button></article>`;
    }).join("");
    $("[data-practice-view='questions']")?.click();
    setTimeout(() => {
      filterAudience();
      const target = $("#practiceStatus") || $("#questionList");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    if (!options.silent) WT.toast("Práctica cargada", "success");
  }

  async function previewsFor(practices) {
    const previews = {}, counts = {};
    for (const p of practices) {
      const items = await itemsOf(p.id).catch(() => []);
      counts[p.id] = items.length;
      const qids = items.map(x => x.question_id).filter(Boolean);
      const cids = items.map(x => x.custom_question_id).filter(Boolean);
      const [bank, custom] = await Promise.all([questionMap(qids), customMap(cids)]);
      previews[p.id] = items.slice(0, 3).map(x => x.question_id ? bank[x.question_id]?.question_text : custom[x.custom_question_id]?.question_text).filter(Boolean);
    }
    return { previews, counts };
  }


  async function shareMinePractice(practice, user) {
    const items = await itemsOf(practice.id).catch(() => []);
    if (!items.length) {
      WT.toast("Esta práctica no tiene preguntas para compartir.", "warning");
      return false;
    }
    const payload = await sharedPayloadFromPractice(practice, user, items);
    const existing = await WT.supabase.from("practice_shared_configs").select("id").eq("custom_practice_id", practice.id).maybeSingle();
    let shared;
    if (existing.data?.id) {
      shared = await WT.supabase.from("practice_shared_configs").update(payload).eq("id", existing.data.id);
    } else {
      shared = await WT.supabase.from("practice_shared_configs").insert(payload);
    }
    if (shared.error) {
      WT.toast("No se pudo compartir la práctica. Intenta de nuevo.", "error");
      return false;
    }
    const updated = await WT.supabase.from("user_custom_practices").update({ is_shared: true }).eq("id", practice.id);
    if (updated.error) {
      WT.toast("Se compartió, pero no se pudo actualizar la etiqueta local.", "warning");
    } else {
      practice.is_shared = true;
    }
    WT.toast("Práctica compartida con la comunidad.", "success", "Compartida");
    return true;
  }

  async function handleSharedAddError(error, sharedPractice, user, modal, button) {
    const msg = String(error?.message || "");
    const duplicate = error?.code === "23505" || msg.toLowerCase().includes("duplicate key") || msg.includes("user_custom_practices_user_source");
    if (!duplicate) return WT.toast("No se pudo guardar la práctica compartida. Intenta de nuevo.", "error");
    const existing = await WT.supabase.from("user_custom_practices").select("id,title,description,audience_type,is_shared,source_shared_id").eq("user_id", user.id).eq("source_shared_id", sharedPractice.id).maybeSingle();
    if (existing.data?.id) {
      WT.toast("Ya tenías esta práctica guardada. La abriremos desde tus prácticas.", "info", "Práctica ya agregada");
      modal.close();
      await runPractice(existing.data, { silent: true });
      return;
    }
    if (button) { button.disabled = false; button.textContent = "Ya agregada"; }
    WT.toast("Ya tienes esta práctica guardada en Mis prácticas.", "info", "Práctica ya agregada");
  }

  async function deleteMinePractice(practice, user, modal) {
    if (!practice) return;
    const myProfile = await WT.getMyProfile?.().catch(() => null);
    const isOwner = String(practice.user_id || "") === String(user.id || "");
    const isPublished = Boolean(practice.is_shared);
    const canAuthorDelete = isOwner && (!isPublished || isOwnerProfile(myProfile) || isWithinMinutes(practice.created_at, 5));
    const canAdminDelete = isStaffRole(myProfile?.role) && !isOwner;
    if (!canAuthorDelete && !canAdminDelete) return WT.toast("Las prácticas publicadas solo pueden ser eliminadas por su autor durante los primeros 5 minutos. Después, solo administración autorizada puede retirarlas.", "error");
    const ok = await WT.confirmDialog({ title: "Eliminar práctica", message: isPublished ? "Se eliminará de tus prácticas y se retirará de las prácticas compartidas." : "Se eliminará de tus prácticas.", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    if (isPublished) {
      const shared = await WT.supabase.from("practice_shared_configs").select("id").eq("custom_practice_id", practice.id).maybeSingle();
      if (shared.error) return WT.toast(shared.error.message || "No se pudo localizar la práctica publicada.", "error");
      if (shared.data?.id) {
        const delShared = await WT.supabase.rpc("admin_delete_shared_practice", { shared_practice_id: shared.data.id });
        if (delShared.error) return WT.toast(delShared.error.message || "No se pudo retirar la práctica compartida.", "error");
      }
    }
    const d = await WT.supabase.from("user_custom_practices").delete().eq("id", practice.id);
    if (d.error) return WT.toast("No se pudo eliminar la práctica.", "error");
    WT.toast("Práctica eliminada", "success"); modal.close(); openMine();
  }
  async function deleteSharedPractice(sharedPractice, profiles, user, modal, onDone) {
    const myProfile = await WT.getMyProfile?.().catch(() => null);
    const author = profiles[sharedPractice.owner_id] || {};
    const isMine = String(sharedPractice.owner_id || "") === String(user.id || "");
    const canAuthorDelete = isMine && (isOwnerProfile(myProfile) || isWithinMinutes(sharedPractice.created_at, 5));
    const canAdminDelete = !isMine && canManageAuthor(author.role || "user", myProfile);
    if (!canAuthorDelete && !canAdminDelete) return WT.toast("No tienes permisos para eliminar esta práctica publicada.", "error");
    const ok = await WT.confirmDialog({ title: "Eliminar práctica publicada", message: "Se retirará de la sección de prácticas compartidas.", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    const del = await WT.supabase.rpc("admin_delete_shared_practice", { shared_practice_id: sharedPractice.id });
    if (del.error) return WT.toast(del.error.message || "No se pudo eliminar la práctica publicada.", "error");
    if (sharedPractice.custom_practice_id && isMine) await WT.supabase.from("user_custom_practices").update({ is_shared: false }).eq("id", sharedPractice.custom_practice_id);
    WT.toast("Práctica publicada eliminada", "success"); modal.close(); if (onDone) onDone();
  }

  async function openMine() {
    const user = await getUser();
    if (!user) return;
    const r = await WT.supabase.from("user_custom_practices").select("*").order("created_at", { ascending: false });
    if (r.error) return WT.toast("No se pudieron cargar tus prácticas.", "error");
    const practices = r.data || [];
    const { previews, counts } = await previewsFor(practices);
    const cards = practices.map(p => {
      const canShare = !p.source_shared_id && !p.is_shared;
      const sharedLabel = p.source_shared_id ? 'Añadida 🔒' : (p.is_shared ? 'Compartida' : 'Privada');
      const actions = `<button class="btn btn-primary btn-small" data-run-mine="${p.id}">Practicar</button>${canShare ? `<button class="btn btn-soft btn-small practice-share-action" data-share-mine="${p.id}">Compartir</button>` : ''}<button class="btn btn-danger btn-small" data-del-mine="${p.id}">Eliminar</button>`;
      return `<article class="practice-list-card" data-mine-card data-title="${esc((p.title + ' ' + (p.description || '')).toLowerCase())}" data-audience="${esc(p.audience_type || 'all')}" data-type="${p.source_shared_id ? 'added' : (p.is_shared ? 'shared' : 'private')}"><div class="practice-card-top"><div class="practice-card-title"><h3>${esc(p.title)}</h3><p>${esc(stripSharedManualQuestions(p.description || '') || 'Sin descripción')}</p></div><span class="practice-mini-pill">${counts[p.id] || 0} preguntas</span></div><div class="practice-pill-row"><span class="practice-mini-pill">${audienceLabel(p.audience_type)}</span><span class="practice-mini-pill">${sharedLabel}</span></div><button class="shared-toggle" type="button" data-toggle-preview>Ver preguntas</button><div class="practice-preview-box">${(previews[p.id] || []).length ? previews[p.id].map(x => `<span>• ${esc(x)}</span>`).join('') : '<span>Sin vista previa</span>'}</div><div class="practice-card-actions ${canShare ? 'has-three' : ''}">${actions}</div></article>`;
    }).join('') || '<div class="empty-state">No tienes prácticas guardadas.</div>';
    const body = `<div class="practice-modal-tools"><input class="input" id="mineSearch" placeholder="Buscar en mis prácticas..."><div class="practice-modal-filters"><select class="input" id="mineAudience"><option value="">Todos los segmentos</option><option value="first_year">Primer año</option><option value="repeaters">Repitentes</option><option value="all">General</option></select><select class="input" id="mineType"><option value="">Todas</option><option value="shared">Compartidas</option><option value="private">Privadas</option><option value="added">Añadidas</option></select></div></div><div class="practice-card-list">${cards}</div>`;
    const modal = WT.showModal({ title: "Mis prácticas", body });
    const apply = () => {
      const s = $("#mineSearch", modal.element).value.toLowerCase();
      const aud = $("#mineAudience", modal.element).value;
      const typ = $("#mineType", modal.element).value;
      $$("[data-mine-card]", modal.element).forEach(card => { card.hidden = (s && !card.dataset.title.includes(s)) || (aud && card.dataset.audience !== aud) || (typ && card.dataset.type !== typ); });
    };
    $("#mineSearch", modal.element)?.addEventListener("input", apply);
    $("#mineAudience", modal.element)?.addEventListener("change", apply);
    $("#mineType", modal.element)?.addEventListener("change", apply);
    modal.element.addEventListener("click", async event => {
      const toggle = event.target.closest("[data-toggle-preview]");
      if (toggle) { event.stopPropagation(); const card = toggle.closest("[data-mine-card]"); card.classList.toggle("is-open"); toggle.textContent = card.classList.contains("is-open") ? "Ocultar preguntas" : "Ver preguntas"; return; }
      const run = event.target.closest("[data-run-mine]");
      if (run) { event.stopPropagation(); const p = practices.find(x => x.id === run.dataset.runMine); modal.close(); await runPractice(p); return; }
      const share = event.target.closest("[data-share-mine]");
      if (share) { event.stopPropagation(); const p = practices.find(x => x.id === share.dataset.shareMine); share.disabled = true; share.textContent = "Compartiendo..."; const ok = await shareMinePractice(p, user); if (ok) { modal.close(); openMine(); } else { share.disabled = false; share.textContent = "Compartir"; } return; }
      const del = event.target.closest("[data-del-mine]");
      if (del) { event.stopPropagation(); const p = practices.find(x => x.id === del.dataset.delMine); await deleteMinePractice(p, user, modal); }
    });
  }

  function audienceLabel(value) {
    return value === "first_year" ? "Primer año" : value === "repeaters" ? "Repitentes" : "General";
  }

  function renderShared(items, profiles, questions, likeCounts, liked, user = {}, myProfile = {}) {
    return items.map(p => {
      const author = profiles[p.owner_id] || {};
      const manualPreview = getSharedManualQuestions(p.description || "");
      const preview = [
        ...(p.question_ids || []).map(id => questions[id]).filter(Boolean),
        ...manualPreview
      ].slice(0, 3);
      const visibleDescription = stripSharedManualQuestions(p.description || "") || "Sin descripción";
      const isMine = String(p.owner_id || '') === String(user.id || '');
      const canDelete = (isMine && (isOwnerProfile(myProfile) || isWithinMinutes(p.created_at, 5))) || (!isMine && canManageAuthor(author.role || 'user', myProfile));
      return `<article class="practice-list-card" data-shared-card data-audience="${esc(p.audience_type || 'all')}"><div class="practice-shared-author"><img src="${esc(WT.sanitizeImageUrl(author.photo_url, 'images/placeholder-avatar.png'))}" alt="Autor"><div><strong>${esc(author.full_name || 'Miembro')}</strong><span>${WT.renderRoleBadge(author.role || 'user')}</span></div></div><div class="practice-card-top"><div class="practice-card-title"><h3>${esc(p.title)}</h3><p>${esc(visibleDescription)}</p></div><button class="practice-like-btn ${liked.has(p.id) ? 'is-liked' : ''}" data-like-shared="${p.id}">♥ ${likeCounts[p.id] || 0}</button></div><div class="practice-pill-row"><span class="practice-mini-pill">${audienceLabel(p.audience_type)}</span><span class="practice-mini-pill">🔒 No recompartible</span></div><button class="shared-toggle" type="button" data-toggle-preview>Ver preguntas</button><div class="practice-preview-box">${preview.length ? preview.map(x => `<span>• ${esc(x)}</span>`).join('') : '<span>Vista previa no disponible</span>'}</div><div class="practice-card-actions ${canDelete ? 'has-three' : ''}"><button class="btn btn-primary btn-small" data-add-shared="${p.id}">Guardar y practicar</button>${canDelete ? `<button class="btn btn-danger btn-small" data-delete-shared="${p.id}">Eliminar</button>` : ''}</div></article>`;
    }).join("") || '<div class="empty-state">No hay prácticas compartidas.</div>';
  }

  async function openShared() {
    const user = await getUser();
    if (!user) return;
    const myProfile = await WT.getMyProfile?.().catch(() => null);
    const r = await WT.supabase.from("practice_shared_configs").select("*").eq("active", true).order("created_at", { ascending: false }).limit(120);
    if (r.error) return WT.toast(r.error.message, "error");
    const shared = r.data || [];
    const qids = [...new Set(shared.flatMap(x => x.question_ids || []))];
    const owners = [...new Set(shared.map(x => x.owner_id).filter(Boolean))];
    const sids = shared.map(x => x.id);
    const questions = {};
    const profiles = {};
    if (qids.length) { const qr = await WT.supabase.from("practice_questions").select("id,question_text").in("id", qids); (qr.data || []).forEach(x => questions[x.id] = x.question_text); }
    if (owners.length) { try { const pr = await WT.supabase.from("public_profiles").select("id,full_name,photo_url,role").in("id", owners); (pr.data || []).forEach(x => profiles[x.id] = x); } catch (_) {} }
    const likeCounts = {}, liked = new Set();
    if (sids.length) { try { const lr = await WT.supabase.from("practice_shared_likes").select("shared_practice_id,user_id").in("shared_practice_id", sids); (lr.data || []).forEach(x => { likeCounts[x.shared_practice_id] = (likeCounts[x.shared_practice_id] || 0) + 1; if (x.user_id === user.id) liked.add(x.shared_practice_id); }); } catch (_) {} }
    const sortPopular = arr => arr.sort((a, b) => (likeCounts[b.id] || 0) - (likeCounts[a.id] || 0) || new Date(b.created_at) - new Date(a.created_at));
    sortPopular(shared);
    const body = `<div class="practice-modal-tools"><input class="input" id="sharedSearch" placeholder="Buscar práctica compartida..."><div class="practice-modal-filters"><select class="input" id="sharedAudience"><option value="">Todos los segmentos</option><option value="first_year">Primer año</option><option value="repeaters">Repitentes</option><option value="all">General</option></select><select class="input" id="sharedOrder"><option value="popular">Más populares</option><option value="recent">Más recientes</option></select></div></div><div class="practice-card-list" id="sharedList">${renderShared(shared, profiles, questions, likeCounts, liked, user, myProfile)}</div>`;
    const modal = WT.showModal({ title: "Prácticas compartidas", body });
    const redraw = () => {
      const s = $("#sharedSearch", modal.element).value.toLowerCase();
      const aud = $("#sharedAudience", modal.element).value;
      const order = $("#sharedOrder", modal.element).value;
      let arr = [...shared].filter(p => (!s || (`${p.title} ${stripSharedManualQuestions(p.description || '')}`).toLowerCase().includes(s)) && (!aud || (p.audience_type || "all") === aud));
      if (order === "popular") sortPopular(arr); else arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      $("#sharedList", modal.element).innerHTML = renderShared(arr, profiles, questions, likeCounts, liked, user, myProfile);
    };
    $("#sharedSearch", modal.element)?.addEventListener("input", redraw);
    $("#sharedAudience", modal.element)?.addEventListener("change", redraw);
    $("#sharedOrder", modal.element)?.addEventListener("change", redraw);
    modal.element.addEventListener("click", async event => {
      const toggle = event.target.closest("[data-toggle-preview]");
      if (toggle) { event.stopPropagation(); const card = toggle.closest("[data-shared-card]"); card.classList.toggle("is-open"); toggle.textContent = card.classList.contains("is-open") ? "Ocultar preguntas" : "Ver preguntas"; return; }
      const like = event.target.closest("[data-like-shared]");
      if (like) {
        event.preventDefault(); event.stopPropagation();
        const id = like.dataset.likeShared;
        if (liked.has(id)) { await WT.supabase.from("practice_shared_likes").delete().eq("shared_practice_id", id).eq("user_id", user.id); liked.delete(id); likeCounts[id] = Math.max(0, (likeCounts[id] || 1) - 1); }
        else { const ins = await WT.supabase.from("practice_shared_likes").insert({ shared_practice_id: id, user_id: user.id }); if (ins.error) return WT.toast(ins.error.message, "error"); liked.add(id); likeCounts[id] = (likeCounts[id] || 0) + 1; }
        redraw(); return;
      }
      const delShared = event.target.closest("[data-delete-shared]");
      if (delShared) { event.preventDefault(); event.stopPropagation(); const p = shared.find(x => x.id === delShared.dataset.deleteShared); if (p) await deleteSharedPractice(p, profiles, user, modal, openShared); return; }
      const add = event.target.closest("[data-add-shared]");
      if (add) {
        event.preventDefault(); event.stopPropagation();
        const p = shared.find(x => x.id === add.dataset.addShared);
        if (!p) return;
        add.disabled = true;
        add.textContent = "Añadiendo...";
        const created = await WT.supabase.from("user_custom_practices").insert({ user_id: user.id, title: p.title, description: stripSharedManualQuestions(p.description || ""), audience_type: p.audience_type || "all", is_shared: false, source_shared_id: p.id }).select("id,title,description,audience_type,is_shared,source_shared_id").single();
        if (created.error) { add.disabled = false; add.textContent = "Guardar y practicar"; return handleSharedAddError(created.error, p, user, modal, add); }
        const manualShared = getSharedManualQuestions(p.description || "");
        const rows = (p.question_ids || []).map((question_id, i) => ({ custom_practice_id: created.data.id, question_id, custom_question_id: null, sort_order: i }));
        for (let i = 0; i < manualShared.length; i++) {
          const customId = await createManualQuestion(user.id, manualShared[i], p.audience_type || "all");
          rows.push({ custom_practice_id: created.data.id, question_id: null, custom_question_id: customId, sort_order: rows.length });
        }
        if (rows.length) { const inserted = await WT.supabase.from("user_custom_practice_items").insert(rows); if (inserted.error) { add.disabled = false; add.textContent = "Guardar y practicar"; return WT.toast("No se pudieron agregar las preguntas. Intenta de nuevo.", "error"); } }
        modal.close();
        await runPractice(created.data);
      }
    });
  }

  async function loadDynamicInfo() {
    if (!WT.canConnect) return;
    try {
      const audience = $("#practiceAudience")?.value || state.settings.default_audience_type || "all";
      const [infoRes, glossaryRes] = await Promise.all([
        WT.supabase.from("practice_info_sections").select("*").eq("active", true).in("audience_type", ["all", audience]).order("sort_order"),
        WT.supabase.from("practice_glossary_terms").select("*").eq("active", true).in("audience_type", ["all", audience]).order("sort_order")
      ]);
      const wil = $("#wilberforceList");
      if (wil && infoRes.data?.length) wil.innerHTML = infoRes.data.filter(x => x.section_type === "wilberforce").map(x => `<article class="practice-info-card"><h3>${esc(x.icon || '⚖️')} ${esc(x.title)}</h3><p>${esc(x.body)}</p></article>`).join("") || wil.innerHTML;
      const glo = $("#glossaryList");
      if (glo && glossaryRes.data?.length) glo.innerHTML = glossaryRes.data.map(x => `<article class="glossary-card"><h3>${esc(x.term)}</h3><p>${esc(x.definition)}</p>${x.example ? `<small>${esc(x.example)}</small>` : ""}</article>`).join("");
    } catch (_) {}
  }

  function bindCustomQuestionVoice() {
    document.addEventListener("click", event => {
      const detail = event.target.closest("[data-custom-detail]");
      if (detail) {
        event.preventDefault(); event.stopImmediatePropagation();
        const q = state.customQuestionMap.get(detail.dataset.customDetail);
        if (q) WT.showModal({ title: "Pregunta personalizada", body: `<div class="answer-box"><strong>Pregunta:</strong><br>${esc(q.question_text)}</div>`, actions: [{ label: "Escuchar", className: "btn-primary", onClick: () => speakText(q.question_text) }, { label: "Cerrar", className: "btn-soft" }] });
        return;
      }
      const row = event.target.closest("[data-custom-row]");
      if (row && WT.page === "practice") {
        if (event.target.closest("button,input,label,.custom-question-check")) return;
        event.preventDefault(); event.stopImmediatePropagation();
        const q = state.customQuestionMap.get(row.dataset.customRow);
        speakText(q?.question_text || row.querySelector("h3")?.textContent || "");
      }
    }, true);
  }

  function observeQuestions() {
    const root = $("#questionList");
    if (!root) return;
    new MutationObserver(() => setTimeout(addQuestionSelectors, 30)).observe(root, { childList: true, subtree: true });
    addQuestionSelectors();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (WT.page !== "practice") return;
    addStyles();
    await loadSettings();
    patchSpeech();
    installToolbar();
    installAudienceFilter();
    observeQuestions();
    bindCustomQuestionVoice();
    setTimeout(loadDynamicInfo, 900);
  });

  window.WTPracticeCustom = { openMine, openShared, loadSettings, pickVoice, getVoices, runPractice };
})();
