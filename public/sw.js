/* public/sw.js */
const VERSION = "magang-app-v1.0.16";
const STATIC_CACHE  = VERSION + "-static";
const DYNAMIC_CACHE = VERSION + "-dynamic";

const APP_SHELL = [
  "/",
  "/user/dashboard",
  "/user/upload_foto",
  "/auth/login",
  "/offline",
  "/favicon.ico",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

/* ===== IndexedDB Queue (upload offline) ===== */
const QUEUE_DB = "photo-upload-queue-db";
const QUEUE_STORE = "requests";
const UPLOAD_PATH = "/api/job-photos/upload";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
async function queueAdd(rec) {
  const db = await idbOpen();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(rec);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function queueAll() {
  const db = await idbOpen();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
  db.close();
  return items;
}
async function queueDel(id) {
  const db = await idbOpen();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function notifyClients(msg) {
  const arr = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of arr) { try { c.postMessage(msg); } catch(_) {} }
}
async function processQueue() {
  const items = await queueAll();
  const okIds = [];
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method || "POST",
        headers: item.headers || {},
        body: item.body || null,
      });
      if (res && res.ok) {
        await queueDel(item.id);
        okIds.push(item.id);
        await notifyClients({ type: "upload-synced", queueId: item.id });
      }
    } catch (_) {}
  }
  if (okIds.length) await notifyClients({ type: "sync-complete", queueIds: okIds });
}

/* ===== Utils cache ===== */
async function precache(cache, urls) {
  await Promise.all(urls.map(async (u) => {
    try { await cache.add(new Request(u, { cache: "reload" })); } catch(_) {}
  }));
}
async function putDual(cache, req, res) {
  // res di sini SUDAH clone dari luar
  try { await cache.put(req, res.clone()); } catch(_) {}
  try {
    const url = new URL(req.url);
    const pathReq = new Request(url.pathname, { headers: req.headers, mode: "same-origin" });
    await cache.put(pathReq, res.clone());
  } catch(_) {}
}
async function matchHtml(urlOrReq) {
  let hit = await caches.match(urlOrReq, { ignoreSearch: true });
  if (hit) return hit;
  const url = typeof urlOrReq === "string" ? new URL(urlOrReq, self.location.origin) : new URL(urlOrReq.url);
  const candidates = [
    url.href,
    url.pathname + url.hash,
    url.pathname,
    url.pathname.replace(/\/$/, ""),
    url.pathname.endsWith("/") ? url.pathname : url.pathname + "/",
  ];
  for (const c of candidates) {
    hit = await caches.match(c, { ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

/* ===== Install / Activate ===== */
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await precache(cache, APP_SHELL);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) =>
        (k.startsWith("magang-app-") && k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          ? caches.delete(k)
          : Promise.resolve()
      ))
    )
  );
  self.clients.claim();
});

/* ===== Background Sync & Messages ===== */
self.addEventListener("sync", (e) => {
  if (e.tag === "photo-upload-sync") e.waitUntil(processQueue());
});
self.addEventListener("message", (e) => {
  if (e.data?.type === "force-sync") e.waitUntil(processQueue());
});

/* ===== Fetch ===== */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 0) Intercept upload: online-first; gagal → antre
  if (req.method === "POST" && url.pathname === UPLOAD_PATH) {
    e.respondWith((async () => {
      try {
        const onlineRes = await fetch(req.clone());
        return onlineRes;
      } catch {
        const body = await req.clone().arrayBuffer();
        const headers = {};
        req.headers.forEach((v, k) => (headers[k] = v));
        const id = Date.now() + "-" + Math.random().toString(36).slice(2);
        await queueAdd({ id, url: req.url, method: "POST", headers, body, createdAt: Date.now() });
        try { await self.registration.sync.register("photo-upload-sync"); } catch(_) {}
        return new Response(JSON.stringify({ status: "queued", queueId: id }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    })());
    return;
  }

  if (req.method !== "GET") return;

  const isSameOrigin = url.origin === self.location.origin;
  const accept = req.headers.get("accept") || "";
  const isHTML  = req.mode === "navigate" || accept.includes("text/html");

  // 1) HTML → network-first; cache pakai waitUntil + clone AWAL
  if (isHTML) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const resForCache = res.clone(); // ⬅️ clone sebelum dikonsumsi page
        e.waitUntil(
          caches.open(DYNAMIC_CACHE).then((c) => putDual(c, req, resForCache))
        );
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

  // 2) Static (termasuk /_next/*) → SWR
  const isStatic =
    isSameOrigin &&
    (url.pathname.startsWith("/_next/") ||
     /\.(?:js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url.pathname));

  if (isStatic) {
    e.respondWith((async () => {
      const cache = await caches.open(DYNAMIC_CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        const copy = res.clone();                  // ⬅️ clone lebih awal
        e.waitUntil(cache.put(req, copy));         // ⬅️ tulis cache via waitUntil
        return res;
      }).catch(() => null);
      return cached || (await network) || (await matchHtml("/offline"));
    })());
    return;
  }

  // 3) API GET → network-first + fallback cache
  if (url.pathname.startsWith("/api/")) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const copy = res.clone();
        e.waitUntil(caches.open(DYNAMIC_CACHE).then((c) => c.put(req, copy)));
        return res;
      } catch {
        return (
          (await caches.match(req, { ignoreSearch: true })) ||
          new Response(JSON.stringify({ offline: true }), {
            headers: { "Content-Type": "application/json" },
          })
        );
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
      const copy = res.clone();
      e.waitUntil(caches.open(DYNAMIC_CACHE).then((c) => c.put(req, copy)));
      return res;
    } catch {
      return (
        (await matchHtml(req)) ||
        (await caches.match("/offline", { ignoreSearch: true })) ||
        new Response("", { status: 504 })
      );
    }
  })());
});
