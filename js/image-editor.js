(() => {
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 10;

  function aspectToNumber(aspect = "1:1") {
    if (typeof aspect === "number") return aspect || 1;
    const [w, h] = String(aspect).split(":").map(Number);
    return w && h ? w / h : 1;
  }

  function aspectToCss(aspect = "1:1") {
    if (typeof aspect === "number") return `${aspect} / 1`;
    const [w, h] = String(aspect).split(":").map(Number);
    return w && h ? `${w} / ${h}` : "1 / 1";
  }

  function aspectLabel(aspect = "1:1") {
    return String(aspect || "1:1");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo procesar la imagen.")), type, quality);
    });
  }

  async function makeBlob(canvas, maxBytes = 1900000) {
    const types = ["image/webp", "image/jpeg"];
    const qualities = [0.94, 0.9, 0.86, 0.8, 0.72, 0.64, 0.56, 0.48, 0.38];
    for (const type of types) {
      for (const q of qualities) {
        const blob = await canvasToBlob(canvas, type, q);
        if (blob.size <= maxBytes) return blob;
      }
    }
    return await canvasToBlob(canvas, "image/jpeg", 0.34);
  }

  function open({
    file,
    src = "",
    aspectRatio = "1:1",
    title = "Ajustar imagen",
    maxOutputWidth = 1200,
    maxBytes = 1900000,
    shape = "rect"
  } = {}) {
    return new Promise((resolve, reject) => {
      if (!file && !src) return reject(new Error("No se recibió imagen."));

      const objectUrl = src || URL.createObjectURL(file);
      const shouldRevoke = !src;
      const ratio = aspectToNumber(aspectRatio);
      const ratioCss = aspectToCss(aspectRatio);
      let finished = false;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const body = `
        <div class="image-editor-final" data-editor-shape="${shape}">
          <div class="image-editor-final-toolbar">
            <strong>Vista final ${aspectLabel(aspectRatio)}</strong>
            <span>Mueve la imagen, ajusta el zoom y guarda exactamente lo que ves dentro del marco.</span>
          </div>
          <div class="image-editor-final-frame ${shape === "circle" ? "is-circle" : ""}" id="imageEditorFrame" style="--editor-aspect:${ratioCss}">
            <img id="imageEditorImg" alt="Imagen para ajustar" draggable="false">
            <div class="image-editor-final-grid" aria-hidden="true"></div>
          </div>
          <div class="image-editor-final-controls">
            <label>Zoom
              <input id="imageEditorZoom" type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="1">
            </label>
            <label>Horizontal
              <input id="imageEditorPanX" type="range" min="-100" max="100" step="1" value="0">
            </label>
            <label>Vertical
              <input id="imageEditorPanY" type="range" min="-100" max="100" step="1" value="0">
            </label>
            <div class="image-editor-final-actions">
              <button type="button" class="btn btn-soft btn-small" id="imageEditorCenter">Centrar</button>
              <button type="button" class="btn btn-soft btn-small" id="imageEditorFitMore">Ampliar</button>
            </div>
          </div>
        </div>`;

      const modal = WT.showModal({
        title,
        body,
        closeOnBackdrop: false,
        className: "image-editor-modal image-editor-final-modal",
        actions: [
          {
            label: "Cancelar",
            className: "btn-soft",
            onClick: () => {
              cleanup();
              finished = true;
              reject(new Error("Edición cancelada"));
            }
          },
          {
            label: "Usar esta imagen",
            className: "btn-primary",
            close: false,
            onClick: async ({ close, button }) => {
              try {
                button.disabled = true;
                button.textContent = "Procesando...";
                const output = await exportImage();
                cleanup();
                finished = true;
                close();
                resolve(output);
              } catch (error) {
                button.disabled = false;
                button.textContent = "Usar esta imagen";
                WT.toast(error.message || "No se pudo procesar la imagen", "error");
              }
            }
          }
        ]
      });

      const frame = WT.qs("#imageEditorFrame", modal.element);
      const img = WT.qs("#imageEditorImg", modal.element);
      const zoomInput = WT.qs("#imageEditorZoom", modal.element);
      const panXInput = WT.qs("#imageEditorPanX", modal.element);
      const panYInput = WT.qs("#imageEditorPanY", modal.element);
      const centerBtn = WT.qs("#imageEditorCenter", modal.element);
      const fitMoreBtn = WT.qs("#imageEditorFitMore", modal.element);
      const closeButton = WT.qs(".modal-close", modal.element);

      const state = {
        zoom: 1,
        panX: 0,
        panY: 0,
        baseScale: 1,
        displayW: 0,
        displayH: 0,
        dragging: false,
        dragStartX: 0,
        dragStartY: 0,
        startPanX: 0,
        startPanY: 0
      };

      img.decoding = "async";
      img.crossOrigin = "anonymous";
      img.src = objectUrl;
      img.onload = () => reset();
      img.onerror = () => WT.toast("No se pudo cargar la imagen seleccionada.", "error");

      function cleanup() {
        window.removeEventListener("resize", render);
        document.body.style.overflow = previousOverflow;
        if (shouldRevoke) URL.revokeObjectURL(objectUrl);
      }

      closeButton?.addEventListener("click", () => {
        if (!finished) {
          cleanup();
          finished = true;
          reject(new Error("Edición cancelada"));
        }
      }, { once: true });

      function frameRect() {
        return frame.getBoundingClientRect();
      }

      function calcBase() {
        if (!img.naturalWidth || !img.naturalHeight) return;
        const rect = frameRect();
        state.baseScale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
        state.displayW = img.naturalWidth * state.baseScale;
        state.displayH = img.naturalHeight * state.baseScale;
      }

      function maxPan() {
        const rect = frameRect();
        const scaledW = state.displayW * state.zoom;
        const scaledH = state.displayH * state.zoom;
        return {
          x: Math.max(0, (scaledW - rect.width) / 2),
          y: Math.max(0, (scaledH - rect.height) / 2)
        };
      }

      function panPixels() {
        const max = maxPan();
        return {
          x: (state.panX / 100) * max.x,
          y: (state.panY / 100) * max.y
        };
      }

      function syncInputs() {
        if (zoomInput) zoomInput.value = String(state.zoom);
        if (panXInput) panXInput.value = String(Math.round(state.panX));
        if (panYInput) panYInput.value = String(Math.round(state.panY));
      }

      function render() {
        calcBase();
        state.zoom = clamp(Number(state.zoom) || 1, MIN_ZOOM, MAX_ZOOM);
        state.panX = clamp(Number(state.panX) || 0, -100, 100);
        state.panY = clamp(Number(state.panY) || 0, -100, 100);

        const pan = panPixels();
        img.style.width = `${state.displayW}px`;
        img.style.height = `${state.displayH}px`;
        img.style.transform = `translate3d(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px), 0) scale(${state.zoom})`;
        syncInputs();
      }

      function reset() {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        render();
      }

      function zoomAt(nextZoom) {
        state.zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
        render();
      }

      zoomInput?.addEventListener("input", () => zoomAt(Number(zoomInput.value || 1)));
      panXInput?.addEventListener("input", () => {
        state.panX = Number(panXInput.value || 0);
        render();
      });
      panYInput?.addEventListener("input", () => {
        state.panY = Number(panYInput.value || 0);
        render();
      });
      centerBtn?.addEventListener("click", reset);
      fitMoreBtn?.addEventListener("click", () => zoomAt(Math.min(MAX_ZOOM, state.zoom + 0.35)));

      frame.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        frame.setPointerCapture?.(event.pointerId);
        state.dragging = true;
        state.dragStartX = event.clientX;
        state.dragStartY = event.clientY;
        state.startPanX = state.panX;
        state.startPanY = state.panY;
      });

      frame.addEventListener("pointermove", (event) => {
        if (!state.dragging) return;
        event.preventDefault();
        const max = maxPan();
        const dx = event.clientX - state.dragStartX;
        const dy = event.clientY - state.dragStartY;

        state.panX = max.x ? state.startPanX + (dx / max.x) * 100 : 0;
        state.panY = max.y ? state.startPanY + (dy / max.y) * 100 : 0;
        render();
      });

      function stopDrag(event) {
        if (!state.dragging) return;
        state.dragging = false;
        try { frame.releasePointerCapture?.(event.pointerId); } catch (_) {}
      }

      frame.addEventListener("pointerup", stopDrag);
      frame.addEventListener("pointercancel", stopDrag);
      frame.addEventListener("lostpointercapture", stopDrag);

      frame.addEventListener("wheel", (event) => {
        event.preventDefault();
        const factor = event.deltaY > 0 ? 0.92 : 1.08;
        zoomAt(state.zoom * factor);
      }, { passive: false });

      window.addEventListener("resize", render);

      function sourceCrop() {
        const rect = frameRect();
        const pan = panPixels();
        const scale = state.baseScale * state.zoom;
        const cropW = rect.width / scale;
        const cropH = rect.height / scale;

        let cropX = (img.naturalWidth / 2) - ((rect.width / 2 + pan.x) / scale);
        let cropY = (img.naturalHeight / 2) - ((rect.height / 2 + pan.y) / scale);

        cropX = clamp(cropX, 0, Math.max(0, img.naturalWidth - cropW));
        cropY = clamp(cropY, 0, Math.max(0, img.naturalHeight - cropH));

        return { cropX, cropY, cropW, cropH };
      }

      async function exportImage() {
        if (!img.naturalWidth || !img.naturalHeight) throw new Error("Espera a que la imagen cargue primero.");
        render();
        const rect = frameRect();
        const outW = Math.round(Math.min(maxOutputWidth, Math.max(640, rect.width * 2)));
        const outH = Math.round(outW / ratio);
        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;

        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outW, outH);

        const { cropX, cropY, cropW, cropH } = sourceCrop();
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

        const blob = await makeBlob(canvas, maxBytes);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
        const pan = panPixels();

        return {
          blob,
          dataUrl,
          cropData: {
            exact_crop: true,
            aspectRatio,
            shape,
            zoom: Number(state.zoom.toFixed(3)),
            pan_x_percent: Math.round(state.panX),
            pan_y_percent: Math.round(state.panY),
            pan_x_px: Math.round(pan.x),
            pan_y_px: Math.round(pan.y),
            source_x: Number(cropX.toFixed(2)),
            source_y: Number(cropY.toFixed(2)),
            source_width: Number(cropW.toFixed(2)),
            source_height: Number(cropH.toFixed(2)),
            output_width: outW,
            output_height: outH
          }
        };
      }
    });
  }

  function bindInput(input, options, callback) {
    input?.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        callback(await open({ file, ...options }));
      } catch (error) {
        if (error.message !== "Edición cancelada") WT.toast(error.message, "error");
      }
    });
  }

  window.WTImageEditor = { open, bindInput };
})();
