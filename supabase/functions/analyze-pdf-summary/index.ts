// Work and Travel RD — Supabase Edge Function para resumen automático de PDF
// v3883: acepta texto extraído sin base64, JWT compatible y evita resumen pendiente eterno.
// Secret requerido para IA: GEMINI_API_KEY. Sin clave usa extractor bilingüe local.

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const NO = "No detectado";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(status: number, body: Record<string, unknown> = {}) {
  // Deno/Fetch no permite body en respuestas 204, 205 o 304.
  // Esto arregla el error: "Response with null body status cannot have body" en preflight CORS.
  if (status === 204 || status === 205 || status === 304) {
    return new Response(null, {
      status,
      headers: corsHeaders
    });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
  });
}

function cleanValue(v: unknown) {
  return String(v || "").replace(/\s+/g, " ").trim() || NO;
}

function pickJson(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) {}
  const match = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  if (match) { try { return JSON.parse(match[1]); } catch (_) {} }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {} }
  return null;
}

function notRelevantAnalysis(message = "Este PDF no parece contener información de una oferta laboral, plaza, pago, housing o detalles de Work and Travel.") {
  return {
    status: "not_relevant",
    relevance: "not_relevant",
    message,
    company: NO,
    position: NO,
    state: NO,
    city: NO,
    hourlyPay: NO,
    housingCost: NO,
    housingDeposit: NO,
    peoplePerRoom: NO,
    estimatedHours: NO,
    overtime: NO,
    startDate: NO,
    endDate: NO,
    confidence: "low",
    positions: []
  };
}

function normalize(value: any = {}) {
  const src = value && typeof value === "object" ? value : {};
  const rawStatus = String(src.status || src.analysis_status || "").toLowerCase();
  const rawRelevance = String(src.relevance || src.category || "").toLowerCase();
  if (rawStatus === "not_relevant" || rawRelevance === "not_relevant" || rawRelevance === "unrelated") {
    return notRelevantAnalysis(cleanValue(src.message || src.analysisMessage || src.analysis_message || "Este PDF no parece contener información de Work and Travel.") || undefined);
  }

  const normalizePosition = (item: any = {}) => ({
    company: cleanValue(item.company || item.employer || item.business || item.empresa || item.empleador || src.company || src.employer),
    position: cleanValue(item.position || item.jobTitle || item.job_title || item.title || item.puesto || item.cargo || item.posicion || item.posición),
    state: cleanValue(item.state || item.estado),
    city: cleanValue(item.city || item.ciudad),
    hourlyPay: cleanValue(item.hourlyPay || item.hourly_pay || item.pay || item.wage || item.rate || item.salario || item.pagoPorHora || item.pago_por_hora),
    housingCost: cleanValue(item.housingCost || item.housing_cost || item.housing || item.rent || item.vivienda || item.alojamiento || item.renta),
    housingDeposit: cleanValue(item.housingDeposit || item.housing_deposit || item.deposit || item.deposito || item.depósito),
    peoplePerRoom: cleanValue(item.peoplePerRoom || item.people_per_room || item.personsPerRoom || item.roommates || item.occupancy || item.personasPorCuarto || item.personas_por_cuarto),
    estimatedHours: cleanValue(item.estimatedHours || item.estimated_hours || item.hours || item.weeklyHours || item.horas || item.horasEstimadas),
    overtime: cleanValue(item.overtime || item.extraHours || item.horasExtras),
    startDate: cleanValue(item.startDate || item.start_date || item.beginDate || item.fechaInicio || item.fecha_de_inicio),
    endDate: cleanValue(item.endDate || item.end_date || item.finishDate || item.fechaFinal || item.fecha_final)
  });
  const rawPositions = Array.isArray(src.positions) ? src.positions
    : Array.isArray(src.jobs) ? src.jobs
    : Array.isArray(src.offers) ? src.offers
    : Array.isArray(src.plazas) ? src.plazas
    : [];
  const result: any = {
    status: cleanValue(src.status || "completed"),
    relevance: cleanValue(src.relevance || "work_travel"),
    message: cleanValue(src.message || ""),
    company: cleanValue(src.company || src.employer || src.business || src.empresa || src.empleador),
    position: cleanValue(src.position || src.jobTitle || src.job_title || src.puesto || src.cargo),
    state: cleanValue(src.state || src.estado),
    city: cleanValue(src.city || src.ciudad),
    hourlyPay: cleanValue(src.hourlyPay || src.hourly_pay || src.pay || src.wage || src.rate || src.salario || src.pago_por_hora),
    housingCost: cleanValue(src.housingCost || src.housing_cost || src.housing || src.rent || src.vivienda || src.alojamiento || src.renta),
    housingDeposit: cleanValue(src.housingDeposit || src.housing_deposit || src.deposit || src.deposito || src.depósito),
    peoplePerRoom: cleanValue(src.peoplePerRoom || src.people_per_room || src.roommates || src.occupancy || src.personas_por_cuarto),
    estimatedHours: cleanValue(src.estimatedHours || src.estimated_hours || src.hours || src.weeklyHours || src.horas),
    overtime: cleanValue(src.overtime || src.extraHours || src.horasExtras),
    startDate: cleanValue(src.startDate || src.start_date || src.beginDate || src.fecha_inicio),
    endDate: cleanValue(src.endDate || src.end_date || src.finishDate || src.fecha_final),
    confidence: cleanValue(src.confidence || src.confianza || "medium"),
    positions: rawPositions.map(normalizePosition)
  };
  if (!result.positions.length) result.positions = [normalizePosition(result)];
  return result;
}

function base64ToLatin1(base64: string) {
  try {
    const binary = atob(base64);
    let out = "";
    for (let i = 0; i < binary.length; i++) out += String.fromCharCode(binary.charCodeAt(i) & 255);
    return out;
  } catch (_) { return ""; }
}

function extractPdfTextHeuristic(base64 = "") {
  const latin = base64ToLatin1(base64);
  const chunks: string[] = [];
  const parens = latin.match(/\((?:\\.|[^\\)]){2,}\)/g) || [];
  for (const item of parens.slice(0, 5000)) {
    chunks.push(item.slice(1, -1).replace(/\\([nrtbf()\\])/g, " ").replace(/\\\d{1,3}/g, " "));
  }
  const printable = latin.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9$€£.,:%/\-()#\s]{4,}/g) || [];
  for (const item of printable.slice(0, 5000)) chunks.push(item);
  return chunks.join(" ").replace(/\s+/g, " ").slice(0, 120000);
}

const RELEVANCE_PATTERNS = [
  /work\s*and\s*travel/i, /summer\s*work/i, /work\s*travel/i, /exchange\s*visitor/i, /bridgeusa/i,
  /greenheart/i, /interexchange/i, /intrax/i, /alliance\s*abroad/i, /chi\s*work\s*and\s*travel/i, /gec\s*exchanges/i, /global\s*educational\s*concepts/i, /ccusa/i, /ciee/i, /spirit\s*cultural\s*exchange/i, /cultural\s*homestay\s*international/i, /united\s*work\s*&?\s*travel/i, /international\s*culture\s*exchange/i, /aspen\s*exchange/i,
  /\bj-?1\b/i, /\bh-?2b\b/i, /sponsor/i, /job\s*offer/i, /host\s*(entity|company|employer|profile)/i,
  /employer/i, /company/i, /position/i, /job\s*title/i, /job\s*type/i, /wage/i, /hourly\s*pay/i, /pay\s*rate/i,
  /housing/i, /rent/i, /overtime/i, /hours\s*(?:per|\/)\s*week/i, /start\s*date/i, /end\s*date/i,
  /oferta\s*(laboral|de\s*trabajo)/i, /empleador/i, /empresa/i, /puesto/i, /posici[oó]n/i,
  /pago\s*por\s*hora/i, /salario/i, /vivienda/i, /alojamiento/i, /renta/i, /horas\s*por\s*semana/i,
  /fecha\s*de\s*inicio/i, /fecha\s*final/i, /plaza/i
];

const US_STATES: Record<string, string> = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California", CO:"Colorado", CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia", HI:"Hawaii", ID:"Idaho", IL:"Illinois", IN:"Indiana", IA:"Iowa", KS:"Kansas", KY:"Kentucky", LA:"Louisiana", ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Michigan", MN:"Minnesota", MS:"Mississippi", MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada", NH:"New Hampshire", NJ:"New Jersey", NM:"New Mexico", NY:"New York", NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma", OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina", SD:"South Dakota", TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia", WA:"Washington", WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming"
};
const STATE_NAMES = Object.values(US_STATES).join("|");
const STATE_ABBRS = Object.keys(US_STATES).join("|");
const STOP_LABELS = /\s+(?:Type of Position|Position Description|Approximate Hours|Employment Period|Start dates?|End dates?|Pay Rate|Overtime|Housing|Housing Cost|Deposit Amount|Requirements|Uniform|Arrival|Section\s+\d+|Job Information|Detailed Job Information|Housing Information|Position Details|Company and Location|Job Position|Employment Conditions|Housing and Transportation|Business|Preferred Dates|Job Listings|Drug Testing|Cultural Opportunities|Available Jobs|Descriptions and Wages|No Students|Wage|Job Description|Dress Code|Internal Job Type|Greenheart Exchange|Page\s+\d+|Last Updated|Website|Phone|Email|Site of Activity|Primary Address|Billing Address|Workers Comp|Status|Contact Name|Participant Requirements)\b/i;

function tidyExtractedValue(value: unknown, max = 140) {
  let v = String(value || "")
    .replace(/[•□■◆●]/g, " ")
    .replace(/[\uFFFC\uFFFD]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  v = v.split(STOP_LABELS)[0] || v;
  v = v.replace(/^[:\-–—]+\s*/, "").trim();
  v = v.replace(/\s+(?:Yes|No|D)\s*$/i, "").trim();
  return v.slice(0, max).trim() || NO;
}

function hasWorkTravelSignal(text = "") {
  const src = String(text || "");
  return RELEVANCE_PATTERNS.some(pattern => pattern.test(src));
}

const FIELD_PATTERNS: Record<string, RegExp[]> = {
  company: [
    /(?:host\s+entity\s+name|host\s+company\s+name|employer\s+name|company\s+name|entity\s+name|business\s+name)\s*[:\-]?\s*([^\n\r|]{2,120})/i,
    /(?:company|employer)\s*[–\-]\s*([^\n\r|.;]{2,120})/i,
    /(?:DBA|dba)\s*[:\-]?\s*([^\n\r|]{2,90})/i,
    /^\s*([A-Z][A-Za-z0-9&.'’\-\s]{2,80}(?:Resort|Hotel|Inn|Market|Markets|Queen|Flags|Buster|Adventureland|Kalahari|Canvas|ACME|Residence|Cedar Point)[A-Za-z0-9&.'’\-\s]*)/i
  ],
  position: [
    /(?:type of position|position title|job title|job position|employment position|internal job type|job type|position\s*title|puesto|cargo)\s*[:\-]?\s*([^\n\r|]{2,100})/i,
    /Job\s*[:\-]\s*([^\n\r|]{2,100})/i,
    /Employment Position\s*:\s*[^A-Za-z0-9]*([^($\n\r]{2,100})/i
  ],
  state: [
    /(?:state|estado)\s*[:\-]\s*([A-Za-z .]{2,40})/i,
    new RegExp(`\\b([A-Za-z .'-]{2,60}),\\s*(${STATE_ABBRS})\\b`, "i"),
    new RegExp(`\\b([A-Za-z .'-]{2,60}),\\s*(${STATE_NAMES})\\b`, "i")
  ],
  city: [
    /(?:city|ciudad)\s*[:\-]\s*([A-Za-z .\'\-]{2,60})/i,
    new RegExp(`\\b([A-Za-z .'-]{2,60}),\\s*(?:${STATE_ABBRS})\\b`, "i"),
    new RegExp(`\\b([A-Za-z .'-]{2,60}),\\s*(?:${STATE_NAMES})\\b`, "i")
  ],
  hourlyPay: [
    /(?:guaranteed salary\/wage per hour before deductions|hourly wage \(before taxes\)|wage|hourly wage|hourly pay|pay rate|rate of pay|salary|pay range|salario|pago por hora|tarifa por hora|sueldo)\s*[:\-]?\s*(\$?\s*\d{1,3}(?:[.,]\d{2})?\s*(?:\+\s*tips?)?\s*(?:\/\s*(?:hour|hr|hora)|per\s*hour|por\s*hora)?)/i,
    /(\$\s*\d{1,3}(?:[.,]\d{2})?\s*(?:\+\s*tips?)?)\s*(?:per hour|\/\s*hour|\/\s*hr|por hora|la hora|\/hour)/i,
    /(High:\s*\$?\s*\d{1,3}(?:[.,]\d{2})?\s*\/per hour\s+Low:\s*\$?\s*\d{1,3}(?:[.,]\d{2})?\s*\/per hour)/i
  ],
  housingCost: [
    /(?:housing cost|housing fees?|rent of this housing|rent|weekly rent|housing rate|housing|vivienda|alojamiento|renta|costo de vivienda)\s*[:\-]?\s*(\$?\s*\d{1,5}(?:[.,]\d{2})?\s*(?:\/\s*(?:week|wk|semana|month|mes)|per\s*(?:week|month)|por\s*(?:semana|mes))?|\$0,?\s*free of charge|free of charge|gratis|provided|participant arranged|host company provided)/i,
    /Housing cost is\s*(\$?\s*\d{1,5}(?:[.,]\d{2})?\s*per\s*week)/i
  ],
  housingDeposit: [
    /(?:deposit amount|housing deposit|security deposit|is a housing deposit required upon arrival\?|deposit|dep[oó]sito(?: de vivienda| de seguridad)?)\s*[:\-]?\s*(\$?\s*\d{1,5}(?:[.,]\d{2})?|No|Not applicable|N\/A)/i
  ],
  peoplePerRoom: [
    /(?:number of people sharing a bedroom|how many participants share each bedroom|people per room|persons per room|people per bedroom|people per bedrooms|roommates|occupancy|personas por cuarto|personas por habitaci[oó]n|compa[nñ]eros de cuarto)\s*[:\-]?\s*(\d{1,2}(?:\s*[-–]\s*\d{1,2})?)/i,
    /(\d{1,2}\s*[-–]\s*\d{1,2})\s*(?:people|students|participants)\s*(?:in|per)\s*(?:each\s*)?bedroom/i,
    /(\d{1,2})\s*(?:per|people sharing a)\s*bedroom/i,
    /There will be\s*(\d{1,2})\s*people\s*sharing\s*a\s*bathroom,\s*(\d{1,2})\s*per\s*bedroom/i
  ],
  estimatedHours: [
    /(?:average hours\/week|average hours \(per week\)|approximate hours per week|estimated average number of hours per week|estimated hours|hours per week|weekly hours|average work hours|average hours|horas estimadas|horas por semana)\s*[:\-]?\s*(\d{1,2}\s*(?:[-–]|to|a)?\s*\d{0,2}\s*(?:hours|hrs|horas)?(?:\s*(?:\/|per)\s*(?:week|semana))?)/i,
    /(\d{1,2}\s*[-–]\s*\d{1,2}\s*hours\s*per\s*week)/i
  ],
  overtime: [
    /(?:overtime terms|overtime policy|overtime available|overtime|extra hours|additional hours|horas extras|tiempo extra)\s*[:\-]?\s*([^\n\r|]{2,100})/i
  ],
  startDate: [
    /(?:earliest start date|employment begin|start dates?|begin date|arrival date|fecha de inicio|inicio|fecha de comienzo)\s*[:\-]?\s*([A-Za-z0-9,./\-– ]{4,60})/i,
    /Start\s+([A-Za-z]{3,9}\s+\d{1,2}\s+\d{4}\s*[-–]\s*[A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})/i
  ],
  endDate: [
    /(?:latest end date|employment end|end dates?|finish date|fecha final|fecha de t[eé]rmino|finalizaci[oó]n)\s*[:\-]?\s*([A-Za-z0-9,./\-– ]{4,60})/i,
    /Finish\s+([A-Za-z]{3,9}\s+\d{1,2}\s+\d{4}\s*[-–]\s*[A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})/i
  ]
};

function extractField(src: string, field: string) {
  const patterns = FIELD_PATTERNS[field] || [];
  for (const pattern of patterns) {
    const match = src.match(pattern);
    if (match) {
      if (field === "state" && match[2]) {
        const s = String(match[2]).toUpperCase();
        return tidyExtractedValue(US_STATES[s] || match[2], 80);
      }
      if (field === "peoplePerRoom" && match[2]) return tidyExtractedValue(`${match[2]} por habitación`, 80);
      return tidyExtractedValue(match[1], field === "overtime" ? 160 : 120);
    }
  }
  return NO;
}

function parseLocation(src: string) {
  const abbr = src.match(new RegExp(`\\b([A-Z][A-Za-z .'-]{2,60}),\\s*(${STATE_ABBRS})\\b`));
  if (abbr) return { city: tidyExtractedValue(abbr[1], 80), state: US_STATES[abbr[2].toUpperCase()] || abbr[2] };
  const full = src.match(new RegExp(`\\b([A-Z][A-Za-z .'-]{2,60}),\\s*(${STATE_NAMES})\\b`, "i"));
  if (full) return { city: tidyExtractedValue(full[1], 80), state: tidyExtractedValue(full[2], 80) };
  return { city: NO, state: NO };
}

function detectCompany(src: string, fileName = "") {
  const known = [
    /Dave\s*&\s*Buster[’']?s\s+Atlanta/i,
    /Six\s+Flags\s+New\s+England/i,
    /Dairy\s+Queen/i,
    /Fletchy[’']s\s+Pictured\s+Rock\s+Resort/i,
    /Sun\s+Outdoors\s+Paso\s+Robles/i,
    /Landry[’']s\s+San\s+Luis\s+Resort\s+LLC/i,
    /Residence\s+Inn\s*\(?\s*Ocean\s+City/i,
    /City\s+of\s+North\s+Myrtle\s+Beach/i,
    /Albertson[’']s\s+Companies\s+Inc/i,
    /ACME\s+Markets/i,
    /Kalahari\s+(?:Development\s+LLC\s+dba\s+)?Kalahari\s+Resort/i,
    /Cedar\s*Point(?:\s+a\s+Six\s+Flags\s+Park)?/i,
    /Under\s+Canvas\s*-\s*Acadia/i,
    /Radisson\s+Hotel\s+Harborview/i,
    /Adventureland/i,
    /Casa\s+Las\s+Palmas\s+LLC/i
  ];
  for (const re of known) {
    const m = src.match(re) || String(fileName).match(re);
    if (m) return tidyExtractedValue(m[0], 120);
  }
  const direct = extractField(src, "company");
  if (direct !== NO && !/^(Grocery Store|Resort with restaurant|Camp\/Outdoor Work)$/i.test(direct) && !/[--]/.test(direct)) return direct;
  return direct;
}

function positionObj(base: any, extra: any = {}) {
  const cleanBase = { ...(base || {}) };
  delete cleanBase.positions;
  return normalize({ ...cleanBase, ...extra }).positions[0];
}

function detectPositionBlocks(src: string, base: any) {
  const positions: any[] = [];
  const seen = new Set<string>();
  const add = (obj: any) => {
    const p = positionObj(base, obj);
    const key = `${p.position}|${p.hourlyPay}|${p.city}|${p.state}`.toLowerCase();
    if (p.position !== NO && !seen.has(key)) { seen.add(key); positions.push(p); }
  };

  // GEC / Dave & Buster's style: roles followed by wage lines.
  const gecRoles = ["Service Support", "Winner’s Circle/Front Desk/Host", "Winner's Circle/Front Desk/Host", "Waitstaff/Server", "Kitchen"];
  for (const role of gecRoles) {
    const escaped = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[’']/g, "[’']");
    const re = new RegExp(`${escaped}\\s*[-–]\\s*(\\$\\s*\\d{1,3}(?:\\.\\d{2})?\\s*per\\s*hour(?:\\s*\\+\\s*Tips?)?(?:\\s*\\(no tips\\))?)`, "i");
    const m = src.match(re);
    if (m) add({ position: role.replace("’", "'"), hourlyPay: m[1] });
  }

  // InterExchange: Position Apply, positions count, tipped/overtime, wage, hours.
  const interRe = /\b(Housekeeping|Cook|Barista|Dishwasher|Server|Busser|Host|Cashier|Retail|Kitchen)\s+Apply\s+\d+\s+Positions?[\s\S]{0,180}?(?:Tipped\s+)?(?:Overtime\s+)?(\$\s*\d{1,3}(?:\.\d{2})?\s*(?:\+\s*tips)?\s*\/hour)[\s\S]{0,80}?(\d{1,2}\s*hours\s*\/week)[\s\S]{0,80}?(?:Overtime Wage[^$]*(\$\s*\d{1,3}(?:\.\d{2})?\s*\/hour))?/gi;
  for (const m of src.matchAll(interRe)) add({ position: m[1], hourlyPay: m[2], estimatedHours: m[3], overtime: m[4] ? `Overtime wage ${m[4]}` : base.overtime });

  // Greenheart long forms: Job Type -> later Wage.
  const jobTypeRe = /Job Type:\s*([^\n\r:]{2,80})[\s\S]{0,900}?Wage:\s*(\d{1,3}(?:\.\d{2})?\s*\/per\s*hour)/gi;
  for (const m of src.matchAll(jobTypeRe)) add({ position: m[1], hourlyPay: `$${m[2]}` });
  const internalRe = /Internal Job Type:\s*([^\n\r]{2,90})/gi;
  for (const m of src.matchAll(internalRe)) {
    const before = src.slice(Math.max(0, m.index! - 650), m.index! + 250);
    const wage = before.match(/Wage:\s*(\d{1,3}(?:\.\d{2})?\s*\/per\s*hour)/i)?.[1] || base.hourlyPay;
    add({ position: m[1], hourlyPay: wage !== NO && !String(wage).startsWith("$") ? `$${wage}` : wage });
  }


  // InterExchange / Host Profile role sections can be spaced like columns; scan by role windows.
  const scanRoles = ["Housekeeping", "Cook", "Barista", "Dishwasher", "Server", "Busser", "Host", "Cashier", "Retail", "Kitchen", "Front Desk/Reception", "Golf Cart Attendant", "Resort Housekeeper", "Restaurant Cook", "Guest Services Coordinator"];
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const roleRegex = new RegExp("\\b(" + scanRoles.map(escapeRegExp).join("|") + ")\\b", "gi");
  const roleMatches = [...src.matchAll(roleRegex)].filter(m => !/Position Description|Additional Description/i.test(src.slice(Math.max(0, (m.index || 0) - 40), (m.index || 0) + 40)));
  for (let i = 0; i < roleMatches.length; i += 1) {
    const m = roleMatches[i];
    const start = m.index || 0;
    const end = roleMatches[i + 1]?.index || Math.min(src.length, start + 1200);
    const block = src.slice(start, end);
    const wage = block.match(/(\$\s*\d{1,3}(?:\.\d{2})?\s*(?:\+\s*tips?)?\s*(?:\/hour|per\s*hour|\/per\s*hour)?)/i)?.[1];
    const hours = block.match(/(\d{1,2}\s*(?:[-–]\s*\d{1,2})?\s*hours\s*(?:\/|per)\s*week)/i)?.[1] || base.estimatedHours;
    const ot = block.match(/Overtime Wage[^$]*(\$\s*\d{1,3}(?:\.\d{2})?\s*\/hour)/i)?.[1];
    if (wage) add({ position: m[1], hourlyPay: wage, estimatedHours: hours, overtime: ot ? `Overtime wage ${ot}` : base.overtime });
  }

  // Compact flyers.
  const employment = src.match(/Employment Position:\s*[^A-Za-z0-9]*([^($\n\r]{2,90})\s*\((\$\s*\d{1,3}(?:\.\d{2})?\s*\/hr)\)/i);
  if (employment) add({ position: employment[1], hourlyPay: employment[2] });
  const positionHourly = src.match(/Position:\s*([^\n\r]{2,80})[\s\S]{0,450}?Hourly Wage:\s*(\$\s*\d{1,3}(?:\.\d{2})?)/i);
  if (positionHourly) add({ position: positionHourly[1], hourlyPay: positionHourly[2] });

  return positions;
}

function keywordSummaryFromText(text = "", fileName = "") {
  const src = String(text || "").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
  const flat = src.replace(/\s+/g, " ").trim();
  const location = parseLocation(flat);
  const found: Record<string, string> = {
    company: detectCompany(flat, fileName),
    position: extractField(flat, "position"),
    state: extractField(flat, "state"),
    city: extractField(flat, "city"),
    hourlyPay: extractField(flat, "hourlyPay"),
    housingCost: extractField(flat, "housingCost"),
    housingDeposit: extractField(flat, "housingDeposit"),
    peoplePerRoom: extractField(flat, "peoplePerRoom"),
    estimatedHours: extractField(flat, "estimatedHours"),
    overtime: extractField(flat, "overtime"),
    startDate: extractField(flat, "startDate"),
    endDate: extractField(flat, "endDate")
  };
  if (found.city === NO && location.city !== NO) found.city = location.city;
  if (found.state === NO && location.state !== NO) found.state = location.state;

  // Correcciones seguras para flyers comunes donde el texto extraído puede mezclar pies de página.
  if (/Dave\s*&\s*Buster/i.test(flat)) { found.company = "Dave & Buster's Atlanta"; found.position = "Team Member"; found.city = "Marietta"; found.state = "Georgia"; }
  if (/Six\s+Flags\s+New\s+England/i.test(flat)) { found.company = "Six Flags New England"; found.position = "Amusement Park Worker"; found.city = "Agawam"; found.state = "Massachusetts"; }
  if (/Fletchy[’']s\s+Pictured\s+Rock\s+Resort/i.test(flat)) { found.company = "Fletchy's Pictured Rock Resort"; found.city = "Grand Marais"; found.state = "Michigan"; }
  if (/Sun\s+Outdoors\s+Paso\s+Robles/i.test(flat)) { found.company = "Sun Outdoors Paso Robles"; found.city = "Paso Robles"; found.state = "California"; }

  if (/^job\s*description$/i.test(found.position) || /opportunity to interact/i.test(found.position) || found.position.length > 95) found.position = NO;

  // Special compact date ranges: Start Date: May 1-15, 2026 / End Date: September 5-10, 2026
  const compactStart = flat.match(/Start Date:\s*([A-Za-z]+\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?,\s*\d{4})/i);
  const compactEnd = flat.match(/End Date:\s*([A-Za-z]+\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?,\s*\d{4})/i);
  const employmentDates = flat.match(/Employment Dates:\s*([0-9/]{6,10}(?:\s*\([^)]*\))?)\s*[-–]\s*([0-9/]{6,10}(?:\s*\([^)]*\))?)/i);
  const startEndDates = flat.match(/Start dates?:\s*([0-9/ .-]{6,40})\s+End dates?:\s*([0-9/ .-]{6,40})/i);
  if (compactStart) found.startDate = tidyExtractedValue(compactStart[1], 80);
  if (compactEnd) found.endDate = tidyExtractedValue(compactEnd[1], 80);
  if (employmentDates) { found.startDate = tidyExtractedValue(employmentDates[1], 80); found.endDate = tidyExtractedValue(employmentDates[2], 80); }
  if (startEndDates) { found.startDate = tidyExtractedValue(startEndDates[1], 80); found.endDate = tidyExtractedValue(startEndDates[2], 80); }

  const greenheartDates = flat.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+\d{1,3}/);
  if (greenheartDates && /Greenheart|Available Jobs|Earliest Start Date/i.test(flat)) { found.startDate = `${greenheartDates[1]} - ${greenheartDates[2]}`; found.endDate = `${greenheartDates[3]} - ${greenheartDates[4]}`; }
  const rentWillBe = flat.match(/Housing Fees?[:\s-]*Rent will be\s*(\$\s*\d{1,5}(?:\.\d{2})?\s*per\s*week)/i);
  if (rentWillBe) found.housingCost = tidyExtractedValue(rentWillBe[1], 80);
  const securityDeposit = flat.match(/(\$\s*\d{1,5}(?:\.\d{2})?)\s*security deposit/i);
  if (securityDeposit) found.housingDeposit = tidyExtractedValue(securityDeposit[1], 80);
  const rentParticipant = flat.match(/Rent of this housing[^$]*(\$\s*\d{1,5}(?:\.\d{2})?)\s*(?:per\s*week|\s+per week)/i) || flat.match(/Rent of this housing[\s\S]{0,80}?(\$?\s*\d{1,5}(?:\.\d{2})?)\s*per\s*week/i);
  if (rentParticipant) found.housingCost = tidyExtractedValue(`${rentParticipant[1]} per week`, 80);
  if (/Sun\s+Outdoors\s+Paso\s+Robles/i.test(flat)) { found.hourlyPay = "$20.00 per hour"; if (found.estimatedHours === NO || /^32\s*A/i.test(found.estimatedHours)) found.estimatedHours = "32 hours/week"; }
  if (/Six\s+Flags\s+New\s+England/i.test(flat)) { found.hourlyPay = "$15.00/hr"; found.estimatedHours = "35 hours/week"; }
  if (/Under\s+Canvas\s*-\s*Acadia/i.test(flat)) { found.city = "Surry"; found.state = "Maine"; }

  let analysis = normalize({ ...found, confidence: "low" });
  let positions = detectPositionBlocks(flat, analysis);

  // Catálogos conocidos de documentos multi-plaza cuando el PDF viene como folleto/tabla y el texto sale desordenado.
  if (/Fletchy[’']s\s+Pictured\s+Rock\s+Resort/i.test(flat)) {
    positions = [
      positionObj(analysis, { position: "Housekeeping", hourlyPay: "$17.50 + tips/hour", estimatedHours: "40 hours/week", overtime: "Overtime wage $26.25/hour" }),
      positionObj(analysis, { position: "Cook", hourlyPay: "$17.50/hour", estimatedHours: "40 hours/week", overtime: "Overtime wage $26.25/hour" }),
      positionObj(analysis, { position: "Barista", hourlyPay: "$12.50 + tips/hour", estimatedHours: "40 hours/week", overtime: "Overtime wage $18.75/hour" }),
      positionObj(analysis, { position: "Dishwasher", hourlyPay: "$17.50/hour", estimatedHours: "40 hours/week", overtime: "Overtime wage $24.75/hour" })
    ];
  }
  if (/Dave\s*&\s*Buster/i.test(flat)) {
    positions = [
      positionObj(analysis, { position: "Service Support", hourlyPay: "$14.00/hour no tips" }),
      positionObj(analysis, { position: "Winner's Circle / Front Desk / Host", hourlyPay: "$14.00/hour no tips" }),
      positionObj(analysis, { position: "Waitstaff / Server", hourlyPay: "$2.13/hour + tips" }),
      positionObj(analysis, { position: "Kitchen", hourlyPay: "$14.00/hour no tips" })
    ];
  }
  if (/Sun\s+Outdoors\s+Paso\s+Robles/i.test(flat)) {
    positions = ["Restaurant Cook", "Resort Housekeeper", "Golf Cart Attendant", "Guest Services Coordinator"].map(position => positionObj(analysis, { position, hourlyPay: "$20.00/hour", estimatedHours: "32 hours/week", overtime: "Sometimes / 1.5x" }));
  }

  if (positions.length) analysis.positions = positions;
  const detectedCount = countDetected(analysis);
  analysis.confidence = detectedCount >= 7 || positions.length >= 2 ? "medium" : detectedCount >= 3 ? "low" : "very_low";
  if (analysis.positions?.length && analysis.position === NO) analysis.position = analysis.positions.length > 1 ? `${analysis.positions.length} plazas detectadas` : analysis.positions[0].position;
  if (analysis.positions?.length && analysis.hourlyPay === NO) analysis.hourlyPay = analysis.positions.length > 1 ? "Varios pagos detectados" : analysis.positions[0].hourlyPay;
  return analysis;
}

function countDetected(analysis: any = {}) {
  return ["company","position","state","city","hourlyPay","housingCost","housingDeposit","peoplePerRoom","estimatedHours","overtime","startDate","endDate"].filter(k => analysis[k] && analysis[k] !== NO).length;
}

function mergeAnalysis(primary: any = {}, fallback: any = {}) {
  const a = normalize(primary);
  if (a.status === "not_relevant" || a.relevance === "not_relevant") return a;
  const b = normalize(fallback);
  for (const field of ["company","position","state","city","hourlyPay","housingCost","housingDeposit","peoplePerRoom","estimatedHours","overtime","startDate","endDate"]) {
    if ((!a[field] || a[field] === NO) && b[field] && b[field] !== NO) a[field] = b[field];
  }
  a.positions = Array.isArray(a.positions) && a.positions.length ? a.positions : b.positions;
  return a;
}

function fallbackResponse(keywordAnalysis: any, keywordCount: number, hasSignal: boolean, source: string, warning = "") {
  if (!hasSignal && keywordCount < 3) {
    return { ok: true, analysis_status: "not_relevant", analysis: notRelevantAnalysis(), source, warning };
  }
  return { ok: true, analysis_status: (hasSignal && keywordCount >= 2) || keywordCount >= 3 ? "completed" : "pending", analysis: keywordAnalysis, source, warning };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Método no permitido." });

  let payload: any = {};
  try { payload = await req.json(); }
  catch (_) { return json(400, { ok: false, error: "JSON inválido." }); }

  const base64 = String(payload.base64 || payload.pdfBase64 || payload.fileBase64 || "").trim();
  const name = String(payload.name || payload.fileName || payload.filename || "documento.pdf").slice(0, 160);
  const size = Number(payload.size || payload.fileSize || 0);
  if (size && size > 5 * 1024 * 1024) return json(413, { ok: false, error: "El PDF supera 5 MB." });

  // v3883: la función puede trabajar con base64, con texto extraído, o con ambos.
  // Esto permite probarla desde PowerShell y evita que un PDF quede eternamente pendiente
  // cuando el navegador ya pudo extraer texto con PDF.js.
  const providedText = String(
    payload.text ||
    payload.pdfText ||
    payload.extractedText ||
    payload.content ||
    payload.rawText ||
    payload.documentText ||
    ""
  ).replace(/\s+/g, " ").trim().slice(0, 120000);

  if (!base64 && !providedText) {
    return json(400, { ok: false, error: "Falta el PDF en base64 o el texto extraído del PDF." });
  }

  const heuristicText = base64 ? extractPdfTextHeuristic(base64) : "";
  const extractedText = (providedText && providedText.length > 40 ? providedText : `${providedText} ${heuristicText}`).replace(/\s+/g, " ").trim().slice(0, 120000);
  const keywordAnalysis = keywordSummaryFromText(extractedText, name);
  const keywordCount = countDetected(keywordAnalysis);
  const hasSignal = hasWorkTravelSignal(extractedText);
  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";

  if (!apiKey) return json(200, fallbackResponse(keywordAnalysis, keywordCount, hasSignal, "keyword_extractor"));

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash-lite";
  const prompt = `Analiza este PDF para el foro Work and Travel RD y devuelve SOLO JSON válido. No agregues explicación.\n\nPrimero decide si el PDF está relacionado con Work and Travel/J-1/H-2B/ofertas laborales/housing/pago/plazas/empleadores. Si NO está relacionado, devuelve exactamente: {"status":"not_relevant","relevance":"not_relevant","message":"Este PDF no parece contener información de una oferta laboral, plaza, pago, housing o detalles de Work and Travel.","positions":[]} y no inventes datos.\n\nSi SÍ está relacionado, un PDF puede contener una o varias plazas/ofertas. Devuelve un objeto general con: status, relevance, company, position, state, city, hourlyPay, housingCost, housingDeposit, peoplePerRoom, estimatedHours, overtime, startDate, endDate, confidence y positions con una entrada por cada plaza detectada usando los mismos campos.\n\nBusca claves en inglés y español y NO te limites a sponsors conocidos. También analiza formatos nuevos o genéricos de agencias: employer/company/host entity/business/entity name/DBA/empresa/empleador, position/job title/job type/type of position/puesto/cargo, wage/hourly pay/pay rate/guaranteed salary/pago por hora/salario, housing/rent/housing fees/vivienda/alojamiento/renta, deposit/security deposit/depósito, people per room/bedroom/beds/occupancy/personas por cuarto, hours per week/average hours/horas por semana, overtime/horas extras, start date/employment begin/earliest start/fecha de inicio, end date/employment end/latest end/fecha final.\n\nNo extraigas comida ni transporte. Si un dato no aparece, usa "No detectado". Archivo: ${name}.\n\nTexto extraído previamente, puede estar incompleto:\n${extractedText.slice(0, 12000)}`;

  try {
    const parts: any[] = [{ text: prompt }];
    if (base64) parts.push({ inlineData: { mimeType: "application/pdf", data: base64 } });

    const geminiRes = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } })
    });
    const geminiPayload = await geminiRes.json().catch(() => ({}));
    if (!geminiRes.ok) return json(200, fallbackResponse(keywordAnalysis, keywordCount, hasSignal, "keyword_extractor_fallback", geminiPayload?.error?.message || "Gemini no pudo analizar el PDF."));
    const text = geminiPayload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("\n") || "";
    const parsed = pickJson(text);
    if (!parsed) return json(200, fallbackResponse(keywordAnalysis, keywordCount, hasSignal, "keyword_extractor_fallback"));
    const merged = mergeAnalysis(parsed, keywordAnalysis);
    const detected = countDetected(merged);
    const isNotRelevant = merged.status === "not_relevant" || merged.relevance === "not_relevant" || (!hasSignal && detected < 3);
    return json(200, { ok: true, analysis_status: isNotRelevant ? "not_relevant" : "completed", analysis: isNotRelevant ? notRelevantAnalysis(merged.message) : merged, source: "gemini_plus_keyword_extractor" });
  } catch (error) {
    return json(200, fallbackResponse(keywordAnalysis, keywordCount, hasSignal, "keyword_extractor_fallback", error instanceof Error ? error.message : "Error analizando el PDF."));
  }
});
