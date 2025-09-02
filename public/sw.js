/* public/sw.js */
const VERSION = "magang-app-v1.0.5";
const STATIC_CACHE = VERSION + "-static";
const DYNAMIC_CACHE = VERSION + "-dynamic";

const IS_DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

/* Tambahkan rute penting kamu di sini */
const APP_SHELL = [
  "/",
  "/user/dashboard",
  "/user/upload_foto",
  "/auth/login",      // tambahkan kalau ada middleware login
  "/offline",
  "/favicon.ico",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

/* Utils */
async function precache(cache, urls) {
  await Promise.all(
    urls.map(async (u) => {
      try { await cache.add(new Request(u, { cache: "reload" })); } catch (_) {}
    })
  );
}

async function putDual(cache, req, res) {
  try { await cache.put(req, res.clone()); } catch (_) {}
  try {
    const url = new URL(req.url);
    const pathReq = new Request(url.pathname, { headers: req.headers, mode: "same-origin" });
    await cache.put(pathReq, res.clone());
  } catch (_) {}
}

async function matchHtml(urlOrReq) {
  // cari dengan mengabaikan query string
  let hit = await caches.match(urlOrReq, { ignoreSearch: true });
  if (hit) return hit;
  const url = typeof urlOrReq === "string" ? new URL(urlOrReq, self.location.origin) : new URL(urlOrReq.url);
  const candidates = [url.href, url.pathname + url.hash, url.pathname, url.pathname.replace(/\/$/, ""), url.pathname.endsWith("/") ? url.pathname : url.pathname + "/"];
  for (const c of candidates) {
    hit = await caches.match(c, { ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

/* Install */
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await precache(cache, APP_SHELL);
  })());
  self.skipWaiting();
});

/* Activate */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k.startsWith("magang-app-") && k !== STATIC_CACHE && k !== DYNAMIC_CACHE ? caches.delete(k) : Promise.resolve())))
    )
  );
  self.clients.claim();
});

/* Fetch */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");

  // Dev: jangan intercept asset Next js
  if (IS_DEV && url.pathname.startsWith("/_next/")) return;

  // 1) HTML navigations → network-first, simpan dual-key; offline → cari cache (ignoreSearch)
  if (isHTML) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        caches.open(DYNAMIC_CACHE).then((c) => putDual(c, req, res.clone()));
        return res;
      } catch {
        return (
          (await matchHtml(req)) ||
          (await caches.match("/", { ignoreSearch: true })) ||
          (await caches.match("/offline", { ignoreSearch: true })) ||
          new Response("<h1>Offline</h1>", { headers: { "Content-Type": "text/html" } })
        );
      }
    })());
    return;
  }

  // 2) Static assets (PROD) → stale-while-revalidate
  const isStatic = isSameOrigin && (url.pathname.startsWith("/_next/") || /\.(?:js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname));
  if (isStatic && !IS_DEV) {
    e.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      const fetching = fetch(req).then((res) => { caches.open(DYNAMIC_CACHE).then((c) => c.put(req, res.clone())); return res; }).catch(() => null);
      return cached || (await fetching) || (await matchHtml("/offline"));
    })());
    return;
  }

  // 3) API GET → network-first + fallback cache
  if (url.pathname.startsWith("/api/")) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) caches.open(DYNAMIC_CACHE).then((c) => c.put(req, res.clone()));
        return res;
      } catch {
        return (await caches.match(req, { ignoreSearch: true })) || new Response(JSON.stringify({ offline: true }), { headers: { "Content-Type": "application/json" } });
      }
    })());
    return;
  }

  // 4) Default → cache-first + update
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      caches.open(DYNAMIC_CACHE).then((c) => c.put(req, res.clone()));
      return res;
    } catch {
      return (await matchHtml(req)) || (await caches.match("/offline", { ignoreSearch: true })) || new Response("", { status: 504 });
    }
  })());
});