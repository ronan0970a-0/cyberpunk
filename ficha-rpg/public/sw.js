// Service worker: mostra notificações push mesmo com o app fechado
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'Ficha RPG', corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (abertas.some(c => c.visibilityState === 'visible')) return; // app em uso: o selo do celular já avisa
    await self.registration.showNotification(d.titulo || 'Ficha RPG', {
      body: d.corpo || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag, data: { url: d.url || '/' }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const todas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of todas) if ('focus' in c) return c.focus();
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || '/');
  })());
});
