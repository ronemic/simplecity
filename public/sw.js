const CACHE_VERSION = "simplecity-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const HOMEPAGE_DATA_CACHE = `${CACHE_VERSION}-homepage-data`;
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

function isHomepageDataRequest(request, url) {
  return url.pathname.startsWith("/homepage-data/") && url.pathname.endsWith("/data.json");
}

function canCache(response) {
  return response && response.ok && response.type === "basic";
}

function cachePageInBackground(event, response) {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.put(event.request, response.clone()))
      .catch(() => undefined)
  );
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
  try {
    const preloadResponse = await event.preloadResponse;

    if (canCache(preloadResponse)) {
      cachePageInBackground(event, preloadResponse);
      return preloadResponse;
    }

    const networkResponse = await fetch(event.request);

    if (canCache(networkResponse)) {
      cachePageInBackground(event, networkResponse);
    }

    return networkResponse;
  } catch {
    const cache = await caches.open(PAGE_CACHE);
    const cachedResponse = await cache.match(event.request);
    return cachedResponse || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function staleWhileRevalidateHomepageData(event) {
  const cache = await caches.open(HOMEPAGE_DATA_CACHE);
  const cachedResponse = await cache.match(event.request);

  if (cachedResponse) {
    event.waitUntil(
      fetch(event.request)
        .then((response) =>
          canCache(response) ? cache.put(event.request, response) : undefined
        )
        .catch(() => undefined)
    );
    return cachedResponse;
  }

  const networkResponse = await fetch(event.request);

  if (canCache(networkResponse)) {
    event.waitUntil(cache.put(event.request, networkResponse.clone()).catch(() => undefined));
  }

  return networkResponse;
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
              .filter(
                (cacheName) =>
                  cacheName !== STATIC_CACHE &&
                  cacheName !== PAGE_CACHE &&
                  cacheName !== HOMEPAGE_DATA_CACHE
              )
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

  if (isHomepageDataRequest(request, url)) {
    event.respondWith(staleWhileRevalidateHomepageData(event));
    return;
  }

  if (isCacheableAssetRequest(request, url)) {
    event.respondWith(cacheFirst(request));
  }
});
