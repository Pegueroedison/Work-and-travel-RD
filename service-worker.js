const WT_CACHE = "wt-guide-rd-v4046-supabase-reconnect-fix";
self.addEventListener("install", event => { self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== WT_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    try { data = { title: "Work and Travel RD", body: event.data ? event.data.text() : "Tienes una nueva notificación." }; } catch (_) {}
  }
  const title = data.title || "Work and Travel RD";
  const options = {
    body: data.body || data.message || "Tienes una nueva notificación.",
    icon: data.icon || "images/icon-192.png",
    badge: data.badge || "images/icon-144.png",
    tag: data.tag || data.type || "work-travel-rd",
    data: { url: data.url || data.link || "./foro.html" },
    vibrate: [80, 35, 80]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "./foro.html";
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if ("focus" in client) {
        try { await client.focus(); if ("navigate" in client) await client.navigate(targetUrl); return; } catch (_) {}
      }
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});

self.addEventListener("pushsubscriptionchange", event => {
  // La app volverá a suscribir el dispositivo cuando el usuario abra su perfil.
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match("./index.html")));
    return;
  }
  // NSFWJS/TensorFlow local pesan varios MB; se cachean para no
  // descargarlos de nuevo cada vez que se abra la PWA.
  if (url.pathname.includes("/vendor/nsfwjs/") || url.pathname.includes("/vendor/tfjs/")) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(WT_CACHE).then(cache => cache.put(request, copy)).catch(()=>{});
      return response;
    })));
    return;
  }
  if (/\.(js|css|html)$/i.test(url.pathname)) {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    const copy = response.clone();
    caches.open(WT_CACHE).then(cache => cache.put(request, copy)).catch(()=>{});
    return response;
  })));
});
