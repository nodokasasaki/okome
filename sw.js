const CACHE_NAME = 'ouchi-rhythm-v17';
const ASSETS = [
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './firebase-config.js',
  './auth.js',
  './db-cloud.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // 外部オリジン（Firebase / Google 認証など）はSWを素通りさせる
  if (!e.request.url.startsWith(self.location.origin)) return;
  // リダイレクトを含むレスポンスはキャッシュしない（"response has redirections" 対策）
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // opaqueredirect や status=0 はキャッシュに入れない
        if (!res || res.type === 'opaqueredirect' || res.redirected) return res;
        return res;
      });
    })
  );
});

// プッシュ通知受信（将来のWeb Push対応用）
self.addEventListener('push', e => {
  const data = e.data?.json?.() || {};
  const title = data.title || 'おうちリズム';
  const body  = data.body  || 'パートナーから通知が届きました';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './kakusann.png',
      badge: './kakusann.png',
      tag: 'partner-notify',
      renotify: true,
    })
  );
});

// 通知クリックでアプリを開く
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(self.location.origin + self.location.pathname.replace('sw.js', ''));
    })
  );
});
