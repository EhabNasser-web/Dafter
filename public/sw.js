// public/sw.js – Service Worker لتطبيق دفتر PWA
const CACHE_NAME = 'daftar-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/themes/notebook.css',
  '/brand/icon-192.png',
];

// تثبيت: تخزين الملفات الأساسية
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// تفعيل: حذف الكاشات القديمة
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// جلب: استراتيجية Network-first للـ API، Cache-first للباقي
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // API calls: لا تُخزَّن
  if (event.request.url.includes('/api/') || event.request.url.includes('/admin/')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && response.status < 400) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// ─── استقبال الإشعارات (Web Push) ─────────────────────────────────────────────
self.addEventListener('push', event => {
  let payload = {
    title: 'دفتر',
    body: 'رسالة جديدة من دفتر',
    icon: '/brand/icon-192.png',
    badge: '/brand/icon-192.png',
    data: { url: '/#chat' },
  };

  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch (_e) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/brand/icon-192.png',
    badge: payload.badge || '/brand/icon-192.png',
    vibrate: [100, 50, 100],
    data: payload.data || { url: payload.url || '/#chat' },
    dir: 'rtl',
    lang: 'ar',
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// ─── النقر على الإشعار: تركيز التطبيق والانتقال ───────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/#chat';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ('focus' in client && client.url.includes(self.registration.scope)) {
          client.focus();
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

