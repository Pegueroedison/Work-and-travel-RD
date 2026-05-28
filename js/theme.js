(() => {
  const DEFAULT_THEME = {
    color_primary: "#072553",
    color_secondary: "#ca1824",
    color_accent: "#e8a320",
    color_bg: "#f6f8fc",
    color_card: "#ffffff",
    color_text: "#152033",
    color_muted: "#64748b",
    color_danger: "#dc2626",
    color_success: "#16a34a",
    color_border: "#dbe3ef",
    color_header: "#ffffff",
    color_footer: "#071a38",
    color_button: "#072553",
    color_button_text: "#ffffff",
    color_badge: "#eef4ff",
    color_forum_bg: "#f6f8fc",
    color_forum_surface: "#ffffff",
    color_forum_surface_2: "#eef4ff",
    color_forum_text: "#152033",
    color_forum_muted: "#64748b",
    color_forum_border: "#dbe3ef",
    color_forum_button: "#e9eff8",
    color_forum_accent: "#072553",
    color_forum_cta: "#0a7cff",
    shadow_card: "0 18px 50px rgba(7, 37, 83, .10)",
    radius_card: "22px",
    radius_button: "16px"
  };

  const CSS_MAP = {
    color_primary: "--color-primary", color_secondary: "--color-secondary", color_accent: "--color-accent",
    color_bg: "--color-bg", color_card: "--color-card", color_text: "--color-text", color_muted: "--color-muted",
    color_danger: "--color-danger", color_success: "--color-success", color_border: "--color-border",
    color_header: "--color-header", color_footer: "--color-footer", color_button: "--color-button",
    color_button_text: "--color-button-text", color_badge: "--color-badge",
    color_forum_bg: "--forum-bg", color_forum_surface: "--forum-surface", color_forum_surface_2: "--forum-surface-2",
    color_forum_text: "--forum-text", color_forum_muted: "--forum-muted", color_forum_border: "--forum-border",
    color_forum_button: "--forum-button", color_forum_accent: "--forum-accent", color_forum_cta: "--forum-cta",
    shadow_card: "--shadow-card",
    radius_card: "--radius-card", radius_button: "--radius-button"
  };

  async function loadTheme() {
    applyTheme(DEFAULT_THEME);
    if (!WT.canConnect) return DEFAULT_THEME;
    const { data, error } = await WT.supabase.from("theme_settings").select("key,value");
    if (error) return DEFAULT_THEME;
    const theme = { ...DEFAULT_THEME };
    data?.forEach(row => theme[row.key] = row.value);
    applyTheme(theme);
    return theme;
  }

  function applyTheme(theme) {
    Object.entries(CSS_MAP).forEach(([key, cssVar]) => {
      const value = theme[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") document.documentElement.style.setProperty(cssVar, value);
    });
    if (theme.mode === "dark") document.documentElement.style.colorScheme = "dark";
  }

  function normalizeSettingValue(value) {
    if (value == null) return "";
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return "";
      try {
        const parsed = JSON.parse(trimmed);
        return typeof parsed === "string" ? parsed : parsed;
      } catch (_) {
        return trimmed;
      }
    }
    return value;
  }

  function validLogoUrl(value = "") {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^data:image\//i.test(url)) return ""; // El logo no debe venir como base64 desde la base de datos.
    return url;
  }

  function applySiteLogo(logoUrl = "") {
    const fallback = "images/placeholder-logo.png";
    const finalUrl = validLogoUrl(logoUrl) || fallback;
    document.querySelectorAll("#siteLogo").forEach(logo => {
      logo.onerror = () => {
        logo.onerror = null;
        logo.src = fallback;
      };
      logo.src = finalUrl;
    });
    return finalUrl;
  }

  async function loadSiteSettings() {
    const fallbackLogo = "images/placeholder-logo.png";
    if (!WT.canConnect) {
      applySiteLogo(fallbackLogo);
      return {};
    }
    const { data } = await WT.supabase.from("site_settings").select("key,value,type,is_public").eq("is_public", true);
    const settings = {};
    data?.forEach(row => settings[row.key] = normalizeSettingValue(row.value));
    const siteName = WT.qs("#siteName");
    const footer = WT.qs("#footerText");
    if (settings.site_name && siteName) siteName.textContent = settings.site_name;

    // Clave preferida: site_logo. Si el proyecto ya usa logo_url, se respeta como respaldo.
    const logoUrl = validLogoUrl(settings.site_logo) || validLogoUrl(settings.logo_url) || fallbackLogo;
    applySiteLogo(logoUrl);

    if (settings.footer_text && footer) footer.textContent = settings.footer_text;
    if (settings.meta_description) document.querySelector('meta[name="description"]')?.setAttribute("content", settings.meta_description);

    const faviconUrl = validLogoUrl(settings.favicon_url);
    if (faviconUrl) {
      const icon = document.querySelector('link[rel="icon"]');
      if (icon) icon.setAttribute("href", faviconUrl);
    }
    return settings;
  }

  document.addEventListener("DOMContentLoaded", () => { loadTheme(); loadSiteSettings(); });
  window.WTTheme = { DEFAULT_THEME, CSS_MAP, loadTheme, applyTheme, loadSiteSettings };
})();
