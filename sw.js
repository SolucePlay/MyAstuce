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
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});