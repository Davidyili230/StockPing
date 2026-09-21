self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'StockPing alert', {
    body: data.body || 'A watched iPhone may be available.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'stockping-restock',
    renotify: true,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    let url;
    try { url = new URL(target, self.location.origin); } catch { url = new URL('/', self.location.origin); }
    if (url.origin !== self.location.origin) {
      return clients.openWindow(url.href);
    }
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      if ('focus' in client) {
        await client.navigate(url.href);
        return client.focus();
      }
    }
    return clients.openWindow(url.href);
  })());
});
