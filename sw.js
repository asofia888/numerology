/* ============================================================
   数秘術鑑定 Service Worker — オフライン対応
   ・ページ(HTML)はネットワーク優先:常に最新を表示し、圏外時のみキャッシュ
   ・画像・フォント等はキャッシュ優先+裏で更新(stale-while-revalidate)
   ※キャッシュ構成を変えたときは CACHE のバージョン番号を上げてください
   ============================================================ */
const CACHE = "numerology-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./privacy.html",
  "./disclaimer.html",
  "./site.webmanifest",
  "./images/logo.png",
  "./images/favicon-32.png",
  "./images/favicon-192.png",
  "./images/apple-touch-icon.png",
  "./images/icon-512.png",
  "./images/icon-512-maskable.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;

  /* ページ遷移(HTML)はネットワーク優先 */
  if(req.mode === "navigate"){
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  /* その他(画像・フォント・マニフェスト等)はキャッシュ優先+裏で更新 */
  e.respondWith(
    caches.match(req).then(cached => {
      const refresh = fetch(req)
        .then(res => {
          if(res && (res.ok || res.type === "opaque")){
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
