(() => {
  async function getPublicSetting(key, fallback = null) {
    if (!WT.canConnect) return fallback;
    const { data } = await WT.supabase.from("site_settings").select("value").eq("key", key).eq("is_public", true).maybeSingle();
    return data ? WT.parseSettingValue(data.value) : fallback;
  }


  function normalizeRecordImages(item = {}) {
    return {
      ...item,
      image_url: WT.sanitizeImageUrl(item.image_url || "", ""),
      photo_url: WT.sanitizeImageUrl(item.photo_url || "", "")
    };
  }

  async function listHeroSlides() {
    if (!WT.canConnect) return [];
    const { data, error } = await WT.supabase.from("hero_slides").select("*").eq("active", true).order("sort_order", { ascending: true });
    if (error) { WT.toast("No se pudo cargar el carrusel", "error"); return []; }
    return (data || []).map(normalizeRecordImages);
  }

  function filterByDate(items = []) {
    const now = Date.now();
    return items.filter(item => {
      const startsOk = !item.start_date || new Date(item.start_date).getTime() <= now;
      const endsOk = !item.end_date || new Date(item.end_date).getTime() >= now;
      return startsOk && endsOk;
    });
  }

  function matchPosition(item, position = "home") {
    const value = String(item.position || "home").toLowerCase();
    return value === "all" || value === "todo" || value === "site" || value === position;
  }

  async function listAnnouncements({ featured = null, limit = 6 } = {}) {
    if (!WT.canConnect) return [];
    let q = WT.supabase.from("announcements").select("*").eq("active", true).neq("type", "popup").order("sort_order", { ascending: true }).limit(limit);
    if (featured !== null) q = q.eq("featured", featured);
    const { data, error } = await q;
    if (error) return [];
    return filterByDate((data || []).map(normalizeRecordImages));
  }

  async function listPopupAnnouncements({ position = "home", limit = 3 } = {}) {
    if (!WT.canConnect) return [];
    const { data, error } = await WT.supabase
      .from("announcements")
      .select("*")
      .eq("active", true)
      .eq("type", "popup")
      .order("sort_order", { ascending: true })
      .limit(25);
    if (error) return [];
    return filterByDate((data || []).map(normalizeRecordImages)).filter(item => matchPosition(item, position)).slice(0, limit);
  }

  async function getService(id) {
    if (!id) return null;
    if (!WT.canConnect) return null;
    const { data, error } = await WT.supabase.from("services_j1").select("*").eq("id", id).eq("active", true).maybeSingle();
    if (error) return null;
    return data ? normalizeRecordImages(data) : null;
  }

  async function getCourse(id) {
    if (!WT.canConnect || !id) return null;
    const { data, error } = await WT.supabase.from("english_courses").select("*").eq("id", id).eq("active", true).maybeSingle();
    if (error) return null;
    return data ? normalizeRecordImages(data) : null;
  }

  async function listServices({ search = "", featured = null, limit = 12 } = {}) {
    if (!WT.canConnect) return [];
    let q = WT.supabase.from("services_j1").select("*").eq("active", true).order("sort_order", { ascending: true }).limit(limit);
    if (featured !== null) q = q.eq("featured", featured);
    if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map(normalizeRecordImages);
  }

  async function listCourses({ search = "", level = "", featured = null, limit = 12 } = {}) {
    if (!WT.canConnect) return [];
    let q = WT.supabase.from("english_courses").select("*").eq("active", true).order("sort_order", { ascending: true }).limit(limit);
    if (featured !== null) q = q.eq("featured", featured);
    if (level) q = q.eq("level", level);
    if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%,teacher.ilike.%${search}%,institution.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map(normalizeRecordImages);
  }

  async function latestPosts(limit = 3) {
    if (!WT.canConnect) return [];
    const { data, error } = await WT.supabase.from("forum_posts").select("*, forum_categories(name)").eq("status", "approved").order("last_activity_at", { ascending: false }).limit(limit);
    if (error) return [];
    return hydrateAuthors(data || []);
  }

  async function hydrateAuthors(items, authorField = "author_id") {
    if (!items.length || !WT.canConnect) return items;
    const ids = [...new Set(items.map(x => x[authorField]).filter(Boolean))];
    if (!ids.length) return items;

    const [{ data: profiles }, { data: badgeRows }] = await Promise.all([
      WT.supabase.from("public_profiles").select("id,username,full_name,photo_url,role,status").in("id", ids),
      WT.supabase.from("user_badges").select("user_id,badge_definitions(id,name,icon,color,active)").in("user_id", ids)
    ]);

    const badgesByUser = {};
    (badgeRows || []).forEach(row => {
      const badge = row.badge_definitions;
      if (!badge || badge.active === false) return;
      badgesByUser[row.user_id] ||= [];
      badgesByUser[row.user_id].push(badge);
    });

    const byId = Object.fromEntries((profiles || []).map(p => [p.id, { ...normalizeRecordImages(p), badges: badgesByUser[p.id] || [] }]));
    return items.map(item => ({ ...item, author: byId[item[authorField]] || null }));
  }

  function imageStyle(item = {}) {
    const fit = item.image_fit || "cover";
    const x = item.image_position_x ?? 50;
    const y = item.image_position_y ?? 50;
    const zoom = Number(item.image_zoom ?? 1);
    const alreadyCropped = Boolean(item.image_crop_data || item.image_aspect_ratio);
    const safeZoom = alreadyCropped ? 1 : zoom;
    return `object-fit:${fit};object-position:${x}% ${y}%;transform:scale(${safeZoom});`;
  }


  const FALLBACK_GUIDE_SERVICES = [
    {
      id: "guia-record-mescyt-uasd",
      title: "Récord de notas",
      description: "Apartado general para guías de récord de notas por universidad. Actualmente incluye la guía de Récord de notas UASD enviado al MESCyT.",
      details: `Este apartado no pertenece a una sola universidad. Aquí se organizarán las guías de récord de notas por institución, porque no todos los estudiantes son de la UASD.

Universidades disponibles por ahora:

1. Récord de notas UASD
Guía para estudiantes de la UASD que necesitan solicitar en línea el récord de notas y enviarlo al MESCyT para fines de legalización.

Requisitos principales para la guía UASD/MESCyT:
- Acta de nacimiento reciente.
- Fotocopia de la cédula de ambos lados.
- Certificado de bachillerato.

Pasos resumidos para UASD:
1. Entrar al portal de la UASD.
2. Ir a Servicios en línea.
3. Seleccionar Récord de Notas para No Graduados.
4. Elegir el método Envío al Mescyt.
5. Hacer clic en Solicitar servicio y completar el pago.

Después de varias semanas, la UASD puede entregar un número de oficio para continuar con la legalización en el MESCyT. El pago normal puede tomar más tiempo; el pago VIP depende de disponibilidad y costo vigente.`,
      icon: "📄", price: "Guía", duration: "Por universidad", level: "Documentos", modality: "En línea", featured: true, active: true, sort_order: 10,
      cta_text: "Ver universidades", cta_url: "servicio.html?id=guia-record-mescyt-uasd",
      image_url: "",
      gallery_json: [],
      child_guides_json: [
        {
          id: "uasd-record-notas",
          title: "Récord de notas UASD",
          subtitle: "Universidad Autónoma de Santo Domingo",
          summary: "Guía para solicitar el récord de notas en línea y enviarlo al MESCyT para fines de legalización.",
          logo_url: "",
          badge: "Disponible",
          duration: "10 días aprox.",
          modality: "En línea",
          level: "Documentos",
          details: `Guía para estudiantes de la UASD que necesitan solicitar en línea el récord de notas y enviarlo al MESCyT para fines de legalización.

Requisitos principales:
- Acta de nacimiento reciente.
- Fotocopia de la cédula de ambos lados.
- Certificado de bachillerato.

Pasos resumidos para UASD:
1. Entrar al portal de la UASD.
2. Ir a Servicios en línea.
3. Seleccionar Récord de Notas para No Graduados.
4. Elegir el método Envío al Mescyt.
5. Hacer clic en Solicitar servicio y completar el pago.

Después de varias semanas, la UASD puede entregar un número de oficio para continuar con la legalización en el MESCyT. El pago normal puede tomar más tiempo; el pago VIP depende de disponibilidad y costo vigente.`,
          gallery_json: []
        }
      ]
    },
    {
      id: "guia-certificado-bachiller",
      title: "Solicitar certificado de bachiller",
      description: "Guía para obtener el certificado de bachiller desde el portal oficial del Ministerio de Educación antes de completar procesos universitarios o consulares.",
      details: "Para solicitar el certificado de bachiller se debe usar el portal oficial del Ministerio de Educación.\n\nDatos que normalmente necesitarás:\n- Año escolar.\n- Convocatoria.\n- Código de estudiante: RNE o número de registro.\n- Verificación No soy un robot.\n\nEsta sección sirve como guía visual para encontrar el formulario y entender qué información se solicita.",
      icon: "🎓", price: "Guía", duration: "Consulta rápida", level: "Documentos", modality: "En línea", featured: true, active: true, sort_order: 20,
      cta_text: "Ver pasos", cta_url: "servicio.html?id=guia-certificado-bachiller",
      image_url: "",
      gallery_json: []
    },
    {
      id: "internet-us-mobile-j1",
      title: "Internet en EE.UU. con US Mobile para J1",
      description: "Recomendación de plan de internet económico para estudiantes J1: 3 meses de Unlimited Starter por $45, compatible con SIM o eSIM.",
      details: "Recomendación para tener internet durante tu estadía en Estados Unidos con el programa J1.\n\nPlan recomendado:\n- Internet ilimitado.\n- Vigencia de 3 meses.\n- $45 dólares en total durante la promoción indicada.\n- Compatible con SIM o eSIM.\n- No requiere contrato.\n\nCódigo de referencia:\n29C7035E\n\nImportante:\nNo seleccionar la prueba gratuita de 30 días si vienes nuevo, porque esa opción es para personas que ya tienen una línea activa y desean cambiarse desde otra compañía.\n\nSi tu teléfono no es compatible con eSIM, selecciona SIM Card Starter Kit. Para recibirlo a tiempo, puedes usar un courier confiable o enviarlo a la dirección donde estarás en Estados Unidos.",
      icon: "📶", price: "$45", duration: "3 meses", level: "J1", modality: "SIM / eSIM", featured: true, active: true, sort_order: 30,
      cta_text: "Ver guía US Mobile", cta_url: "servicio.html?id=internet-us-mobile-j1",
      image_url: "",
      gallery_json: []
    },
    {
      id: "verificar-visa-j1-proceso-administrativo",
      title: "Verificar visa J1 y proceso administrativo",
      description: "Guía para revisar el estado de la visa después de la entrevista y entender qué significa proceso administrativo por revisión de redes sociales.",
      details: "Esta sección ayuda a los estudiantes a revisar el estado de su visa después de la entrevista consular.\n\nActualmente muchos casos pueden quedar en Administrative Processing mientras el consulado revisa información adicional, incluyendo redes sociales u otros datos de seguridad.\n\nQué agregar en esta sección desde el panel admin:\n- Enlace oficial para verificar el estado de visa.\n- Explicación de estados comunes: Ready, Administrative Processing, Issued, Refused.\n- Recomendaciones: revisar el correo, no comprar vuelos definitivos hasta tener visa emitida y responder cualquier solicitud del consulado.\n\nEsta guía debe mantenerse actualizada desde el panel admin, porque los procesos consulares pueden cambiar.",
      icon: "🛂", price: "Guía", duration: "Después de entrevista", level: "Visa J1", modality: "Consulta en línea", featured: true, active: true, sort_order: 40,
      cta_text: "Ver guía de visa", cta_url: "servicio.html?id=verificar-visa-j1-proceso-administrativo",
      image_url: "images/placeholder-hero.jpg",
      gallery_json: []
    }
  ];


  function decodeHTML(value = "") {
    const box = document.createElement("textarea");
    box.innerHTML = String(value || "");
    return box.value;
  }

  function richToPlain(value = "") {
    let raw = decodeHTML(String(value || ""));
    if (!raw) return "";
    raw = raw
      .replace(/&nbsp;/gi, " ")
      .replace(/\u00a0/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<\/div\s*>/gi, "\n")
      .replace(/<\/li\s*>/gi, "\n")
      .replace(/<\/?(p|div|li|ul|ol|h[1-6]|blockquote|strong|b|em|i|u|span)(\s|>)[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return decodeHTML(raw);
  }

  function normalizeGallery(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(x => typeof x === "string" ? x : (x?.url || "")).filter(Boolean);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try { return normalizeGallery(JSON.parse(trimmed)); } catch (_) {}
      return trimmed.split(/\n|,/).map(x => x.trim()).filter(Boolean);
    }
    return [];
  }

  function fallbackServices({ search = "", featured = null, limit = 12 } = {}) {
    const q = String(search || "").toLowerCase().trim();
    let items = FALLBACK_GUIDE_SERVICES.filter(x => x.active !== false);
    if (featured !== null) items = items.filter(x => Boolean(x.featured) === Boolean(featured));
    if (q) items = items.filter(x => [x.title, x.description, x.details, x.icon, x.level, x.modality].join(" ").toLowerCase().includes(q));
    return items.slice(0, limit);
  }

  function contentCard(item, type = "service") {
    const image = item.image_url || "images/placeholder-hero.jpg";
    const isCourse = type === "course";
    const isService = type === "service";
    const detailUrl = isCourse ? `curso.html?id=${encodeURIComponent(item.id)}` : isService ? `servicio.html?id=${encodeURIComponent(item.id)}` : (item.cta_url || "");
    const hasCustomCta = Boolean((item.cta_text || "").trim() && (item.cta_url || "").trim());
    const cta = hasCustomCta ? item.cta_text.trim() : (isCourse ? "Ver curso" : isService ? "Ver servicio" : "");
    const url = hasCustomCta ? item.cta_url.trim() : detailUrl;
    const badges = [];
    if (item.price) badges.push(item.price);
    if (item.duration) badges.push(item.duration);
    if (item.level) badges.push(item.level);
    if (item.modality) badges.push(item.modality);
    if (item.featured) badges.push("Destacado");
    return `<article class="content-card">
      <div class="content-card__image"><img src="${WT.escapeHTML(image)}" alt="${WT.escapeHTML(item.title || "Imagen")}" style="${imageStyle(item)}"></div>
      <div class="content-card__body">
        <div class="meta-row">${badges.map(b => `<span class="badge">${WT.escapeHTML(b)}</span>`).join("")}</div>
        <h3>${WT.escapeHTML(item.title || "Sin título")}</h3>
        <p>${WT.escapeHTML(richToPlain(item.description || ""))}</p>
        <div class="meta-row">
          ${url && cta ? `<a class="btn btn-primary btn-small" href="${WT.escapeHTML(url)}">${WT.escapeHTML(cta)}</a>` : ""}
          ${(isCourse || isService) && (!url || hasCustomCta) ? `<a class="btn btn-soft btn-small" href="${WT.escapeHTML(detailUrl)}">Detalles</a>` : ""}
          ${type === "course" ? `<a class="btn btn-soft btn-small" href="${WT.escapeHTML(item.forum_url || "foro.html")}">Preguntar en el foro</a>` : ""}
        </div>
      </div>
    </article>`;
  }

  window.WTContent = { getPublicSetting, richToPlain, listHeroSlides, listAnnouncements, listPopupAnnouncements, getService, getCourse, listServices, listCourses, latestPosts, hydrateAuthors, contentCard, imageStyle, normalizeGallery, FALLBACK_GUIDE_SERVICES };
})();
