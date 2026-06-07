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
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }, delay);
  return id;
}

export function cancelNotification(id) {
  if (id) clearTimeout(id);
}
