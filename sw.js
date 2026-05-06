// ─── FIREBASE MESSAGING (required for FCM token registration) ───
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

importScripts('/sw-env.js');

firebase.initializeApp(FIREBASE_CONFIG);

const messaging = firebase.messaging();

// ─── BACKGROUND NOTIFICATIONS ───────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || payload.data?.title || 'New Story';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    image: payload.notification?.image || payload.data?.image || undefined,
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// ─── NOTIFICATION CLICK → opens the article URL ─────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  // FCM auto-displayed notifications store the link in fcmOptions
  const url = e.notification?.data?.url
           || e.notification?.data?.FCM_MSG?.fcmOptions?.link
           || '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ─── CACHE & INSTALL (PWA) ──────────────────────────────────
const CACHE_NAME = 'pahari-abirta-v6';
const ASSETS = ['/', '/style.css', '/script.js', '/favicon-192.png', '/sw-env.js', '/firebase-env.js', '/firebase-config.js'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
