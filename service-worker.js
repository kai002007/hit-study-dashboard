// 学习作战台 Service Worker
// 策略：network-first，离线时回退到 cache

const CACHE_NAME = "study-dashboard-v28";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./js/config.js",
  "./js/storage.js",
  "./js/aggregation.js",
  "./js/main.js",
  "./js/ui/base.js",
  "./js/ui/daily-card.js",
  "./js/ui/version.js",
  "./js/ui/stage.js",
  "./js/ui/checkin.js",
  "./js/ui/charts.js",
  "./js/ui/weekly.js",
  "./js/ui/command.js",
  "./js/ui/today.js",
  "./js/ui/goals.js",
  "./js/ui/dashboard.js",
  "./js/ui/review.js",
  "./js/ui/global-stats.js",
  "./js/ui/settings.js",
  "./version.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn("[SW] 部分资源缓存失败", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // 只处理同源请求
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 成功：更新缓存，返回最新
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        // 失败：从缓存取
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // 导航请求回退到 index.html
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return new Response("离线且未缓存", { status: 503, statusText: "Offline" });
        });
      })
  );
});
