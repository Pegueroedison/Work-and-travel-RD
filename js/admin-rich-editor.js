(() => {
  const TOOLBAR = [
    { cmd: "bold", label: "B", title: "Negrita" },
    { cmd: "italic", label: "I", title: "Cursiva" },
    { cmd: "underline", label: "U", title: "Subrayado" },
    { cmd: "insertUnorderedList", label: "• Lista", title: "Lista" },
    { cmd: "insertOrderedList", label: "1. Lista", title: "Lista numerada" },
    { cmd: "formatBlock", value: "h3", label: "Título", title: "Título" },
    { cmd: "formatBlock", value: "p", label: "Párrafo", title: "Párrafo" },
    { cmd: "removeFormat", label: "Limpiar", title: "Quitar formato" }
  ];

  function escapeHTML(value = "") {
    return String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", '"':"&quot;" }[ch]));
  }

  function normalizeTextBreaks(value = "") {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n");
  }

  function plainToHTML(value = "") {
    const text = normalizeTextBreaks(value).trim();
    if (!text) return "";
    if (/<\/?(p|br|strong|b|em|i|u|ul|ol|li|h[1-6]|blockquote|a|span|figure|img)\b/i.test(text)) return text;
    return text.split(/\n{2,}/).map(block => `<p>${escapeHTML(block).replace(/\n/g, "<br>")}</p>`).join("");
  }

  function cleanHTML(html = "") {
    const div = document.createElement("div");
    div.innerHTML = String(html || "");
    div.querySelectorAll("script,style,iframe,object,embed,form,input,button").forEach(n => n.remove());
    div.querySelectorAll("*").forEach(node => {
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) node.removeAttribute(attr.name);
        if ((name === "href" || name === "src") && /^javascript:/i.test(attr.value || "")) node.removeAttribute(attr.name);
        if (name === "style" && !node.classList.contains("wt-link-btn")) node.removeAttribute(attr.name);
      });
    });
    return div.innerHTML.replace(/&nbsp;/gi, " ").replace(/\u00a0/g, " ").trim();
  }

  function getSourceTextarea(box) {
    if (!box) return null;
    const linkedId = box.dataset.richSourceId || "";
    if (linkedId) {
      const direct = document.querySelector(`textarea[data-rich-source-id="${CSS.escape(linkedId)}"]`);
      if (direct) return direct;
    }
    const previous = box.previousElementSibling;
    if (previous?.matches?.("label")) {
      const fromLabel = previous.querySelector("textarea[data-rich-editor]");
      if (fromLabel) return fromLabel;
    }
    return box.querySelector("textarea[data-rich-editor]");
  }

  function syncOne(box) {
    const textarea = getSourceTextarea(box);
    const editor = box?.querySelector("[data-rich-editable]");
    if (!textarea || !editor) return;
    const html = cleanHTML(editor.innerHTML || "");
    textarea.value = html === "<br>" ? "" : html;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ── HIPERENLACE: abre popover ─────────────────────────────────
  function openLinkPopover(editable, box) {
    // Guardar selección. En móviles el click del botón puede quitar la selección,
    // por eso usamos la última selección válida guardada en el editor.
    const sel = window.getSelection();
    let savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    if (!savedRange || !editable.contains(savedRange.commonAncestorContainer)) {
      savedRange = editable.__lastRange ? editable.__lastRange.cloneRange() : null;
    }
    const selectedText = savedRange ? savedRange.toString() : "";

    // Detectar si el cursor está dentro de un <a>
    let anchorNode = sel?.anchorNode || savedRange?.commonAncestorContainer || null;
    if (anchorNode && anchorNode.nodeType === Node.TEXT_NODE) anchorNode = anchorNode.parentElement;
    const existingAnchor = anchorNode?.closest?.("a") || null;
    const existingHref = existingAnchor?.getAttribute("href") || "";
    const existingIsBtn = existingAnchor?.classList.contains("wt-link-btn");

    // Quitar popover anterior si existe
    box.querySelector(".rich-link-popover")?.remove();

    const popover = document.createElement("div");
    popover.className = "rich-link-popover";
    popover.innerHTML = `
      <div class="rich-link-popover-inner">
        <label class="rich-link-label">Texto del enlace
          <input class="rich-link-input" type="text" placeholder="Texto que se verá" value="${escapeHTML(selectedText || existingAnchor?.textContent || "")}">
        </label>
        <label class="rich-link-label">URL del enlace
          <input class="rich-link-input rich-link-url" type="url" placeholder="https://..." value="${escapeHTML(existingHref)}">
        </label>
        <label class="rich-link-check">
          <input type="checkbox" class="rich-link-as-btn" ${existingIsBtn ? "checked" : ""}> Mostrar como botón
        </label>
        <div class="rich-link-actions">
          <button type="button" class="rich-link-save btn btn-primary btn-small">Insertar</button>
          ${existingAnchor ? '<button type="button" class="rich-link-remove btn btn-soft btn-small">Quitar enlace</button>' : ""}
          <button type="button" class="rich-link-cancel btn btn-soft btn-small">Cancelar</button>
        </div>
      </div>`;

    box.appendChild(popover);
    popover.addEventListener("pointerdown", e => e.stopPropagation());
    popover.addEventListener("click", e => e.stopPropagation());

    const urlInput = popover.querySelector(".rich-link-url");
    const textInput = popover.querySelector(".rich-link-input");
    const asBtn = popover.querySelector(".rich-link-as-btn");

    // Poner foco en URL si hay texto, en texto si no hay
    setTimeout(() => (selectedText ? urlInput : textInput).focus(), 30);

    const close = () => popover.remove();

    popover.querySelector(".rich-link-cancel")?.addEventListener("click", close);

    popover.querySelector(".rich-link-remove")?.addEventListener("click", () => {
      editable.focus({ preventScroll: true });
      if (existingAnchor) {
        const parent = existingAnchor.parentNode;
        while (existingAnchor.firstChild) parent.insertBefore(existingAnchor.firstChild, existingAnchor);
        parent.removeChild(existingAnchor);
      }
      syncOne(box);
      close();
    });

    popover.querySelector(".rich-link-save")?.addEventListener("click", () => {
      const url = urlInput.value.trim();
      const text = textInput.value.trim();
      if (!url) { urlInput.focus(); return; }

      editable.focus({ preventScroll: true });

      // Restaurar selección guardada
      if (savedRange) {
        const sel2 = window.getSelection();
        sel2.removeAllRanges();
        sel2.addRange(savedRange);
      }

      if (existingAnchor) {
        existingAnchor.href = url;
        existingAnchor.textContent = text || url;
        existingAnchor.className = asBtn.checked ? "wt-link-btn" : "";
        existingAnchor.target = "_blank";
        existingAnchor.rel = "noopener noreferrer";
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.textContent = text || url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        if (asBtn.checked) a.className = "wt-link-btn";

        if (savedRange) {
          savedRange.deleteContents();
          savedRange.insertNode(a);
          const afterRange = document.createRange();
          afterRange.setStartAfter(a);
          afterRange.collapse(true);
          const sel3 = window.getSelection();
          sel3.removeAllRanges();
          sel3.addRange(afterRange);
          editable.__lastRange = afterRange.cloneRange();
        } else {
          editable.insertAdjacentHTML("beforeend", a.outerHTML);
        }
      }

      syncOne(box);
      close();
    });

    // Cerrar al hacer click fuera
    setTimeout(() => {
      const onOutside = (e) => {
        if (!popover.contains(e.target) && !box.contains(e.target)) {
          close();
          document.removeEventListener("mousedown", onOutside);
          document.removeEventListener("touchstart", onOutside);
        }
      };
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("touchstart", onOutside, { passive: true });
    }, 120);
  }


  function openImagePopover(editable, box) {
    const sel = window.getSelection();
    let savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    if (!savedRange || !editable.contains(savedRange.commonAncestorContainer)) {
      savedRange = editable.__lastRange ? editable.__lastRange.cloneRange() : null;
    }

    box.querySelector(".rich-image-popover")?.remove();

    const popover = document.createElement("div");
    popover.className = "rich-link-popover rich-image-popover";
    popover.innerHTML = `
      <div class="rich-link-popover-inner">
        <label class="rich-link-label">URL de la imagen
          <input class="rich-link-input rich-image-url" type="url" placeholder="https://...">
        </label>
        <label class="rich-link-label">Texto alternativo
          <input class="rich-link-input rich-image-alt" type="text" placeholder="Descripción breve">
        </label>
        <small class="admin-rich-hint">Usa una URL pública de una imagen ya subida. La imagen aparecerá dentro del texto.</small>
        <div class="rich-link-actions">
          <button type="button" class="rich-image-save btn btn-primary btn-small">Insertar imagen</button>
          <button type="button" class="rich-link-cancel btn btn-soft btn-small">Cancelar</button>
        </div>
      </div>`;

    box.appendChild(popover);
    popover.addEventListener("pointerdown", e => e.stopPropagation());
    popover.addEventListener("click", e => e.stopPropagation());

    const urlInput = popover.querySelector(".rich-image-url");
    const altInput = popover.querySelector(".rich-image-alt");
    setTimeout(() => urlInput.focus(), 30);

    const close = () => popover.remove();
    popover.querySelector(".rich-link-cancel")?.addEventListener("click", close);

    popover.querySelector(".rich-image-save")?.addEventListener("click", () => {
      const url = urlInput.value.trim();
      const alt = altInput.value.trim();
      if (!url) { urlInput.focus(); return; }

      const img = document.createElement("img");
      img.src = url;
      img.alt = alt || "Imagen";
      img.loading = "lazy";
      img.className = "wt-rich-image";

      const figure = document.createElement("figure");
      figure.className = "wt-rich-figure";
      figure.appendChild(img);

      editable.focus({ preventScroll: true });
      if (savedRange) {
        savedRange.deleteContents();
        savedRange.insertNode(figure);
        const afterRange = document.createRange();
        afterRange.setStartAfter(figure);
        afterRange.collapse(true);
        const sel2 = window.getSelection();
        sel2.removeAllRanges();
        sel2.addRange(afterRange);
        editable.__lastRange = afterRange.cloneRange();
      } else {
        editable.appendChild(figure);
      }
      syncOne(box);
      close();
    });
  }

  function createEditor(textarea) {
    if (!textarea || textarea.dataset.richReady === "true") return;
    if (textarea.type === "hidden" || textarea.classList.contains("hidden")) return;
    const name = String(textarea.name || textarea.dataset.optionField || "").toLowerCase();
    if (textarea.hasAttribute("data-no-rich") || /json|gallery|url|path|css|html_code/.test(name)) return;

    textarea.dataset.richReady = "true";
    textarea.dataset.richEditor = "true";
    textarea.classList.add("admin-rich-source");

    const richId = `rich_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    textarea.dataset.richSourceId = richId;

    const box = document.createElement("div");
    box.className = "admin-rich-editor";
    box.dataset.richSourceId = richId;
    if (/details|description|body|content|guide|note|summary|subtitle/.test(name)) box.classList.add("admin-rich-editor-large");

    const toolbar = document.createElement("div");
    toolbar.className = "admin-rich-toolbar";

    // Botones estándar
    TOOLBAR.forEach(tool => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = tool.label;
      btn.title = tool.title;
      btn.addEventListener("mousedown", ev => ev.preventDefault());
      btn.addEventListener("touchstart", ev => ev.preventDefault(), { passive: false });
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        editable.focus({ preventScroll: true });
        document.execCommand(tool.cmd, false, tool.value || null);
        syncOne(box);
      });
      toolbar.appendChild(btn);
    });

    // Botón de enlace / hiperenlace
    const linkBtn = document.createElement("button");
    linkBtn.type = "button";
    linkBtn.textContent = "🔗 Enlace";
    linkBtn.title = "Insertar o editar un enlace (también como botón)";
    linkBtn.className = "rich-toolbar-link-btn";
    linkBtn.addEventListener("pointerdown", ev => {
      ev.preventDefault();
      rememberSelection();
      openLinkPopover(editable, box);
    });
    toolbar.appendChild(linkBtn);

    const imageBtn = document.createElement("button");
    imageBtn.type = "button";
    imageBtn.textContent = "Imagen";
    imageBtn.title = "Insertar una imagen dentro del texto";
    imageBtn.className = "rich-toolbar-image-btn";
    imageBtn.addEventListener("pointerdown", ev => {
      ev.preventDefault();
      rememberSelection();
      openImagePopover(editable, box);
    });
    toolbar.appendChild(imageBtn);

    const editable = document.createElement("div");
    editable.className = "admin-rich-editable";
    const rememberSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (editable.contains(range.commonAncestorContainer)) editable.__lastRange = range.cloneRange();
      }
    };
    editable.contentEditable = "true";
    editable.dataset.richEditable = "true";
    editable.innerHTML = plainToHTML(textarea.value);
    editable.addEventListener("input", () => { rememberSelection(); syncOne(box); });
    editable.addEventListener("keyup", rememberSelection);
    editable.addEventListener("mouseup", rememberSelection);
    editable.addEventListener("touchend", () => setTimeout(rememberSelection, 20), { passive: true });
    editable.addEventListener("blur", () => syncOne(box));
    editable.addEventListener("click", ev => {
      ev.stopPropagation();
      editable.focus({ preventScroll: true });
    });
    editable.addEventListener("touchend", ev => {
      ev.stopPropagation();
      editable.focus({ preventScroll: true });
    }, { passive: true });

    const hint = document.createElement("small");
    hint.className = "admin-rich-hint";
    hint.textContent = "Editor profesional: usa negrita, listas, títulos y enlaces. El contenido se guardará al guardar los cambios.";

    const parentLabel = textarea.parentElement?.tagName?.toLowerCase() === "label" ? textarea.parentElement : null;
    if (parentLabel) parentLabel.after(box);
    else textarea.after(box);
    box.appendChild(toolbar);
    box.appendChild(editable);
    box.appendChild(hint);
    textarea.classList.add("visually-hidden-rich-source");
    textarea.tabIndex = -1;
    textarea.setAttribute("aria-hidden", "true");
    syncOne(box);
  }

  function enhance(root = document) {
    root.querySelectorAll('textarea.input:not([data-rich-ready="true"])').forEach(createEditor);
    root.querySelectorAll("form").forEach(form => {
      if (form.dataset.richSubmitBound === "true") return;
      form.dataset.richSubmitBound = "true";
      form.addEventListener("submit", () => sync(form), true);
    });
  }

  function sync(root = document) {
    root.querySelectorAll(".admin-rich-editor").forEach(syncOne);
  }

  document.addEventListener("DOMContentLoaded", () => enhance(document));
  window.WTAdminRich = { enhance, sync, cleanHTML, plainToHTML, normalizeTextBreaks };
})();
