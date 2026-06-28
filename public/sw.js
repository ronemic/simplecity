const CACHE_VERSION = "simplecity-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const OFFLINE_URL = "/offline";

const STATIC_ASSETS = [
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  OFFLINE_URL
];

function isPrivateOrApiRequest(url) {
  return url.pathname.startsWith("/admin") || url.pathname.startsWith("/api");
}

function isCacheableAssetRequest(request, url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    request.destination === "font" ||
    request.destination === "image" ||
    request.destination === "script" ||
    request.destination === "style"
  );
}

function canCache(response) {
  return response && response.ok && response.type === "basic";
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);

  if (canCache(networkResponse)) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

async function networkFirstPage(event) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const preloadResponse = await event.preloadResponse;

    if (canCache(preloadResponse)) {
      await cache.put(event.request, preloadResponse.clone());
      return preloadResponse;
    }

    const networkResponse = await fetch(event.request);

    if (canCache(networkResponse)) {
      await cache.put(event.request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    const cachedResponse = await cache.match(event.request);
    return cachedResponse || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter((cacheName) => cacheName.startsWith("simplecity-"))
              .filter((cacheName) => cacheName !== STATIC_CACHE && cacheName !== PAGE_CACHE)
              .map((cacheName) => caches.delete(cacheName))
          )
        ),
      self.registration.navigationPreload ? self.registration.navigationPreload.enable() : Promise.resolve()
    ]).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (isPrivateOrApiRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
    return;
  }

  if (isCacheableAssetRequest(request, url)) {
    event.respondWith(cacheFirst(request));
  }
});
