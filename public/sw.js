const CACHE_NAME = "amy-engmate-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add("./")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request) || await cache.match("./");
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  if (!cached) return network;
  return Promise.race([
    network,
    new Promise((resolve) => setTimeout(() => resolve(cached), 1200))
  ]);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (url.pathname.includes("/assets/") || url.pathname.includes("/data/books/")) {
    event.respondWith(cacheFirst(request));
  }
});
