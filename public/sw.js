// Offline support. Pages: network first (so new deploys show up), falling back to the
// cached app shell. Hashed build assets: cache first. Fonts: cached after first load.
// /api is never cached: sync always talks to the server, and the app queues changes offline.
const VERSION = "run90-v1";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (req, res) => {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (sameOrigin && url.pathname.startsWith("/api/")) return;
  if (!sameOrigin && !isFont) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => put("/", res))
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }
  // Cache first for hashed assets and fonts; stale-while-revalidate for the rest.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => put(req, res)).catch(() => hit);
      if (hit && (url.pathname.startsWith("/assets/") || isFont)) return hit;
      return hit || net;
    }),
  );
});
