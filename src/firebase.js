import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyBWM2DVgkxZxeIQvkvNB2hSgYm85vi_zPQ",
  authDomain: "my-productivity-app-ab66b.firebaseapp.com",
  projectId: "my-productivity-app-ab66b",
  storageBucket: "my-productivity-app-ab66b.firebasestorage.app",
  messagingSenderId: "1068703647703",
  appId: "1:1068703647703:web:b2583b66da31e3a6f3ed92"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export const VAPID_KEY = 'BMLOoYVyVekzvEJydYzXpXy5Ip5upR_9HzJVew7AL8zTbWr5k686tNlzrgE8M36cb2fdoRRHADnnllUAY5XnkTE';

export async function requestFCMToken() {
  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      console.log('FCM Token:', token);
      return token;
    }
  } catch (err) {
    console.error('FCM token error:', err);
  }
  return null;
}

export { messaging, onMessage };
