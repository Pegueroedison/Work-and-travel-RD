(() => {
  "use strict";

  const NAV_PAGES = [
    { page: "home", href: "index.html", label: "Inicio" },
    { page: "services", href: "servicios.html", label: "Guía" },
    { page: "courses", href: "cursos.html", label: "Servicios" },
    { page: "forum", href: "foro.html", label: "Foro" },
    { page: "practice", href: "practica-consular.html", label: "Práctica" }
  ];

  function pageName() {
    return document.body?.dataset?.page || "";
  }

  function isAllowedPage() {
    return NAV_PAGES.some(item => item.page === pageName());
  }

  function currentIndex() {
    return NAV_PAGES.findIndex(item => item.page === pageName());
  }

  function shouldIgnoreSwipe(event) {
    const target = event.target;
    if (!target) return false;

    if (document.body.classList.contains("wt-modal-open") || document.body.classList.contains("wt-image-viewer-open")) return true;
    if (document.querySelector(".modal-backdrop, .image-editor-fullscreen, .forum-image-viewer, .forum-image-viewer-backdrop")) return true;

    const interactive = target.closest?.(
      "input, textarea, select, option, button, a, label, [contenteditable='true'], .forum-attachment-gallery, .guide-gallery-grid, .forum-image-viewer, .image-editor-stage, .image-editor-frame, .comment-composer-bar, .forum-comment-composer, .fa-tabs-wrap, .fa-filter-sheet"
    );
    if (interactive) return true;

    const scrollable = target.closest?.("[data-no-swipe], .horizontal-scroll, .carousel, .forum-selected-images, .fa-tabs-scroll");
    if (scrollable) return true;

    return false;
  }

  function showHint() {
    // Guía visual desactivada: la navegación debe sentirse como app, sin cartel flotante.
  }

  function navigate(direction) {
    const idx = currentIndex();
    if (idx < 0) return;

    const nextIdx = direction === "next" ? idx + 1 : idx - 1;
    const next = NAV_PAGES[nextIdx];
    if (!next) return;

    document.body.classList.add(direction === "next" ? "swipe-page-next" : "swipe-page-prev");
    // Navegación rápida: sin esperar cartel ni animación larga.
    requestAnimationFrame(() => window.location.assign(next.href));
  }

  function initSwipeNavigation() {
    if (!isAllowedPage()) return;
    if (window.__WT_SWIPE_NAV_BOUND__) return;
    window.__WT_SWIPE_NAV_BOUND__ = true;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;
    let moved = false;

    document.addEventListener("touchstart", event => {
      if (event.touches.length !== 1) return;
      if (shouldIgnoreSwipe(event)) return;

      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      tracking = true;
      moved = false;
    }, { passive: true });

    document.addEventListener("touchmove", event => {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (Math.abs(dy) > 42 && Math.abs(dy) > Math.abs(dx)) {
        tracking = false;
        return;
      }

      if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        moved = true;
        // Bloquea el arrastre horizontal de la página, pero deja intacto el scroll vertical.
        event.preventDefault();
      }
    }, { passive: false });

    document.addEventListener("touchend", event => {
      if (!tracking) return;
      tracking = false;
      if (!moved) return;

      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const elapsed = Date.now() - startTime;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      const validDistance = absX >= Math.min(72, window.innerWidth * 0.17);
      const validVelocity = absX >= 46 && elapsed < 460;
      const mostlyHorizontal = absX > absY * 1.45;

      if (!mostlyHorizontal || !(validDistance || validVelocity)) return;

      // En navegación occidental: deslizar hacia la izquierda avanza, hacia la derecha regresa.
      if (dx < 0) navigate("next");
      else navigate("prev");
    }, { passive: true });

    // Soporte básico con mouse/trackpad para probar en PC arrastrando.
    let mouseDown = false;
    let mouseX = 0;
    let mouseY = 0;
    document.addEventListener("mousedown", event => {
      if (event.button !== 0 || shouldIgnoreSwipe(event)) return;
      mouseDown = true;
      mouseX = event.clientX;
      mouseY = event.clientY;
    });
    document.addEventListener("mousemove", event => {
      if (!mouseDown) return;
      const dx = event.clientX - mouseX;
      const dy = event.clientY - mouseY;
      if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4) event.preventDefault();
    });

    document.addEventListener("mouseup", event => {
      if (!mouseDown) return;
      mouseDown = false;
      const dx = event.clientX - mouseX;
      const dy = event.clientY - mouseY;
      if (Math.abs(dx) > 150 && Math.abs(dx) > Math.abs(dy) * 2) {
        if (dx < 0) navigate("next");
        else navigate("prev");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSwipeNavigation);
  } else {
    initSwipeNavigation();
  }
})();
