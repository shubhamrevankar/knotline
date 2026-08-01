/* global caches, self */

const SHELL = "knotline-shell-v1",
  SAFE = ["/", "/help", "/status", "/accessibility", "/legal/privacy", "/legal/terms"];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SAFE))
      .then(() => self.skipWaiting())
  )
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
);
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/v1/") ||
    url.pathname.includes("approval") ||
    url.pathname.includes("credential") ||
    url.pathname.includes("guest")
  )
    return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && SAFE.includes(url.pathname))
          void caches.open(SHELL).then((cache) => cache.put(request, response.clone()));
        return response;
      })
      // A cache miss deliberately falls through to the offline shell.
      // eslint-disable-next-line promise/no-nesting
      .catch(() => caches.match(request).then((response) => response ?? caches.match("/")))
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  if (event.data?.type === "PURGE") event.waitUntil(caches.delete(SHELL));
});
