// archivo: js/supabase-config.js
// No pongas claves privadas aquí. Las claves privadas de R2, Brevo y Sender van en Cloudflare Worker o Supabase SMTP.

window.WT_SUPABASE_CONFIG = {
  SUPABASE_URL: "https://wmdyawtcfivzivaogktq.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtZHlhd3RjZml2eml2YW9na3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTk0MTcsImV4cCI6MjA5NDY5NTQxN30.2aWanyCnpPiM08MjAt1DDKmM0YsmVtN-ulEfEvxXJOM",
  BUCKETS: {
    site_assets: "site-assets",
    profile_photos: "profile-photos",
    content_images: "content-images",
    hero_images: "hero-images",
    course_images: "course-images",
    service_images: "service-images",
    announcement_images: "announcement-images",
    practice_audio: "practice-audio"
  },
  CLOUDFLARE_R2: {
    ENABLED: true,
    UPLOAD_WORKER_URL: "https://work-and-travel-rd-upload.8pydpnjg9z.workers.dev/upload",
    PUBLIC_BASE_URL: "https://media.peguerocrespo.com",
    BLOCK_LEGACY_SUPABASE_IMAGES: true
  },
  EMAIL_SERVICES: {
    BREVO_USAGE: ["verificacion_cuenta", "recuperacion_contrasena", "cambio_contrasena"],
    SENDER_USAGE: ["notificaciones_foro", "newsletters", "anuncios", "campanas"]
  },
  GOOGLE_DRIVE_PDF: {
    ENABLED: true,
    UPLOAD_ENDPOINT: "https://work-and-travel-rd-upload.8pydpnjg9z.workers.dev/upload-pdf",
    MAX_BYTES: 5 * 1024 * 1024,
    MAX_FILES_PER_POST: 1,
    MAX_FILES_PER_COMMENT: 1,
    MAX_FILES_PER_DAY: 5,
    ENABLE_AI_SUMMARY: true,
    AI_SUMMARY_ENDPOINT: "https://wmdyawtcfivzivaogktq.supabase.co/functions/v1/analyze-pdf-summary",
    AI_SUMMARY_FALLBACK_ENDPOINT: "/.netlify/functions/analyze-pdf-summary"
  },
  FORUM_LIMITS: {
    IMAGES_PER_POST: 4,
    IMAGES_PER_DAY: 20,
    IMAGE_ORIGINAL_MAX_MB: 6,
    IMAGE_FINAL_MAX_MB: 3,
    PDFS_PER_DAY: 5,
    PASSWORD_RESETS_PER_DAY: 2,
    PASSWORD_RESET_COOLDOWN_MINUTES: 15
  },
  PUSH_NOTIFICATIONS: {
    ENABLED: true,
    // Coloca aquí la clave pública VAPID. La clave privada va como secret en Supabase.
    VAPID_PUBLIC_KEY: "BLTPxUpmpWC91wWjksG4kUffnmqeMM8Y56fH-atpf4PkR_aU5K5Ut0OmE3-JlLKSnUOopv5aLkevoZQNr15c7LM",
    EDGE_FUNCTION: "send-push-notification"
  }
};
