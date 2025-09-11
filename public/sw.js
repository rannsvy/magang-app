// sw.js
const CACHE_NAME = "technician-report-v2";
const STATIC_CACHE = "static-v2";
const DYNAMIC_CACHE = "dynamic-v2";

const urlsToCache = [
  "/",
  "/auth/login",
  "/user/dashboard",
  "/admin/dashboard",
  "/offline",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("[SW] Caching static assets");
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error("[SW] Failed to cache static assets:", error);
      })
  );
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log("[SW] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Helper aman untuk cache.put() — hanya untuk GET & status 200 */
async function safeCachePut(cacheName, request, response) {
  try {
    if (request.method !== "GET") return; // <- penting!
    if (!response || response.status !== 200) return;
    const cache = await caches.open(cacheName);
    // pakai clone supaya response tetap bisa dikembalikan ke browser
    await cache.put(request, response.clone());
  } catch (err) {
    // Jangan bikin app crash kalau ada yang tidak bisa dicache (opaque, dll)
    console.warn("[SW] cache.put skipped:", err);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // === PENTING: Jangan cache selain GET ===
  if (request.method !== "GET") {
    // Untuk POST/PUT/PATCH/DELETE, langsung network-only
    event.respondWith(fetch(request));
    return;
  }

  // === API GET: network-first (fallback ke cache) ===
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          await safeCachePut(DYNAMIC_CACHE, request, networkResponse);
          return networkResponse.clone();
        } catch (err) {
          const cached = await caches.match(request);
          if (cached) return cached;
          // kalau tidak ada cache, propagasikan error agar terlihat di devtools
          throw err;
        }
      })()
    );
    return;
  }

  // === Navigations: network-first (fallback ke offline) ===
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          await safeCachePut(DYNAMIC_CACHE, request, networkResponse);
          return networkResponse.clone();
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match("/offline");
        }
      })()
    );
    return;
  }

  // === Asset lain (GET): cache-first (fallback ke network, lalu cache) ===
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const networkResponse = await fetch(request);
        await safeCachePut(DYNAMIC_CACHE, request, networkResponse);
        return networkResponse.clone();
      } catch (err) {
        // kalau asset dokumen gagal dan ada offline page
        if (request.destination === "document") {
          const offline = await caches.match("/offline");
          if (offline) return offline;
        }
        throw err;
      }
    })()
  );
});

// (Opsional) Background Sync — proses antrean di sini bila kamu pakai indexedDB/queue sendiri.
// Jangan register sync di dalam handler ini (anti-pattern).
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    console.log("[SW] Background sync triggered");
    // event.waitUntil(processQueuedRequests());
  }
});

self.addEventListener("push", (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.primaryKey,
      },
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});
