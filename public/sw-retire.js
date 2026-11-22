// Chargé par le service worker de Lumen. Sur l'ancienne adresse, il se retire de lui-même
// pour que la page recharge et suive la redirection vers l'adresse principale.
(function () {
  var RETIRED = ['lumen-two-rust.vercel.app'];
  if (RETIRED.indexOf(self.location.hostname) === -1) return;
  self.addEventListener('install', function () {
    self.skipWaiting();
  });
  self.addEventListener('activate', function (event) {
    event.waitUntil(
      self.registration
        .unregister()
        .then(function () {
          return self.clients.matchAll({ type: 'window' });
        })
        .then(function (clients) {
          clients.forEach(function (c) {
            c.navigate(c.url);
          });
        }),
    );
  });
})();
