importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBWM2DVgkxZxeIQvkvNB2hSgYm85vi_zPQ",
  authDomain: "my-productivity-app-ab66b.firebaseapp.com",
  projectId: "my-productivity-app-ab66b",
  storageBucket: "my-productivity-app-ab66b.firebasestorage.app",
  messagingSenderId: "1068703647703",
  appId: "1:1068703647703:web:b2583b66da31e3a6f3ed92"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(event => {
  self.registration.showNotification(event.notification.title, {
    body: event.notification.body,
    icon: '/favicon.ico',
  });
});
