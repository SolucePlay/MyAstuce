const CACHE_NAME = 'astuce-3d-v1';
// Liste des fichiers à garder en mémoire sur le téléphone
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './data.js',
  './app.js'
];

// Installation de l'application
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Interception des requêtes (permet de charger très vite même si on capte mal)
self.addEventListener('fetch', event => {
  // 🚨 RÈGLE D'OR : On n'intercepte JAMAIS les requêtes externes (API, Proxy, MapTiler)
  if (!event.request.url.startsWith(self.location.origin)) {
    return; // Laisse le navigateur faire sa requête normalement
  }

  // Pour les fichiers locaux (HTML, CSS, JS, etc.), on applique le cache
  event.respondWith(
    caches.match(event.request).then(response => {
      // Retourne la version en cache, ou fait la vraie requête réseau si non trouvé
      return response || fetch(event.request);
    }).catch(() => {
      // Sécurité absolue pour éviter l'erreur "undefined"
      return new Response('Fichier introuvable', { status: 404 });
    })
  );
});
