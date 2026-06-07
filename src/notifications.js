import { requestFCMToken } from './firebase';
import { supabase } from './supabase';

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

export async function setupFCM() {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await registerServiceWorker();
  const token = await requestFCMToken();
  if (token) {
    await supabase.from('fcm_tokens').upsert({ token, updated_at: new Date().toISOString() }, { onConflict: 'token' });
  }
}

export function scheduleNotification(title, body, fireAt) {
  const delay = fireAt - Date.now();
  if (delay <= 0) return null;
  return setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }, delay);
}

export function cancelNotification(id) {
  if (id) clearTimeout(id);
}
