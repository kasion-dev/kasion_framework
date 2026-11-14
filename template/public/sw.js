// kasion framework service worker: shows push notifications when the app is closed and opens the right page on tap.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) {}
  // Always show something: browsers revoke push permission for silent pushes.
  e.waitUntil(self.registration.showNotification(d.title || 'แจ้งเตือนใหม่', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: d.icon || '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(url); } catch (x) {} } return; } }
    await self.clients.openWindow(url);
  })());
});
