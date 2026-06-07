self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  self.registration.showNotification(data.title || 'My Planner', {
    body: data.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  clients.openWindow('/');
});
