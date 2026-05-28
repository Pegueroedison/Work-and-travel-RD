# Work and Travel RD v4058

## Objetivo
Corregir que el botón **Publicar** no hiciera nada cuando la publicación tenía imagen o PDF.

## Base técnica
- Se tomó la v4057.
- Se restauró el manejo de sesión/PWA estable de la v4045 para no interferir con file picker, imagen, PDF, lectura local ni subida.
- Se mantuvo el ajuste del panel admin para no forzar `refreshSession()` antes de guardar.

## Cambios principales
- `js/supabase-client.js` restaurado al comportamiento estable de v4045.
- `js/pwa.js` restaurado al comportamiento estable de v4045.
- `js/admin-content.js` mantiene guardado sin refresh forzado.
- No se tocó el flujo de PDF ni imagen.
- No hay SQL obligatorio.
