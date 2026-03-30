# 🚇 Rouen Pulse 3D (Astuce Live)

> **Un calculateur d'itinéraire multimodal temps réel et 3D, propulsé par un algorithme de routage 100% "fait maison" basé sur l'Open Data de la Métropole de Rouen.**

## 📖 À propos
**Rouen Pulse 3D** n'est pas qu'une simple interface cartographique. C'est un véritable moteur de calcul d'itinéraire (Routing Engine) exécuté directement côté client. Au lieu de s'appuyer sur des API payantes fermées (comme Google Maps ou Transit API), ce projet ingère les données brutes du Réseau Astuce (GTFS, GTFS-RT, GeoJSON) pour calculer mathématiquement le meilleur trajet combinant marche à pied, métro et bus.

## ✨ Fonctionnalités Principales
* ⏱️ **Moteur de Temps Réel (Live) :** Connexion aux flux GTFS-RT pour afficher les retards et les temps d'attente à la minute près.
* 📅 **Fallback Statique Intelligent :** Si le GPS d'un véhicule est désactivé (ou en horaires de nuit), l'algorithme bascule automatiquement sur une base de données statique issue des fiches horaires officielles.
* 🗺️ **Rendu Cartographique 3D :** Affichage fluide avec suivi GPS exact des rails et routes de la métropole.
* 🔀 **Gestion Complexe des Correspondances :** Calcul des distances de transfert à pied (formule de Haversine), pénalités de temps d'accès, et synchronisation des horaires entre deux lignes.
* 🌱 **Indicateurs Premium :** Calcul automatique de l'empreinte carbone (CO₂) économisée face à la voiture et des calories (kcal) brûlées pendant la marche.

## 🧠 Sous le capot (Technologie & Algorithmes)
Ce projet est conçu pour démontrer des compétences avancées en ingénierie logicielle et manipulation de données géospatiales :
- **Algorithme de Routing :** Analyse combinatoire des arrêts de départ et d'arrivée, calcul des segments de marche optimaux (~55m/min) et des vitesses commerciales (~18km/h).
- **Tracés Haute Précision :** Utilisation de fichiers `lignes.geojson` contenant les relevés GPS réels pour dessiner des trajectoires qui épousent parfaitement la courbure de la voirie.
- **JavaScript Vanilla / Architecture Client :** Hautes performances atteintes sans surcharger de frameworks lourds, avec une manipulation optimisée du DOM pour générer les feuilles de route "Premium".

## 🚀 Installation et Lancement

1. Clonez ce dépôt :
```bash
git clone https://github.com/SolucePlay/MyAstuce.git
```
2. Ouvrez le dossier dans votre éditeur (ex: VS Code).
3. Lancez un serveur local (ex: via l'extension *Live Server*).
4. Ouvrez `index.html` dans votre navigateur.

## 📸 Captures d'écran
*(Ajoutez ici vos images en remplaçant ce texte)*
## 🎯 Pourquoi ce projet ?
J'ai construit ce projet pour relever un défi d'ingénierie : comprendre et recréer la logique complexe derrière les grandes applications de transport. Gérer les aléas du direct, les coordonnées GPS, et l'expérience utilisateur m'a permis de consolider mes compétences en algorithmie et en développement Front-End avancé.

---
*Fait avec ❤️ pour la Métropole de Rouen.*
