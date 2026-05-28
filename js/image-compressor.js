/* === Image Compressor — Work and Travel RD ===
   Compresión real en navegador, compatible con móvil.
   Modo obligatorio: solo permite WebP real.
   Si el móvil no puede codificar WebP, se bloquea la subida para no guardar JPEG.
*/
(() => {
  const DEFAULTS = {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.78,
    mimeType: "image/webp",
    timeoutMs: 22000,
    skipBelowBytes: 0,
    fallbackToOriginal: false,
    onlyIfSmaller: false,
    allowJpegFallback: false,
    requireWebP: true,
    maxBytes: 0,
    force: true
  };

  let webpEncodeSupport;

  function isImage(file) {
    return Boolean(file && String(file.type || "").startsWith("image/"));
  }

  function isProbablyHeic(file) {
    const type = String(file?.type || "").toLowerCase();

    // v3925 FIX iOS: iPhone/Safari puede convertir HEIC a JPEG/PNG/WebP
    // al seleccionar la foto, pero conservar el nombre IMG_1234.HEIC.
    // Si el MIME ya es un formato estándar soportado, NO debe bloquearse
    // por la extensión del nombre.
    if (["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(type)) {
      return false;
    }

    const name = String(file?.name || "").toLowerCase();
    return type.includes("heic") || type.includes("heif") || (!type && /\.(heic|heif)$/i.test(name));
  }

  function safeName(name = "image") {
    return String(name || "image")
      .replace(/\.[a-z0-9]{2,6}$/i, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "image";
  }

  function extensionFromType(type = "") {
    const value = String(type || "").toLowerCase();
    if (value.includes("webp")) return "webp";
    if (value.includes("png")) return "png";
    if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
    return "jpg";
  }

  function supportsWebPEncode() {
    if (webpEncodeSupport !== undefined) return webpEncodeSupport;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      webpEncodeSupport = canvas.toDataURL("image/webp", 0.5).startsWith("data:image/webp");
    } catch (_) {
      webpEncodeSupport = false;
    }
    return webpEncodeSupport;
  }

  function dataURLToBlob(dataURL) {
    const parts = String(dataURL || "").split(",");
    if (parts.length < 2) return null;
    const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || "image/jpeg";
    const binary = atob(parts[1]);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function canvasToBlob(canvas, type = "image/webp", quality = 0.78, timeoutMs = 10000) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (blob) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(fallbackTimer);
        resolve(blob || null);
      };
      const tryDataURL = () => {
        if (done) return;
        try {
          const asDataURL = canvas.toDataURL(type, quality);
          const fallbackBlob = asDataURL.startsWith(`data:${type}`) ? dataURLToBlob(asDataURL) : null;
          finish(fallbackBlob);
        } catch (_) {
          finish(null);
        }
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      const fallbackTimer = setTimeout(tryDataURL, type === "image/webp" ? 1800 : 3500);

      try {
        if (canvas.toBlob) {
          canvas.toBlob((blob) => {
            if (blob && blob.type && String(blob.type).toLowerCase().includes(type.split("/")[1])) return finish(blob);
            if (blob && type !== "image/webp") return finish(blob);
            tryDataURL();
          }, type, quality);
        } else {
          tryDataURL();
        }
      } catch (_) {
        tryDataURL();
      }
    });
  }

  function loadWithImage(file, timeoutMs = 16000) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (error) {
          URL.revokeObjectURL(url);
          reject(error);
        } else {
          resolve({ source: img, revoke: () => URL.revokeObjectURL(url) });
        }
      };
      const timer = setTimeout(() => finish(new Error("La imagen tardó demasiado en leerse.")), timeoutMs);
      img.onload = () => finish(null);
      img.onerror = () => finish(new Error("No se pudo leer la imagen. Si es HEIC, conviértela a JPG antes de subirla."));
      img.decoding = "async";
      img.src = url;
    });
  }

  function isMobileBrowser() {
    const ua = navigator.userAgent || "";
    return /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || matchMedia("(max-width: 820px)").matches;
  }

  function timeoutReject(ms, message) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
  }

  async function loadBitmap(file, timeoutMs = 16000) {
    // En móvil usamos createImageBitmap primero porque decodifica fuera del flujo principal
    // y evita que el progreso se quede congelado en 18% con fotos grandes.
    if (window.createImageBitmap) {
      try {
        const bitmap = await Promise.race([
          createImageBitmap(file, { imageOrientation: "from-image" }),
          timeoutReject(Math.max(6000, Math.floor(timeoutMs * 0.65)), "La imagen tardó demasiado en decodificarse en el móvil.")
        ]);
        return { source: bitmap, revoke: () => { try { bitmap.close?.(); } catch (_) {} } };
      } catch (_) {
        // fallback estable
      }
    }
    return await loadWithImage(file, timeoutMs);
  }

  function getSize(source) {
    const width = source.naturalWidth || source.videoWidth || source.width || 0;
    const height = source.naturalHeight || source.videoHeight || source.height || 0;
    return { width, height };
  }

  function targetSize(width, height, maxWidth, maxHeight) {
    if (!width || !height) return { width: Math.min(1200, maxWidth), height: Math.min(1200, maxHeight) };
    const ratio = Math.min(1, maxWidth / width, maxHeight / height);
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio))
    };
  }

  function drawToCanvas(source, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Este navegador no pudo preparar la imagen.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, width, height);
    return canvas;
  }

  async function encodeBest(canvas, opts) {
    const requireWebP = opts.requireWebP !== false;
    const webpSupported = supportsWebPEncode();

    if (requireWebP && !webpSupported) {
      throw new Error("Este móvil/navegador no puede convertir imágenes a WebP desde el navegador. Activa 'Más compatible' en la cámara o prueba desde otro navegador/dispositivo.");
    }

    const targetTypes = [];
    if (webpSupported) targetTypes.push("image/webp");
    if (!requireWebP && opts.allowJpegFallback !== false) targetTypes.push("image/jpeg");

    const baseQuality = Number(opts.quality || 0.78);
    const qualities = [...new Set([baseQuality, 0.76, 0.70, 0.64, 0.58, 0.50, 0.44])].filter(q => q > 0 && q <= 1);

    let best = null;
    for (const type of targetTypes) {
      for (const q of qualities) {
        const blob = await canvasToBlob(canvas, type, q, Math.max(3000, Math.floor((opts.timeoutMs || 22000) / 3)));
        if (!blob) continue;

        const realType = String(blob.type || type).toLowerCase();
        if (type === "image/webp" && !realType.includes("webp")) continue;
        if (requireWebP && !realType.includes("webp")) continue;

        if (!best || blob.size < best.blob.size) {
          best = { blob, quality: q, mime: realType || type };
        }
        if (!opts.maxBytes || blob.size <= opts.maxBytes) return { blob, quality: q, mime: realType || type };
      }
    }

    if (requireWebP && (!best || !String(best.blob.type || best.mime || "").toLowerCase().includes("webp"))) {
      throw new Error("Este dispositivo no pudo generar WebP real. La subida fue bloqueada para evitar guardar JPEG.");
    }

    return best;
  }

  async function optimize(file, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    if (!isImage(file)) throw new Error("Solo se permiten imágenes.");
    if (isProbablyHeic(file)) throw new Error("El formato HEIC no se puede comprimir en este navegador. Configura la cámara en 'Más compatible' o sube JPG/PNG/WebP.");

    const original = {
      blob: file,
      file,
      width: null,
      height: null,
      originalSize: file.size || 0,
      size: file.size || 0,
      converted: false,
      compressed: false,
      fallback: true,
      mime: file.type || "image/jpeg",
      extension: extensionFromType(file.type || "image/jpeg"),
      fileName: file.name || `image.${extensionFromType(file.type || "image/jpeg")}`
    };

    const work = (async () => {
      const loaded = await loadBitmap(file, Math.max(12000, opts.timeoutMs || 22000));
      try {
        const { width, height } = getSize(loaded.source);
        const size = targetSize(width, height, opts.maxWidth, opts.maxHeight);
        const canvas = drawToCanvas(loaded.source, size.width, size.height);
        const encoded = await encodeBest(canvas, opts);
        canvas.width = 1;
        canvas.height = 1;

        if (!encoded?.blob) throw new Error("No se pudo comprimir la imagen en este dispositivo.");
        if (opts.requireWebP !== false && !String(encoded.blob.type || encoded.mime || "").toLowerCase().includes("webp")) {
          throw new Error("El navegador intentó devolver JPEG/PNG. La subida fue bloqueada porque solo se permite WebP.");
        }

        if (opts.onlyIfSmaller && file.size && encoded.blob.size >= file.size) {
          if (opts.fallbackToOriginal) return original;
          throw new Error("La imagen no se pudo reducir. Intenta con otra imagen.");
        }

        const ext = extensionFromType(encoded.blob.type || encoded.mime);
        const name = `${safeName(file.name)}.${ext}`;
        return {
          blob: encoded.blob,
          file: new File([encoded.blob], name, { type: encoded.blob.type || encoded.mime }),
          width: size.width,
          height: size.height,
          originalWidth: width,
          originalHeight: height,
          originalSize: file.size || 0,
          size: encoded.blob.size,
          converted: true,
          compressed: true,
          fallback: false,
          quality: encoded.quality,
          mime: encoded.blob.type || encoded.mime,
          extension: ext,
          fileName: name,
          webp: (encoded.blob.type || encoded.mime) === "image/webp"
        };
      } finally {
        try { loaded.revoke?.(); } catch (_) {}
      }
    })();

    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => {
        if (opts.fallbackToOriginal) return resolve(original);
        reject(new Error("La compresión tardó demasiado en este dispositivo. Intenta con una imagen más liviana."));
      }, opts.timeoutMs || 22000);
    });

    const result = await Promise.race([work.catch((error) => opts.fallbackToOriginal ? original : Promise.reject(error)), timeout]);
    if (!result) throw new Error("No se pudo optimizar la imagen.");
    return result;
  }

  async function optimizeForUse(file, use = "forum", extra = {}) {
    const mobile = isMobileBrowser();
    const map = {
      profile: { maxWidth: mobile ? 512 : 768, maxHeight: mobile ? 512 : 768, quality: mobile ? 0.76 : 0.80, maxBytes: 700 * 1024, timeoutMs: mobile ? 16000 : 24000 },
      forum: { maxWidth: mobile ? 960 : 1600, maxHeight: mobile ? 960 : 1600, quality: mobile ? 0.70 : 0.78, maxBytes: 1800 * 1024, timeoutMs: mobile ? 22000 : 26000 },
      comment: { maxWidth: mobile ? 840 : 1200, maxHeight: mobile ? 840 : 1200, quality: mobile ? 0.68 : 0.75, maxBytes: 1200 * 1024, timeoutMs: mobile ? 20000 : 24000 },
      admin: { maxWidth: mobile ? 1280 : 1920, maxHeight: mobile ? 1280 : 1920, quality: mobile ? 0.74 : 0.80, maxBytes: 2200 * 1024, timeoutMs: mobile ? 18000 : 26000 }
    };
    return optimize(file, { ...(map[use] || map.forum), ...extra, timeoutMs: Math.min(extra.timeoutMs || Infinity, (map[use] || map.forum).timeoutMs) });
  }

  window.WTImageCompressor = {
    optimize,
    optimizeForUse,
    extensionFromType,
    safeName,
    supportsWebPEncode
  };
})();
