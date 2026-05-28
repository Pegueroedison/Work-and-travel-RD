(() => {
  let heroSlides = [];
  let heroIndex = 0;
  let heroTimer = null;


  function normalizeTextBreaks(value = "") {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n");
  }

  function decodeHTML(value = "") {
    const box = document.createElement("textarea");
    box.innerHTML = String(value || "");
    return box.value;
  }

  function plainFromRich(value = "") {
    if (window.WTContent?.richToPlain) return WTContent.richToPlain(value);
    return decodeHTML(String(value || ""))
      .replace(/&nbsp;/gi, " ")
      .replace(/\u00a0/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<\/div\s*>/gi, "\n")
      .replace(/<\/li\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function renderRichText(value = "") {
    let raw = decodeHTML(normalizeTextBreaks(value)).trim();
    if (!raw) return "";
    raw = raw.replace(/&nbsp;/gi, " ").replace(/\u00a0/g, " ");
    if (!/<\/?(p|br|strong|b|em|i|u|ul|ol|li|h[1-6]|blockquote|a|span|div)(\s|>)/i.test(raw)) {
      return WT.escapeHTML(raw).replace(/\n/g, "<br>");
    }
    const box = document.createElement("div");
    box.innerHTML = raw;
    box.querySelectorAll("script,style,iframe,object,embed,form,input,button").forEach(n => n.remove());
    box.querySelectorAll("*").forEach(node => {
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "style") node.removeAttribute(attr.name);
        if ((name === "href" || name === "src") && /^javascript:/i.test(attr.value || "")) node.removeAttribute(attr.name);
      });
    });
    return box.innerHTML.trim();
  }

  function renderAnnouncements(items) {
    const root = WT.qs("#announcementCards"); if (!root) return;
    root.innerHTML = items.length ? items.map(item => WTContent.contentCard(item, "announcement")).join("") : `<div class="empty-state">No hay anuncios activos.</div>`;
  }
  function renderServices(items) {
    const root = WT.qs("#serviceCards"); if (!root) return;
    root.innerHTML = items.length ? items.map(item => WTContent.contentCard(item, "service")).join("") : `<div class="empty-state">No hay servicios activos.</div>`;
  }
  function renderCourses(items) {
    const root = WT.qs("#courseCards"); if (!root) return;
    root.innerHTML = items.length ? items.map(item => WTContent.contentCard(item, "course")).join("") : `<div class="empty-state">No hay cursos activos.</div>`;
  }

  function showHero(index) {
    if (!heroSlides.length) return;
    heroIndex = (index + heroSlides.length) % heroSlides.length;
    const slide = heroSlides[heroIndex];
    const bg = WT.qs("#heroBg"), overlay = WT.qs("#heroOverlay");
    const title = WT.qs("#heroTitle"), subtitle = WT.qs("#heroSubtitle"), btn1 = WT.qs("#heroBtn1"), btn2 = WT.qs("#heroBtn2");
    const heroEyebrow = WT.qs(".hero-eyebrow");
    if (heroEyebrow) {
      heroEyebrow.hidden = true;
      heroEyebrow.textContent = "";
    }
    if (bg) {
      // En pantallas >= 1024px usar desktop_image_url si existe
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      const imgUrl = (isDesktop && slide.desktop_image_url)
        ? slide.desktop_image_url
        : WT.sanitizeImageUrl(slide.image_url, "images/placeholder-hero.jpg");
      bg.style.backgroundImage = `url('${imgUrl}')`;
      bg.style.backgroundSize = "cover";
      bg.style.backgroundPosition = "center center";
      bg.style.transform = "scale(1)";
    }
    if (overlay) overlay.style.background = `linear-gradient(180deg, rgba(5,15,35,${Math.max(0, (slide.overlay_opacity ?? 45) / 100 - .18)}), rgba(5,15,35,${(slide.overlay_opacity ?? 62) / 100}))`;
    if (title) title.textContent = slide.title || "Work and Travel RD";
    if (subtitle) {
      const cleanSubtitle = WTContent.richToPlain ? WTContent.richToPlain(slide.subtitle) : (slide.subtitle || "");
      subtitle.textContent = String(cleanSubtitle || "").trim();
      subtitle.hidden = !String(cleanSubtitle || "").trim();
    }
    const actions = WT.qs(".hero-actions");
    const primaryText = String(slide.button_text || "").trim();
    const primaryUrl = String(slide.button_url || "").trim();
    const secondaryText = String(slide.secondary_button_text || "").trim();
    const secondaryUrl = String(slide.secondary_button_url || "").trim();
    const hasPrimary = Boolean(primaryText && primaryUrl);
    const hasSecondary = Boolean(secondaryText && secondaryUrl);
    if (btn1) {
      btn1.hidden = !hasPrimary;
      if (hasPrimary) { btn1.textContent = primaryText; btn1.href = primaryUrl; }
      else { btn1.textContent = ""; btn1.removeAttribute("href"); }
    }
    if (btn2) {
      btn2.hidden = !hasSecondary;
      if (hasSecondary) { btn2.textContent = secondaryText; btn2.href = secondaryUrl; }
      else { btn2.textContent = ""; btn2.removeAttribute("href"); }
    }
    if (actions) actions.hidden = !(hasPrimary || hasSecondary);
    WT.qsa("#heroDots button").forEach((b, i) => b.classList.toggle("active", i === heroIndex));
    clearTimeout(heroTimer);
    heroTimer = setTimeout(() => showHero(heroIndex + 1), Number(slide.change_ms || slide.change_time_ms || 6500));
  }

  async function initHero() {
    if (!WT.qs("#heroCarousel")) return;
    heroSlides = await WTContent.listHeroSlides();
    if (!heroSlides.length) return;
    const dots = WT.qs("#heroDots");
    if (dots) dots.innerHTML = heroSlides.map((_, i) => `<button aria-label="Slide ${i + 1}" data-index="${i}"></button>`).join("");
    dots?.addEventListener("click", e => { const b = e.target.closest("button"); if (b) showHero(Number(b.dataset.index)); });
    showHero(0);
  }

  function postImages(post) {
    const list = [];
    const seen = new Set();
    const add = (item) => {
      if (!item) return;
      if (Array.isArray(item)) {
        item.forEach(add);
        return;
      }
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (!trimmed || trimmed === "null" || trimmed === "undefined") return;
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          try {
            add(JSON.parse(trimmed));
            return;
          } catch (_) {}
        }
        if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("images/") || trimmed.startsWith("/") || trimmed.startsWith("data:image/")) {
          const url = WT.sanitizeImageUrl(trimmed, "");
          if (url && !seen.has(url)) {
            seen.add(url);
            list.push({ url });
          }
        }
        return;
      }
      if (typeof item === "object") {
        const nested = item.attachments || item.images || item.image_urls || item.items || item.files || item.media;
        if (nested) add(nested);
        const rawUrl = item.url || item.publicUrl || item.public_url || item.image_url || item.src || item.href || "";
        if (rawUrl) add(rawUrl);
      }
    };
    add(post.attachments);
    add(post.images);
    add(post.image_urls);
    add(post.media);
    add(post.files);
    add(post.image_url);
    return list.slice(0, 6);
  }

  function authorPayloadAttr(author = {}) {
    return encodeURIComponent(JSON.stringify({
      id: author.id || "",
      full_name: author.full_name || "Estudiante",
      photo_url: author.photo_url || "",
      role: author.role || "user",
      badges: Array.isArray(author.badges) ? author.badges : [],
      bio: author.bio || "",
      city: author.city || "",
      sponsor: author.sponsor || "",
      program_year: author.program_year || ""
    }));
  }

  function renderHomeAuthorTrigger(author = {}) {
    const authorName = author.full_name || "Estudiante";
    const authorAvatar = WT.escapeHTML(WT.sanitizeImageUrl(author.photo_url, "images/placeholder-avatar.png"));
    const payload = authorPayloadAttr(author);
    return `<button class="wt-home-author-trigger" type="button" data-open-home-public-profile="${payload}" aria-label="Ver perfil de ${WT.escapeHTML(authorName)}">
      <img class="reddit-avatar" src="${authorAvatar}" alt="Foto de ${WT.escapeHTML(authorName)}">
    </button>`;
  }

  function renderHomeAttachmentGallery(post) {
    const images = postImages(post);
    if (!images.length) return "";

    const encoded = encodeURIComponent(JSON.stringify(images.map(img => ({ url: img.url }))));
    const hero = images[0];
    const thumbs = images.slice(1, 4);
    const remaining = Math.max(0, images.length - 4);

    if (images.length === 1) {
      return `<div class="wt-home-gallery-shell is-single" data-home-gallery="${encoded}">
        <button class="wt-home-gallery-hero" type="button" data-home-open-image data-home-image-index="0" aria-label="Abrir imagen principal">
          <img src="${WT.escapeHTML(hero.url)}" alt="Imagen de la publicación">
        </button>
      </div>`;
    }

    return `<div class="wt-home-gallery-shell" data-home-gallery="${encoded}">
      <button class="wt-home-gallery-hero" type="button" data-home-open-image data-home-image-index="0" aria-label="Abrir imagen 1">
        <img src="${WT.escapeHTML(hero.url)}" alt="Imagen principal de la publicación">
      </button>
      <div class="wt-home-gallery-thumbs">
        ${thumbs.map((img, idx) => `
          <button class="wt-home-gallery-thumb" type="button" data-home-open-image data-home-image-index="${idx + 1}" aria-label="Abrir imagen ${idx + 2}">
            <img src="${WT.escapeHTML(img.url)}" alt="Imagen ${idx + 2}">
            ${remaining && idx === thumbs.length - 1 ? `<span class="wt-home-gallery-more">+${remaining}</span>` : ""}
          </button>`).join("")}
      </div>
    </div>`;
  }

  function openHomeImageViewer(images = [], startIndex = 0) {
    const list = (images || []).map(item => {
      if (typeof item === "string") return { url: WT.sanitizeImageUrl(item, "") };
      return { url: WT.sanitizeImageUrl(item?.url || "", "") };
    }).filter(item => item.url);
    if (!list.length) return;

    document.querySelectorAll(".forum-image-viewer").forEach(el => el.remove());

    let current = Math.max(0, Math.min(list.length - 1, Number(startIndex) || 0));
    let closed = false;
    const backdrop = document.createElement("div");
    backdrop.className = "forum-image-viewer wt-home-image-viewer";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.innerHTML = `<button class="forum-image-viewer-close" type="button" aria-label="Cerrar">×</button>
      <button class="forum-image-viewer-nav prev" type="button" aria-label="Imagen anterior">‹</button>
      <figure><img alt="Imagen de la publicación" draggable="false"></figure>
      <button class="forum-image-viewer-nav next" type="button" aria-label="Imagen siguiente">›</button>
      <div class="forum-image-viewer-count" aria-live="polite"></div>`;

    const img = WT.qs("figure img", backdrop);
    const counter = WT.qs(".forum-image-viewer-count", backdrop);
    const prev = WT.qs(".forum-image-viewer-nav.prev", backdrop);
    const next = WT.qs(".forum-image-viewer-nav.next", backdrop);
    const oldHtmlOverflow = document.documentElement.style.overflow;
    const oldBodyOverflow = document.body.style.overflow;

    img.decoding = "async";
    img.loading = "eager";

    const preloadAround = () => {
      if (list.length <= 1) return;
      [-1, 1].forEach(delta => {
        const preload = new Image();
        preload.decoding = "async";
        preload.src = list[(current + delta + list.length) % list.length].url;
      });
    };
    const update = () => {
      const nextUrl = list[current].url;
      img.removeAttribute("src");
      requestAnimationFrame(() => { img.src = nextUrl; });
      counter.textContent = list.length > 1 ? `${current + 1} / ${list.length}` : "";
      prev.hidden = list.length <= 1;
      next.hidden = list.length <= 1;
      preloadAround();
    };
    const go = (delta) => {
      if (list.length <= 1) return;
      current = (current + delta + list.length) % list.length;
      update();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      document.documentElement.style.overflow = oldHtmlOverflow;
      document.body.style.overflow = oldBodyOverflow;
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
    };
    function onKey(event) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    WT.qs(".forum-image-viewer-close", backdrop).addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); close(); });
    prev.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); go(-1); });
    next.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); go(1); });
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });

    let startX = 0;
    let startY = 0;
    backdrop.addEventListener("touchstart", (event) => {
      const t = event.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    }, { passive: true });
    backdrop.addEventListener("touchend", (event) => {
      const t = event.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.18) go(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener("keydown", onKey);

    update();
    document.body.appendChild(backdrop);
  }

  function bindHomeForumGallery(root) {
    if (!root || root.dataset.homeGalleryBound === "1") return;
    root.dataset.homeGalleryBound = "1";
    root.addEventListener("click", (event) => {
      const imageButton = event.target.closest("[data-home-open-image]");
      if (imageButton && root.contains(imageButton)) {
        event.preventDefault();
        event.stopPropagation();
        const gallery = imageButton.closest("[data-home-gallery]");
        if (!gallery) return;
        let urls = [];
        try { urls = JSON.parse(decodeURIComponent(gallery.dataset.homeGallery || "")); } catch (_) { urls = []; }
        openHomeImageViewer(urls, Number(imageButton.dataset.homeImageIndex || 0));
        return;
      }

      const authorButton = event.target.closest("[data-open-home-public-profile]");
      if (authorButton && root.contains(authorButton)) {
        event.preventDefault();
        event.stopPropagation();
        let author = {};
        try { author = JSON.parse(decodeURIComponent(authorButton.dataset.openHomePublicProfile || "")); } catch (_) { author = {}; }
        if (window.WTAuth?.showPublicProfileModal) window.WTAuth.showPublicProfileModal(author);
      }
    });
  }

  function renderLatestPosts(posts) {
    const root = WT.qs("#latestPosts"); if (!root) return;
    root.classList.add("wt-home-forum-feed", "wt-home-reddit-feed");
    root.innerHTML = posts.length ? posts.map(post => {
      const author = post.author || {};
      const body = post.body || "";
      const excerpt = WT.escapeHTML(body.slice(0, 220)) + (body.length > 220 ? "..." : "");
      const authorName = author.full_name || "Estudiante";
      const authorAvatar = WT.escapeHTML(WT.sanitizeImageUrl(author.photo_url, "images/placeholder-avatar.png"));
      const category = post.forum_categories?.name || "Foro";
      const gallery = renderHomeAttachmentGallery(post);
      return `<article class="reddit-post-card wt-home-reddit-card latest-post-card wt-home-post-redesign">
        <div class="reddit-post-meta wt-home-reddit-meta">
          ${renderHomeAuthorTrigger(author)}
          <div class="reddit-post-meta-text">
            <div class="reddit-post-meta-line">
              <strong>${WT.escapeHTML(authorName)}</strong>
              <span>•</span>
              <span>${WT.formatDate(post.created_at)}</span>
            </div>
            <div class="reddit-category-text">
              <span>${WT.escapeHTML(category)}</span>
              ${WT.renderRoleBadge(author.role || "user")}
              ${WT.renderUserBadges(author.badges || [])}
            </div>
          </div>
          <a class="reddit-menu-dot" href="post.html?id=${post.id}" title="Abrir publicación">•••</a>
        </div>
        <h2 class="reddit-post-title"><a href="post.html?id=${post.id}">${WT.escapeHTML(post.title)}</a></h2>
        ${excerpt ? `<p class="reddit-post-excerpt">${excerpt}</p>` : ""}
        ${gallery}
        <div class="reddit-actions wt-home-reddit-actions">
          <span class="reddit-action-pill reddit-vote-pill">
            <span aria-hidden="true">↑</span>
            <span class="reddit-score">${post.likes_count || 0}</span>
            <span aria-hidden="true">↓</span>
          </span>
          <a class="reddit-action-pill" href="post.html?id=${post.id}">💬 ${post.comments_count || 0}</a>
          <a class="reddit-action-pill" href="post.html?id=${post.id}" title="Abrir publicación">Abrir</a>
        </div>
      </article>`;
    }).join("") : `<div class="empty-state">Todavía no hay publicaciones aprobadas.</div>`;
    bindHomeForumGallery(root);
  }


  function pagePosition() {
    const map = { home: "home", services: "services", courses: "courses", forum: "forum", practice: "practice" };
    return map[WT.page] || "home";
  }

  function announcementStorageKey(item) {
    const today = new Date().toISOString().slice(0, 10);
    const frequency = item.popup_frequency || "once";
    if (frequency === "daily") return `wt_popup_daily_${item.id}_${today}`;
    if (frequency === "always") return "";
    return `wt_popup_once_${item.id}`;
  }

  function canShowPopup(item) {
    const key = announcementStorageKey(item);
    if (!key) return true;
    return localStorage.getItem(key) !== "shown";
  }

  function markPopupShown(item) {
    const key = announcementStorageKey(item);
    if (key) localStorage.setItem(key, "shown");
  }

  function popupImageHTML(item) {
    const popupImage = WT.sanitizeImageUrl(item.image_url, "");
    if (!popupImage) return "";
    return `<div class="announcement-popup-image"><img src="${WT.escapeHTML(popupImage)}" alt="${WT.escapeHTML(item.title || "Anuncio")}" style="${WTContent.imageStyle(item)}"></div>`;
  }

  function showAnnouncementPopup(item) {
    if (!item || !canShowPopup(item)) return;
    markPopupShown(item);
    const ctaText = (item.cta_text || "").trim();
    const ctaUrl = (item.cta_url || "").trim();
    const actions = [{ label: "Cerrar", className: "btn-soft" }];
    if (ctaText && ctaUrl) {
      actions.push({ label: ctaText, className: "btn-primary", onClick: () => { window.location.href = ctaUrl; } });
    }
    WT.showModal({
      title: item.title || "Anuncio",
      className: "announcement-popup-modal",
      body: `${popupImageHTML(item)}<p class="announcement-popup-text">${WT.escapeHTML(plainFromRich(item.description || ""))}</p>`,
      actions
    });
  }

  async function initAnnouncementPopups() {
    if (!WTContent.listPopupAnnouncements) return;
    const popups = await WTContent.listPopupAnnouncements({ position: pagePosition(), limit: 3 });
    const item = popups.find(canShowPopup);
    if (!item) return;
    const delay = Math.max(0, Number(item.popup_delay_ms || 1500));
    setTimeout(() => showAnnouncementPopup(item), delay);
  }

  async function initAboutSection() {
    const aboutTitle = WT.qs("#aboutTitle");
    if (!aboutTitle) return;
    const [eyebrow, title, text, btnText, btnUrl] = await Promise.all([
      WTContent.getPublicSetting("home_about_eyebrow", "Sobre nosotros"),
      WTContent.getPublicSetting("home_about_title", "Una comunidad dominicana para prepararte mejor"),
      WTContent.getPublicSetting("home_about_text", "Work and Travel RD reúne orientación, práctica consular, servicios, cursos y experiencias reales para estudiantes dominicanos que quieren vivir su proceso J1 con más claridad."),
      WTContent.getPublicSetting("home_about_button_text", "Conocer servicios"),
      WTContent.getPublicSetting("home_about_button_url", "servicios.html")
    ]);
    WT.qs("#aboutEyebrow").textContent = eyebrow;
    aboutTitle.textContent = title;
    WT.qs("#aboutText").textContent = text;
    const btn = WT.qs("#aboutBtn");
    if (btn) { btn.textContent = btnText; btn.href = btnUrl || "servicios.html"; }
  }

  async function initHome() {
    await initHero();
    await initAboutSection();
    renderAnnouncements(await WTContent.listAnnouncements({ featured: true, limit: 3 }));
    initAnnouncementPopups();
    renderServices(await WTContent.listServices({ featured: true, limit: 6 }));
    renderCourses(await WTContent.listCourses({ featured: true, limit: 6 }));
    renderLatestPosts(await WTContent.latestPosts(4));
  }

  async function initServicesPage() {
    const search = WT.qs("#serviceSearch"), featured = WT.qs("#serviceFeatured");
    const load = async () => renderServices(await WTContent.listServices({ search: search?.value || "", featured: featured?.value ? featured.value === "true" : null, limit: 30 }));
    search?.addEventListener("input", WT.debounce ? WT.debounce(load, 300) : load);
    featured?.addEventListener("change", load);
    await load();
  }

  async function initCoursesPage() {
    const search = WT.qs("#courseSearch"), level = WT.qs("#courseLevel");
    const load = async () => renderCourses(await WTContent.listCourses({ search: search?.value || "", level: level?.value || "", limit: 30 }));
    search?.addEventListener("input", load);
    level?.addEventListener("change", load);
    await load();
  }


  function getQueryId() {
    return new URLSearchParams(location.search).get("id");
  }

  function detailImage(item) {
    return `<div class="detail-image"><img src="${WT.escapeHTML(WT.sanitizeImageUrl(item.image_url, 'images/placeholder-hero.jpg'))}" alt="${WT.escapeHTML(item.title || '')}" style="${WTContent.imageStyle(item)}"></div>`;
  }

  function detailGallery(item) {
    const gallery = WTContent.normalizeGallery ? WTContent.normalizeGallery(item.gallery_json || item.gallery_urls || item.gallery) : [];
    const unique = [...new Set(gallery.filter(Boolean))].filter(url => url !== item.image_url);
    if (!unique.length) return "";
    return `<section class="detail-guide-gallery"><h2>Imágenes de la guía</h2><p>Toca una imagen para verla mejor.</p><div class="guide-gallery-grid">${unique.map((url, i) => `<button type="button" class="guide-gallery-item" data-guide-image="${i}" aria-label="Abrir imagen ${i + 1}"><img src="${WT.escapeHTML(url)}" alt="Paso ${i + 1} de la guía" loading="lazy"></button>`).join("")}</div></section>`;
  }

  function bindDetailGallery(root, item) {
    const gallery = WTContent.normalizeGallery ? WTContent.normalizeGallery(item.gallery_json || item.gallery_urls || item.gallery) : [];
    const unique = [...new Set(gallery.filter(Boolean))].filter(url => url !== item.image_url);
    if (!unique.length || !root) return;
    root.addEventListener("click", event => {
      const btn = event.target.closest("[data-guide-image]");
      if (!btn) return;
      openHomeImageViewer(unique.map(url => ({ url })), Number(btn.dataset.guideImage) || 0);
    });
  }


  function parseMaybeJSON(value, fallback = null) {
    if (!value) return fallback;
    if (Array.isArray(value) || typeof value === "object") return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function defaultRecordUniversityGuides(item = {}) {
    return [{
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
      gallery_json: WTContent.normalizeGallery ? WTContent.normalizeGallery(item.gallery_json || item.gallery_urls || item.gallery) : []
    }];
  }

  function getServiceOptions(item = {}) {
    const configured = parseMaybeJSON(item.child_guides_json || item.service_options_json || item.options_json || item.guides_json, []);
    const list = Array.isArray(configured) ? configured : [];
    if (list.length) return list
      .filter(option => option && typeof option === "object")
      .map((option, index) => ({ ...option, id: option.id || `opcion-${index + 1}` }));

    const title = String(item.title || "").toLowerCase();
    const id = String(item.id || "").toLowerCase();
    if (id.includes("record") || id.includes("notas") || title.includes("récord de notas") || title.includes("record de notas")) return defaultRecordUniversityGuides(item);
    return [];
  }

  function optionLabel(item = {}) {
    const title = String(item.title || "").toLowerCase();
    const id = String(item.id || "").toLowerCase();
    if (id.includes("record") || title.includes("récord de notas") || title.includes("record de notas")) {
      return { eyebrow: "Opciones por universidad", lead: "Elige tu universidad para ver la guía completa. Cada institución puede tener pasos, requisitos y tiempos diferentes.", back: "Universidades" };
    }
    return { eyebrow: "Opciones del servicio", lead: "Elige una opción para ver la guía completa. Cada opción puede tener pasos, requisitos, enlaces e imágenes diferentes.", back: "Opciones" };
  }

  function renderServiceOptionList(root, item) {
    const options = getServiceOptions(item);
    const labels = optionLabel(item);
    const mainImage = WT.sanitizeImageUrl(item.image_url, "images/placeholder-hero.jpg");
    root.innerHTML = `<article class="detail-page-card guide-detail-card service-options-card">
      <div class="detail-body">
        <a class="link-pill" href="servicios.html">← Volver a servicios</a>
        <span class="eyebrow">${WT.escapeHTML(labels.eyebrow)}</span>
        <h1>${WT.escapeHTML(item.title || "Servicio")}</h1>
        <p class="detail-lead">${WT.escapeHTML(plainFromRich(item.description || labels.lead))}</p>
        <p class="service-options-help">${WT.escapeHTML(labels.lead)}</p>
        <div class="service-option-search-wrap">
          <input class="input service-option-search" type="search" placeholder="Buscar universidad u opción..." data-service-option-search>
        </div>
        <div class="service-option-grid" data-service-option-grid>
          ${options.map((option, index) => {
            const searchText = [option.title, option.subtitle, option.summary, option.description, option.badge, option.duration, option.modality, option.level].filter(Boolean).join(' ').toLowerCase();
            return `<button type="button" class="service-option-card" data-service-option="${index}" data-search="${WT.escapeHTML(searchText)}">
            <span class="service-option-logo"><img src="${WT.escapeHTML(WT.sanitizeImageUrl(option.logo_url || option.image_url || mainImage, 'images/placeholder-logo.png'))}" alt="${WT.escapeHTML(option.subtitle || option.title || 'Opción')}" loading="lazy"></span>
            <span class="service-option-content">
              <span class="service-option-kicker">${WT.escapeHTML(option.subtitle || option.badge || 'Guía disponible')}</span>
              <b>${WT.escapeHTML(option.title || option.subtitle || 'Opción')}</b>
              <small>${WT.escapeHTML(plainFromRich(option.summary || option.description || 'Toca para ver los pasos completos.'))}</small>
              <span class="service-option-meta">
                ${option.badge ? `<em>${WT.escapeHTML(option.badge)}</em>` : ""}
                ${option.duration ? `<em>${WT.escapeHTML(option.duration)}</em>` : ""}
                ${option.modality ? `<em>${WT.escapeHTML(option.modality)}</em>` : ""}
                ${option.level ? `<em>${WT.escapeHTML(option.level)}</em>` : ""}
              </span>
            </span>
            <span class="service-option-arrow">›</span>
          </button>`}).join("")}
        </div>
        <div class="empty-state mini service-option-empty hidden" data-service-option-empty>No se encontró ninguna opción con ese texto.</div>
      </div>
    </article>`;
    const searchInput = WT.qs("[data-service-option-search]", root);
    const empty = WT.qs("[data-service-option-empty]", root);
    const applySearch = () => {
      const q = String(searchInput?.value || "").trim().toLowerCase();
      let visible = 0;
      WT.qsa("[data-service-option]", root).forEach(card => {
        const ok = !q || String(card.dataset.search || "").includes(q);
        card.classList.toggle("hidden", !ok);
        if (ok) visible += 1;
      });
      empty?.classList.toggle("hidden", visible !== 0);
    };
    searchInput?.addEventListener("input", applySearch);
    root.addEventListener("click", event => {
      const btn = event.target.closest("[data-service-option]");
      if (!btn) return;
      const option = options[Number(btn.dataset.serviceOption) || 0];
      if (!option) return;
      location.hash = option.id || "opcion";
      renderServiceOptionDetail(root, item, option);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function renderServiceOptionDetail(root, item, option) {
    const labels = optionLabel(item);
    const optionForGallery = { ...option, image_url: option.image_url || option.logo_url || item.image_url };
    const gallery = WTContent.normalizeGallery ? WTContent.normalizeGallery(option.gallery_json || option.gallery_urls || option.gallery || item.gallery_json || item.gallery_urls || item.gallery) : [];
    const details = option.details || option.long_description || option.description || option.summary || "";
    root.innerHTML = `<article class="detail-page-card guide-detail-card service-option-detail-card">
      <div class="detail-body">
        <button type="button" class="link-pill as-button" id="backToServiceOptions">← ${WT.escapeHTML(labels.back)}</button>
        <div class="service-option-detail-head">
          <span class="service-option-logo large"><img src="${WT.escapeHTML(WT.sanitizeImageUrl(option.logo_url || option.image_url || item.image_url, 'images/placeholder-logo.png'))}" alt="${WT.escapeHTML(option.subtitle || option.title || '')}"></span>
          <div>
            <span class="eyebrow">${WT.escapeHTML(option.subtitle || option.badge || 'Guía')}</span>
            <h1>${WT.escapeHTML(option.title || '')}</h1>
            <p class="detail-lead">${WT.escapeHTML(plainFromRich(option.summary || option.description || ''))}</p>
          </div>
        </div>
        <div class="detail-meta-grid">${[["Estado", option.badge || "Disponible"],["Duración", option.duration],["Nivel", option.level],["Modalidad", option.modality]].filter(x => x[1]).map(([k,v]) => `<div><span>${WT.escapeHTML(k)}</span><strong>${WT.escapeHTML(v)}</strong></div>`).join('')}</div>
        ${option.guide_note || option.note ? `<div class="guide-note-box">${renderRichText(option.guide_note || option.note)}</div>` : ""}
        <div class="detail-rich-text">${renderRichText(details)}</div>
        ${detailGallery({ ...optionForGallery, gallery_json: gallery })}
        <div class="detail-actions"><a class="btn btn-soft" href="foro.html">Preguntar en el foro</a></div>
      </div>
    </article>`;
    const back = WT.qs("#backToServiceOptions", root);
    back?.addEventListener("click", () => { history.replaceState(null, "", location.pathname + location.search); renderServiceOptionList(root, item); });
    bindDetailGallery(root, { ...optionForGallery, gallery_json: gallery });
  }

  function renderDetail(root, item, type) {
    if (!root) return;
    if (!item) { root.innerHTML = `<div class="empty-state">No se encontró este ${type === 'course' ? 'curso' : 'servicio'}.</div>`; return; }
    const isCourse = type === 'course';
    const serviceOptions = !isCourse ? getServiceOptions(item) : [];
    if (serviceOptions.length) {
      const hash = decodeURIComponent(String(location.hash || '').replace(/^#/, ''));
      const selected = hash ? serviceOptions.find(g => String(g.id || '') === hash) : null;
      if (selected) renderServiceOptionDetail(root, item, selected);
      else renderServiceOptionList(root, item);
      return;
    }
    const meta = isCourse
      ? [["Precio", item.price], ["Duración", item.duration], ["Nivel", item.level], ["Modalidad", item.modality], ["Profesor", item.teacher], ["Institución", item.institution]]
      : [["Tipo", item.icon], ["Precio / costo", item.price], ["Duración", item.duration], ["Nivel", item.level], ["Modalidad", item.modality], ["Estado", item.active ? "Disponible" : "No disponible"]];
    const details = item.details || item.long_description || item.description || "";
    const selfDetailUrl = `servicio.html?id=${item.id}`;
    const rawCtaUrl = String(item.cta_url || "");
    const ctaUrl = isCourse ? (item.cta_url || '#') : (rawCtaUrl && !rawCtaUrl.includes(selfDetailUrl) ? rawCtaUrl : "foro.html");
    const ctaText = isCourse ? (item.cta_text || 'Solicitar información') : (item.cta_text && !rawCtaUrl.includes(selfDetailUrl) ? item.cta_text : "Preguntar / confirmar enlace");
    root.innerHTML = `<article class="detail-page-card guide-detail-card">
      ${detailImage(item)}
      <div class="detail-body">
        <a class="link-pill" href="${isCourse ? 'cursos.html' : 'servicios.html'}">← Volver</a>
        <span class="eyebrow">${isCourse ? 'Curso disponible' : 'Guía disponible'}</span>
        <h1>${WT.escapeHTML(item.title || '')}</h1>
        <p class="detail-lead">${WT.escapeHTML(plainFromRich(item.description || ''))}</p>
        <div class="detail-meta-grid">${meta.filter(x => x[1]).map(([k,v]) => `<div><span>${WT.escapeHTML(k)}</span><strong>${WT.escapeHTML(v)}</strong></div>`).join('')}</div>
        <div class="detail-rich-text">${renderRichText(details)}</div>
        ${detailGallery(item)}
        <div class="detail-actions">
          <a class="btn btn-primary" href="${WT.escapeHTML(ctaUrl)}">${WT.escapeHTML(ctaText)}</a>
          ${isCourse ? `<a class="btn btn-soft" href="${WT.escapeHTML(item.forum_url || 'foro.html')}">Preguntar en el foro</a>` : `<a class="btn btn-soft" href="foro.html">Preguntar en el foro</a>`}
        </div>
      </div>
    </article>`;
    bindDetailGallery(root, item);
  }

  async function initServiceDetailPage() {
    renderDetail(WT.qs("#serviceDetailRoot"), await WTContent.getService(getQueryId()), 'service');
  }

  async function initCourseDetailPage() {
    renderDetail(WT.qs("#courseDetailRoot"), await WTContent.getCourse(getQueryId()), 'course');
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (WT.page === "home") initHome();
    if (WT.page === "services") initServicesPage();
    if (WT.page === "courses") initCoursesPage();
    if (WT.page === "service-detail") initServiceDetailPage();
    if (WT.page === "course-detail") initCourseDetailPage();
  });
})();
