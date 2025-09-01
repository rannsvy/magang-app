const CACHE_NAME = "technician-report-v2"
const STATIC_CACHE = "static-v2"
const DYNAMIC_CACHE = "dynamic-v2"

const urlsToCache = [
  "/",
  "/auth/login",
  "/user/dashboard",
  "/admin/dashboard",
  "/offline",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
]

self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...")
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("[SW] Caching static assets")
        return cache.addAll(urlsToCache)
      })
      .then(() => {
        console.log("[SW] Static assets cached successfully")
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error("[SW] Failed to cache static assets:", error)
      }),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Handle API requests with network-first strategy
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => {
          return caches.match(request)
        }),
    )
    return
  }

  // Handle navigation requests
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match("/offline")
          })
        }),
    )
    return
  }

  // Handle other requests with cache-first strategy
  event.respondWith(
    caches
      .match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
      })
      .catch(() => {
        if (request.destination === "document") {
          return caches.match("/offline")
        }
      }),
  )
})

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...")
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log("[SW] Deleting old cache:", cacheName)
              return caches.delete(cacheName)
            }
          }),
        )
      })
      .then(() => {
        console.log("[SW] Service worker activated")
        return self.clients.claim()
      }),
  )
})

self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    console.log("[SW] Background sync triggered")
    event.waitUntil(
      // Handle offline form submissions when back online
      self.registration.sync.register("background-sync"),
    )
  }
})

self.addEventListener("push", (event) => {
  if (event.data) {
    const data = event.data.json()
    const options = {
      body: data.body,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.primaryKey,
      },
    }
    event.waitUntil(self.registration.showNotification(data.title, options))
  }
})