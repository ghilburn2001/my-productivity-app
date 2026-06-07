export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch (err) {
    console.error('SW registration failed:', err);
    return null;
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export function scheduleNotification(title, body, fireAt) {
  const now = Date.now();
  const delay = fireAt - now;
  if (delay <= 0) return null;
  const id = setTimeout(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, { body, icon: '/favicon.ico' });
      });
    } else if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }, delay);
  return id;
}

export function cancelNotification(id) {
  if (id) clearTimeout(id);
}
