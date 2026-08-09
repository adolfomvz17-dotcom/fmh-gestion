/* Service Worker de FMH Asistencia — recibe los avisos del comedor aunque la app
   esté cerrada o la pantalla bloqueada. NO editar a mano salvo que se sepa qué se hace. */
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAhY-XKlfpRTIfNksWlI5m43-p6VdU68Fo",
  authDomain: "fmh-gestion-staging.firebaseapp.com",
  projectId: "fmh-gestion-staging",
  storageBucket: "fmh-gestion-staging.firebasestorage.app",
  messagingSenderId: "500631200882",
  appId: "1:500631200882:web:716c77547babe6e0a4ceeb"
});

const messaging = firebase.messaging();

// Mensaje que llega con la app en segundo plano / cerrada (enviamos solo "data")
messaging.onBackgroundMessage(function(payload){
  const d = (payload && payload.data) || {};
  const title = d.title || '🔔 ¡Bajar al comedor!';
  const body  = d.body  || 'La coordinación te está llamando.';
  self.registration.showNotification(title, {
    body: body,
    icon: 'icon.png',
    badge: 'icon.png',
    tag: 'comedor-fmh',
    renotify: true,
    requireInteraction: true,
    vibrate: [400,150,400,150,400,150,600],
    data: { url: './asistencia.html' }
  });
});

// Al tocar la notificación, abre/enfoca la app
self.addEventListener('notificationclick', function(event){
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(cl){
      for (const c of cl){ if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow('./asistencia.html');
    })
  );
});
