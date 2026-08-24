const CACHE_NAME = 'ouchi-rhythm-v22';

// SW の scope 基準の絶対 URL を生成するヘルパー
const BASE = self.registration.scope; // 例: https://okome.pages.dev/

// 必須アセット（1つでも取得失敗すると install が失敗するため、
// デプロイに含まれないファイルは入れない）
const ASSETS_REQUIRED = [
  BASE,
  BASE + 'index.html',
  BASE + 'app.js',
  BASE + 'style.css',
  BASE + 'manifest.json',
  BASE + 'auth.js',
  BASE + 'db-cloud.js',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
];

// 取得失敗してもキャッシュだけ試みる任意アセット
const ASSETS_OPTIONAL = [
  BASE + 'firebase-config.js',
  BASE + 'kakusann.webp',
  BASE + 'kakusann.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // 必須アセットは addAll（失敗時は install ごと失敗）
      await cache.addAll(ASSETS_REQUIRED);
      // 任意アセットは個別に fetch し、失敗は無視
      await Promise.allSettled(
        ASSETS_OPTIONAL.map(url =>
          fetch(url).then(res => {
            if (res.ok) cache.put(url, res);
          })
        )
      );
    })
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

// index.html のキャッシュエントリを取得する共通関数
function getCachedIndex() {
  return caches.open(CACHE_NAME).then(cache => cache.match(BASE + 'index.html'));
}

self.addEventListener('fetch', e => {
  // 外部オリジン（Firebase / Google 認証など）はSWを素通りさせる
  if (!e.request.url.startsWith(BASE)) return;

  // navigate リクエスト（ページ遷移・ホーム画面起動・リロード）
  // → Network First: まずネットワークを試み、失敗したらキャッシュを返す
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // 正常レスポンスはキャッシュを更新してから返す
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(BASE + 'index.html', clone));
          }
          return res;
        })
        .catch(() => getCachedIndex())
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
          return getCachedIndex();
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
