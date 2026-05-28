(() => {
  const view = () => WT.qs("#adminView");
  const editedImages = new WeakMap();
  const desktopEditedImages = new WeakMap();

  const DESTINATIONS = [
    { value: "index.html", label: "Inicio" },
    { value: "servicios.html", label: "Guía" },
    { value: "cursos.html", label: "Servicios" },
    { value: "foro.html", label: "Foro de estudiantes" },
    { value: "practica-consular.html", label: "Práctica consular" },
    { value: "admin.html", label: "Panel admin" },
    { value: "servicio.html", label: "Página detalle servicio" },
    { value: "curso.html", label: "Página detalle curso" },
    { value: "#servicios", label: "Sección servicios en inicio" },
    { value: "#cursos", label: "Sección cursos en inicio" },
    { value: "#foro", label: "Sección foro en inicio" },
    { value: "custom", label: "URL personalizada" }
  ];

  const POSITIONS = [
    { value: "home", label: "Inicio" },
    { value: "forum", label: "Foro" },
    { value: "courses", label: "Servicios" },
    { value: "services", label: "Guía" },
    { value: "practice", label: "Práctica consular" },
    { value: "all", label: "Todo el sitio" }
  ];

  function header(title, onCreate = null, label = "Crear") {
    WT.qs("#adminTitle").textContent = title;
    const btn = WT.qs("#adminCreateBtn");
    if (!btn) return;
    btn.textContent = label;
    btn.classList.toggle("hidden", !onCreate);
    btn.onclick = onCreate || null;
  }

  function field(label, name, value = "", type = "text", attrs = "") {
    return `<label>${WT.escapeHTML(label)}<input class="input" type="${type}" name="${name}" value="${WT.escapeHTML(value ?? "")}" ${attrs}></label>`;
  }

  function textArea(label, name, value = "", attrs = "") {
    const noRich = /data-no-rich|gallery|json|css|code/i.test(`${attrs} ${name}`);
    const richAttr = noRich ? "" : " data-rich-editor='true'";
    return `<label>${WT.escapeHTML(label)}<textarea class="input" name="${name}" ${richAttr} ${attrs}>${WT.escapeHTML(value ?? "")}</textarea></label>`;
  }

  function boolField(label, name, checked = false) {
    return `<label>${WT.escapeHTML(label)}<select class="input" name="${name}"><option value="true" ${checked ? "selected" : ""}>Activo / Sí</option><option value="false" ${!checked ? "selected" : ""}>Inactivo / No</option></select></label>`;
  }

  function selectField(label, name, value, options, attrs = "") {
    return `<label>${WT.escapeHTML(label)}<select class="input" name="${name}" ${attrs}>${options.map(o => `<option value="${WT.escapeHTML(o.value)}" ${String(o.value) === String(value ?? "") ? "selected" : ""}>${WT.escapeHTML(o.label)}</option>`).join("")}</select></label>`;
  }

  function section(title, body, help = "") {
    return `<section class="admin-form-section"><div class="admin-form-section-head"><h3>${WT.escapeHTML(title)}</h3>${help ? `<p>${WT.escapeHTML(help)}</p>` : ""}</div><div class="admin-form-section-body">${body}</div></section>`;
  }

  async function log(action, tableName, recordId = null, details = {}) {
    try { await WT.runWithSession?.(() => WT.supabase.from("admin_logs").insert({ action, table_name: tableName, record_id: recordId, details })); } catch (_) {}
  }

  async function adminQuery(action) {
    // V4057: no forzar refresh antes de cada guardado.
    // runWithSession solo reintenta si Supabase responde con error real de sesión/JWT.
    if (WT.runWithSession) return WT.runWithSession(action);
    try { await WT.wakeSupabaseSession?.({ reason: "admin-action" }); } catch (_) {}
    return action();
  }

  const ADMIN_DRAFT_PREFIX = "wt_admin_draft_v1:";

  function draftKey(scope, item = {}) {
    return `${ADMIN_DRAFT_PREFIX}${scope}:${item.id || "new"}`;
  }

  function serializeFormDraft(form) {
    try {
      window.WTAdminRich?.sync(form);
      const fd = new FormData(form);
      const data = {};
      fd.forEach((value, key) => {
        if (value instanceof File) return;
        if (data[key] !== undefined) {
          data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
        } else {
          data[key] = value;
        }
      });
      return data;
    } catch (_) {
      return {};
    }
  }

  function applyFormDraft(form, draft = {}) {
    if (!form || !draft || typeof draft !== "object") return;
    Object.entries(draft).forEach(([name, value]) => {
      const values = Array.isArray(value) ? value.map(String) : [String(value ?? "")];
      form.querySelectorAll(`[name="${CSS.escape(name)}"]`).forEach((el) => {
        if (el.type === "file") return;
        if (el.type === "checkbox" || el.type === "radio") {
          el.checked = values.includes(String(el.value));
          return;
        }
        if (el.tagName === "SELECT") {
          el.value = values[0] ?? "";
          return;
        }
        el.value = values.join("\n");
      });
    });
    window.WTAdminRich?.enhance(form);
    window.WTAdminRich?.sync(form);
  }

  function showDraftStatus(form, text = "Borrador protegido") {
    let status = form.querySelector("[data-admin-draft-status]");
    if (!status) {
      status = document.createElement("div");
      status.className = "admin-draft-status";
      status.dataset.adminDraftStatus = "true";
      const firstSection = form.querySelector(".admin-form-section");
      if (firstSection) firstSection.before(status);
      else form.prepend(status);
    }
    status.textContent = text;
  }

  function bindAdminDraftAutosave(form, scope, item = {}) {
    if (!form || form.dataset.draftAutosaveBound === "true") return;
    form.dataset.draftAutosaveBound = "true";
    const key = draftKey(scope, item);
    let timer = null;
    let restored = false;

    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved?.data && saved.savedAt) {
        const ageMs = Date.now() - Number(saved.savedAt || 0);
        if (ageMs < 7 * 24 * 60 * 60 * 1000) {
          const savedDate = new Date(Number(saved.savedAt)).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
          WT.showModal({
            title: "Borrador guardado",
            className: "admin-draft-recovery-modal",
            closeOnBackdrop: false,
            body: `<div class="admin-draft-recovery">
              <div class="admin-draft-recovery-icon">💾</div>
              <h3>Encontré cambios sin guardar</h3>
              <p>Hay un borrador local de este formulario guardado el <strong>${WT.escapeHTML(savedDate)}</strong>. Puedes recuperarlo o descartarlo.</p>
            </div>`,
            actions: [
              {
                label: "Descartar",
                className: "btn-soft",
                onClick: () => {
                  localStorage.removeItem(key);
                  showDraftStatus(form, "Borrador descartado.");
                }
              },
              {
                label: "Recuperar borrador",
                className: "btn-primary",
                onClick: () => {
                  applyFormDraft(form, saved.data);
                  showDraftStatus(form, "Borrador local recuperado. Revisa y guarda cuando estés listo.");
                  restored = true;
                }
              }
            ]
          });
        }
      }
    } catch (_) {}

    const save = () => {
      try {
        const data = serializeFormDraft(form);
        localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
        showDraftStatus(form, restored ? "Borrador recuperado y protegido localmente." : "Borrador protegido localmente.");
      } catch (_) {}
    };

    const queueSave = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 650);
    };

    form.addEventListener("input", queueSave, true);
    form.addEventListener("change", queueSave, true);
    form.addEventListener("submit", () => save(), true);

    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") save();
    });

    form.dataset.draftKey = key;
  }

  function clearAdminDraft(form) {
    try {
      const key = form?.dataset?.draftKey;
      if (key) localStorage.removeItem(key);
    } catch (_) {}
  }

  function extensionFromBlob(blob) {
    if (blob?.type === "image/webp") return "webp";
    if (blob?.type === "image/jpeg") return "jpg";
    if (blob?.type === "image/png") return "png";
    return "jpg";
  }

  async function uploadOptionalImage(fd, bucket, folder, aspectRatio = "16:9", form = null, fileField = "image_file") {
    const editedMap = fileField === "desktop_image_file" ? desktopEditedImages : editedImages;
    let edited = form ? editedMap.get(form) : null;
    const file = fd.get(fileField) || (fileField === "image_file" ? (fd.get("logo_file") || fd.get("icon_file") || fd.get("favicon_file")) : null);
    if (!edited && file && file.size) {
      edited = await WTImageEditor.open({
        file,
        aspectRatio,
        shape: "rect",
        title: aspectRatio === "16:9" ? "Ajustar imagen horizontal" : "Ajustar imagen",
        maxOutputWidth: aspectRatio === "16:9" ? 1600 : 1200,
        maxBytes: aspectRatio === "16:9" ? 1800000 : 1600000
      });
      if (form && edited) editedMap.set(form, edited);
    }
    if (!edited) return null;
    let blobToUpload = edited.blob;
    let fileName = "image.webp";
    if (window.WTImageCompressor?.optimize) {
      const sourceFile = new File([edited.blob], `admin-${Date.now()}.${extensionFromBlob(edited.blob)}`, { type: edited.blob.type || "image/jpeg" });
      const optimized = await WTImageCompressor.optimizeForUse(sourceFile, "admin", { fallbackToOriginal: true, onlyIfSmaller: false });
      blobToUpload = optimized.blob || edited.blob;
      fileName = optimized.fileName || fileName;
    }
    const ext = extensionFromBlob(blobToUpload);
    const path = `${folder}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const uploaded = await WT.uploadBlob(bucket, path, blobToUpload, {
      contentType: blobToUpload.type,
      fileName,
      assetKind: folder === "hero-images" ? "hero_image" : bucket,
      folder
    });
    return { ...uploaded, cropData: edited.cropData, aspectRatio };
  }

  async function uploadGalleryFiles(input, textarea, { bucket, folder = "content/gallery", aspectRatio = "16:9" } = {}) {
    const files = Array.from(input?.files || []).filter(file => file && file.type && file.type.startsWith("image/"));
    if (!files.length) {
      WT.toast("Selecciona una o varias imágenes válidas.", "warning");
      return [];
    }
    if (!textarea) throw new Error("No encontré el campo donde guardar las URLs de la galería.");
    if (!bucket) throw new Error("No hay bucket configurado para guardar estas imágenes.");

    const uploadedUrls = [];
    const statusText = input.closest(".gallery-upload-box")?.querySelector("small");
    const oldStatus = statusText?.textContent || "";

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      if (statusText) statusText.textContent = `Ajustando imagen ${index + 1} de ${files.length}...`;

      let edited;
      if (window.WTImageEditor?.open) {
        edited = await WTImageEditor.open({
          file,
          aspectRatio,
          shape: "rect",
          title: files.length > 1 ? `Ajustar imagen ${index + 1} de ${files.length}` : "Ajustar imagen de galería",
          maxOutputWidth: 1600,
          maxBytes: 1800000
        });
      }

      let blob = edited?.blob || file;
      let fileName = file.name || `gallery-${Date.now()}.jpg`;

      if (statusText) statusText.textContent = `Subiendo imagen ${index + 1} de ${files.length}...`;

      if (window.WTImageCompressor?.optimizeForUse) {
        const sourceFile = new File([blob], fileName, { type: blob.type || file.type || "image/jpeg" });
        const optimized = await WTImageCompressor.optimizeForUse(sourceFile, "admin", {
          fallbackToOriginal: true,
          onlyIfSmaller: false,
          timeoutMs: 22000
        });
        blob = optimized.blob || blob;
        fileName = optimized.fileName || fileName;
      }

      const ext = extensionFromBlob(blob);
      const safeFolder = String(folder || "content/gallery").replace(/^\/+|\/+$/g, "");
      const path = `${safeFolder}/${Date.now()}-${index}-${Math.random().toString(16).slice(2)}.${ext}`;
      const uploaded = await WT.uploadBlob(bucket, path, blob, {
        contentType: blob.type || file.type || "image/jpeg",
        fileName,
        assetKind: "admin_gallery_image",
        folder: safeFolder
      });

      const url = uploaded?.url || uploaded?.publicUrl || "";
      if (url) uploadedUrls.push(url);
    }

    const previous = String(textarea.value || "").trim();
    const merged = [
      ...previous.split(/\n|,/).map(x => x.trim()).filter(Boolean),
      ...uploadedUrls
    ];
    textarea.value = [...new Set(merged)].join("\n");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));

    if (input) input.value = "";
    if (statusText) statusText.textContent = uploadedUrls.length ? `${uploadedUrls.length} imagen(es) ajustada(s) y agregada(s). Guarda el servicio para aplicar los cambios.` : oldStatus;
    WT.toast(`${uploadedUrls.length} imagen(es) ajustada(s) y agregada(s) a la galería. Ahora guarda el servicio.`, "success");
    return uploadedUrls;
  }

  function applyUploadedImage(payload, upload) {
    if (!upload) return payload;
    payload.image_url = upload.url;
    payload.image_path = upload.path;
    payload.image_crop_data = upload.cropData;
    payload.image_aspect_ratio = upload.aspectRatio || "16:9";
    // La imagen ya sale recortada desde el editor. No aplicar zoom extra en la vista pública.
    payload.image_fit = "cover";
    payload.image_position_x = 50;
    payload.image_position_y = 50;
    payload.image_zoom = 1;
    payload.image_rotation = 0;
    return payload;
  }

  function destinationValue(current = "") {
    const value = String(current || "").trim();
    if (!value) return "";
    return DESTINATIONS.some(d => d.value === value) ? value : "custom";
  }

  function destinationField(label, name, current = "", help = "") {
    const selected = destinationValue(current);
    const customHidden = selected && selected !== "custom" ? " hidden" : "";
    return `<div class="destination-box" data-destination-box="${WT.escapeHTML(name)}">
      ${selectField(label, `${name}_destination`, selected || "", [{ value: "", label: "Sin botón / sin enlace" }, ...DESTINATIONS], `data-destination-select="${WT.escapeHTML(name)}"`)}
      <label class="url-custom-field${customHidden}" data-url-custom-field="${WT.escapeHTML(name)}">URL personalizada
        <input class="input" type="text" name="${name}" value="${WT.escapeHTML(current || "")}" placeholder="Ejemplo: https://... o pagina.html" data-url-target="${WT.escapeHTML(name)}">
      </label>
      ${help ? `<p class="form-help">${WT.escapeHTML(help)}</p>` : ""}
    </div>`;
  }

  function positionField(value = "home") {
    return selectField("Dónde se mostrará", "position", value || "home", POSITIONS);
  }

  // imageFields — soporte para campo personalizado (fieldName)
  // Si se pasa fieldName="desktop_image", los inputs usan desktop_image_file / desktop_image_url
  function imageFields(item = {}, aspectRatio = "16:9", fieldName = "image") {
    const isDesktop = fieldName === "desktop_image";
    const fileField = isDesktop ? "desktop_image_file" : "image_file";
    const urlField  = isDesktop ? "desktop_image_url"  : "image_url";
    const currentUrl = isDesktop ? (item.desktop_image_url || "") : (item.image_url || "");
    const ratioCss = aspectRatio.includes(":") ? aspectRatio.replace(":", " / ") : "16 / 9";
    const preview = WT.sanitizeImageUrl(currentUrl, "images/placeholder-hero.jpg");
    const isHorizontal = aspectRatio === "16:9";
    const isVerticalSlide = aspectRatio === "9:16";
    const titleLabel = isDesktop
      ? "Imagen para PC / escritorio (16:9 horizontal)"
      : (isHorizontal ? "Imagen horizontal" : (isVerticalSlide ? "Imagen para móvil (9:16 vertical)" : "Imagen"));
    const help = isDesktop
      ? "Imagen exclusiva para pantallas anchas (PC y tablets en horizontal). Formato 16:9. Si no subes una, el carrusel usará la imagen de móvil también en escritorio."
      : isVerticalSlide
        ? "Imagen principal del slide para móvil y pantallas estrechas. Formato vertical 9:16."
        : "Al seleccionar una imagen se abre el editor visual. Puedes moverla, hacer zoom y confirmar el recorte antes de guardar.";
    const imageBoxAttr = isDesktop ? 'data-desktop-image-box' : 'data-image-box';
    const previewAttr  = isDesktop ? 'data-desktop-image-preview' : 'data-image-preview';
    const statusAttr   = isDesktop ? 'data-desktop-image-status' : 'data-image-status';
    const adjustAttr   = isDesktop ? 'data-adjust-desktop-image' : 'data-adjust-current-image';
    const clearAttr    = isDesktop ? 'data-clear-desktop-image' : 'data-clear-image';
    return section(titleLabel, `<div class="image-admin-box image-admin-box-horizontal" ${imageBoxAttr} data-image-aspect="${WT.escapeHTML(aspectRatio)}">
        <div class="admin-image-preview-wrap admin-image-preview-wrap-horizontal">
          <div class="admin-image-frame-guide">
            <img class="admin-image-preview" ${previewAttr} src="${WT.escapeHTML(preview)}" alt="Vista previa de imagen" style="--preview-aspect:${WT.escapeHTML(ratioCss)}" onerror="this.src='images/placeholder-hero.jpg'">
          </div>
          <div class="admin-image-preview-info">
            <strong>${isDesktop ? "Vista previa escritorio 16:9" : (isVerticalSlide ? "Vista previa móvil 9:16" : "Vista previa")}</strong>
            <span ${statusAttr}>${currentUrl ? "Imagen guardada actualmente" : "Todavía no has subido una imagen"}</span>
          </div>
        </div>
        <label class="file-drop-label image-file-drop-label">Subir y ajustar imagen
          <input class="input" type="file" name="${fileField}" accept="image/png,image/jpeg,image/webp" data-image-input data-aspect-ratio="${WT.escapeHTML(aspectRatio)}">
        </label>
        <div class="record-actions image-editor-actions">
          <button class="btn btn-soft btn-small" type="button" ${adjustAttr} ${currentUrl ? "" : "hidden"}>Ajustar imagen actual</button>
          <button class="btn btn-soft btn-small" type="button" ${clearAttr}>Quitar imagen</button>
        </div>
        <p class="form-help">${WT.escapeHTML(help)}</p>
      </div>
      <details class="admin-advanced"><summary>URL externa / orden</summary>
        ${field("Enlace de imagen guardado o externo", urlField, currentUrl, "text", `placeholder='Se llena solo al subir. También puedes pegar una URL externa.' ${isDesktop ? "data-desktop-image-url" : "data-image-url"}`)}
        ${!isDesktop ? `<input type="hidden" name="image_fit" value="cover"><input type="hidden" name="image_position_x" value="50"><input type="hidden" name="image_position_y" value="50"><input type="hidden" name="image_zoom" value="1"><input type="hidden" name="image_rotation" value="0">${field("Orden", "sort_order", item.sort_order ?? 0, "number")}` : ""}
        <p class="form-help">Para que el recorte sea exacto, la posición y el zoom visual se guardan dentro de la imagen procesada. No hace falta ajustar márgenes aparte.</p>
      </details>`, isDesktop ? "La imagen de escritorio reemplaza la de móvil solo en pantallas ≥ 1024 px." : "La vista previa aparece antes de guardar para que sepas cómo va a quedar.");
  }

  function bindDestinationFields(root) {
    WT.qsa("[data-destination-select]", root).forEach(select => {
      const name = select.dataset.destinationSelect;
      const input = WT.qs(`[data-url-target="${CSS.escape(name)}"]`, root);
      const custom = WT.qs(`[data-url-custom-field="${CSS.escape(name)}"]`, root);
      const sync = () => {
        const value = select.value;
        if (!input || !custom) return;
        if (!value) {
          input.value = "";
          custom.classList.add("hidden");
          return;
        }
        if (value === "custom") {
          custom.classList.remove("hidden");
          input.focus?.();
          return;
        }
        input.value = value;
        custom.classList.add("hidden");
      };
      select.addEventListener("change", sync);
      sync();
    });
  }

  function bindImagePicker(root, item = {}, aspectRatio = "16:9") {
    const form = WT.qs("form", root) || root;
    const input = WT.qs("[data-image-input]", root);
    const preview = WT.qs("[data-image-preview]", root);
    const status = WT.qs("[data-image-status]", root);
    const urlInput = WT.qs("[data-image-url]", root);
    const adjustCurrentBtn = WT.qs("[data-adjust-current-image]", root);
    const isHorizontal = aspectRatio === "16:9";
    const isVerticalSlide = aspectRatio === "9:16";

    const openHorizontalEditor = async ({ file = null, src = "" } = {}) => {
      return WTImageEditor.open({
        file,
        src,
        aspectRatio,
        shape: "rect",
        title: isHorizontal ? "Ajustar imagen horizontal" : (isVerticalSlide ? "Ajustar slide vertical 9:16" : "Ajustar imagen"),
        maxOutputWidth: isHorizontal ? 1600 : (isVerticalSlide ? 1080 : 1200),
        maxBytes: isHorizontal ? 1800000 : (isVerticalSlide ? 1900000 : 1600000)
      });
    };

    async function applyEditedImage(edited, message = "Imagen ajustada correctamente") {
      editedImages.set(form, edited);

      // La imagen del editor es ahora el archivo real que se guardará.
      // También la colocamos en el input file para evitar que el submit use la imagen original.
      try {
        if (input && edited?.blob) {
          const ext = extensionFromBlob(edited.blob);
          const croppedFile = new File([edited.blob], `recorte-real-${Date.now()}.${ext}`, { type: edited.blob.type || "image/webp" });
          const dt = new DataTransfer();
          dt.items.add(croppedFile);
          input.files = dt.files;
        }
      } catch (_) {}

      if (preview) preview.src = edited.dataUrl;
      if (status) status.textContent = "Recorte aplicado. Esta vista previa es la imagen que se subirá al guardar.";
      if (adjustCurrentBtn) adjustCurrentBtn.hidden = false;

      // Si había una URL anterior, se limpia para que no vuelva a guardarse la imagen vieja.
      if (urlInput) urlInput.value = "";

      const fit = WT.qs('select[name="image_fit"]', form);
      const posX = WT.qs('input[name="image_position_x"]', form);
      const posY = WT.qs('input[name="image_position_y"]', form);
      const zoom = WT.qs('input[name="image_zoom"]', form);
      const rotation = WT.qs('input[name="image_rotation"]', form);
      if (fit) fit.value = "cover";
      if (posX) posX.value = 50;
      if (posY) posY.value = 50;
      if (zoom) zoom.value = 1;
      if (rotation) rotation.value = 0;
      WT.toast(message, "success");
    }

    input?.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const edited = await openHorizontalEditor({ file });
        await applyEditedImage(edited);
      } catch (error) {
        input.value = "";
        editedImages.delete(form);
        if (error.message !== "Edición cancelada") WT.toast(error.message, "error");
      }
    });

    adjustCurrentBtn?.addEventListener("click", async () => {
      const currentUrl = String(urlInput?.value || item.image_url || preview?.src || "").trim();
      if (!currentUrl || currentUrl.includes("placeholder-hero")) {
        WT.toast("Primero sube o pega una imagen para poder ajustarla.", "warning");
        return;
      }
      try {
        if (status) status.textContent = "Cargando imagen guardada para editar...";
        let edited;
        try {
          const currentFile = await remoteImageUrlToFile(currentUrl, "slide-actual.png");
          edited = await openHorizontalEditor({ file: currentFile });
        } catch (downloadError) {
          // Si el storage no permite descargar por CORS, intentamos abrir por URL.
          // En ese caso el editor puede abrir, pero la exportación depende del CORS del dominio de imágenes.
          console.warn("No se pudo descargar la imagen actual, usando URL directa:", downloadError);
          edited = await openHorizontalEditor({ src: currentUrl });
        }
        await applyEditedImage(edited, "Imagen actual reajustada. Guarda para aplicar el cambio.");
      } catch (error) {
        if (status) status.textContent = "No se pudo abrir la imagen actual para editar. Sube nuevamente el archivo original.";
        if (error.message !== "Edición cancelada") WT.toast(error.message || "No se pudo ajustar la imagen actual.", "error");
      }
    });

    urlInput?.addEventListener("input", () => {
      const value = String(urlInput.value || "").trim();
      if (preview && value) preview.src = WT.sanitizeImageUrl(value, "images/placeholder-hero.jpg");
      if (adjustCurrentBtn) adjustCurrentBtn.hidden = !value;
    });

    WT.qs("[data-clear-image]", root)?.addEventListener("click", () => {
      editedImages.delete(form);
      if (input) input.value = "";
      if (urlInput) urlInput.value = "";
      if (preview) preview.src = "images/placeholder-hero.jpg";
      if (adjustCurrentBtn) adjustCurrentBtn.hidden = true;
      if (status) status.textContent = "Imagen quitada. Guarda para aplicar el cambio.";
    });
  }

  function cleanVirtualFields(payload) {
    Object.keys(payload).forEach(key => {
      const value = payload[key];
      const isFileLike = value instanceof File || value instanceof Blob;
      const isVirtualField =
        key.endsWith("_destination") ||
        key.endsWith("_file") ||
        key === "image_file" ||
        key === "desktop_image_file" ||
        key === "logo_file" ||
        key === "icon_file" ||
        key === "favicon_file";
      if (isVirtualField || isFileLike) delete payload[key];
    });
    return payload;
  }

  async function renderDashboard() {
    header("Dashboard", null);
    const tables = ["user_profiles", "forum_posts", "forum_comments", "forum_reports", "announcements", "services_j1", "english_courses", "practice_questions"];
    const labels = ["Usuarios", "Publicaciones", "Comentarios", "Reportes", "Anuncios", "Servicios", "Cursos", "Preguntas"];
    const counts = await Promise.all(tables.map(t => WT.supabase.from(t).select("id", { count: "exact", head: true })));
    view().innerHTML = `<div class="stats-grid">${counts.map((r, i) => `<div class="stat-card"><strong>${r.count ?? 0}</strong><span>${labels[i]}</span></div>`).join("")}</div>`;
  }

  function recordCard(item, fields, actions) {
    const img = item.image_url ? `<img class="admin-record-thumb" src="${WT.escapeHTML(item.image_url)}" alt="Imagen" onerror="this.remove()">` : "";
    return `<article class="admin-record">${img}<h3>${WT.escapeHTML(item.title || item.name || item.key || item.email || "Registro")}</h3>${fields.map(f => `<p><strong>${WT.escapeHTML(f.label)}:</strong> ${WT.escapeHTML(f.value ?? "")}</p>`).join("")}<div class="record-actions">${actions}</div></article>`;
  }

  async function renderHero() {
    header("Carrusel de inicio", () => openHeroForm(), "Crear slide");
    const { data, error } = await WT.supabase.from("hero_slides").select("*").order("sort_order", { ascending: true });
    if (error) return view().innerHTML = `<div class="empty-state">${WT.escapeHTML(error.message)}</div>`;
    const items = data || [];
    view().innerHTML = `<div class="toolbar-card hero-admin-toolbar">
      <input class="input" id="heroSearch" placeholder="Buscar slide por título, subtítulo o botón...">
      <select class="input" id="heroStatusFilter"><option value="">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select>
    </div>
    <div class="admin-summary-strip">
      <span><strong>${items.length}</strong> slides</span>
      <span><strong>${items.filter(x => x.active).length}</strong> activos</span>
      <span><strong>${items.filter(x => !x.active).length}</strong> inactivos</span>
    </div>
    <div class="admin-content-grid hero-content-grid">${items.map(renderHeroSlideRecord).join("") || `<div class="empty-state">No hay slides.</div>`}</div>`;
    const applyFilters = () => {
      const search = (WT.qs("#heroSearch")?.value || "").toLowerCase();
      const status = WT.qs("#heroStatusFilter")?.value || "";
      WT.qsa("[data-hero-record]").forEach(card => {
        const okSearch = !search || (card.dataset.search || "").includes(search);
        const okStatus = !status || card.dataset.status === status;
        card.classList.toggle("hidden", !(okSearch && okStatus));
      });
    };
    WT.qs("#heroSearch")?.addEventListener("input", applyFilters);
    WT.qs("#heroStatusFilter")?.addEventListener("change", applyFilters);
    WT.qsa("[data-edit-hero]").forEach(b => b.addEventListener("click", () => openHeroForm(items.find(x => x.id === b.dataset.editHero))));
  }

  async function openHeroForm(item = {}) {
    const body = `<form class="admin-form modern-admin-form" id="heroForm">
      ${section("Contenido del slide", `${field("Título", "title", item.title || "", "text", "required")}${textArea("Subtítulo", "subtitle", item.subtitle || "")}`)}
      ${section("Botones", `<div class="two">${field("Texto botón principal", "button_text", item.button_text || "")}${destinationField("Destino botón principal", "button_url", item.button_url || "")}</div><div class="two">${field("Texto botón secundario", "secondary_button_text", item.secondary_button_text || "")}${destinationField("Destino botón secundario", "secondary_button_url", item.secondary_button_url || "")}</div>`, "Elige una página de la web sin escribir la URL manualmente.")}
      <div class="hero-dual-image-grid">
        ${imageFields(item, "9:16", "image")}
        ${imageFields(item, "16:9", "desktop_image")}
      </div>
      ${section("Opciones de publicación", `<div class="two compact-grid">${field("Cambio en milisegundos", "change_ms", item.change_ms || 6500, "number")}${field("Oscurecimiento (%)", "overlay_opacity", item.overlay_opacity ?? 58, "number", "min='0' max='95'")}</div>${boolField("Estado", "active", item.active ?? true)}`)}
      <button class="btn btn-primary">Guardar slide</button>
    </form>`;
    const modal = WT.showModal({ title: item.id ? "Editar slide" : "Crear slide", body, className: "admin-edit-modal admin-hero-edit-modal", closeOnBackdrop: false });
    bindDestinationFields(modal.element);
    // Dos bindImagePicker: uno para móvil, otro para escritorio
    bindImagePicker(modal.element, item, "9:16");
    bindDesktopImagePicker(modal.element, item);
    window.WTAdminRich?.enhance(modal.element);
    const form = WT.qs("#heroForm", modal.element);
    bindAdminDraftAutosave(form, "hero_slides", item);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      window.WTAdminRich?.sync(e.currentTarget);
      const fd = new FormData(e.currentTarget);
      try {
        // Subir imagen de móvil (9:16)
        const upload = await uploadOptionalImage(fd, WT.cfg.BUCKETS.hero_images, "hero-images", "9:16", form);
        // Subir imagen de escritorio (16:9) si hay archivo
        const desktopUpload = await uploadOptionalImage(
          fd, WT.cfg.BUCKETS.hero_images, "hero-images", "16:9", form, "desktop_image_file"
        );
        const payload = cleanVirtualFields(Object.fromEntries(fd.entries()));
        if (payload.subtitle !== undefined) {
          const plainSubtitle = window.WTContent?.richToPlain ? WTContent.richToPlain(payload.subtitle) : String(payload.subtitle || "");
          if (!String(plainSubtitle || "").trim()) payload.subtitle = "";
        }
        payload.active = payload.active === "true";
        payload.sort_order = Number(payload.sort_order || 0);
        payload.overlay_opacity = Number(payload.overlay_opacity || 58);
        payload.change_ms = Number(payload.change_ms || 6500);
        payload.image_position_x = Number(payload.image_position_x || 50);
        payload.image_position_y = Number(payload.image_position_y || 50);
        payload.image_zoom = Number(payload.image_zoom || 1);
        applyUploadedImage(payload, upload);
        if (desktopUpload?.url) payload.desktop_image_url = desktopUpload.url;
        if (payload.desktop_image_url !== undefined) payload.desktop_image_url = String(payload.desktop_image_url || "").trim();
        if (upload || payload.image_url) {
          payload.image_fit = "cover";
          payload.image_position_x = 50;
          payload.image_position_y = 50;
          payload.image_zoom = 1;
          payload.image_aspect_ratio = payload.image_aspect_ratio || "9:16";
        }
        const result = item.id ? await adminQuery(() => WT.supabase.from("hero_slides").update(payload).eq("id", item.id).select("id").single()) : await adminQuery(() => WT.supabase.from("hero_slides").insert(payload).select("id").single());
        if (result.error) throw result.error;
        await log(item.id ? "editar_slide" : "crear_slide", "hero_slides", item.id || result.data.id, payload);
        clearAdminDraft(form);
        WT.toast("Slide guardado", "success"); modal.close(); renderHero();
      } catch (err) {
        const msg = String(err.message || err || "Error al guardar");
        const friendlyMsg = /Cannot coerce|PGRST116|single JSON object/i.test(msg) ? "No se pudo confirmar el guardado. Revisa si el cambio se aplicó y vuelve a intentarlo" : msg;
        if (msg.includes("child_guides_json") || msg.includes("service_options")) {
          WT.toast("Esta función todavía no está lista. Revisa la configuración interna antes de guardar.", "error");
        } else if (msg.toLowerCase().includes("desktop_image_url") && (msg.toLowerCase().includes("schema cache") || msg.toLowerCase().includes("could not find") || msg.toLowerCase().includes("column"))) {
          WT.toast("La imagen de escritorio todavía no está disponible para guardar. Espera unos segundos, recarga la app e inténtalo otra vez.", "error");
        } else if (msg.toLowerCase().includes("desktop_image_file")) {
          WT.toast("No se pudo guardar la imagen de escritorio. Recarga la app e inténtalo otra vez.", "error");
        } else {
          WT.toast(`${friendlyMsg}. Tu borrador quedó protegido localmente.`, "error");
        }
      }
    });
  }

  // Maneja el picker para la imagen de escritorio (campo distinto)
  function bindDesktopImagePicker(root, item = {}) {
    const input = root.querySelector('[name="desktop_image_file"]');
    const preview = root.querySelector("[data-desktop-image-preview]");
    const status = root.querySelector("[data-desktop-image-status]");
    const urlInput = root.querySelector("[data-desktop-image-url]");
    const adjustBtn = root.querySelector("[data-adjust-desktop-image]");
    const clearBtn = root.querySelector("[data-clear-desktop-image]");
    if (!input) return;

    const updatePreview = (src) => {
      if (preview) preview.src = src || "images/placeholder-hero.jpg";
      if (status) status.textContent = src ? "Imagen guardada actualmente" : "Sin imagen de escritorio (usa la de móvil)";
      if (adjustBtn) adjustBtn.hidden = !src;
    };

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const edited = await WTImageEditor.open({ file, aspectRatio: "16:9", shape: "rect", title: "Ajustar imagen escritorio 16:9", maxOutputWidth: 1920, maxBytes: 2200000 });
        desktopEditedImages.set(root.querySelector("form") || root, edited);
        try {
          const ext = extensionFromBlob(edited.blob);
          const croppedFile = new File([edited.blob], `recorte-escritorio-${Date.now()}.${ext}`, { type: edited.blob.type || "image/webp" });
          const dt = new DataTransfer();
          dt.items.add(croppedFile);
          input.files = dt.files;
        } catch (_) {}
        if (preview) preview.src = edited.dataUrl;
        if (status) status.textContent = "Recorte aplicado. Esta vista previa es la imagen que se subirá al guardar.";
        if (adjustBtn) adjustBtn.hidden = false;
        if (urlInput) urlInput.value = "";
      } catch (_) { input.value = ""; }
    });

    adjustBtn?.addEventListener("click", async () => {
      const src = urlInput?.value || item.desktop_image_url || "";
      if (!src) return;
      try {
        const currentFile = await remoteImageUrlToFile(src, "desktop-actual.jpg").catch(() => null);
        const edited = await WTImageEditor.open({ file: currentFile, src: currentFile ? null : src, aspectRatio: "16:9", shape: "rect", title: "Ajustar imagen escritorio", maxOutputWidth: 1920, maxBytes: 2200000 });
        desktopEditedImages.set(root.querySelector("form") || root, edited);
        try {
          const ext = extensionFromBlob(edited.blob);
          const croppedFile = new File([edited.blob], `recorte-escritorio-${Date.now()}.${ext}`, { type: edited.blob.type || "image/webp" });
          const dt = new DataTransfer();
          dt.items.add(croppedFile);
          input.files = dt.files;
        } catch (_) {}
        if (preview) preview.src = edited.dataUrl;
        if (status) status.textContent = "Recorte aplicado. Esta vista previa es la imagen que se subirá al guardar.";
        if (urlInput) urlInput.value = "";
      } catch (_) {}
    });

    clearBtn?.addEventListener("click", () => {
      desktopEditedImages.delete(root.querySelector("form") || root);
      input.value = "";
      if (urlInput) urlInput.value = "";
      updatePreview("");
    });

    updatePreview(item.desktop_image_url || "");
  }

  async function renderAnnouncements() { await renderContentTable({ title: "Anuncios", table: "announcements", bucket: WT.cfg.BUCKETS.announcement_images, folder: "announcements", form: announcementForm, label: "anuncio" }); }
  async function renderServices() { await renderContentTable({ title: "Servicios", table: "services_j1", bucket: WT.cfg.BUCKETS.service_images, folder: "services", form: serviceForm, label: "servicio" }); }
  async function renderCourses() { await renderContentTable({ title: "Cursos", table: "english_courses", bucket: WT.cfg.BUCKETS.course_images, folder: "courses", form: courseForm, label: "curso" }); }

  function getPositionLabel(value = "") {
    return (POSITIONS.find(p => p.value === value)?.label) || value || "No definido";
  }

  function getDestinationLabel(value = "") {
    const found = DESTINATIONS.find(d => d.value === value);
    return found ? found.label : (value || "Sin enlace");
  }

  function plainFromRich(value = "") {
    const box = document.createElement("textarea");
    box.innerHTML = String(value || "");
    let raw = box.value
      .replace(/&nbsp;/gi, " ")
      .replace(/\u00a0/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<\/div\s*>/gi, "\n")
      .replace(/<\/li\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    box.innerHTML = raw;
    return box.value;
  }

  function safeText(value, fallback = "No definido") {
    const text = plainFromRich(value ?? "").trim();
    return text || fallback;
  }


  const SETTING_LABELS = {
    site_name: "Nombre del sitio",
    site_logo: "Logo principal",
    logo_url: "Logo principal",
    icon_url: "Ícono del sitio",
    favicon_url: "Favicon",
    instagram: "Instagram",
    whatsapp: "WhatsApp",
    email: "Correo",
    phone: "Teléfono",
    footer_text: "Texto del footer",
    site_description: "Descripción del sitio",
    meta_description: "Meta descripción",
    legal_text: "Texto legal",
    privacy_policy: "Política de privacidad",
    terms_conditions: "Términos y condiciones",
    site_status: "Estado general del sitio",
    forum_require_approval: "Aprobación previa del foro",
    forum_media_require_approval: "Imágenes requieren moderación",
    forum_allow_public_comments: "Comentarios sin supervisión",
    forum_comments_require_approval: "Aprobación previa de comentarios",
    home_about_eyebrow: "Etiqueta de la sección Nosotros",
    home_about_title: "Título de Nosotros",
    home_about_text: "Descripción de Nosotros",
    home_about_button_text: "Texto del botón de Nosotros",
    home_about_button_url: "Destino del botón de Nosotros",
    home_cover_title: "Título de portada",
    home_cover_subtitle: "Subtítulo de portada",
    notification_prompt_hide_days: "Reaparición del aviso de notificaciones"
  };

  const SETTING_GROUPS = [
    { id: "identity", label: "Identidad", keys: ["site_name", "site_description", "meta_description"] },
    { id: "home", label: "Inicio / Nosotros", keys: ["home_cover_title", "home_cover_subtitle", "home_about_eyebrow", "home_about_title", "home_about_text", "home_about_button_text", "home_about_button_url"] },
    { id: "images", label: "Logo e imágenes", keys: ["site_logo", "logo_url", "icon_url", "favicon_url"] },
    { id: "contact", label: "Contacto", keys: ["instagram", "whatsapp", "email", "phone"] },
    { id: "forum", label: "Foro", keys: ["forum_require_approval", "forum_media_require_approval", "forum_allow_public_comments", "forum_comments_require_approval"] },
    { id: "notifications", label: "Notificaciones", keys: ["notification_prompt_hide_days"] },
    { id: "legal", label: "Legal", keys: ["footer_text", "legal_text", "privacy_policy", "terms_conditions"] },
    { id: "system", label: "Sistema", keys: ["site_status"] }
  ];

  function getSettingLabel(key = "") {
    return SETTING_LABELS[key] || String(key || "Configuración").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  function getSettingGroup(key = "") {
    const group = SETTING_GROUPS.find(g => g.keys.includes(key));
    return group || { id: "other", label: "Otras configuraciones" };
  }

  function settingPreviewValue(item = {}) {
    const key = item.key || "";
    const value = String(item.value ?? "").trim();
    if (!value) return "Sin valor";
    if (item.type === "boolean" || ["true", "false"].includes(value.toLowerCase())) return value.toLowerCase() === "true" ? "Activado" : "Desactivado";
    if (["site_logo", "logo_url", "icon_url", "favicon_url"].includes(key)) return "Imagen configurada";
    return value.length > 90 ? `${value.slice(0, 90)}...` : value;
  }

  function settingTypeLabel(type = "text") {
    return ({ text: "Texto", url: "URL", html: "HTML", boolean: "Sí / No", json: "JSON" })[type] || type || "Texto";
  }

  const SETTING_FRIENDLY = {
    site_name: { title: "Nombre de la página", hint: "El nombre principal que ve la gente en la web." },
    site_description: { title: "Descripción corta de la página", hint: "Una frase sencilla para explicar de qué trata Work and Travel RD." },
    meta_description: { title: "Descripción para Google", hint: "Texto usado por buscadores y vistas previas al compartir el enlace." },
    site_logo: { title: "Logo principal", hint: "Logo que aparece en la web, barra y encabezados." },
    logo_url: { title: "Logo principal", hint: "Logo que aparece en la web, barra y encabezados." },
    icon_url: { title: "Icono de la app", hint: "Icono usado para accesos directos o partes pequeñas de la interfaz." },
    favicon_url: { title: "Favicon", hint: "Icono pequeño que aparece en la pestaña del navegador." },
    instagram: { title: "Instagram", hint: "Usuario o enlace de Instagram." },
    whatsapp: { title: "WhatsApp", hint: "Número o enlace para contacto por WhatsApp." },
    email: { title: "Correo de contacto", hint: "Correo que verá la comunidad para comunicarse contigo." },
    phone: { title: "Teléfono", hint: "Número público de contacto." },
    footer_text: { title: "Texto del pie de página", hint: "Texto que aparece al final de la web." },
    legal_text: { title: "Texto legal", hint: "Aviso legal general de la plataforma." },
    privacy_policy: { title: "Política de privacidad", hint: "Texto sobre cómo se manejan los datos." },
    terms_conditions: { title: "Términos y condiciones", hint: "Reglas de uso de la plataforma." },
    site_status: { title: "Estado del sitio", hint: "Permite activar o pausar funciones generales." },
    forum_require_approval: { title: "Aprobar publicaciones antes de mostrarlas", hint: "Si está activado, todas las publicaciones de usuarios normales necesitan revisión." },
    forum_media_require_approval: { title: "Enviar publicaciones con imagen a moderación", hint: "Si está activado, el texto/PDF puede publicarse directo, pero las publicaciones con imagen quedan pendientes." },
    forum_allow_public_comments: { title: "Permitir comentarios públicos", hint: "Controla si los usuarios pueden comentar." },
    forum_comments_require_approval: { title: "Aprobar comentarios antes de mostrarlos", hint: "Si está activado, los comentarios necesitan revisión." },
    notification_prompt_hide_days: { title: "Tiempo para volver a mostrar el aviso", hint: "Cantidad de días que esperará la ventana de activar notificaciones cuando alguien elija no volver a mostrarla." }
  };

  function getSettingFriendly(key = "", item = {}) {
    const fallbackTitle = getSettingLabel(key);
    const fallbackHint = item.description || "Ajuste de la página.";
    return SETTING_FRIENDLY[key] || { title: fallbackTitle, hint: fallbackHint };
  }

  function friendlyTypeLabel(type = "text", key = "") {
    if (["site_logo", "logo_url", "icon_url", "favicon_url"].includes(key)) return "Imagen";
    return ({ text: "Texto", url: "Enlace", html: "Texto avanzado", boolean: "Activado / Desactivado", json: "Datos avanzados", number: "Número" })[type] || "Texto";
  }

  function validateRemoteImageUrl(url = "") {
    const clean = String(url || "").trim();
    if (!clean) throw new Error("No se obtuvo una URL pública para la imagen.");
    if (/^data:image\//i.test(clean)) throw new Error("El logo debe subirse como imagen antes de guardarlo.");
    if (!/^https?:\/\//i.test(clean) && !clean.startsWith("/")) throw new Error("La URL pública del logo no es válida.");
    return clean;
  }

  async function remoteImageUrlToFile(url = "", fileName = "logo-current.png") {
    const clean = String(url || "").trim();
    if (!clean) throw new Error("No hay imagen actual para editar.");
    if (/^data:image\//i.test(clean)) throw new Error("La imagen actual no es una URL pública válida.");

    const cacheSafeUrl = clean.includes("?")
      ? `${clean}&wt_edit=${Date.now()}`
      : `${clean}?wt_edit=${Date.now()}`;

    const response = await fetch(cacheSafeUrl, { mode: "cors", cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo abrir la imagen actual para editarla.");

    const blob = await response.blob();
    if (!blob || !String(blob.type || "").startsWith("image/")) {
      throw new Error("El archivo actual no parece ser una imagen válida.");
    }

    const ext = extensionFromBlob(blob);
    return new File([blob], fileName.replace(/\.[a-z0-9]{2,6}$/i, "") + `.${ext}`, { type: blob.type || "image/jpeg" });
  }

  async function uploadSettingImageFile(file, key = "site_logo", currentUrl = "") {
    if (!file && !currentUrl) return null;

    const isIcon = key === "icon_url" || key === "favicon_url";
    const edited = await WTImageEditor.open({
      file: file || null,
      src: file ? "" : currentUrl,
      aspectRatio: "1:1",
      shape: "rect",
      title: isIcon ? "Ajustar icono" : "Ajustar logo",
      maxOutputWidth: isIcon ? 768 : 1200,
      maxBytes: isIcon ? 700000 : 1200000
    });
    if (!edited?.blob) return null;

    let blob = edited.blob;
    let fileName = file?.name || `${key}-${Date.now()}.${extensionFromBlob(blob)}`;

    if (window.WTImageCompressor?.optimizeForUse) {
      try {
        const sourceFile = new File([blob], fileName, { type: blob.type || file?.type || "image/jpeg" });
        const optimized = await WTImageCompressor.optimizeForUse(sourceFile, "admin", {
          fallbackToOriginal: true,
          onlyIfSmaller: false,
          timeoutMs: 22000
        });
        blob = optimized.blob || blob;
        fileName = optimized.fileName || fileName;
      } catch (_) {
        // Si el compresor falla, seguimos con la imagen editada.
      }
    }

    const assetSubfolder = (key === "site_logo" || key === "logo_url") ? "logos" : key === "favicon_url" ? "favicons" : "icons";
    const folder = "site-assets";
    const ext = extensionFromBlob(blob);
    const path = `${folder}/${assetSubfolder}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    // El logo debe guardarse como URL pública. Nunca como base64 en site_settings.
    const buckets = [
      WT.cfg?.BUCKETS?.site_assets,
      WT.cfg?.BUCKETS?.service_images,
      WT.cfg?.BUCKETS?.content_images,
      WT.cfg?.BUCKETS?.hero_images
    ].filter(Boolean);

    let lastError = null;
    for (const bucket of [...new Set(buckets)]) {
      try {
        const uploaded = await WT.uploadBlob(bucket, path, blob, {
          contentType: blob.type || file?.type || "image/jpeg",
          fileName,
          folder
        });
        const publicUrl = validateRemoteImageUrl(uploaded?.url || uploaded?.publicUrl || "");
        return { ...uploaded, url: publicUrl, publicUrl, storageMode: "remote" };
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("No se pudo subir el logo. Revisa la conexión e inténtalo otra vez.");
  }

  function renderHeroSlideRecord(item) {
    const image = item.image_url
      ? `<img class="content-record-image hero-card-image" src="${WT.escapeHTML(item.image_url)}" alt="Slide ${WT.escapeHTML(item.title || '')}" style="object-fit:${WT.escapeHTML(item.image_fit || 'cover')};object-position:${Number(item.image_position_x ?? 50)}% ${Number(item.image_position_y ?? 50)}%;" onerror="this.src='images/placeholder-hero.jpg'">`
      : `<div class="content-record-image content-record-image-empty">Sin imagen</div>`;
    const subtitle = safeText(item.subtitle, "Sin subtítulo");
    const meta = [
      { label: "Botón principal", value: item.button_text || "Sin botón" },
      { label: "Destino", value: getDestinationLabel(item.button_url) },
      { label: "Botón secundario", value: item.secondary_button_text || "Sin botón" },
      { label: "Destino secundario", value: getDestinationLabel(item.secondary_button_url) },
      { label: "Cambio", value: `${item.change_ms || 6500} ms` },
      { label: "Oscurecimiento", value: `${item.overlay_opacity ?? 58}%` },
      { label: "Orden", value: item.sort_order ?? 0 },
      { label: "Encaje", value: item.image_fit || "cover" }
    ].map(m => `<div class="content-meta-item"><span>${WT.escapeHTML(m.label)}</span><strong>${WT.escapeHTML(m.value)}</strong></div>`).join("");

    return `<article class="admin-content-record hero-slide-record" data-hero-record data-search="${WT.escapeHTML([item.title,item.subtitle,item.button_text,item.secondary_button_text].filter(Boolean).join(' ').toLowerCase())}" data-status="${item.active ? 'active' : 'inactive'}">
      <div class="content-record-media hero-record-media">
        ${image}
        <div class="hero-mini-overlay" style="opacity:${Math.min(95, Math.max(0, Number(item.overlay_opacity ?? 58))) / 100}"></div>
      </div>
      <div class="content-record-body">
        <div class="content-record-top">
          <div>
            <div class="content-badge-row">
              <span class="content-badge ${item.active ? 'is-active' : 'is-inactive'}">${item.active ? 'Activo' : 'Inactivo'}</span>
              <span class="content-badge is-kind">Slide</span>
              <span class="content-badge is-featured">Orden ${WT.escapeHTML(item.sort_order ?? 0)}</span>
            </div>
            <h3>${WT.escapeHTML(item.title || "Sin título")}</h3>
          </div>
          <div class="content-record-actions">
            <button class="btn btn-soft btn-small" data-edit-hero="${item.id}">Editar</button>
            <button class="btn btn-danger btn-small" data-delete="hero_slides:${item.id}">Eliminar</button>
          </div>
        </div>
        <p class="content-record-description">${WT.escapeHTML(subtitle)}</p>
        <div class="content-meta-grid hero-meta-grid">${meta}</div>
      </div>
    </article>`;
  }

  function settingCard(item) {
    const group = getSettingGroup(item.key);
    const friendly = getSettingFriendly(item.key, item);
    const isImage = ["site_logo", "logo_url", "icon_url", "favicon_url"].includes(item.key);
    const image = isImage && item.value
      ? `<img class="setting-image-preview" src="${WT.escapeHTML(item.value)}" alt="${WT.escapeHTML(friendly.title)}" onerror="this.remove()">`
      : "";
    return `<article class="admin-setting-record friendly-setting-record" data-setting-record data-group="${WT.escapeHTML(group.id)}" data-public="${item.is_public ? 'yes' : 'no'}" data-type="${WT.escapeHTML(item.type || 'text')}" data-search="${WT.escapeHTML([friendly.title, getSettingLabel(item.key), item.key, item.value, item.description, friendly.hint].filter(Boolean).join(' ').toLowerCase())}">
      <div class="setting-record-head">
        <div>
          <span class="setting-group-pill">${WT.escapeHTML(group.label)}</span>
          <h3>${WT.escapeHTML(friendly.title)}</h3>
          <p class="setting-friendly-hint">${WT.escapeHTML(friendly.hint || "")}</p>
          <details class="setting-tech-details"><summary>Ver nombre técnico</summary><code>${WT.escapeHTML(item.key || '')}</code></details>
        </div>
        ${image}
      </div>
      <p class="setting-value-preview">${WT.escapeHTML(settingPreviewValue(item))}</p>
      ${item.description && item.description !== friendly.hint ? `<p class="setting-description">${WT.escapeHTML(item.description)}</p>` : ""}
      <div class="content-badge-row">
        <span class="content-badge is-kind">${WT.escapeHTML(friendlyTypeLabel(item.type, item.key))}</span>
        <span class="content-badge ${item.is_public ? 'is-active' : 'is-inactive'}">${item.is_public ? 'Visible en la web' : 'Solo admin'}</span>
      </div>
      <div class="record-actions">
        <button class="btn btn-soft btn-small" data-edit-setting="${item.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-delete="site_settings:${item.id}">Eliminar</button>
      </div>
    </article>`;
  }

  function renderLogRecord(l) {
    const actor = l.user_profiles?.full_name || l.user_id || "Sistema";
    const details = JSON.stringify(l.details || {}, null, 2);
    return `<article class="admin-log-record" data-log-record data-table="${WT.escapeHTML(l.table_name || '')}" data-action="${WT.escapeHTML(l.action || '')}" data-search="${WT.escapeHTML([l.action,l.table_name,actor,details].filter(Boolean).join(' ').toLowerCase())}">
      <div class="log-icon">📝</div>
      <div class="log-body">
        <div class="log-top">
          <div>
            <h3>${WT.escapeHTML(String(l.action || 'Acción').replaceAll('_',' '))}</h3>
            <p>${WT.escapeHTML(actor)}</p>
          </div>
          <time>${WT.escapeHTML(WT.formatDate(l.created_at))}</time>
        </div>
        <div class="content-badge-row">
          <span class="content-badge is-kind">${WT.escapeHTML(l.table_name || 'Sin tabla')}</span>
          ${l.record_id ? `<span class="content-badge is-inactive">ID ${WT.escapeHTML(String(l.record_id).slice(0, 8))}</span>` : ""}
        </div>
        <div class="record-actions"><button class="btn btn-soft btn-small" data-log='${WT.escapeHTML(details)}'>Ver detalles</button></div>
      </div>
    </article>`;
  }

  function renderContentMeta(cfg, item) {
    const rows = [];
    if (cfg.table === "announcements") {
      rows.push({ label: "Tipo", value: item.type === "popup" ? "Popup" : item.type === "banner" ? "Banner" : "Tarjeta" });
      rows.push({ label: "Ubicación", value: getPositionLabel(item.position) });
      rows.push({ label: "Frecuencia", value: item.popup_frequency === "always" ? "Siempre" : item.popup_frequency === "daily" ? "Diario" : "Una vez" });
      rows.push({ label: "CTA", value: getDestinationLabel(item.cta_url) });
    } else if (cfg.table === "services_j1") {
      rows.push({ label: "Icono", value: item.icon || "—" });
      rows.push({ label: "CTA", value: safeText(item.cta_text, "Sin botón") });
      rows.push({ label: "Destino", value: getDestinationLabel(item.cta_url) });
    } else if (cfg.table === "english_courses") {
      rows.push({ label: "Precio", value: safeText(item.price, "No definido") });
      rows.push({ label: "Duración", value: safeText(item.duration, "No definido") });
      rows.push({ label: "Nivel", value: safeText(item.level, "No definido") });
      rows.push({ label: "Modalidad", value: safeText(item.modality, "No definido") });
    }
    rows.push({ label: "Orden", value: item.sort_order ?? 0 });
    return rows;
  }

  function renderContentRecord(cfg, item) {
    const image = item.image_url
      ? `<img class="content-record-image" src="${WT.escapeHTML(item.image_url)}" alt="Imagen de ${WT.escapeHTML(item.title || cfg.label)}" onerror="this.src='images/placeholder-hero.jpg'">`
      : `<div class="content-record-image content-record-image-empty">Sin imagen</div>`;
    const status = item.active ? "Activo" : "Inactivo";
    const typeOrKind = cfg.table === "announcements" ? (item.type || "card") : cfg.label;
    const badgeClass = item.active ? "is-active" : "is-inactive";
    const featured = item.featured ? `<span class="content-badge is-featured">Destacado</span>` : "";
    const desc = safeText(item.description, "Sin descripción");
    const meta = renderContentMeta(cfg, item).map(m => `<div class="content-meta-item"><span>${WT.escapeHTML(m.label)}</span><strong>${WT.escapeHTML(m.value)}</strong></div>`).join("");
    return `<article class="admin-content-record" data-search="${WT.escapeHTML([item.title, safeText(item.description, ''), item.type, item.position, item.level, item.modality, item.price].filter(Boolean).join(' ').toLowerCase())}" data-status="${item.active ? 'active' : 'inactive'}" data-featured="${item.featured ? 'yes' : 'no'}" data-type="${WT.escapeHTML(typeOrKind || '')}" data-position="${WT.escapeHTML(item.position || '')}">
      <div class="content-record-media">${image}</div>
      <div class="content-record-body">
        <div class="content-record-top">
          <div>
            <div class="content-badge-row">
              <span class="content-badge ${badgeClass}">${status}</span>
              <span class="content-badge is-kind">${WT.escapeHTML(typeOrKind)}</span>
              ${featured}
            </div>
            <h3>${WT.escapeHTML(item.title || "Sin título")}</h3>
          </div>
          <div class="content-record-actions">
            <button class="btn btn-soft btn-small" data-edit-content="${cfg.table}:${item.id}">Editar</button>
            <button class="btn btn-danger btn-small" data-delete="${cfg.table}:${item.id}">Eliminar</button>
          </div>
        </div>
        <p class="content-record-description">${WT.escapeHTML(desc)}</p>
        <div class="content-meta-grid">${meta}</div>
      </div>
    </article>`;
  }

  function contentToolbar(cfg, data = []) {
    const typeOptions = cfg.table === "announcements"
      ? `<select class="input" id="contentTypeFilter"><option value="">Todos los tipos</option><option value="banner">Banner</option><option value="popup">Popup</option><option value="card">Tarjeta</option></select>`
      : "";
    const positionOptions = cfg.table === "announcements"
      ? `<select class="input" id="contentPositionFilter"><option value="">Todas las ubicaciones</option>${POSITIONS.map(p => `<option value="${WT.escapeHTML(p.value)}">${WT.escapeHTML(p.label)}</option>`).join("")}</select>`
      : "";
    return `<div class="toolbar-card content-admin-toolbar">
      <input class="input" id="contentSearch" placeholder="Buscar ${WT.escapeHTML(cfg.title.toLowerCase())}...">
      <select class="input" id="contentStatusFilter"><option value="">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select>
      <select class="input" id="contentFeaturedFilter"><option value="">Destacados y normales</option><option value="yes">Solo destacados</option><option value="no">No destacados</option></select>
      ${typeOptions}
      ${positionOptions}
    </div>
    <div class="admin-summary-strip">
      <span><strong>${data.length}</strong> registros</span>
      <span><strong>${data.filter(x => x.active).length}</strong> activos</span>
      <span><strong>${data.filter(x => x.featured).length}</strong> destacados</span>
      ${cfg.table === "announcements" ? `<span><strong>${data.filter(x => x.type === 'popup').length}</strong> popups</span>` : ""}
    </div>`;
  }

  async function renderContentTable(cfg) {
    header(cfg.title, () => openContentForm(cfg));
    const { data, error } = await WT.supabase.from(cfg.table).select("*").order("sort_order", { ascending: true });
    if (error) return view().innerHTML = `<div class="empty-state">${WT.escapeHTML(error.message)}</div>`;
    const items = data || [];
    view().innerHTML = `${contentToolbar(cfg, items)}<div class="admin-content-grid" id="contentList">${items.map(item => renderContentRecord(cfg, item)).join("") || `<div class="empty-state">Sin registros.</div>`}</div>`;

    const applyFilters = () => {
      const search = (WT.qs("#contentSearch")?.value || "").toLowerCase();
      const status = WT.qs("#contentStatusFilter")?.value || "";
      const featured = WT.qs("#contentFeaturedFilter")?.value || "";
      const type = WT.qs("#contentTypeFilter")?.value || "";
      const position = WT.qs("#contentPositionFilter")?.value || "";
      WT.qsa(".admin-content-record").forEach(card => {
        const okSearch = !search || (card.dataset.search || "").includes(search);
        const okStatus = !status || card.dataset.status === status;
        const okFeatured = !featured || card.dataset.featured === featured;
        const okType = !type || card.dataset.type === type;
        const okPosition = !position || card.dataset.position === position;
        card.classList.toggle("hidden", !(okSearch && okStatus && okFeatured && okType && okPosition));
      });
    };
    ["#contentSearch", "#contentStatusFilter", "#contentFeaturedFilter", "#contentTypeFilter", "#contentPositionFilter"].forEach(sel => {
      const el = WT.qs(sel);
      if (el) {
        el.addEventListener("input", applyFilters);
        el.addEventListener("change", applyFilters);
      }
    });
    WT.qsa("[data-edit-content]").forEach(b => b.addEventListener("click", () => openContentForm(cfg, items.find(x => x.id === b.dataset.editContent.split(":")[1]))));
  }

  function announcementForm(item = {}) {
    return `${section("Información principal", `${field("Título", "title", item.title || "", "text", "required")}${textArea("Descripción", "description", item.description || "")}`)}
    ${section("Ubicación y comportamiento", `<div class="three compact-grid">${selectField("Tipo", "type", item.type || "card", [{value:"banner",label:"Banner"},{value:"popup",label:"Popup"},{value:"card",label:"Tarjeta"}])}${positionField(item.position || "home")}${selectField("Frecuencia popup", "popup_frequency", item.popup_frequency || "once", [{value:"once",label:"Una vez"},{value:"daily",label:"Una vez al día"},{value:"always",label:"Siempre"}])}</div>`, "Ya no tienes que escribir home, forum o courses. Selecciónalo aquí.")}
    ${section("Botón del anuncio", `<div class="two">${field("Texto del botón", "cta_text", item.cta_text || "")}${destinationField("Destino del botón", "cta_url", item.cta_url || "")}</div>`, "Elige una sección de la web o usa una URL personalizada.")}
    ${section("Fechas", `<div class="three compact-grid">${field("Inicio", "start_date", item.start_date || "", "datetime-local")}${field("Fin", "end_date", item.end_date || "", "datetime-local")}${field("Delay popup ms", "popup_delay_ms", item.popup_delay_ms || 1500, "number")}</div>`)}
    `;
  }


  function parseAdminOptions(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "object") return Array.isArray(value.items) ? value.items : [];
    try {
      const parsed = JSON.parse(String(value));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function splitLines(value = "") {
    return String(value || "").split(/\n|,/).map(x => x.trim()).filter(Boolean);
  }

  function serviceOptionCard(option = {}, index = 0) {
    const galleryValue = Array.isArray(option.gallery_json || option.gallery)
      ? (option.gallery_json || option.gallery).join("\n")
      : String(option.gallery_json || option.gallery || "");
    const logo = option.logo_url || option.image_url || "";
    return `<article class="service-option-admin-card" data-service-option-card>
      <div class="service-option-admin-head">
        <strong>Opción / sección ${index + 1}</strong>
        <button type="button" class="btn btn-soft btn-small" data-remove-service-option>Eliminar</button>
      </div>
      <div class="service-option-admin-grid">
        <label>Título de la opción<input class="input" type="text" data-option-field="title" value="${WT.escapeHTML(option.title || "")}" placeholder="Ej: Récord de notas UASD"></label>
        <label>Subtítulo / institución<input class="input" type="text" data-option-field="subtitle" value="${WT.escapeHTML(option.subtitle || option.university || "")}" placeholder="Ej: Universidad Autónoma de Santo Domingo"></label>
        <label>Estado / etiqueta<input class="input" type="text" data-option-field="badge" value="${WT.escapeHTML(option.badge || "Disponible")}" placeholder="Disponible"></label>
        <label>Duración<input class="input" type="text" data-option-field="duration" value="${WT.escapeHTML(option.duration || "")}" placeholder="Ej: 10 días aprox."></label>
        <label>Modalidad<input class="input" type="text" data-option-field="modality" value="${WT.escapeHTML(option.modality || "")}" placeholder="Ej: En línea"></label>
        <label>Nivel / tipo<input class="input" type="text" data-option-field="level" value="${WT.escapeHTML(option.level || "")}" placeholder="Ej: Documentos"></label>
      </div>
      <label>Resumen visible en la tarjeta<textarea class="input" data-no-rich="true" data-option-field="summary" placeholder="Resumen corto que verá el público antes de abrir la guía">${WT.escapeHTML(option.summary || option.description || "")}</textarea></label>
      <label>Comentario visible como guía<textarea class="input service-option-guide-note" data-no-rich="true" data-option-field="guide_note" placeholder="Nota, advertencia o comentario que se mostrará dentro de la guía. Ej: tiempo aproximado, recomendación, aclaración importante.">${WT.escapeHTML(option.guide_note || option.note || "")}</textarea></label>
      <div class="service-option-logo-admin">
        <img src="${WT.escapeHTML(WT.sanitizeImageUrl(logo, 'images/placeholder-logo.png'))}" alt="Logo" data-option-logo-preview onerror="this.src='images/placeholder-logo.png'">
        <div class="service-option-logo-controls">
          <label>Logo / imagen de la opción<input class="input" type="text" data-option-field="logo_url" value="${WT.escapeHTML(logo)}" placeholder="Pega una URL o sube una imagen"></label>
          <div class="option-logo-actions">
            <input class="input" type="file" accept="image/png,image/jpeg,image/webp" data-option-logo-file>
            <button type="button" class="btn btn-soft btn-small" data-adjust-option-logo>Ajustar imagen</button>
            <button type="button" class="btn btn-danger-soft btn-small" data-clear-option-logo>Quitar logo</button>
          </div>
          <small>Al subir un logo podrás moverlo y centrarlo antes de guardarlo. Si presionas Quitar logo, la imagen dejará de mostrarse en esta opción.</small>
        </div>
      </div>
      <label>Guía completa de esta opción<textarea class="input service-option-details-input" data-no-rich="true" data-option-field="details" placeholder="Escribe aquí los pasos, requisitos, notas y enlaces de esta opción específica.">${WT.escapeHTML(option.details || option.long_description || "")}</textarea></label>
      <label>Imágenes de esta opción<textarea class="input" data-no-rich="true" data-option-field="gallery_json" placeholder="Pega una URL pública por línea o sube imágenes debajo.">${WT.escapeHTML(galleryValue)}</textarea></label>
      <div class="gallery-upload-box">
        <input class="input" type="file" accept="image/*" multiple data-option-gallery-file>
        <small>Sube una o varias imágenes; cada una se abrirá en el editor antes de guardarse.</small>
      </div>
    </article>`;
  }

  function serviceOptionsBuilder(item = {}) {
    const options = parseAdminOptions(item.child_guides_json || item.service_options_json || item.options_json || item.guides_json);
    const initial = options.length ? options : [];
    return section("Opciones internas del servicio", `<div class="service-options-admin-box" data-service-options-builder>
      <p class="form-help">Usa esto cuando un servicio tenga varias opciones internas, por ejemplo varias universidades dentro de Récord de notas, varios métodos o varias guías. Cada opción puede tener su logo, resumen, texto completo e imágenes.</p>
      <div data-service-options-list>${initial.map(serviceOptionCard).join("") || `<div class="empty-state mini" data-no-service-options>Aún no hay opciones internas. Puedes dejarlo vacío si este servicio solo tiene una guía general.</div>`}</div>
      <button type="button" class="btn btn-soft" data-add-service-option>+ Agregar opción interna</button>
      <textarea class="hidden" name="child_guides_json" data-service-options-json>${WT.escapeHTML(JSON.stringify(initial))}</textarea>
    </div>`, "Todo lo que agregues aquí será visible para el público como tarjetas tocables dentro del servicio.");
  }

  function collectServiceOptions(form) {
    const hidden = WT.qs("[data-service-options-json]", form);
    if (!hidden) return [];
    const options = WT.qsa("[data-service-option-card]", form).map((card, index) => {
      const value = field => WT.qs(`[data-option-field="${field}"]`, card)?.value?.trim() || "";
      const title = value("title");
      const subtitle = value("subtitle");
      const summary = value("summary");
      const details = value("details");
      const logo = value("logo_url");
      const gallery = splitLines(value("gallery_json"));
      return {
        id: (title || subtitle || `opcion-${index + 1}`).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `opcion-${index + 1}`,
        title,
        subtitle,
        summary,
        logo_url: logo,
        badge: value("badge"),
        duration: value("duration"),
        modality: value("modality"),
        level: value("level"),
        details,
        guide_note: value("guide_note"),
        gallery_json: gallery
      };
    }).filter(opt => opt.title || opt.summary || opt.details || opt.logo_url || opt.gallery_json.length);
    hidden.value = JSON.stringify(options);
    return options;
  }

  async function uploadOptionLogoFile(file, cfg = {}, currentUrl = "") {
    if (!file && !currentUrl) return null;
    let edited = null;
    if (window.WTImageEditor?.open) {
      edited = await WTImageEditor.open({
        file: file || null,
        src: file ? "" : currentUrl,
        aspectRatio: "1:1",
        shape: "circle",
        title: "Ajustar logo circular de la opción",
        maxOutputWidth: 700,
        maxBytes: 1200000
      });
    }
    let blob = edited?.blob || file;
    if (!blob) return null;
    let fileName = file?.name || `logo-${Date.now()}.${extensionFromBlob(blob)}`;
    if (window.WTImageCompressor?.optimizeForUse) {
      const sourceFile = new File([blob], fileName, { type: blob.type || file?.type || "image/jpeg" });
      const optimized = await WTImageCompressor.optimizeForUse(sourceFile, "admin-option-logo", { fallbackToOriginal: true, onlyIfSmaller: false });
      blob = optimized.blob || blob;
      fileName = optimized.fileName || fileName;
    }
    const ext = extensionFromBlob(blob);
    const bucket = cfg.bucket || WT.cfg.BUCKETS.service_images;
    const folder = `${cfg.folder || "services"}/options`;
    return await WT.uploadBlob(bucket, `${folder}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`, blob, { contentType: blob.type || file?.type || "image/jpeg", fileName });
  }

  function bindServiceOptionsBuilder(root, cfg = {}) {
    const box = WT.qs("[data-service-options-builder]", root);
    if (!box) return;
    const list = WT.qs("[data-service-options-list]", box);
    const sync = () => collectServiceOptions(root);
    const refreshIndexes = () => {
      WT.qsa("[data-service-option-card]", box).forEach((card, index) => {
        const title = WT.qs(".service-option-admin-head strong", card);
        if (title) title.textContent = `Opción / sección ${index + 1}`;
      });
    };
    WT.qs("[data-add-service-option]", box)?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      try {
        WT.qs("[data-no-service-options]", box)?.remove();
        const wrap = document.createElement("div");
        wrap.innerHTML = serviceOptionCard({}, WT.qsa("[data-service-option-card]", box).length).trim();
        const card = wrap.firstElementChild;
        if (!card) return;
        list.appendChild(card);
        // No reactivar el editor enriquecido en toda la lista; eso cerraba/rompía el modal.
        refreshIndexes();
        sync();
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        WT.qs('[data-option-field="title"]', card)?.focus?.();
      } catch (err) {
        console.error("No se pudo agregar opción interna", err);
        WT.toast("No se pudo agregar la sección interna. Recarga la página e intenta de nuevo.", "error");
      }
    });
    box.addEventListener("input", event => {
      window.WTAdminRich?.sync(box);
      const logoInput = event.target.closest('[data-option-field="logo_url"]');
      if (logoInput) {
        const card = logoInput.closest("[data-service-option-card]");
        const preview = WT.qs("[data-option-logo-preview]", card);
        if (preview) preview.src = WT.sanitizeImageUrl(logoInput.value, "images/placeholder-logo.png");
      }
      sync();
    });
    box.addEventListener("click", async event => {
      const clearLogo = event.target.closest("[data-clear-option-logo]");
      if (clearLogo) {
        const card = clearLogo.closest("[data-service-option-card]");
        const urlInput = WT.qs('[data-option-field="logo_url"]', card);
        const preview = WT.qs("[data-option-logo-preview]", card);
        if (urlInput) urlInput.value = "";
        if (preview) preview.src = "images/placeholder-logo.png";
        sync();
        WT.toast("Logo quitado de esta opción", "success");
        return;
      }

      const adjustLogo = event.target.closest("[data-adjust-option-logo]");
      if (adjustLogo) {
        const card = adjustLogo.closest("[data-service-option-card]");
        const urlInput = WT.qs('[data-option-field="logo_url"]', card);
        const preview = WT.qs("[data-option-logo-preview]", card);
        const currentUrl = String(urlInput?.value || "").trim();
        if (!currentUrl) {
          WT.toast("Primero sube o pega una imagen para poder ajustarla.", "warning");
          return;
        }
        try {
          const uploaded = await uploadOptionLogoFile(null, cfg, currentUrl);
          if (uploaded?.url && urlInput) urlInput.value = uploaded.url;
          if (uploaded?.url && preview) preview.src = uploaded.url;
          sync();
          WT.toast("Logo ajustado y guardado", "success");
        } catch (err) {
          if (!String(err.message || "").toLowerCase().includes("cancel")) WT.toast(err.message || "No se pudo ajustar el logo", "error");
        }
        return;
      }

      const remove = event.target.closest("[data-remove-service-option]");
      if (!remove) return;
      remove.closest("[data-service-option-card]")?.remove();
      if (!WT.qsa("[data-service-option-card]", box).length) list.innerHTML = `<div class="empty-state mini" data-no-service-options>Aún no hay opciones internas. Puedes dejarlo vacío si este servicio solo tiene una guía general.</div>`;
      refreshIndexes();
      sync();
    });
    box.addEventListener("change", async event => {
      const galleryInput = event.target.closest("[data-option-gallery-file]");
      if (galleryInput?.files?.length) {
        const card = galleryInput.closest("[data-service-option-card]");
        const galleryTextarea = WT.qs('[data-option-field="gallery_json"]', card);
        try {
          await uploadGalleryFiles(galleryInput, galleryTextarea, { bucket: cfg.bucket || WT.cfg.BUCKETS.service_images, folder: `${cfg.folder || "services"}/options-gallery` });
          sync();
        } catch (err) {
          WT.toast(err.message || "No se pudieron subir las imágenes", "error");
        }
        return;
      }
      const input = event.target.closest("[data-option-logo-file]");
      if (!input?.files?.[0]) return;
      const card = input.closest("[data-service-option-card]");
      const urlInput = WT.qs('[data-option-field="logo_url"]', card);
      const preview = WT.qs("[data-option-logo-preview]", card);
      try {
        const uploaded = await uploadOptionLogoFile(input.files[0], cfg);
        if (uploaded?.url && urlInput) urlInput.value = uploaded.url;
        if (uploaded?.url && preview) preview.src = uploaded.url;
        sync();
        WT.toast("Logo de la opción ajustado y subido", "success");
      } catch (err) {
        if (!String(err.message || "").toLowerCase().includes("cancel")) WT.toast(err.message || "No se pudo subir el logo", "error");
      } finally {
        input.value = "";
      }
    });
    window.WTAdminRich?.enhance(box);
    sync();
  }

  function serviceForm(item = {}) {
    const galleryValue = Array.isArray(item.gallery_json) ? item.gallery_json.join("\n") : (typeof item.gallery_json === "string" ? item.gallery_json : "");
    return `${section("Información del servicio", `${field("Título", "title", item.title || "", "text", "required")}${textArea("Descripción corta", "description", item.description || "")}${textArea("Descripción general del servicio", "details", item.details || item.long_description || "", "placeholder='Este texto se usa si el servicio no tiene opciones internas. Si agregas opciones, cada opción tendrá su propia guía completa.'")}${field("Icono", "icon", item.icon || "")}`)}
    ${section("Detalles rápidos", `<div class="three compact-grid">${field("Precio / costo", "price", item.price || "")}${field("Duración", "duration", item.duration || "")}${field("Nivel / público", "level", item.level || "")}</div><div class="two compact-grid">${field("Modalidad", "modality", item.modality || "")}${field("Orden", "sort_order", item.sort_order ?? 0, "number")}</div>`)}
    ${serviceOptionsBuilder(item)}
    ${section("Imágenes adicionales del servicio", `${textArea("Galería general", "gallery_json", galleryValue, "data-no-rich='true' placeholder='Pega una URL pública por línea o sube imágenes debajo.'")}<div class="gallery-upload-box"><input class="input" type="file" accept="image/*" multiple data-general-gallery-file><small>Al subir imágenes, cada una se abrirá en el editor. Luego presiona Guardar servicio para aplicar los cambios.</small></div>`, "Estas imágenes se muestran en la guía general o como respaldo para opciones internas sin imágenes.")}
    ${section("Botón", `<div class="two">${field("Texto del botón", "cta_text", item.cta_text || "Solicitar servicio")}${destinationField("Destino del botón", "cta_url", item.cta_url || "")}</div>`, "Si no pones destino, la tarjeta abrirá su propia página de detalle.")}`;
  }

  function courseForm(item = {}) {
    return `${section("Información del curso", `${field("Título", "title", item.title || "", "text", "required")}${textArea("Descripción corta", "description", item.description || "")}${textArea("Descripción completa del curso", "details", item.details || item.long_description || "")}`)}
    ${section("Detalles", `<div class="three compact-grid">${field("Precio", "price", item.price || "")}${field("Duración", "duration", item.duration || "")}${field("Nivel", "level", item.level || "")}</div><div class="three compact-grid">${field("Modalidad", "modality", item.modality || "")}${field("Profesor", "teacher", item.teacher || "")}${field("Institución", "institution", item.institution || "")}</div>`)}
    ${section("Botones", `<div class="two">${field("Texto CTA", "cta_text", item.cta_text || "Solicitar información")}${destinationField("Destino CTA", "cta_url", item.cta_url || "")}</div>${destinationField("Destino para preguntar en foro", "forum_url", item.forum_url || "foro.html")}`, "Si no pones destino, la tarjeta abre su propia página de detalle.")}`;
  }

  async function openContentForm(cfg, item = {}) {
    const body = `<form class="admin-form modern-admin-form" id="contentForm">${cfg.form(item)}${imageFields(item, "16:9")}${section("Publicación", `<div class="two compact-grid">${boolField("Activo", "active", item.active ?? true)}${boolField("Destacado", "featured", item.featured ?? false)}</div>`)}<button class="btn btn-primary">Guardar ${cfg.label}</button></form>`;
    const modal = WT.showModal({ title: item.id ? `Editar ${cfg.label}` : `Crear ${cfg.label}`, body, className: "admin-edit-modal", closeOnBackdrop: false });
    bindDestinationFields(modal.element);
    bindImagePicker(modal.element, item, "16:9");
    if (cfg.table === "services_j1") bindServiceOptionsBuilder(modal.element, cfg);
    window.WTAdminRich?.enhance(modal.element);
    const generalGallery = WT.qs("[data-general-gallery-file]", modal.element);
    generalGallery?.addEventListener("change", async () => {
      const textarea = WT.qs('textarea[name="gallery_json"]', modal.element);
      try {
        await uploadGalleryFiles(generalGallery, textarea, { bucket: cfg.bucket, folder: `${cfg.folder || "content"}/gallery` });
        textarea?.dispatchEvent(new Event("input", { bubbles: true }));
        form?.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (err) {
        WT.toast(err.message || "No se pudieron subir las imágenes", "error");
      }
    });
    const form = WT.qs("#contentForm", modal.element);
    bindAdminDraftAutosave(form, cfg.table, item);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      window.WTAdminRich?.sync(e.currentTarget);
      window.WTAdminRich?.sync(modal.element);
      if (cfg.table === "services_j1") collectServiceOptions(e.currentTarget);
      const fd = new FormData(e.currentTarget);
      try {
        const upload = await uploadOptionalImage(fd, cfg.bucket, cfg.folder, "16:9", form);
        const payload = cleanVirtualFields(Object.fromEntries(fd.entries()));
        ["active", "featured"].forEach(k => payload[k] = payload[k] === "true");
        ["sort_order", "image_position_x", "image_position_y", "popup_delay_ms"].forEach(k => { if (payload[k] !== undefined && payload[k] !== "") payload[k] = Number(payload[k]); });
        if (payload.image_zoom !== undefined) payload.image_zoom = Number(payload.image_zoom || 1);
        if (payload.gallery_json !== undefined) {
          const rawGallery = String(payload.gallery_json || "").trim();
          payload.gallery_json = rawGallery ? rawGallery.split(/\n|,/).map(x => x.trim()).filter(Boolean) : [];
        }
        if (payload.child_guides_json !== undefined) {
          try { payload.child_guides_json = JSON.parse(payload.child_guides_json || "[]"); }
          catch (_) { payload.child_guides_json = []; }
        }
        if (payload.start_date === "") payload.start_date = null;
        if (payload.end_date === "") payload.end_date = null;
        applyUploadedImage(payload, upload);
        const result = item.id ? await adminQuery(() => WT.supabase.from(cfg.table).update(payload).eq("id", item.id).select("id").single()) : await adminQuery(() => WT.supabase.from(cfg.table).insert(payload).select("id").single());
        if (result.error) throw result.error;
        await log(item.id ? `editar_${cfg.label}` : `crear_${cfg.label}`, cfg.table, item.id || result.data.id, payload);
        clearAdminDraft(form);
        WT.toast("Guardado correctamente", "success"); modal.close(); cfg.table === "announcements" ? renderAnnouncements() : cfg.table === "services_j1" ? renderServices() : renderCourses();
      } catch (err) {
        const msg = String(err.message || err || "Error al guardar");
        const friendlyMsg = /Cannot coerce|PGRST116|single JSON object/i.test(msg) ? "No se pudo confirmar el guardado. Revisa si el cambio se aplicó y vuelve a intentarlo" : msg;
        if (msg.includes("child_guides_json") || msg.includes("service_options")) {
          WT.toast("Esta función todavía no está lista. Revisa la configuración interna antes de guardar.", "error");
        } else {
          WT.toast(`${friendlyMsg}. Tu borrador quedó protegido localmente.`, "error");
        }
      }
    });
  }

  const OWNER_EMAIL = "edisonpeguero61@gmail.com";
  const OWNER_EMAILS = new Set([
    "edisonpeguero61@gmail.com",
    "nubepeguero@gmail.com",
    "nubepeguero@peguerocrespo.com",
    "workandtravelrd@gmail.com",
    "workandtravelrd@peguerocrespo.com"
  ]);
  const ROLE_RANKS = { user: 0, moderator: 1, moderador: 1, admin: 2, superadmin: 3, owner: 4 };
  const ROLE_LABELS = { owner: "★★★★★", superadmin: "Director", admin: "Administrador", moderator: "Moderador", moderador: "Moderador", user: "" };
  function roleRank(role = "user") { return ROLE_RANKS[String(role || "user").toLowerCase()] ?? 0; }
  function roleLabel(role = "user") { return ROLE_LABELS[String(role || "user").toLowerCase()] ?? String(role || ""); }
  function isOwnerRole(role = "") { return String(role || "").toLowerCase() === "owner"; }
  function canManageRoleTarget(target = {}, myProfile = {}) {
    const myRole = String(myProfile?.role || "user").toLowerCase();
    const targetRole = String(target?.role || "user").toLowerCase();
    if (!myProfile?.id || !target?.id || String(myProfile.id) === String(target.id)) return false;
    if (myRole === "owner") return true;
    if (isOwnerRole(targetRole)) return false;
    return roleRank(myRole) > roleRank(targetRole);
  }
  function protectedEmailForUser(u = {}, myProfile = {}) {
    const email = String(u.email || "").trim();
    const normalized = email.toLowerCase();
    const sameUser = String(myProfile?.id || "") === String(u.id || "");
    const viewerIsOwner = isOwnerProfile(myProfile);
    const targetIsOwner = isOwnerRole(u.role) || OWNER_EMAILS.has(normalized);
    if (targetIsOwner && !sameUser && !viewerIsOwner) return "Correo protegido";
    if (targetIsOwner && !sameUser && viewerIsOwner) return email || "Correo owner";
    return email || "Sin correo";
  }

  async function loadUserBadges() {
    try {
      const [{ data: defs, error: e1 }, { data: assigned, error: e2 }] = await Promise.all([
        WT.supabase.from("badge_definitions").select("*").order("name", { ascending: true }),
        WT.supabase.from("user_badges").select("id,user_id,badge_id,badge_definitions(id,name,icon,color)")
      ]);
      if (e1 || e2) return { defs: [], byUser: {} };
      const byUser = {};
      (assigned || []).forEach(row => {
        byUser[row.user_id] ||= [];
        if (row.badge_definitions) byUser[row.user_id].push({ ...row.badge_definitions, assigned_id: row.id });
      });
      return { defs: defs || [], byUser };
    } catch (_) { return { defs: [], byUser: {} }; }
  }

  async function renderUsers() {
    header("Usuarios", null);
    const myProfile = await WT.getMyProfile();
    const myPermissions = await loadMyGranularPermissions(myProfile?.id);
    const { data, error } = await WT.supabase.from("user_profiles").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) return view().innerHTML = `<div class="empty-state">${WT.escapeHTML(error.message)}</div>`;
    const badgeData = await loadUserBadges();
    const cards = (data || []).map(u => renderUserRecord(u, badgeData.byUser[u.id] || [], myProfile, myPermissions)).join("");
    const badgeOptions = badgeData.defs.length ? `<option value="">Todas las insignias</option>` + badgeData.defs.map(b => `<option value="${WT.escapeHTML(b.id)}">${WT.escapeHTML((b.icon || "🏅") + " " + b.name)}</option>`).join("") : `<option value="">Todas las insignias</option>`;
    view().innerHTML = `<div class="toolbar-card admin-users-toolbar">
      <input class="input" id="userSearch" placeholder="Buscar por nombre, @usuario o correo...">
      <select class="input" id="userRoleFilter"><option value="">Todos los roles</option><option value="owner">★★★★★</option><option value="superadmin">Director</option><option value="admin">Administrador</option><option value="moderator">Moderadores</option><option value="user">Usuarios</option></select>
      <select class="input" id="userStatusFilter"><option value="">Todos los estados</option><option value="active">Activos</option><option value="blocked">Bloqueados</option><option value="pending">Pendientes</option></select>
      <select class="input" id="userBadgeFilter">${badgeOptions}</select>
    </div>
    <div class="admin-card-list" id="usersList">${cards || `<div class="empty-state">No hay usuarios.</div>`}</div>`;

    const applyFilters = () => {
      const search = (WT.qs("#userSearch")?.value || "").toLowerCase();
      const role = WT.qs("#userRoleFilter")?.value || "";
      const status = WT.qs("#userStatusFilter")?.value || "";
      const badge = WT.qs("#userBadgeFilter")?.value || "";
      WT.qsa(".admin-user-card").forEach(card => {
        const matchSearch = !search || card.textContent.toLowerCase().includes(search);
        const matchRole = !role || card.dataset.role === role;
        const matchStatus = !status || card.dataset.status === status;
        const badges = (card.dataset.badges || "").split(",").filter(Boolean);
        const matchBadge = !badge || badges.includes(badge);
        card.classList.toggle("hidden", !(matchSearch && matchRole && matchStatus && matchBadge));
      });
    };
    ["#userSearch", "#userRoleFilter", "#userStatusFilter", "#userBadgeFilter"].forEach(sel => WT.qs(sel)?.addEventListener("input", applyFilters));
    ["#userRoleFilter", "#userStatusFilter", "#userBadgeFilter"].forEach(sel => WT.qs(sel)?.addEventListener("change", applyFilters));
  }


    const adminActionIcons = {
      role: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10M7 7l3-3M7 7l3 3M17 17H7m10 0-3-3m3 3-3 3"/></svg>`,
      permissions: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3"/><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M12 15v2"/></svg>`,
      badges: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M8.5 12.5 7 21l5-3 5 3-1.5-8.5"/></svg>`,
      history: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>`,
      warning: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 19a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>`,
      block: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/></svg>`,
      unblock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>`
    };

  function renderBadgePills(badges = []) {
    if (!badges.length) return `<span class="user-badge-empty">Sin insignias</span>`;
    return badges.map(b => `<span class="user-badge-pill" style="--badge-color:${WT.escapeHTML(b.color || "#0b2f6b")}">${WT.escapeHTML(b.icon || "🏅")} ${WT.escapeHTML(b.name || "Insignia")}</span>`).join("");
  }

  function renderUserRecord(u, badges = [], myProfile = {}, myPermissions = new Set()) {
    const label = roleLabel(u.role || "user");
    const statusLabel = u.status === "blocked" ? "Bloqueado" : u.status === "pending" ? "Pendiente" : "Activo";
    const avatar = WT.sanitizeImageUrl(u.photo_url, "images/placeholder-avatar.png");
    const isMe = myProfile?.id === u.id;
    const isTargetAdmin = ["admin", "superadmin", "owner"].includes(String(u.role || "").toLowerCase());
    const canChangeRole = canActOnTargetWithPermission(u, myProfile, myPermissions, "change_role_lower_roles", "change_role_same_role");
    const canManageBadges = canManageRoleTarget(u, myProfile) && (isOwnerProfile(myProfile) || basePermissionKeysForRole(myProfile?.role).has("manage_badges") || myPermissions.has("manage_badges"));
    const canChangeStatus = canManageUserStatus(u, myProfile, myPermissions);
    const canWarnUser = canOpenManualWarning(u, myProfile, myPermissions);
    const canViewWarningsBtn = canViewUserWarnings(u, myProfile, myPermissions);
    const canEditPermissions = canManageGranularPermissionsTarget(u, myProfile, myPermissions);
    const shownEmail = protectedEmailForUser(u, myProfile);

    return `<article class="admin-user-card admin-record" data-user-card data-role="${WT.escapeHTML(u.role || "user")}" data-status="${WT.escapeHTML(u.status || "active")}" data-badges="${WT.escapeHTML(badges.map(b => b.id).join(","))}">
      <div class="admin-user-main">
        <img class="admin-user-avatar" src="${WT.escapeHTML(avatar)}" alt="Foto de ${WT.escapeHTML(u.full_name || u.email || "usuario")}" onerror="this.src='images/placeholder-avatar.png'">
        <div class="admin-user-info">
          <div class="admin-user-name-row">
            <h3>${WT.escapeHTML(u.full_name || "Usuario sin nombre")}</h3>
            ${label ? `<span class="role-badge ${WT.escapeHTML(u.role || "user")}">${WT.escapeHTML(label)}</span>` : ""}
          </div>
          <p class="admin-user-email">${WT.escapeHTML(shownEmail)}</p>
          ${u.username ? `<p class="admin-user-username">@${WT.escapeHTML(u.username)}</p>` : ""}
          <div class="admin-user-meta">
            <span class="status-pill status-${WT.escapeHTML(u.status || "active")}">${WT.escapeHTML(statusLabel)}</span>
            <span>Registro: ${WT.escapeHTML(WT.formatDate(u.created_at))}</span>
            ${u.city ? `<span>Ciudad: ${WT.escapeHTML(u.city)}</span>` : ""}
            ${u.program_year ? `<span>Año: ${WT.escapeHTML(u.program_year)}</span>` : ""}
          </div>
          <div class="user-badge-row">${renderBadgePills(badges)}</div>
          ${u.block_reason ? `<details class="admin-user-block-details admin-user-block-compact"><summary><span class="block-reason-mini-icon" aria-hidden="true">${adminActionIcons.block}</span><span>Motivo del bloqueo</span></summary><p>${WT.escapeHTML(u.block_reason)}</p></details>` : ""}
          ${!canChangeStatus && isTargetAdmin ? `<p class="form-help">No puedes modificar usuarios con el mismo nivel de responsabilidad o superior.</p>` : ""}
        </div>
      </div>
      <div class="record-actions admin-user-actions admin-user-actions-ordered">
        ${canChangeRole ? `<button class="btn btn-soft btn-small admin-action-btn action-role" data-user-role="${u.id}"><span class="admin-action-icon" aria-hidden="true">${adminActionIcons.role}</span><span>Cambiar rol</span></button>` : ""}
        ${canEditPermissions ? `<button class="btn btn-soft btn-small admin-action-btn action-permissions" data-user-permissions="${u.id}"><span class="admin-action-icon" aria-hidden="true">${adminActionIcons.permissions}</span><span>Permisos</span></button>` : ""}
        ${canManageBadges ? `<button class="btn btn-soft btn-small admin-action-btn action-badges" data-user-badges="${u.id}"><span class="admin-action-icon" aria-hidden="true">${adminActionIcons.badges}</span><span>Insignias</span></button>` : ""}
        ${canViewWarningsBtn ? `<button class="btn btn-soft btn-small admin-action-btn action-history" data-user-warnings="${u.id}"><span class="admin-action-icon" aria-hidden="true">${adminActionIcons.history}</span><span>Historial</span></button>` : ""}
        ${canWarnUser ? `<button class="btn btn-soft btn-small admin-action-btn action-warning" data-user-warning="${u.id}"><span class="admin-action-icon" aria-hidden="true">${adminActionIcons.warning}</span><span>Avisar</span></button>` : ""}
        ${canChangeStatus ? `<button class="btn ${u.status === "blocked" ? "btn-primary" : "btn-danger"} btn-small admin-action-btn ${u.status === "blocked" ? "action-unblock" : "action-block"}" data-user-status="${u.id}" data-current-status="${WT.escapeHTML(u.status || "active")}"><span class="admin-action-icon" aria-hidden="true">${u.status === "blocked" ? adminActionIcons.unblock : adminActionIcons.block}</span><span>${u.status === "blocked" ? "Desbloquear" : "Bloquear"}</span></button>` : ""}
      </div>
    </article>`;
  }

  async function renderAppearance() {
    header("Apariencia", null);
    const theme = await WTTheme.loadTheme();
    const colors = Object.entries(WTTheme.CSS_MAP);
    view().innerHTML = `<form class="admin-form" id="appearanceForm">${colors.map(([key]) => key.startsWith("color_") ? `<label>${WT.escapeHTML(key)}<div class="color-input-row"><input type="color" name="${key}" value="${WT.escapeHTML(theme[key] || "#000000")}"><input class="input" name="${key}_text" value="${WT.escapeHTML(theme[key] || "")}"></div></label>` : field(key, key, theme[key] || "")).join("")}<button class="btn btn-primary">Guardar apariencia</button></form>`;
    WT.qsa('input[type="color"]').forEach(color => color.addEventListener("input", () => { const text = WT.qs(`[name="${color.name}_text"]`); if (text) text.value = color.value; }));
    WT.qs("#appearanceForm").addEventListener("submit", async e => {
      e.preventDefault();
      if (cfg.table === "services_j1") collectServiceOptions(e.currentTarget);
      const fd = new FormData(e.currentTarget); const rows = [];
      colors.forEach(([key]) => rows.push({ key, value: fd.get(`${key}_text`) || fd.get(key), description: `Theme ${key}` }));
      const { error } = await adminQuery(() => WT.supabase.from("theme_settings").upsert(rows, { onConflict: "key" }));
      if (error) return WT.toast(error.message, "error");
      await log("cambiar_colores", "theme_settings", null, rows); WT.toast("Apariencia guardada", "success"); WTTheme.loadTheme();
    });
  }


  const LOGO_SETTING_KEYS = ["site_logo", "logo_url", "icon_url", "favicon_url"];

  function normalizeAdminSettingValue(value) {
    if (value == null) return "";
    if (typeof value === "string") {
      const clean = value.trim();
      if (!clean) return "";
      try {
        const parsed = JSON.parse(clean);
        return typeof parsed === "string" ? parsed : clean;
      } catch (_) {
        return clean;
      }
    }
    return String(value || "");
  }

  function logoSettingByKey(items, key) {
    return items.find(x => x.key === key) || null;
  }

  function logoItemFor(items, kind) {
    if (kind === "logo") return logoSettingByKey(items, "site_logo") || logoSettingByKey(items, "logo_url");
    if (kind === "icon") return logoSettingByKey(items, "icon_url");
    if (kind === "favicon") return logoSettingByKey(items, "favicon_url");
    return null;
  }

  function logoPanelCard(items, kind, meta) {
    const item = logoItemFor(items, kind);
    const value = normalizeAdminSettingValue(item?.value || "");
    const safeSrc = WT.sanitizeImageUrl(value, "images/placeholder-logo.png");
    const status = value ? "Configurado" : "Sin configurar";
    return `<article class="admin-logo-config-card" data-logo-config-card="${WT.escapeHTML(kind)}">
      <div class="admin-logo-preview-wrap">
        <img src="${WT.escapeHTML(safeSrc)}" alt="${WT.escapeHTML(meta.title)}" onerror="this.src='images/placeholder-logo.png'">
      </div>
      <div class="admin-logo-config-body">
        <span class="content-badge ${value ? "is-active" : "is-inactive"}">${status}</span>
        <h3>${WT.escapeHTML(meta.title)}</h3>
        <p>${WT.escapeHTML(meta.help)}</p>
        <small>${WT.escapeHTML(item?.key || meta.key)} · Imagen pública</small>
        <div class="record-actions">
          <button class="btn btn-primary btn-small" type="button" data-edit-logo-setting="${WT.escapeHTML(kind)}">${value ? "Cambiar imagen" : "Subir imagen"}</button>
          ${value ? `<button class="btn btn-soft btn-small" type="button" data-edit-logo-setting="${WT.escapeHTML(kind)}">Editar márgenes</button>` : ""}
        </div>
      </div>
    </article>`;
  }

  function renderLogoSettingsPanel(items) {
    return `<section class="admin-tool-card admin-logo-settings-panel">
      <div class="admin-section-heading">
        <div>
          <span class="section-kicker">Logo e identidad visual</span>
          <h3>Configurar logo de la web</h3>
          <p>Sube y ajusta el logo, icono y favicon desde aquí. La imagen quedará lista para mostrarse en la web.</p>
        </div>
      </div>
      <div class="admin-logo-config-grid">
        ${logoPanelCard(items, "logo", { key: "site_logo", title: "Logo principal", help: "Se muestra en la barra superior y encabezados de la web." })}
        ${logoPanelCard(items, "icon", { key: "icon_url", title: "Icono de la app", help: "Se usa para accesos directos o vistas pequeñas de la aplicación." })}
        ${logoPanelCard(items, "favicon", { key: "favicon_url", title: "Favicon", help: "Icono pequeño de la pestaña del navegador." })}
      </div>
    </section>`;
  }

  async function openLogoSetting(kind = "logo", items = []) {
    const config = {
      logo: { key: "site_logo", fallback: "logo_url", title: "Logo principal", description: "Logo que aparece en la web, barra y encabezados." },
      icon: { key: "icon_url", title: "Icono de la app", description: "Icono usado para accesos directos o partes pequeñas de la interfaz." },
      favicon: { key: "favicon_url", title: "Favicon", description: "Icono pequeño que aparece en la pestaña del navegador." }
    }[kind] || { key: "site_logo", title: "Logo principal", description: "Logo principal de la web." };

    let item = kind === "logo"
      ? (logoSettingByKey(items, "site_logo") || logoSettingByKey(items, "logo_url"))
      : logoSettingByKey(items, config.key);

    if (!item) {
      item = {
        key: config.key,
        value: "",
        type: "url",
        description: config.description,
        is_public: true
      };
    }

    openSettingForm(item);
  }

  async function renderSettings() {
    header("Configuración", () => openSettingForm(), "Crear ajuste");
    const { data, error } = await WT.supabase.from("site_settings").select("*").order("key");
    if (error) return view().innerHTML = `<div class="empty-state">${WT.escapeHTML(error.message)}</div>`;
    const items = data || [];
    const groupOptions = [{ id: "", label: "Todos los grupos" }, ...SETTING_GROUPS, { id: "other", label: "Otras configuraciones" }]
      .map(g => `<option value="${WT.escapeHTML(g.id)}">${WT.escapeHTML(g.label)}</option>`).join("");
    const settingValue = (key, fallback = "") => items.find(x => x.key === key)?.value ?? fallback;
    const compressionEnabled = String(settingValue("image_compression_enabled", "true")) !== "false";
    const compressionRequired = String(settingValue("image_compression_required", "true")) !== "false";
    const compressionMaxMb = settingValue("image_compression_max_upload_mb", "6");
    const compressionFinalMaxMb = settingValue("image_compression_final_max_mb", "3");
    view().innerHTML = `${renderLogoSettingsPanel(items)}
    <div class="toolbar-card settings-admin-toolbar">
      <input class="input" id="settingsSearch" placeholder="Buscar por nombre fácil, grupo o valor...">
      <select class="input" id="settingsGroupFilter">${groupOptions}</select>
      <select class="input" id="settingsPublicFilter"><option value="">Visibles y privadas</option><option value="yes">Visibles en la web</option><option value="no">Solo admin</option></select>
      <select class="input" id="settingsTypeFilter"><option value="">Todos los tipos</option><option value="text">Texto</option><option value="url">Enlace</option><option value="boolean">Activado / Desactivado</option><option value="html">Texto avanzado</option><option value="json">Datos avanzados</option></select>
    </div>
    <section class="admin-tool-card image-compression-panel">
      <div>
        <h3>Compresión de imágenes</h3>
        <p>Convierte imágenes a WebP antes de subirlas para que la página cargue más rápido.</p>
      </div>
      <form id="imageCompressionSettingsForm" class="admin-inline-form image-compression-grid">
        <label class="toggle-row"><span>Activar compresión WebP</span><select class="input" name="image_compression_enabled"><option value="true" ${compressionEnabled ? "selected" : ""}>Sí</option><option value="false" ${!compressionEnabled ? "selected" : ""}>No</option></select></label>
        <label class="toggle-row"><span>Obligatoria</span><select class="input" name="image_compression_required"><option value="true" ${compressionRequired ? "selected" : ""}>Sí, bloquear si falla</option><option value="false" ${!compressionRequired ? "selected" : ""}>No, permitir original si falla</option></select></label>
        <label><span>Máximo original para procesar (MB)</span><input class="input" type="number" min="1" max="20" step="1" name="image_compression_max_upload_mb" value="${WT.escapeHTML(compressionMaxMb)}"></label>
        <label><span>Máximo final subido (MB)</span><input class="input" type="number" min="1" max="10" step="1" name="image_compression_final_max_mb" value="${WT.escapeHTML(compressionFinalMaxMb)}"></label>
        <button class="btn btn-primary" type="submit">Guardar compresión</button>
      </form>
    </section>
    <div class="admin-summary-strip">
      <span><strong>${items.length}</strong> ajustes</span>
      <span><strong>${items.filter(x => x.is_public).length}</strong> públicos</span>
      <span><strong>${items.filter(x => (x.type || 'text') === 'boolean').length}</strong> sí/no</span>
    </div>
    <div class="settings-admin-grid">${items.map(settingCard).join("") || `<div class="empty-state">No hay configuraciones.</div>`}</div>`;
    const applyFilters = () => {
      const search = (WT.qs("#settingsSearch")?.value || "").toLowerCase();
      const group = WT.qs("#settingsGroupFilter")?.value || "";
      const pub = WT.qs("#settingsPublicFilter")?.value || "";
      const type = WT.qs("#settingsTypeFilter")?.value || "";
      WT.qsa("[data-setting-record]").forEach(card => {
        const okSearch = !search || (card.dataset.search || "").includes(search);
        const okGroup = !group || card.dataset.group === group;
        const okPublic = !pub || card.dataset.public === pub;
        const okType = !type || card.dataset.type === type;
        card.classList.toggle("hidden", !(okSearch && okGroup && okPublic && okType));
      });
    };
    ["#settingsSearch", "#settingsGroupFilter", "#settingsPublicFilter", "#settingsTypeFilter"].forEach(sel => {
      const el = WT.qs(sel); if (el) { el.addEventListener("input", applyFilters); el.addEventListener("change", applyFilters); }
    });
    WT.qsa("[data-edit-logo-setting]").forEach(b => b.addEventListener("click", () => openLogoSetting(b.dataset.editLogoSetting, items)));
    WT.qsa("[data-edit-setting]").forEach(b => b.addEventListener("click", () => openSettingForm(items.find(x => x.id === b.dataset.editSetting))));
    WT.qs("#imageCompressionSettingsForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const rows = [
        { key: "image_compression_enabled", value: fd.get("image_compression_enabled"), type: "boolean", description: "Activar compresión WebP desde el navegador", is_public: true },
        { key: "image_compression_required", value: fd.get("image_compression_required"), type: "boolean", description: "Hacer obligatoria la conversión WebP antes de subir imágenes", is_public: true },
        { key: "image_compression_max_upload_mb", value: String(fd.get("image_compression_max_upload_mb") || "6"), type: "number", description: "Tamaño máximo permitido por imagen antes de comprimir", is_public: true },
        { key: "image_compression_final_max_mb", value: String(fd.get("image_compression_final_max_mb") || "3"), type: "number", description: "Tamaño máximo final que se permite subir por imagen", is_public: true }
      ];
      const { error } = await adminQuery(() => WT.supabase.from("site_settings").upsert(rows, { onConflict: "key" }));
      if (error) return WT.toast(error.message, "error");
      WT.clearImageCompressionSettingsCache?.();
      await log("actualizar_compresion_imagenes", "site_settings", null, rows);
      WT.toast("Compresión de imágenes guardada", "success");
      renderSettings();
    });
  }

  async function resolveLogoSettingKey(preferred = "") {
    const requested = preferred || "site_logo";
    if (!["site_logo", "logo_url"].includes(requested)) return requested;

    const { data } = await adminQuery(() => WT.supabase
      .from("site_settings")
      .select("*")
      .ilike("key", "%logo%")
      .order("key"));

    const rows = data || [];
    const existing = rows.find(r => r.key === requested)
      || rows.find(r => r.key === "site_logo")
      || rows.find(r => r.key === "logo_url")
      || rows[0];

    return existing?.key || "site_logo";
  }

  async function upsertSettingByKey(key, payload) {
    const cleanPayload = { ...payload, key };
    const existing = await adminQuery(() => WT.supabase.from("site_settings").select("id,key").eq("key", key).maybeSingle());
    if (existing.error) throw existing.error;
    if (existing.data?.id) {
      const result = await adminQuery(() => WT.supabase.from("site_settings").update(cleanPayload).eq("id", existing.data.id).select("id,key").single());
      if (result.error) throw result.error;
      return result.data;
    }
    const result = await adminQuery(() => WT.supabase.from("site_settings").insert(cleanPayload).select("id,key").single());
    if (result.error) throw result.error;
    return result.data;
  }

  function openSettingForm(item = {}) {
    const key = item.key || "";
    const friendly = getSettingFriendly(key, item);
    const isBool = (item.type === "boolean") || ["true", "false"].includes(String(item.value || "").toLowerCase());
    const isImage = ["site_logo", "logo_url", "icon_url", "favicon_url"].includes(key);
    const currentValue = item.value || "";

    let valueInput = "";
    if (isImage) {
      const preview = WT.sanitizeImageUrl(currentValue, "images/placeholder-logo.png");
      valueInput = `<div class="setting-image-editor-box" data-setting-image-box>
        <div class="setting-image-editor-preview">
          <img data-setting-image-preview src="${WT.escapeHTML(preview)}" alt="${WT.escapeHTML(friendly.title)}" onerror="this.src='images/placeholder-logo.png'">
        </div>
        <input type="hidden" name="value" data-setting-image-url value="${WT.escapeHTML(currentValue)}">
        <label class="file-drop-label setting-image-upload">Subir y ajustar imagen
          <input class="input" type="file" accept="image/png,image/jpeg,image/webp" data-setting-image-file>
        </label>
        <div class="record-actions">
          <button class="btn btn-soft btn-small" type="button" data-adjust-setting-image ${currentValue ? "" : "hidden"}>Editar márgenes / centrar</button>
          <button class="btn btn-danger-soft btn-small" type="button" data-clear-setting-image>Quitar imagen</button>
        </div>
        <p class="setting-upload-status" data-setting-upload-status>Selecciona una imagen, ajústala y se subirá automáticamente.</p>
        <p class="form-help">Puedes subir una imagen y ajustar sus márgenes, tamaño y posición antes de guardarla. Si la imagen puede abrirse correctamente, también podrás editarla después de subida. Para logo, icono y favicon se recomienda imagen cuadrada.</p>
      </div>`;
    } else if (isBool) {
      valueInput = selectField("Estado", "value", String(currentValue || "true"), [{ value: "true", label: "Activado" }, { value: "false", label: "Desactivado" }]);
    } else {
      valueInput = textArea("Valor visible", "value", currentValue, "rows='5'");
    }

    const keyInput = item.id || ["site_logo", "logo_url", "icon_url", "favicon_url"].includes(key)
      ? `<input type="hidden" name="key" value="${WT.escapeHTML(key || "site_logo")}"><div class="setting-readonly-key"><span>Nombre técnico</span><code>${WT.escapeHTML(key || "site_logo")}</code></div>`
      : field("Nombre técnico", "key", key, "text", "required placeholder='ej: instagram'");

    const body = `<form class="admin-form modern-admin-form friendly-setting-form" id="settingForm">
      ${section(friendly.title, `<p class="form-help setting-main-help">${WT.escapeHTML(friendly.hint || "Ajuste de la página.")}</p>${keyInput}<div class="two compact-grid">${selectField("Tipo de contenido", "type", item.type || (isImage ? "url" : isBool ? "boolean" : "text"), [{value:"text",label:"Texto"},{value:"url",label:"Enlace / Imagen"},{value:"html",label:"Texto avanzado"},{value:"boolean",label:"Activado / Desactivado"},{value:"json",label:"Datos avanzados"}], "data-setting-type")}</div>${valueInput}${textArea("Nota interna para admin", "description", item.description || friendly.hint || "")}`)}
      ${section("Visibilidad", `${boolField("Visible para la página pública", "is_public", item.is_public ?? true)}`)}
      <button class="btn btn-primary">Guardar configuración</button>
    </form>`;
    const modal = WT.showModal({ title: item.id ? `Editar ${friendly.title}` : "Crear configuración", body, className: "admin-edit-modal friendly-setting-modal" });
    const form = WT.qs("#settingForm", modal.element);

    const fileInput = WT.qs("[data-setting-image-file]", form);
    const adjustBtn = WT.qs("[data-adjust-setting-image]", form);
    const clearBtn = WT.qs("[data-clear-setting-image]", form);
    const urlInput = WT.qs("[data-setting-image-url]", form);
    const preview = WT.qs("[data-setting-image-preview]", form);
    const uploadStatus = WT.qs("[data-setting-upload-status]", form);

    async function saveSettingImageUrl(url) {
      const finalUrl = validateRemoteImageUrl(url);
      const finalKey = await resolveLogoSettingKey(key || "site_logo");
      const payload = {
        key: finalKey,
        value: finalUrl,
        type: "url",
        description: WT.qs('[name="description"]', form)?.value || friendly.hint || "",
        is_public: (WT.qs('[name="is_public"]', form)?.value || "true") === "true"
      };
      const saved = await upsertSettingByKey(finalKey, payload);
      await log("actualizar_configuracion_imagen", "site_settings", saved.id, payload);
      WTTheme.loadSiteSettings?.();
      document.querySelectorAll("#siteLogo").forEach(img => { if (finalKey === "site_logo" || finalKey === "logo_url") img.src = finalUrl; });
      return true;
    }

    async function applySettingImage(file = null, currentUrl = "") {
      try {
        if (uploadStatus) uploadStatus.textContent = "Abriendo editor de imagen...";
        const uploaded = await uploadSettingImageFile(file, key || "logo_url", currentUrl);
        if (uploaded?.url && urlInput) {
          urlInput.value = uploaded.url;
          if (preview) preview.src = uploaded.url;
          if (adjustBtn) adjustBtn.hidden = false;
          if (uploadStatus) uploadStatus.textContent = "Guardando imagen...";
          const savedNow = await saveSettingImageUrl(uploaded.url).catch(err => {
            if (uploadStatus) uploadStatus.textContent = "Imagen preparada. Presiona Guardar configuración para aplicar el cambio.";
            throw err;
          });
          const modeText = uploaded.storageMode === "inline" ? "Imagen subida y guardada correctamente." : "Imagen subida y guardada correctamente.";
          WT.toast(savedNow ? modeText : "Imagen subida. Presiona Guardar configuración.", "success");
          if (uploadStatus) uploadStatus.textContent = savedNow ? modeText : "Imagen subida. Presiona Guardar configuración.";
          form.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } catch (err) {
        if (!String(err.message || "").toLowerCase().includes("cancel")) {
          const msg = err.message || "No se pudo subir la imagen.";
          if (uploadStatus) uploadStatus.textContent = msg;
          WT.toast(msg, "error");
        } else if (uploadStatus) {
          uploadStatus.textContent = "Selección cancelada.";
        }
      } finally {
        if (fileInput) fileInput.value = "";
      }
    }

    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) applySettingImage(file, "");
    });

    adjustBtn?.addEventListener("click", async () => {
      const currentUrl = String(urlInput?.value || "").trim();
      if (!currentUrl) return WT.toast("Primero sube una imagen.", "warning");
      try {
        if (uploadStatus) uploadStatus.textContent = "Cargando imagen actual para editar...";
        const currentFile = await remoteImageUrlToFile(currentUrl, `${key || "site_logo"}-actual.png`);
        await applySettingImage(currentFile, "");
      } catch (err) {
        if (uploadStatus) uploadStatus.textContent = "No pude abrir la imagen actual para editar. Sube nuevamente el archivo original.";
        WT.toast("No pude abrir la imagen actual para editar. Selecciona el logo otra vez y ajústalo.", "warning");
      }
    });

    clearBtn?.addEventListener("click", async () => {
      if (urlInput) urlInput.value = "";
      if (preview) preview.src = "images/placeholder-logo.png";
      if (adjustBtn) adjustBtn.hidden = true;
      form.dispatchEvent(new Event("input", { bubbles: true }));
      try {
        const savedNow = await saveSettingImageUrl("");
        WT.toast(savedNow ? "Imagen quitada y guardada." : "Imagen quitada. Presiona Guardar configuración.", "success");
        if (uploadStatus) uploadStatus.textContent = savedNow ? "Imagen quitada y guardada." : "Imagen quitada. Presiona Guardar configuración.";
      } catch (err) {
        WT.toast("Imagen quitada del formulario. Presiona Guardar configuración.", "warning");
        if (uploadStatus) uploadStatus.textContent = "Imagen quitada del formulario. Presiona Guardar configuración.";
      }
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const payload = Object.fromEntries(fd.entries());
      payload.is_public = payload.is_public === "true";
      if (["site_logo", "logo_url", "icon_url", "favicon_url"].includes(payload.key || key)) {
        if (/^data:image\//i.test(String(payload.value || ""))) {
          return WT.toast("No se puede guardar esa imagen directamente. Súbela como archivo e inténtalo otra vez.", "error");
        }
      }
      const finalKey = await resolveLogoSettingKey(payload.key || key || "site_logo");
      payload.key = finalKey;
      const saved = await upsertSettingByKey(finalKey, payload);
      await log("actualizar_configuracion", "site_settings", saved.id, payload);
      WT.toast("Configuración guardada", "success");
      modal.close();
      renderSettings();
      WTTheme.loadSiteSettings();
    });
  }

  async function renderLogs() {
    header("Logs", null);
    const { data, error } = await WT.supabase.from("admin_logs").select("*, user_profiles(full_name)").order("created_at", { ascending: false }).limit(200);
    if (error) return view().innerHTML = `<div class="empty-state">${WT.escapeHTML(error.message)}</div>`;
    const items = data || [];
    const tables = [...new Set(items.map(x => x.table_name).filter(Boolean))].sort();
    const actions = [...new Set(items.map(x => x.action).filter(Boolean))].sort();
    view().innerHTML = `<div class="toolbar-card logs-admin-toolbar">
      <input class="input" id="logsSearch" placeholder="Buscar por acción, usuario, tabla o detalle...">
      <select class="input" id="logsTableFilter"><option value="">Todas las tablas</option>${tables.map(t => `<option value="${WT.escapeHTML(t)}">${WT.escapeHTML(t)}</option>`).join("")}</select>
      <select class="input" id="logsActionFilter"><option value="">Todas las acciones</option>${actions.map(a => `<option value="${WT.escapeHTML(a)}">${WT.escapeHTML(String(a).replaceAll('_',' '))}</option>`).join("")}</select>
    </div>
    <div class="admin-summary-strip">
      <span><strong>${items.length}</strong> eventos</span>
      <span><strong>${tables.length}</strong> tablas</span>
      <span><strong>${actions.length}</strong> acciones</span>
    </div>
    <div class="admin-log-list">${items.map(renderLogRecord).join("") || `<div class="empty-state">Sin logs.</div>`}</div>`;
    const applyFilters = () => {
      const search = (WT.qs("#logsSearch")?.value || "").toLowerCase();
      const table = WT.qs("#logsTableFilter")?.value || "";
      const action = WT.qs("#logsActionFilter")?.value || "";
      WT.qsa("[data-log-record]").forEach(card => {
        const okSearch = !search || (card.dataset.search || "").includes(search);
        const okTable = !table || card.dataset.table === table;
        const okAction = !action || card.dataset.action === action;
        card.classList.toggle("hidden", !(okSearch && okTable && okAction));
      });
    };
    ["#logsSearch", "#logsTableFilter", "#logsActionFilter"].forEach(sel => {
      const el = WT.qs(sel); if (el) { el.addEventListener("input", applyFilters); el.addEventListener("change", applyFilters); }
    });
    WT.qsa("[data-log]").forEach(b => b.addEventListener("click", () => WT.showModal({ title: "Detalles del log", body: `<pre class="log-detail-pre">${WT.escapeHTML(b.dataset.log)}</pre>` })));
  }

  async function deleteRecord(ref) {
    const [table, id] = ref.split(":");
    const ok = await WT.confirmDialog({ title: "Confirmar eliminación", message: "Este registro se borrará definitivamente.", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    const { error } = await adminQuery(() => WT.supabase.from(table).delete().eq("id", id));
    if (error) return WT.toast(error.message, "error");
    await log("eliminar_registro", table, id); WT.toast("Eliminado", "success"); WTAdmin.renderCurrent();
  }

  async function sendBanEmailNotification(userId, reason, automatic = false) {
    if (!WT.supabase?.functions?.invoke) {
      return { error: { message: "El servicio de correo no está disponible en este momento." } };
    }
    return await WT.supabase.functions.invoke("send-ban-email", {
      body: {
        user_id: userId,
        target_user_id: userId,
        block_reason: reason,
        reason,
        automatic: Boolean(automatic)
      }
    });
  }

  function getEdgeFunctionError(result) {
    if (!result) return "La función no devolvió respuesta.";
    if (result.error) return result.error.message || result.error.context?.error || "No se pudo completar la acción.";
    if (result.data && result.data.ok === false) return result.data.error || result.data.message || "La función respondió con error.";
    return "";
  }

  function isRealStaffRole(role = "") {
    return ["owner", "superadmin", "admin", "moderator", "moderador"].includes(String(role || "").toLowerCase());
  }

  function isOwnerProfile(profile = {}) {
    return String(profile?.role || "").toLowerCase() === "owner";
  }

  function canActOnTargetWithPermission(target = {}, myProfile = {}, myPermissions = new Set(), lowerKey = "", sameKey = "") {
    if (!myProfile?.id || !target?.id || String(myProfile.id) === String(target.id)) return false;
    if (isOwnerProfile(myProfile)) return true;
    if (isOwnerRole(target.role)) return false;
    const myRole = String(myProfile.role || "user").toLowerCase();
    const myRank = roleRank(myRole);
    const targetRank = roleRank(target.role || "user");
    if (myRank > targetRank && lowerKey && (roleHasBasePermission(myRole, lowerKey) || myPermissions.has(lowerKey))) return true;
    if (myRank === targetRank && sameKey && myPermissions.has(sameKey)) return true;
    return false;
  }

  function canManageUserStatus(target = {}, myProfile = {}, myPermissions = new Set()) {
    if (isOwnerProfile(myProfile) && !isOwnerRole(target?.role) && String(myProfile?.id || "") !== String(target?.id || "")) return true;
    return canActOnTargetWithPermission(target, myProfile, myPermissions, "block_lower_roles", "block_same_role");
  }

  function canOpenManualWarning(target = {}, myProfile = {}, myPermissions = new Set()) {
    return canActOnTargetWithPermission(target, myProfile, myPermissions, "warn_lower_roles", "warn_same_role");
  }

  function canViewUserWarnings(target = {}, myProfile = {}, myPermissions = new Set()) {
    return canActOnTargetWithPermission(target, myProfile, myPermissions, "view_warnings_lower_roles", "view_warnings_same_role");
  }

  function isPermissionActiveRow(row = {}) {
    if (!row.expires_at) return true;
    const expires = new Date(row.expires_at).getTime();
    return Number.isFinite(expires) && expires > Date.now();
  }

  function formatPermissionExpiration(value) {
    if (!value) return "Permanente";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Temporal";
    return `Hasta ${d.toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" })}`;
  }

  function getPermissionExpiresAtFromForm(form) {
    const duration = String(new FormData(form).get("permission_duration") || "permanent");
    const now = new Date();
    if (duration === "1h") return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    if (duration === "2h") return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    if (duration === "24h") return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    if (duration === "7d") return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    if (duration === "30d") return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    if (duration === "custom") {
      const raw = String(new FormData(form).get("permission_custom_expires_at") || "").trim();
      if (!raw) throw new Error("Debes elegir la fecha y hora de expiración.");
      const d = new Date(raw);
      if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) throw new Error("La expiración debe ser una fecha futura.");
      return d.toISOString();
    }
    return null;
  }

  function basePermissionKeysForRole(role = "user") {
    const r = String(role || "user").toLowerCase();
    if (r === "owner") return new Set(GRANULAR_PERMISSION_DEFINITIONS.map(p => p.key));

    const commonLowerModeration = [
      "warn_lower_roles",
      "block_lower_roles",
      "delete_forum_lower_roles",
      "delete_shared_practices_lower_roles",
      "approve_forum_posts",
      "manage_forum_reports",
      "view_warnings_lower_roles"
    ];

    // Director / superadmin: permisos fuertes por defecto, pero NO delega permisos granulares
    // salvo que el owner le dé manage_permissions_* explícitamente.
    if (r === "superadmin") return new Set([
      ...commonLowerModeration,
      "warn_same_role",
      "block_same_role",
      "delete_forum_same_role",
      "delete_shared_practices_same_role",
      "view_warnings_same_role",
      "change_role_lower_roles",
      "change_role_same_role",
      "manage_shared_practices",
      "manage_badges",
      "manage_sliders",
      "manage_announcements",
      "manage_services",
      "manage_courses",
      "manage_practice",
      "manage_storage",
      "manage_appearance",
      "manage_site_settings",
      "view_logs"
    ]);

    if (r === "admin") return new Set([
      ...commonLowerModeration,
      "change_role_lower_roles",
      "manage_shared_practices",
      "manage_sliders",
      "manage_announcements",
      "manage_services",
      "manage_courses",
      "manage_practice",
      "manage_storage",
      "view_logs"
    ]);

    if (r === "moderator" || r === "moderador") return new Set(commonLowerModeration);
    return new Set();
  }

  function roleHasBasePermission(role, key) {
    return basePermissionKeysForRole(role).has(key);
  }

  function roleCanUseLowerScope(role = "user") {
    return roleRank(role) > 0;
  }

  function sameRoleLabel(role = "user") {
    const r = String(role || "user").toLowerCase();
    if (r === "superadmin") return "otros Directores";
    if (r === "admin") return "otros Administradores";
    if (r === "moderator" || r === "moderador") return "otros Moderadores";
    return "otros usuarios";
  }

  function lowerRoleLabel(role = "user") {
    const r = String(role || "user").toLowerCase();
    if (r === "superadmin") return "Administradores, Moderadores y usuarios normales";
    if (r === "admin") return "Moderadores y usuarios normales";
    if (r === "moderator" || r === "moderador") return "usuarios normales";
    return "usuarios bajo su responsabilidad";
  }

  const FRIENDLY_PERMISSION_LABELS = {
    manage_permissions_lower_roles: "Gestionar permisos de usuarios inferiores",
    manage_permissions_same_role: "Gestionar permisos de usuarios del mismo nivel",
    warn_lower_roles: "Enviar avisos a usuarios inferiores",
    warn_same_role: "Enviar avisos a usuarios del mismo nivel",
    view_warnings_lower_roles: "Ver advertencias de usuarios inferiores",
    view_warnings_same_role: "Ver advertencias de usuarios del mismo nivel",
    block_lower_roles: "Bloquear y desbloquear usuarios inferiores",
    block_same_role: "Bloquear y desbloquear usuarios del mismo nivel",
    change_role_lower_roles: "Cambiar rol de usuarios inferiores",
    change_role_same_role: "Cambiar rol de usuarios del mismo nivel",
    delete_forum_lower_roles: "Eliminar contenido del foro de usuarios inferiores",
    delete_forum_same_role: "Eliminar contenido del foro de usuarios del mismo nivel",
    approve_forum_posts: "Aprobar publicaciones del foro",
    manage_forum_reports: "Gestionar reportes del foro",
    manage_shared_practices: "Gestionar prácticas compartidas",
    delete_shared_practices_lower_roles: "Eliminar prácticas compartidas de usuarios inferiores",
    delete_shared_practices_same_role: "Eliminar prácticas compartidas de usuarios del mismo nivel",
    manage_badges: "Gestionar insignias",
    manage_sliders: "Gestionar carrusel de inicio",
    manage_announcements: "Gestionar anuncios",
    manage_services: "Gestionar servicios",
    manage_courses: "Gestionar cursos",
    manage_practice: "Gestionar práctica consular",
    manage_storage: "Gestionar almacenamiento",
    manage_appearance: "Gestionar apariencia",
    manage_site_settings: "Configuración general",
    view_logs: "Ver logs administrativos"
  };

  function labelPermissionForTarget(permission, targetRole = "user") {
    const same = sameRoleLabel(targetRole);
    const lower = lowerRoleLabel(targetRole);
    const labels = {
      approve_forum_posts: "Aprobar publicaciones del foro",
      manage_permissions_lower_roles: `Gestionar permisos de ${lower}`,
      manage_permissions_same_role: `Gestionar permisos de ${same}`,
      warn_lower_roles: `Enviar avisos a ${lower}`,
      warn_same_role: `Enviar avisos a ${same}`,
      view_warnings_lower_roles: `Ver advertencias de ${lower}`,
      view_warnings_same_role: `Ver advertencias de ${same}`,
      block_lower_roles: `Bloquear ${lower}`,
      block_same_role: `Bloquear ${same}`,
      change_role_lower_roles: `Cambiar rol de ${lower}`,
      change_role_same_role: `Cambiar rol de ${same}`,
      delete_forum_lower_roles: `Eliminar publicaciones/comentarios de ${lower}`,
      delete_forum_same_role: `Eliminar publicaciones/comentarios de ${same}`,
      manage_forum_reports: "Ver y resolver reportes del foro",
      manage_shared_practices: "Administrar prácticas compartidas",
      delete_shared_practices_lower_roles: `Eliminar prácticas compartidas de ${lower}`,
      delete_shared_practices_same_role: `Eliminar prácticas compartidas de ${same}`,
      manage_badges: "Gestionar insignias",
      manage_sliders: "Gestionar carrusel de inicio",
      manage_announcements: "Gestionar anuncios",
      manage_services: "Gestionar servicios",
      manage_courses: "Gestionar cursos",
      manage_practice: "Gestionar práctica consular",
      manage_storage: "Gestionar almacenamiento",
      manage_appearance: "Gestionar apariencia",
      manage_site_settings: "Configuración general",
      view_logs: "Ver logs administrativos"
    };
    return FRIENDLY_PERMISSION_LABELS[permission.key] || labels[permission.key] || permission.label || "Permiso administrativo";
  }

  async function loadStoredGranularPermissions(userId) {
    if (!userId) return new Set();
    try {
      const { data, error } = await WT.supabase.from("user_permissions").select("permission_key,expires_at").eq("user_id", userId);
      if (error) return new Set();
      return new Set((data || []).filter(isPermissionActiveRow).map(row => row.permission_key));
    } catch (_) { return new Set(); }
  }

  async function loadActorEffectivePermissions(profile = {}) {
    if (!profile?.id) return new Set();
    const base = basePermissionKeysForRole(profile.role || "user");
    if (isOwnerProfile(profile)) return new Set(GRANULAR_PERMISSION_DEFINITIONS.map(p => p.key));
    const stored = await loadStoredGranularPermissions(profile.id);
    return new Set([...base, ...stored]);
  }

  async function loadMyGranularPermissions(userId) {
    if (!userId) return new Set();
    const profile = (WTAuth.profile && String(WTAuth.profile.id) === String(userId)) ? WTAuth.profile : { id: userId, role: "user" };
    return loadActorEffectivePermissions(profile);
  }

  function canManageGranularPermissionsTarget(target = {}, myProfile = {}, myPermissions = new Set()) {
    if (!myProfile?.id || !target?.id || String(myProfile.id) === String(target.id)) return false;
    if (isOwnerProfile(myProfile)) return true;
    if (isOwnerRole(target.role)) return false;
    const myRank = roleRank(myProfile.role || "user");
    const targetRank = roleRank(target.role || "user");
    if (myRank > targetRank && myPermissions.has("manage_permissions_lower_roles")) return true;
    if (myRank === targetRank && myPermissions.has("manage_permissions_same_role")) return true;
    return false;
  }

  function canGrantPermissionManagement(permissionKey = "", actorProfile = {}, actorEffectivePermissions = new Set()) {
    if (isOwnerProfile(actorProfile)) return true;
    if (!String(permissionKey || "").startsWith("manage_permissions_")) return true;
    return actorEffectivePermissions.has("manage_permissions_lower_roles") || actorEffectivePermissions.has("manage_permissions_same_role");
  }

  const MODULE_PERMISSION_KEYS = new Set([
    "approve_forum_posts",
    "manage_forum_reports",
    "manage_shared_practices",
    "manage_badges",
    "manage_sliders",
    "manage_announcements",
    "manage_services",
    "manage_courses",
    "manage_practice",
    "manage_storage",
    "manage_appearance",
    "manage_site_settings",
    "view_logs"
  ]);

  function targetCanUsePermission(permission = {}, targetRole = "user") {
    const role = String(targetRole || "user").toLowerCase();
    const key = String(permission.key || "");
    const scope = String(permission.scope || "tool");

    if (MODULE_PERMISSION_KEYS.has(key)) return true;

    // Usuarios normales no tienen roles inferiores, pero sí pueden recibir permisos
    // para actuar sobre otros usuarios normales si el owner lo decide.
    if (role === "user" || !isRealStaffRole(role)) {
      if (scope === "lower") return false;
      if (key === "change_role_same_role") return false;
      return scope === "same";
    }

    if (scope === "lower") return roleRank(role) > 0;
    if (scope === "same") return isRealStaffRole(role);
    return true;
  }

  function canGrantPermissionManagement(permissionKey = "", actorProfile = {}, actorEffectivePermissions = new Set()) {
    if (isOwnerProfile(actorProfile)) return true;
    if (!String(permissionKey || "").startsWith("manage_permissions_")) return true;
    return actorEffectivePermissions.has("manage_permissions_lower_roles") || actorEffectivePermissions.has("manage_permissions_same_role");
  }

  function assignablePermissionsForTarget(target = {}, actorProfile = {}, actorEffectivePermissions = new Set()) {
    const targetRole = String(target?.role || "user").toLowerCase();
    const isOwnerActor = isOwnerProfile(actorProfile);
    if (isOwnerRole(targetRole) && !isOwnerActor) return [];

    return GRANULAR_PERMISSION_DEFINITIONS
      .filter(permission => {
        if (!targetCanUsePermission(permission, targetRole)) return false;
        if (!isOwnerActor && !actorEffectivePermissions.has(permission.key)) return false;
        if (!canGrantPermissionManagement(permission.key, actorProfile, actorEffectivePermissions)) return false;
        if (!isOwnerActor && roleHasBasePermission(targetRole, permission.key)) return false;
        return true;
      })
      .map(permission => ({ ...permission, label: labelPermissionForTarget(permission, targetRole) }));
  }

  function groupAssignablePermissions(permissions = []) {
    const byGroup = new Map(GRANULAR_PERMISSION_GROUPS.map(group => [group.id, { title: group.title, items: [] }]));
    permissions.forEach(permission => {
      const group = byGroup.get(permission.group) || byGroup.get("system");
      group.items.push([permission.key, permission.label]);
    });
    return [...byGroup.values()].filter(group => group.items.length);
  }

  async function findUserCardData(userId) {
    const { data, error } = await WT.supabase
      .from("user_profiles")
      .select("id,email,full_name,role,status,block_reason")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Usuario no encontrado.");
    return data;
  }

  async function changeUserRole(userId) {
    let target;
    try { target = await findUserCardData(userId); } catch (err) { return WT.toast(err.message || "No se pudo cargar el usuario.", "error"); }
    const actorPermissions = await loadActorEffectivePermissions(WTAuth.profile || {});
    if (!canActOnTargetWithPermission(target, WTAuth.profile, actorPermissions, "change_role_lower_roles", "change_role_same_role")) return WT.toast("No puedes cambiar el rol de este usuario.", "error");
    const myRank = roleRank(WTAuth.profile?.role || "user");
    const options = [
      {value:"user",label:"Usuario"},
      {value:"moderator",label:"Moderador"},
      {value:"admin",label:"Administrador"},
      {value:"superadmin",label:"Director"}
    ].filter(opt => roleRank(opt.value) < myRank);
    const modal = WT.showModal({ title: "Cambiar rol", body: `<form class="admin-form" id="roleForm">${selectField("Rol", "role", target.role || "user", options)}<p class="form-help">No puedes asignar un nivel igual o superior al tuyo. El rol principal solo se asigna desde la configuración interna.</p><button class="btn btn-primary">Guardar</button></form>` });
    WT.qs("#roleForm", modal.element).addEventListener("submit", async e => { e.preventDefault(); const role = new FormData(e.currentTarget).get("role"); if (roleRank(role) >= myRank) return WT.toast("No puedes asignar un nivel igual o superior al tuyo.", "error"); const { error } = await adminQuery(() => WT.supabase.from("user_profiles").update({ role }).eq("id", userId)); if (error) return WT.toast(error.message, "error"); await log("cambiar_rol", "user_profiles", userId, { role }); WT.toast("Rol actualizado", "success"); modal.close(); renderUsers(); });
  }

  async function changeUserStatus(userId) {
    let target;
    try {
      target = await findUserCardData(userId);
    } catch (err) {
      WT.toast(err.message || "No se pudo cargar el usuario.", "error");
      return;
    }

    if (!canManageUserStatus(target, WTAuth.profile)) {
      WT.toast("No tienes permisos para modificar este usuario.", "error");
      return;
    }

    const isBlocked = String(target.status || "active") === "blocked";

    if (isBlocked) {
      const ok = await WT.confirmDialog({
        title: "Desbloquear usuario",
        message: "¿Seguro que quieres desbloquear este usuario? También se perdonarán sus advertencias activas para que no vuelva a bloquearse automáticamente.",
        confirmText: "Desbloquear"
      });
      if (!ok) return;

      const { error } = await WT.supabase.rpc("moderator_unblock_user", {
        target_user_id: userId
      });
      if (error) {
        WT.toast(error.message || "No se pudo desbloquear el usuario.", "error");
        return;
      }

      await log("desbloquear_usuario", "user_profiles", userId, { status: "active" });
      WT.toast("Usuario desbloqueado correctamente.", "success");
      renderUsers();
      return;
    }

    const modal = WT.showModal({
      title: "Bloquear usuario",
      body: `<form class="admin-form" id="blockUserForm">
        <p class="form-help">El usuario seguirá viendo el motivo dentro de la web app y también recibirá un correo de moderación.</p>
        ${textArea("Motivo del bloqueo", "block_reason", "")}
        <button class="btn btn-danger">Bloquear y enviar correo</button>
      </form>`
    });

    const form = WT.qs("#blockUserForm", modal.element);
    form?.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const reason = String(fd.get("block_reason") || "").trim();
      if (!reason) {
        WT.toast("Debes indicar el motivo del bloqueo.", "warning");
        return;
      }

      const btn = form.querySelector("button");
      const oldText = btn?.textContent || "Bloquear y enviar correo";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Bloqueando...";
      }

      const { error } = await WT.supabase.rpc("moderator_block_user", {
        target_user_id: userId,
        reason_text: reason
      });

      if (error) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = oldText;
        }
        WT.toast(error.message || "No se pudo bloquear el usuario.", "error");
        return;
      }

      await log("bloquear_usuario", "user_profiles", userId, { status: "blocked", block_reason: reason });

      if (btn) btn.textContent = "Enviando correo...";
      const emailResult = await sendBanEmailNotification(userId, reason, false);
      if (window.WTPush?.sendPushNotification) {
        await window.WTPush.sendPushNotification(userId, {
          title: "Cuenta bloqueada",
          body: reason,
          url: "foro.html",
          type: "account_blocked",
          tag: "account-blocked"
        }).catch(() => null);
      }

      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText;
      }

      modal.close();
      const emailError = getEdgeFunctionError(emailResult);
      if (emailError) {
        WT.toast(`El usuario fue bloqueado, pero no se pudo enviar el correo: ${emailError}`, "warning");
      } else {
        WT.toast("Usuario bloqueado y correo enviado correctamente.", "success");
      }
      renderUsers();
    });
  }

  const GRANULAR_PERMISSION_GROUPS = [
    { id: "users", title: "Usuarios y roles" },
    { id: "warnings", title: "Advertencias" },
    { id: "forum", title: "Foro" },
    { id: "shared_practices", title: "Prácticas compartidas" },
    { id: "system", title: "Sistema" }
  ];

  const GRANULAR_PERMISSION_DEFINITIONS = [
    { key: "manage_permissions_lower_roles", group: "users", scope: "lower", label: "Gestionar permisos de usuarios inferiores" },
    { key: "manage_permissions_same_role", group: "users", scope: "same", label: "Gestionar permisos de usuarios del mismo nivel" },
    { key: "warn_lower_roles", group: "warnings", scope: "lower", label: "Enviar avisos al equipo bajo su responsabilidad" },
    { key: "warn_same_role", group: "warnings", scope: "same", label: "Enviar avisos a usuarios con su mismo nivel" },
    { key: "view_warnings_lower_roles", group: "warnings", scope: "lower", label: "Ver advertencias del equipo bajo su responsabilidad" },
    { key: "view_warnings_same_role", group: "warnings", scope: "same", label: "Ver advertencias de usuarios con su mismo nivel" },
    { key: "block_lower_roles", group: "users", scope: "lower", label: "Bloquear usuarios bajo su responsabilidad" },
    { key: "block_same_role", group: "users", scope: "same", label: "Bloquear usuarios con su mismo nivel" },
    { key: "change_role_lower_roles", group: "users", scope: "lower", label: "Cambiar rol de usuarios bajo su responsabilidad" },
    { key: "change_role_same_role", group: "users", scope: "same", label: "Cambiar rol de usuarios con su mismo nivel" },
    { key: "delete_forum_lower_roles", group: "forum", scope: "lower", label: "Eliminar publicaciones/comentarios del equipo bajo su responsabilidad" },
    { key: "delete_forum_same_role", group: "forum", scope: "same", label: "Eliminar publicaciones/comentarios de usuarios con su mismo nivel" },
    { key: "approve_forum_posts", group: "forum", scope: "tool", label: "Aprobar publicaciones del foro" },
    { key: "manage_forum_reports", group: "forum", scope: "tool", label: "Ver y resolver reportes del foro" },
    { key: "manage_shared_practices", group: "shared_practices", scope: "tool", label: "Administrar prácticas compartidas" },
    { key: "delete_shared_practices_lower_roles", group: "shared_practices", scope: "lower", label: "Eliminar prácticas compartidas del equipo bajo su responsabilidad" },
    { key: "delete_shared_practices_same_role", group: "shared_practices", scope: "same", label: "Eliminar prácticas compartidas de usuarios con su mismo nivel" },
    { key: "manage_badges", group: "system", scope: "tool", label: "Gestionar insignias" },
    { key: "manage_sliders", group: "system", scope: "tool", label: "Gestionar carrusel de inicio" },
    { key: "manage_announcements", group: "system", scope: "tool", label: "Gestionar anuncios" },
    { key: "manage_services", group: "system", scope: "tool", label: "Gestionar servicios" },
    { key: "manage_courses", group: "system", scope: "tool", label: "Gestionar cursos" },
    { key: "manage_practice", group: "system", scope: "tool", label: "Gestionar práctica consular" },
    { key: "manage_storage", group: "system", scope: "tool", label: "Gestionar almacenamiento" },
    { key: "manage_appearance", group: "system", scope: "tool", label: "Gestionar apariencia" },
    { key: "manage_site_settings", group: "system", scope: "tool", label: "Configuración general" },
    { key: "view_logs", group: "system", scope: "tool", label: "Ver logs administrativos" }
  ];

  async function manageUserPermissions(userId) {
    let target;
    try { target = await findUserCardData(userId); } catch (err) { return WT.toast(err.message || "No se pudo cargar el usuario.", "error"); }
    if (isOwnerRole(target.role) && !isOwnerProfile(WTAuth.profile || {})) return WT.toast("Esta cuenta ya tiene todos los permisos necesarios.", "warning");
    const myProfile = WTAuth.profile || await WT.getMyProfile();
    const actorPermissions = await loadMyGranularPermissions(myProfile?.id);
    if (!canManageGranularPermissionsTarget(target, myProfile, actorPermissions)) return WT.toast("No tienes permiso para gestionar permisos de este usuario.", "error");
    const isOwnerActor = isOwnerProfile(myProfile);
    let rows = [];
    const res = await WT.supabase.from("user_permissions").select("permission_key,expires_at").eq("user_id", userId);
    if (res.error) {
      return WT.showModal({ title: "Permisos", body: `<p>Esta herramienta aún no está lista. Revisa la configuración del panel antes de usarla.</p><p class="muted">${WT.escapeHTML(res.error.message || "Herramienta no disponible")}</p>` });
    }
    rows = res.data || [];
    const activeRows = rows.filter(isPermissionActiveRow);
    const allCurrent = new Set(activeRows.map(r => r.permission_key));
    const expiresByKey = new Map(activeRows.map(r => [r.permission_key, r.expires_at || null]));
    const assignablePermissions = assignablePermissionsForTarget(target, myProfile, actorPermissions);
    const allowedPermissionKeys = new Set(assignablePermissions.map(permission => permission.key));
    const visibleGroups = groupAssignablePermissions(assignablePermissions);
    if (!visibleGroups.length) return WT.toast("Este usuario no tiene permisos extra aplicables según su rol.", "warning");
    const current = new Set([...allCurrent].filter(key => allowedPermissionKeys.has(key)));
    const lockedCount = [...allCurrent].filter(key => !allowedPermissionKeys.has(key)).length;
    const helperText = isOwnerActor
      ? "Puedes otorgar, quitar o programar permisos para el tiempo que necesites. La gestión de permisos solo la controla el owner o quien el owner autorice."
      : "Solo puedes administrar los permisos que te fueron autorizados explícitamente por el owner. Lo demás se conserva sin cambios.";
    const body = `<form class="admin-form granular-permissions-form" id="granularPermissionsForm">
      <p class="form-help">${WT.escapeHTML(helperText)} ${lockedCount ? WT.escapeHTML(`Este usuario tiene ${lockedCount} permiso(s) fuera de tu alcance que no se modificarán.`) : ""}</p>
      ${visibleGroups.map(group => `<section class="admin-form-section"><div class="admin-form-section-head"><h3>${WT.escapeHTML(group.title)}</h3></div><div class="permission-check-grid">${group.items.map(([key,label]) => `<label class="permission-check"><input type="checkbox" name="permission" value="${WT.escapeHTML(key)}" ${current.has(key) ? "checked" : ""}><span>${WT.escapeHTML(label)}${current.has(key) ? `<small class="permission-expiry-note">${WT.escapeHTML(formatPermissionExpiration(expiresByKey.get(key)))}</small>` : ""}</span></label>`).join("")}</div></section>`).join("")}
      <section class="admin-form-section permission-duration-section">
        <div class="admin-form-section-head"><h3>Duración</h3></div>
        <p class="form-help">Puedes otorgar permisos permanentes o temporales. Los permisos temporales dejan de funcionar automáticamente al vencer.</p>
        <label>Duración para permisos nuevos
          <select class="input" name="permission_duration" id="permissionDurationSelect">
            <option value="permanent">Permanente</option>
            <option value="1h">1 hora</option>
            <option value="2h">2 horas</option>
            <option value="24h">24 horas</option>
            <option value="7d">7 días</option>
            <option value="30d">30 días</option>
            <option value="custom">Fecha personalizada</option>
          </select>
        </label>
        <label class="permission-custom-expiry is-hidden" id="permissionCustomExpiryWrap">Expira el
          <input class="input" type="datetime-local" name="permission_custom_expires_at">
        </label>
        <label class="permission-check permission-apply-duration"><input type="checkbox" name="apply_duration_to_existing" value="1"><span>Aplicar esta duración también a los permisos que ya estaban activos y sigan marcados</span></label>
      </section>
      <button class="btn btn-primary">Guardar permisos</button>
    </form>`;
    const modal = WT.showModal({ title: `Permisos de ${WT.escapeHTML(target.full_name || target.email || "usuario")}`, body, className: "admin-edit-modal" });
    const durationSelect = WT.qs("#permissionDurationSelect", modal.element);
    const customExpiryWrap = WT.qs("#permissionCustomExpiryWrap", modal.element);
    durationSelect?.addEventListener("change", () => {
      customExpiryWrap?.classList.toggle("is-hidden", durationSelect.value !== "custom");
    });
    WT.qs("#granularPermissionsForm", modal.element)?.addEventListener("submit", async e => {
      e.preventDefault();
      const form = e.currentTarget;
      let expiresAt = null;
      try { expiresAt = getPermissionExpiresAtFromForm(form); }
      catch (err) { return WT.toast(err.message || "Revisa la duración del permiso.", "warning"); }
      const fd = new FormData(form);
      const selected = new Set(fd.getAll("permission").map(String).filter(k => allowedPermissionKeys.has(k)));
      const applyDurationToExisting = fd.get("apply_duration_to_existing") === "1";
      const toAdd = [...selected].filter(k => !current.has(k));
      const toRemove = [...current].filter(k => !selected.has(k));
      if (toRemove.length) {
        const del = await WT.supabase.from("user_permissions").delete().eq("user_id", userId).in("permission_key", toRemove);
        if (del.error) return WT.toast(del.error.message, "error");
      }
      if (toAdd.length) {
        const payload = toAdd.map(permission_key => ({ user_id: userId, permission_key, expires_at: expiresAt }));
        const ins = await WT.supabase.from("user_permissions").upsert(payload, { onConflict: "user_id,permission_key" });
        if (ins.error) return WT.toast(ins.error.message, "error");
      }
      if (applyDurationToExisting) {
        const toUpdate = [...selected].filter(k => current.has(k));
        if (toUpdate.length) {
          const upd = await WT.supabase.from("user_permissions").update({ expires_at: expiresAt }).eq("user_id", userId).in("permission_key", toUpdate);
          if (upd.error) return WT.toast(upd.error.message, "error");
        }
      }
      await log("actualizar_permisos_usuario", "user_permissions", userId, { permissions: [...selected], expires_at: expiresAt, apply_duration_to_existing: applyDurationToExisting });
      WT.toast("Permisos guardados correctamente.", "success");
      modal.close();
      renderUsers();
    });
  }


  function formatWarningDate(value) {
    const d = new Date(value || 0);
    if (Number.isNaN(d.getTime())) return "Fecha no disponible";
    return d.toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
  }

  function warningSourceLabel(value = "") {
    const v = String(value || "").toLowerCase();
    if (v === "manual") return "Manual";
    return "Sistema";
  }

  function warningStatusLabel(value = "") {
    const v = String(value || "active").toLowerCase();
    if (v === "expired") return "Vencida";
    if (v === "forgiven") return "Perdonada";
    return "Activa";
  }

  function renderWarningCards(items = [], emptyText = "No hay advertencias en esta sección.") {
    if (!items.length) return `<div class="empty-state">${WT.escapeHTML(emptyText)}</div>`;
    return `<div class="warning-history-list">${items.map(w => `
      <article class="warning-history-card ${String(w.status || "active").toLowerCase() === "active" ? "is-active" : "is-muted"}">
        <div class="warning-history-head">
          <strong>${WT.escapeHTML(w.type_label || w.type || "Advertencia")}</strong>
          <span>${WT.escapeHTML(warningStatusLabel(w.status))}</span>
        </div>
        <p>${WT.escapeHTML(w.reason || "Motivo no disponible.")}</p>
        <div class="warning-history-meta">
          <span>${WT.escapeHTML(warningSourceLabel(w.source))}</span>
          <span>${WT.escapeHTML(w.location || "Comunidad")}</span>
          <span>${WT.escapeHTML(formatWarningDate(w.created_at))}</span>
        </div>
      </article>`).join("")}</div>`;
  }

  function renderBlockSummary(blocks = [], profile = {}) {
    const reason = String(profile.block_reason || blocks?.[0]?.reason || "").trim();
    const blockedAt = profile.blocked_at || blocks?.[0]?.created_at || null;
    if (!reason && !blocks?.length) return `<div class="empty-state">No hay bloqueos registrados.</div>`;
    return `<details class="admin-block-summary" open>
      <summary>Ver resumen del bloqueo</summary>
      <div class="admin-block-summary-body">
        ${blockedAt ? `<p><strong>Fecha:</strong> ${WT.escapeHTML(formatWarningDate(blockedAt))}</p>` : ""}
        ${reason ? `<p>${WT.escapeHTML(reason)}</p>` : ""}
        ${blocks?.length ? `<div class="warning-history-list compact">${blocks.map(b => `<article class="warning-history-card is-block"><strong>${WT.escapeHTML(b.action === "auto_blocked" ? "Bloqueo automático" : b.action === "blocked" ? "Bloqueo manual" : "Registro")}</strong><p>${WT.escapeHTML(b.reason || "Sin motivo registrado.")}</p><small>${WT.escapeHTML(formatWarningDate(b.created_at))}</small></article>`).join("")}</div>` : ""}
      </div>
    </details>`;
  }

  async function viewUserWarnings(userId) {
    let target;
    try { target = await findUserCardData(userId); } catch (err) { return WT.toast(err.message || "No se pudo cargar el usuario.", "error"); }
    const myProfile = WTAuth.profile || await WT.getMyProfile();
    const myPermissions = await loadMyGranularPermissions(myProfile?.id);
    if (!canViewUserWarnings(target, myProfile, myPermissions)) return WT.toast("No tienes permiso para ver estas advertencias.", "error");
    const { data, error } = await WT.supabase.rpc("admin_get_user_warnings", { target_user_id: userId });
    if (error) return WT.toast(error.message || "No se pudieron cargar las advertencias.", "error");
    const payload = typeof data === "string" ? JSON.parse(data) : data || {};
    const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    const active = warnings.filter(w => String(w.status || "active").toLowerCase() === "active");
    const expired = warnings.filter(w => String(w.status || "").toLowerCase() !== "active");
    const manual = warnings.filter(w => String(w.source || "").toLowerCase() === "manual");
    const automatic = warnings.filter(w => String(w.source || "system").toLowerCase() !== "manual");
    const profile = payload.profile || target || {};
    const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
    const body = `<div class="admin-warning-panel">
      <div class="admin-warning-overview">
        <strong>${WT.escapeHTML(profile.name || target.full_name || target.email || "Usuario")}</strong>
        <span>${WT.escapeHTML(String(profile.status || target.status || "active").toLowerCase() === "blocked" ? "Bloqueado" : "Activo")}</span>
      </div>
      ${String(profile.status || target.status || "").toLowerCase() === "blocked" ? renderBlockSummary(blocks, profile) : ""}
      <details class="admin-warning-section" open><summary>Advertencias activas (${active.length})</summary>${renderWarningCards(active, "Sin advertencias activas.")}</details>
      <details class="admin-warning-section"><summary>Advertencias automáticas (${automatic.length})</summary>${renderWarningCards(automatic)}</details>
      <details class="admin-warning-section"><summary>Advertencias manuales (${manual.length})</summary>${renderWarningCards(manual)}</details>
      <details class="admin-warning-section"><summary>Advertencias vencidas o cerradas (${expired.length})</summary>${renderWarningCards(expired, "Sin advertencias vencidas o cerradas.")}</details>
    </div>`;
    WT.showModal({ title: "Advertencias del usuario", body, className: "admin-edit-modal admin-warning-modal" });
  }

  async function sendModerationPush(userId, payload = {}) {
    if (!userId || !window.WTPush?.sendPushNotification) return;
    try {
      await window.WTPush.sendPushNotification(userId, payload);
    } catch (error) {
      console.warn("No se pudo enviar push de moderación", error);
    }
  }

  async function sendManualWarning(userId) {
    let target;
    try { target = await findUserCardData(userId); } catch (err) { return WT.toast(err.message || "No se pudo cargar el usuario.", "error"); }
    if (!canOpenManualWarning(target, WTAuth.profile)) return WT.toast("No tienes permiso para advertir a este usuario.", "error");
    const body = `<form class="admin-form" id="manualWarningForm">
      <p class="form-help">Escribe un motivo claro y respetuoso. El usuario verá este motivo en su cuenta.</p>
      <label>Tipo de advertencia<select class="input" name="warning_type"><option value="manual_warning">Advertencia manual</option><option value="spam">Spam</option><option value="offensive_content">Contenido ofensivo</option><option value="adult_content">Contenido adulto</option><option value="misuse">Uso indebido</option><option value="other">Otro</option></select></label>
      ${textArea("Motivo visible para el usuario", "reason", "", "required data-no-rich='true'")}
      ${textArea("Nota interna opcional", "internal_note", "", "data-no-rich='true'")}
      <button class="btn btn-danger">Enviar aviso</button>
    </form>`;
    const modal = WT.showModal({ title: `Enviar aviso de moderación a ${WT.escapeHTML(target.full_name || target.email || "usuario")}`, body });
    WT.qs("#manualWarningForm", modal.element)?.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const reason = String(fd.get("reason") || "").trim();
      if (!reason) return WT.toast("Debes indicar el motivo del aviso.", "warning");
      const btn = e.currentTarget.querySelector("button");
      const oldText = btn?.textContent || "Enviar aviso";
      if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }
      const { data, error } = await WT.supabase.rpc("admin_send_manual_warning", {
        target_user_id: userId,
        reason_text: reason,
        warning_type_text: String(fd.get("warning_type") || "manual_warning"),
        internal_note_text: String(fd.get("internal_note") || "").trim() || null
      });
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
      if (error) return WT.toast(error.message || "No se pudo enviar el aviso de moderación.", "error");
      await log("enviar_aviso_moderacion", "forum_warnings", userId, { reason, result: data });
      const result = typeof data === "string" ? JSON.parse(data) : (data || {});
      await sendModerationPush(userId, {
        title: "Aviso de moderación",
        body: "Recibiste un aviso relacionado con las normas de la comunidad.",
        url: "foro.html",
        type: "forum_warning",
        tag: `moderation-notice-${userId}-${Date.now()}`
      });
      if (result.blocked) {
        const blockReason = result.block_reason || "Cuenta bloqueada automáticamente por acumulación de avisos de moderación.";
        await sendBanEmailNotification(userId, blockReason, true).catch(() => null);
      }
      modal.close();
      WT.toast(result.blocked ? "Aviso enviado. La cuenta quedó bloqueada automáticamente." : "Aviso de moderación enviado.", "success");
      renderUsers();
    });
  }

  async function manageUserBadges(userId) {
    let defs = [], assigned = [];
    try {
      const defRes = await WT.supabase.from("badge_definitions").select("*").order("name", { ascending: true });
      const assRes = await WT.supabase.from("user_badges").select("id,badge_id,badge_definitions(id,name,icon,color)").eq("user_id", userId);
      if (defRes.error) throw defRes.error;
      if (assRes.error) throw assRes.error;
      defs = defRes.data || [];
      assigned = assRes.data || [];
    } catch (err) {
      return WT.showModal({ title: "Insignias", body: `<p>La herramienta de insignias todavía no está lista. Revisa la configuración del panel antes de usarla.</p><p class="muted">${WT.escapeHTML(err.message || "Herramienta no disponible")}</p>` });
    }
    const assignedIds = new Set(assigned.map(x => x.badge_id));
    const body = `<form class="admin-form" id="badgesForm">
      <section class="admin-form-section"><h3>Insignias del usuario</h3>
        <div class="badge-check-grid">${defs.map(b => `<div class="badge-check"><label class="badge-check-main"><input type="checkbox" name="badge" value="${WT.escapeHTML(b.id)}" ${assignedIds.has(b.id) ? "checked" : ""}><span class="badge-preview-pill" style="--badge-color:${WT.escapeHTML(b.color || "#0b2f6b")}">${WT.escapeHTML(b.icon || "🏅")} ${WT.escapeHTML(b.name)}</span><small>${WT.escapeHTML(b.description || "")}</small></label><button class="badge-delete-btn" type="button" data-delete-badge-def="${WT.escapeHTML(b.id)}" aria-label="Eliminar ${WT.escapeHTML(b.name || "insignia")}">Eliminar</button></div>`).join("") || `<div class="empty-state">No hay insignias creadas.</div>`}</div>
      </section>
      <details class="admin-advanced"><summary>Crear nueva insignia</summary>
        <div class="two compact-grid"><label>Nombre<input class="input" name="new_name" placeholder="Ej: Moderador"></label><label>Icono<input class="input" name="new_icon" placeholder="⭐"></label></div>
        <label>Color<input class="input" type="color" name="new_color" value="#0b2f6b"></label>
        <label>Descripción<textarea class="input" name="new_description" placeholder="Para usuarios destacados o moderadores"></textarea></label>
      </details>
      <button class="btn btn-primary">Guardar insignias</button>
    </form>`;
    const modal = WT.showModal({ title: "Administrar insignias", body });
    modal.element.addEventListener("click", async ev => {
      const btn = ev.target.closest("[data-delete-badge-def]");
      if (!btn) return;
      ev.preventDefault(); ev.stopPropagation();
      const badgeId = btn.dataset.deleteBadgeDef;
      const ok = await WT.confirmDialog({ title: "Eliminar insignia", message: "Se quitará esta insignia de todos los usuarios y luego se eliminará.", confirmText: "Eliminar", danger: true });
      if (!ok) return;
      const rem = await WT.supabase.from("user_badges").delete().eq("badge_id", badgeId);
      if (rem.error) return WT.toast(rem.error.message, "error");
      const del = await WT.supabase.from("badge_definitions").delete().eq("id", badgeId);
      if (del.error) return WT.toast(del.error.message, "error");
      await log("eliminar_insignia", "badge_definitions", badgeId);
      WT.toast("Insignia eliminada", "success");
      modal.close();
      manageUserBadges(userId);
    });
    WT.qs("#badgesForm", modal.element).addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      let selected = fd.getAll("badge");
      const newName = String(fd.get("new_name") || "").trim();
      if (newName) {
        const { data: created, error: createError } = await WT.supabase.from("badge_definitions").insert({ name: newName, icon: fd.get("new_icon") || "🏅", color: fd.get("new_color") || "#0b2f6b", description: fd.get("new_description") || "", active: true }).select("id").single();
        if (createError) return WT.toast(createError.message, "error");
        selected.push(created.id);
      }
      const current = new Set(assigned.map(x => x.badge_id));
      const next = new Set(selected);
      const toAdd = [...next].filter(id => !current.has(id));
      const toRemove = [...current].filter(id => !next.has(id));
      if (toRemove.length) {
        const { error } = await WT.supabase.from("user_badges").delete().eq("user_id", userId).in("badge_id", toRemove);
        if (error) return WT.toast(error.message, "error");
      }
      if (toAdd.length) {
        const { error } = await WT.supabase.from("user_badges").insert(toAdd.map(badge_id => ({ user_id: userId, badge_id })));
        if (error) return WT.toast(error.message, "error");
      }
      await log("actualizar_insignias_usuario", "user_badges", userId, { selected });
      WT.toast("Insignias guardadas", "success");
      modal.close();
      renderUsers();
    });
  }

  document.addEventListener("click", e => {
    const del = e.target.closest("[data-delete]"); if (del) deleteRecord(del.dataset.delete);
    const role = e.target.closest("[data-user-role]"); if (role) changeUserRole(role.dataset.userRole);
    const status = e.target.closest("[data-user-status]"); if (status) changeUserStatus(status.dataset.userStatus);
    const perms = e.target.closest("[data-user-permissions]"); if (perms) manageUserPermissions(perms.dataset.userPermissions);
    const warnList = e.target.closest("[data-user-warnings]"); if (warnList) viewUserWarnings(warnList.dataset.userWarnings);
    const warn = e.target.closest("[data-user-warning]"); if (warn) sendManualWarning(warn.dataset.userWarning);
    const badges = e.target.closest("[data-user-badges]"); if (badges) manageUserBadges(badges.dataset.userBadges);
  });

  window.WTAdminContent = { renderDashboard, renderHero, renderAnnouncements, renderServices, renderCourses, renderUsers, renderAppearance, renderSettings, renderLogs, log };
})();
