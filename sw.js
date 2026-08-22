const CACHE_NAME = 'ouchi-rhythm-v18';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './firebase-config.js',
  './auth.js',
  './db-cloud.js',
  './kakusann.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
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

  // navigate リクエスト（ページ遷移・ホーム画面起動）は常に index.html を返す
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(cached => {
        if (cached) return cached;
        return fetch(e.request).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // その他のリソース: Cache First → ネットワーク → キャッシュ保存
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // opaqueredirect / status=0 / リダイレクト はキャッシュに入れない
        if (!res || res.type === 'opaqueredirect' || res.redirected || res.status === 0) {
          return res;
        }
        // 同一オリジンの正常レスポンスはキャッシュに追加
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        return res;
      }).catch(() => {
        // ネットワーク失敗時: HTML ページへのリクエストなら index.html を返す
        if (e.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
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
