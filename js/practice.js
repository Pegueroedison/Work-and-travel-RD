(() => {
  const state = {
    settings: {},
    categories: [],
    questions: [],
    questionMap: new Map(),
    bankPage: 0,
    pageSize: 20,
    selectedId: null,
    selectedIndex: 0,
    activeAudio: null,
    activeUtterance: null,
    responseTimer: null,
    autoAdvanceTimer: null,
    activeView: "questions",
    practiceMode: "manual",
    practiceQueue: [],
    queueIndex: 0,
    isRunning: false
  };

  const glossary = [
    { term: "Sponsor", text: "Organización autorizada que apoya y supervisa tu programa J1." },
    { term: "DS-2019", text: "Documento principal del programa. Debes conocer tu fecha de inicio, fecha final y empleador." },
    { term: "SEVIS", text: "Sistema donde se registra tu participación en el programa de intercambio." },
    { term: "Host Employer", text: "Empresa donde trabajarás durante el programa." },
    { term: "Housing", text: "Alojamiento o vivienda durante tu estadía en Estados Unidos." },
    { term: "Social Security", text: "Número usado para trabajar legalmente y recibir pagos en Estados Unidos." },
    { term: "Port of Entry", text: "Primer aeropuerto o punto de entrada donde pasas migración." },
    { term: "Return date", text: "Fecha en la que debes regresar a tu país según las reglas del programa." }
  ];


  const FALLBACK_CATEGORIES = [{"id": "cat-general-j1", "name": "Preguntas J1", "description": "Preguntas frecuentes de entrevista consular J1.", "active": true, "sort_order": 1}];
  const FALLBACK_QUESTIONS = [{"id": "fallback-q01", "question_text": "Is this your first time?", "difficulty": "Media", "active": true, "sort_order": 1, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "General"}}, {"id": "fallback-q02", "question_text": "Where are you going?", "difficulty": "Media", "active": true, "sort_order": 2, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "General"}}, {"id": "fallback-q03", "question_text": "What are you going to do there / What will you work on?", "difficulty": "Fácil", "active": true, "sort_order": 3, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Trabajo en USA"}}, {"id": "fallback-q04", "question_text": "When did you start college?", "difficulty": "Media", "active": true, "sort_order": 4, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q05", "question_text": "When are you going to finish college?", "difficulty": "Media", "active": true, "sort_order": 5, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q06", "question_text": "What are you studying / What do you study?", "difficulty": "Fácil", "active": true, "sort_order": 6, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q07", "question_text": "Where do you study?", "difficulty": "Media", "active": true, "sort_order": 7, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q08", "question_text": "How many subjects/classes/courses did you take last semester?", "difficulty": "Media", "active": true, "sort_order": 8, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q09", "question_text": "How many subjects are you taking?", "difficulty": "Fácil", "active": true, "sort_order": 9, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q10", "question_text": "Mention the subjects from the last semester and this semester.", "difficulty": "Media", "active": true, "sort_order": 10, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q11", "question_text": "Can you talk about your last homework?", "difficulty": "Media", "active": true, "sort_order": 11, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Trabajo en USA"}}, {"id": "fallback-q12", "question_text": "What is the most difficult and easy subject that you are taking and why?", "difficulty": "Fácil", "active": true, "sort_order": 12, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q13", "question_text": "What are you going to do when you finish your career?", "difficulty": "Media", "active": true, "sort_order": 13, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q14", "question_text": "Does your college have summer break?", "difficulty": "Media", "active": true, "sort_order": 14, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q15", "question_text": "What motivated you to study this career?", "difficulty": "Fácil", "active": true, "sort_order": 15, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q16", "question_text": "Do you know your rights/Wilberforce?", "difficulty": "Media", "active": true, "sort_order": 16, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Wilberforce"}}, {"id": "fallback-q17", "question_text": "How many semesters do you have approved?", "difficulty": "Media", "active": true, "sort_order": 17, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q18", "question_text": "What is your favorite movie/picture and why?", "difficulty": "Fácil", "active": true, "sort_order": 18, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "General"}}, {"id": "fallback-q19", "question_text": "Why are you applying for this program?", "difficulty": "Media", "active": true, "sort_order": 19, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Sponsor y programa"}}, {"id": "fallback-q20", "question_text": "Who is paying for your program?", "difficulty": "Media", "active": true, "sort_order": 20, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Sponsor y programa"}}, {"id": "fallback-q21", "question_text": "What is your GPA?", "difficulty": "Fácil", "active": true, "sort_order": 21, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q22", "question_text": "When does your next semester start?", "difficulty": "Media", "active": true, "sort_order": 22, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q23", "question_text": "When will you return?", "difficulty": "Media", "active": true, "sort_order": 23, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Regreso a RD"}}, {"id": "fallback-q24", "question_text": "For how long will you stay in the U.S.?", "difficulty": "Fácil", "active": true, "sort_order": 24, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "General"}}, {"id": "fallback-q25", "question_text": "What is your favorite subject in this semester and why?", "difficulty": "Media", "active": true, "sort_order": 25, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q26", "question_text": "How many subjects will you take when you return?", "difficulty": "Media", "active": true, "sort_order": 26, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q27", "question_text": "How much will you be paid in your position?", "difficulty": "Fácil", "active": true, "sort_order": 27, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Trabajo en USA"}}, {"id": "fallback-q28", "question_text": "How many hours a week are you going to work?", "difficulty": "Media", "active": true, "sort_order": 28, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Trabajo en USA"}}, {"id": "fallback-q29", "question_text": "Do you have any relatives in the U.S.? Who?", "difficulty": "Media", "active": true, "sort_order": 29, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "General"}}, {"id": "fallback-q30", "question_text": "Do your parents have visa?", "difficulty": "Fácil", "active": true, "sort_order": 30, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "General"}}, {"id": "fallback-q31", "question_text": "How many credits do you have this semester?", "difficulty": "Media", "active": true, "sort_order": 31, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q32", "question_text": "How many credits did you have last semester?", "difficulty": "Media", "active": true, "sort_order": 32, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q33", "question_text": "How many credits did you approve last semester?", "difficulty": "Fácil", "active": true, "sort_order": 33, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q34", "question_text": "How many days per week do you go to college? Which days?", "difficulty": "Media", "active": true, "sort_order": 34, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q35", "question_text": "How many subjects do you have left in your career?", "difficulty": "Media", "active": true, "sort_order": 35, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q36", "question_text": "How many credits do you have left in your career?", "difficulty": "Fácil", "active": true, "sort_order": 36, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q37", "question_text": "How many semesters do you have left in your career?", "difficulty": "Media", "active": true, "sort_order": 37, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q38", "question_text": "What are you going to do when you finish your program?", "difficulty": "Media", "active": true, "sort_order": 38, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Sponsor y programa"}}, {"id": "fallback-q39", "question_text": "When are you going to return from the U.S.?", "difficulty": "Fácil", "active": true, "sort_order": 39, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Regreso a RD"}}, {"id": "fallback-q40", "question_text": "Why are you applying for this program?", "difficulty": "Media", "active": true, "sort_order": 40, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Sponsor y programa"}}, {"id": "fallback-q41", "question_text": "Who is your manager?", "difficulty": "Media", "active": true, "sort_order": 41, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Trabajo en USA"}}, {"id": "fallback-q42", "question_text": "Who is your host manager?", "difficulty": "Fácil", "active": true, "sort_order": 42, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Trabajo en USA"}}, {"id": "fallback-q43", "question_text": "How much does your housing cost?", "difficulty": "Media", "active": true, "sort_order": 43, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "General"}}, {"id": "fallback-q44", "question_text": "What is the address of your housing?", "difficulty": "Media", "active": true, "sort_order": 44, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "General"}}, {"id": "fallback-q45", "question_text": "What is the Zip code of your housing?", "difficulty": "Fácil", "active": true, "sort_order": 45, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "General"}}, {"id": "fallback-q46", "question_text": "Mention a book from your career.", "difficulty": "Media", "active": true, "sort_order": 46, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q47", "question_text": "How many credits does your career have?", "difficulty": "Media", "active": true, "sort_order": 47, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Universidad"}}, {"id": "fallback-q48", "question_text": "Who is your sponsor?", "difficulty": "Fácil", "active": true, "sort_order": 48, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Sponsor y programa"}}, {"id": "fallback-q49", "question_text": "Who is your employer?", "difficulty": "Media", "active": true, "sort_order": 49, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "Trabajo en USA"}}, {"id": "fallback-q50", "question_text": "What do your parents do for a living?", "difficulty": "Media", "active": true, "sort_order": 50, "suggested_answer": "Responde de forma breve, clara y consistente con tus documentos.", "spanish_translation": "Practica esta pregunta en inglés antes de tu entrevista.", "practice_question_categories": {"name": "General"}}];

  function normalRate() {
    return Number(state.settings.voice_rate || state.settings.voice_rate_normal || 0.88);
  }

  function responseSeconds() {
    return Number(state.settings.response_time_seconds || 18);
  }

  function getAvailableVoices() {
    return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  function choosePracticeVoice() {
    const voices = getAvailableVoices();
    if (!voices.length) return null;
    const savedUri = String(state.settings.voice_uri || "").trim();
    const savedName = String(state.settings.voice_name || "").trim().toLowerCase();
    const savedLang = String(state.settings.voice_language || "en-US").trim().toLowerCase();
    let selected = null;

    if (savedUri) selected = voices.find(v => v.voiceURI === savedUri);
    if (!selected && savedName) selected = voices.find(v => String(v.name || "").toLowerCase() === savedName);
    if (!selected && savedName) selected = voices.find(v => String(v.name || "").toLowerCase().includes(savedName));
    if (!selected && savedLang) selected = voices.find(v => String(v.lang || "").toLowerCase() === savedLang);
    if (!selected && savedLang) selected = voices.find(v => String(v.lang || "").toLowerCase().startsWith(savedLang.split("-")[0]));
    if (!selected) selected = voices.find(v => /^en[-_]/i.test(v.lang || "")) || voices[0];
    return selected || null;
  }

  function applyPracticeVoice(utterance) {
    const selected = choosePracticeVoice();
    if (selected) {
      utterance.voice = selected;
      utterance.lang = selected.lang || state.settings.voice_language || "en-US";
    } else {
      utterance.lang = state.settings.voice_language || "en-US";
    }
    utterance.rate = Number(state.settings.voice_rate || 0.88);
    utterance.pitch = Number(state.settings.voice_pitch || 1);
    utterance.volume = 1;
    return utterance;
  }

  function setStatus(message) {
    const status = WT.qs("#practiceStatus");
    if (status) status.textContent = message;
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function loadSettings() {
    if (!WT.canConnect) {
      state.settings = { enable_audio: true, enable_speech_synthesis: true, voice_language: "en-US", voice_rate: 0.88, voice_pitch: 1, voice_uri: "", voice_name: "", response_time_seconds: 18 };
      return state.settings;
    }
    const { data } = await WT.supabase.from("practice_settings").select("key,value");
    state.settings = {};
    data?.forEach(row => state.settings[row.key] = WT.parseSettingValue(row.value));
    state.settings.enable_audio ??= true;
    state.settings.enable_speech_synthesis ??= true;
    state.settings.voice_language ||= "en-US";
    state.settings.voice_rate ??= 0.88;
    state.settings.voice_pitch ??= 1;
    state.settings.voice_uri ||= "";
    state.settings.voice_name ||= "";
    state.settings.response_time_seconds ??= 18;
    return state.settings;
  }

  async function loadCategories() {
    if (!WT.canConnect) {
      state.categories = FALLBACK_CATEGORIES;
      const select = WT.qs("#questionCategory");
      if (select) select.innerHTML = `<option value="">Todas las categorías</option>` + state.categories.map(c => `<option value="${c.id}">${WT.escapeHTML(c.name)}</option>`).join("");
      renderWilberforce();
      renderGlossary();
      return state.categories;
    }
    const { data } = await WT.supabase
      .from("practice_question_categories")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    state.categories = data || [];
    const select = WT.qs("#questionCategory");
    if (select) {
      select.innerHTML = `<option value="">Todas las categorías</option>` + state.categories.map(c => `<option value="${c.id}">${WT.escapeHTML(c.name)}</option>`).join("");
    }
    renderWilberforce();
    renderGlossary();
    return state.categories;
  }

  function rememberQuestions(items = []) {
    items.forEach(q => state.questionMap.set(q.id, q));
  }

  async function loadQuestions(reset = false) {
    if (!WT.canConnect) {
      if (reset) { state.bankPage = 0; state.questions = []; state.questionMap.clear(); }
      const search = WT.qs("#questionSearch")?.value?.trim().toLowerCase() || "";
      const diff = WT.qs("#questionDifficulty")?.value || "";
      let rows = FALLBACK_QUESTIONS.filter(q => (!search || q.question_text.toLowerCase().includes(search)) && (!diff || q.difficulty === diff));
      rows = rows.slice(state.bankPage * state.pageSize, state.bankPage * state.pageSize + state.pageSize);
      rememberQuestions(rows);
      state.questions = reset ? rows : [...state.questions, ...rows];
      renderQuestionList();
      state.bankPage += 1;
      const loadMore = WT.qs("#loadMoreQuestions");
      if (loadMore) loadMore.hidden = rows.length < state.pageSize || state.activeView !== "questions";
      if (!state.selectedId && state.questions.length) { state.selectedId = state.questions[0].id; state.selectedIndex = 0; renderQuestionList(); }
      return;
    }
    if (reset) {
      state.bankPage = 0;
      state.questions = [];
      state.questionMap.clear();
    }

    let query = WT.supabase
      .from("practice_questions")
      .select("*, practice_question_categories(name)")
      .eq("active", true);

    const search = WT.qs("#questionSearch")?.value?.trim() || "";
    const cat = WT.qs("#questionCategory")?.value || "";
    const diff = WT.qs("#questionDifficulty")?.value || "";

    if (search) query = query.or(`question_text.ilike.%${search}%,suggested_answer.ilike.%${search}%,spanish_translation.ilike.%${search}%`);
    if (cat) query = query.eq("category_id", cat);
    if (diff) query = query.eq("difficulty", diff);

    query = query
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .range(state.bankPage * state.pageSize, state.bankPage * state.pageSize + state.pageSize - 1);

    const { data, error } = await query;
    if (error) return WT.toast(error.message, "error");

    const rows = data || [];
    rememberQuestions(rows);
    state.questions = reset ? rows : [...state.questions, ...rows];
    renderQuestionList();
    state.bankPage += 1;

    const loadMore = WT.qs("#loadMoreQuestions");
    if (loadMore) loadMore.hidden = rows.length < state.pageSize || state.activeView !== "questions";

    if (!state.selectedId && state.questions.length) {
      state.selectedId = state.questions[0].id;
      state.selectedIndex = 0;
      renderQuestionList();
    }
  }

  function questionMeta(q) {
    const parts = [];
    if (q.practice_question_categories?.name) parts.push(q.practice_question_categories.name);
    if (q.difficulty) parts.push(q.difficulty);
    return parts.join(" · ");
  }

  function renderQuestionList() {
    const root = WT.qs("#questionList");
    if (!root) return;
    if (!state.questions.length) {
      root.innerHTML = `<div class="empty-state">No hay preguntas disponibles con esos filtros.</div>`;
      return;
    }

    root.innerHTML = state.questions.map((q, index) => `
      <article class="practice-question-row ${q.id === state.selectedId ? "is-active" : ""}" data-question-id="${q.id}">
        <span class="practice-number">${index + 1}</span>
        <span class="question-main-text">
          <h3>${WT.escapeHTML(q.question_text)}</h3>
          <p>${WT.escapeHTML(questionMeta(q) || "Pregunta de práctica")}</p>
        </span>
        <button class="question-detail-btn" data-question-detail="${q.id}" type="button" aria-label="Ver respuesta">i</button>
      </article>
    `).join("");
  }

  function renderWilberforce() {
    const root = WT.qs("#wilberforceList");
    if (!root) return;
    const wilberforceCategories = state.categories.filter(c => /wilberforce/i.test(`${c.name} ${c.description || ""}`));
    if (wilberforceCategories.length) {
      root.innerHTML = wilberforceCategories.map(c => `
        <article class="practice-info-card">
          <h3>${WT.escapeHTML(c.name)}</h3>
          <p>${WT.escapeHTML(c.description || "Categoría disponible para practicar preguntas relacionadas.")}</p>
        </article>
      `).join("");
      return;
    }

    root.innerHTML = `
      <article class="practice-info-card">
        <h3>Wilberforce</h3>
        <p>Usa esta sección para colocar contenido especial desde el panel admin. Puedes crear una categoría llamada Wilberforce y agregar preguntas relacionadas.</p>
      </article>
      <article class="practice-info-card">
        <h3>Consejo rápido</h3>
        <p>Responde claro, tranquilo y con información consistente con tu DS-2019, tu sponsor, tu empleador y tu fecha de regreso.</p>
      </article>
    `;
  }

  function renderGlossary() {
    const root = WT.qs("#glossaryList");
    if (!root) return;
    root.innerHTML = glossary.map(item => `
      <article class="glossary-card">
        <h3>${WT.escapeHTML(item.term)}</h3>
        <p>${WT.escapeHTML(item.text)}</p>
      </article>
    `).join("");
  }

  async function getQuestion(id) {
    let q = state.questionMap.get(id);
    if (q) return q;
    if (!WT.canConnect) {
      q = FALLBACK_QUESTIONS.find(x => x.id === id);
      if (q) state.questionMap.set(q.id, q);
      return q;
    }
    const { data } = await WT.supabase
      .from("practice_questions")
      .select("*, practice_question_categories(name)")
      .eq("id", id)
      .single();
    if (data) state.questionMap.set(data.id, data);
    return data;
  }

  function clearAutoAdvance() {
    if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
    state.autoAdvanceTimer = null;
  }

  function stopResponseTimer(message = "Audio detenido.") {
    if (state.responseTimer) clearInterval(state.responseTimer);
    state.responseTimer = null;
    const timer = WT.qs("#sessionTimer");
    if (timer) timer.textContent = message;
  }

  function startResponseTimer(onFinished) {
    let left = responseSeconds();
    stopResponseTimer();
    clearAutoAdvance();
    setStatus(`Responde ahora. ${left}s para continuar.`);
    state.responseTimer = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setStatus(`Responde ahora. ${left}s para continuar.`);
      } else {
        stopResponseTimer("Puedes continuar");
        setStatus("Tiempo completado. Pasando a la siguiente pregunta...");
        if (typeof onFinished === "function") {
          state.autoAdvanceTimer = setTimeout(onFinished, 650);
        }
      }
    }, 1000);
  }

  function stopAudio(message = "Audio detenido.") {
    if (state.activeAudio) {
      state.activeAudio.pause();
      state.activeAudio.currentTime = 0;
      state.activeAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    state.activeUtterance = null;
    stopResponseTimer(message);
    clearAutoAdvance();
    setStatus(message);
  }

  function selectQuestion(q, index = 0, scroll = false) {
    if (!q) return;
    state.selectedId = q.id;
    state.selectedIndex = Math.max(0, index);
    renderQuestionList();
    if (scroll) {
      const activeRow = WT.qs(`[data-question-id="${CSS.escape(q.id)}"]`);
      activeRow?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function playQuestion(id = state.selectedId, options = {}) {
    const q = await getQuestion(id);
    if (!q) return;
    const idx = state.questions.findIndex(item => item.id === q.id);
    selectQuestion(q, idx >= 0 ? idx : state.selectedIndex, options.scroll === true);
    stopAudio("Preparando audio...");

    const afterAudio = () => {
      if (options.autoNext) startResponseTimer(nextQueueQuestion);
      else startResponseTimer();
    };

    if (q.question_audio_url && state.settings.enable_audio) {
      state.activeAudio = new Audio(q.question_audio_url);
      state.activeAudio.onended = afterAudio;
      state.activeAudio.play().catch(() => WT.toast("No se pudo reproducir el audio", "error"));
      setStatus("Escuchando pregunta...");
      return;
    }

    if (!state.settings.enable_speech_synthesis || !window.speechSynthesis) {
      setStatus("No hay audio disponible para esta pregunta.");
      return WT.toast("No hay audio disponible para esta pregunta", "warning");
    }

    const utterance = applyPracticeVoice(new SpeechSynthesisUtterance(q.question_text));
    utterance.onend = afterAudio;
    state.activeUtterance = utterance;
    setStatus("Escuchando pregunta...");
    window.speechSynthesis.speak(utterance);
  }

  async function ensureQuestions() {
    if (!state.questions.length) await loadQuestions(true);
    if (!state.questions.length) {
      WT.toast("No hay preguntas disponibles", "warning");
      return false;
    }
    return true;
  }

  async function startPractice() {
    if (!(await ensureQuestions())) return;
    stopAudio("Iniciando práctica normal...");
    state.practiceMode = "normal";
    state.practiceQueue = [...state.questions];
    state.queueIndex = 0;
    state.isRunning = true;
    setStatus("Práctica iniciada. Escucha y responde una pregunta a la vez.");
    playQueueCurrent();
  }

  async function startRandomPractice() {
    if (!(await ensureQuestions())) return;
    stopAudio("Iniciando práctica aleatoria...");
    state.practiceMode = "random";
    state.practiceQueue = shuffle(state.questions);
    state.queueIndex = 0;
    state.isRunning = true;
    setStatus("Práctica aleatoria iniciada. Las preguntas saldrán una por una.");
    playQueueCurrent();
  }

  function playQueueCurrent() {
    if (!state.isRunning || !state.practiceQueue.length) return;
    const q = state.practiceQueue[state.queueIndex];
    const idx = state.questions.findIndex(item => item.id === q.id);
    selectQuestion(q, idx >= 0 ? idx : 0, true);
    playQuestion(q.id, { autoNext: true, scroll: true });
  }

  function nextQueueQuestion() {
    if (!state.isRunning) return;
    state.queueIndex += 1;
    if (state.queueIndex >= state.practiceQueue.length) {
      stopAudio("Práctica completada.");
      state.isRunning = false;
      state.queueIndex = 0;
      WT.toast("Práctica completada", "success");
      return;
    }
    playQueueCurrent();
  }

  function resetPractice() {
    stopAudio("Práctica reiniciada.");
    state.practiceMode = "manual";
    state.practiceQueue = [];
    state.queueIndex = 0;
    state.isRunning = false;
    state.selectedId = null;
    state.selectedIndex = 0;
    const search = WT.qs("#questionSearch");
    const cat = WT.qs("#questionCategory");
    const diff = WT.qs("#questionDifficulty");
    if (search) search.value = "";
    if (cat) cat.value = "";
    if (diff) diff.value = "";
    loadQuestions(true);
  }

  function openQuestionDetail(q) {
    WT.showModal({
      title: "Detalle de la pregunta",
      body: `
        <div class="form-grid">
          <div class="answer-box"><strong>Pregunta:</strong><br>${WT.escapeHTML(q.question_text)}</div>
          <div class="answer-box"><strong>Respuesta sugerida:</strong><br>${WT.escapeHTML(q.suggested_answer || "No hay respuesta sugerida.")}</div>
          <div class="answer-box"><strong>Traducción:</strong><br>${WT.escapeHTML(q.spanish_translation || "No hay traducción.")}</div>
        </div>
      `,
      actions: [
        { label: "Escuchar", className: "btn-primary", onClick: () => { playQuestion(q.id, { scroll: true }); } },
        { label: "Cerrar", className: "btn-soft" }
      ]
    });
  }

  async function showDetail(id) {
    const q = await getQuestion(id);
    if (q) openQuestionDetail(q);
  }

  function switchView(view) {
    state.activeView = view;
    WT.qsa("[data-practice-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.practiceView === view));
    WT.qs("#questionList")?.classList.toggle("hidden", view !== "questions");
    WT.qs("#wilberforceList")?.classList.toggle("hidden", view !== "wilberforce");
    WT.qs("#glossaryList")?.classList.toggle("hidden", view !== "glossary");
    WT.qs("#practiceFilters")?.classList.toggle("hidden", view !== "questions");
    const loadMore = WT.qs("#loadMoreQuestions");
    if (loadMore) loadMore.hidden = view !== "questions";
  }

  function bindPractice() {
    WT.qs("#startPractice")?.addEventListener("click", startPractice);
    WT.qs("#randomPractice")?.addEventListener("click", startRandomPractice);
    WT.qs("#stopAudio")?.addEventListener("click", () => {
      state.isRunning = false;
      stopAudio("Práctica detenida.");
    });
    WT.qs("#resetPractice")?.addEventListener("click", resetPractice);
    WT.qs("#loadMoreQuestions")?.addEventListener("click", () => loadQuestions(false));
    WT.qsa("[data-practice-view]").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.practiceView)));
    ["#questionSearch", "#questionCategory", "#questionDifficulty"].forEach(sel => {
      WT.qs(sel)?.addEventListener("input", () => {
        state.isRunning = false;
        stopAudio("Filtros actualizados.");
        loadQuestions(true);
      });
    });

    document.addEventListener("click", (e) => {
      const detail = e.target.closest("[data-question-detail]");
      if (detail) {
        e.preventDefault();
        e.stopPropagation();
        showDetail(detail.dataset.questionDetail);
        return;
      }
      const row = e.target.closest("[data-question-id]");
      if (row && WT.page === "practice") {
        e.preventDefault();
        state.isRunning = false;
        const id = row.dataset.questionId;
        playQuestion(id, { scroll: false });
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (WT.page !== "practice") return;
    bindPractice();
    await loadSettings();
    await loadCategories();
    await loadQuestions(true);
  });

  window.WTPractice = { loadSettings, loadCategories, loadQuestions, playQuestion, stopAudio, applyPracticeVoice, choosePracticeVoice };
})();
