/* Margin service worker: makes the app open and work without internet.
   App files load fresh from the internet when online, and from the saved copy when offline. */
const VERSION = "margin-v6";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./style-01.css",
  "./style-02.css",
  "./style-03.css",
  "./style-04.css",
  "./ui-01.html",
  "./ui-02.html",
  "./app-01.js",
  "./app-02.js",
  "./app-03.js",
  "./app-04.js",
  "./app-05.js",
  "./app-06.js",
  "./app-07.js",
  "./app-08.js",
  "./app-09.js",
  "./app-10.js",
  "./app-11.js",
  "./app-12.js",
  "./app-13.js",
  "./app-14.js",
  "./app-15.js",
  "./app-16.js",
  "./app-17.js",
  "./app-18.js",
  "./app-19.js",
  "./app-20.js",
  "./app-21.js",
  "./app-22.js"
];

/* the PDF engines Margin needs on every launch */
const LIBRARIES = [
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(APP_FILES.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await Promise.all(LIBRARIES.map((url) =>
      cache.add(new Request(url, { mode: "no-cors" })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* Margin's own files: newest from the internet, saved copy when offline */
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const key = req.mode === "navigate" ? "./index.html" : url.pathname;
      try {
        const fresh = await fetch(req, { cache: "no-cache" });
        if (fresh && fresh.ok) cache.put(req.mode === "navigate" ? "./index.html" : req, fresh.clone());
        return fresh;
      } catch (e) {
        return (await cache.match(req.mode === "navigate" ? "./index.html" : req, { ignoreSearch: true })) ||
          (await caches.match(key, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  /* libraries, fonts, converters: use the saved copy at once, refresh it in the background */
  if (!/(^|\.)cdnjs\.cloudflare\.com$|(^|\.)cdn\.jsdelivr\.net$|(^|\.)fonts\.googleapis\.com$|(^|\.)fonts\.gstatic\.com$/.test(url.hostname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    return res || Response.error();
  })());
});
