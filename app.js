let marqueursItineraire = []; // Liste pour stocker les drapeaux de trajet
let donneesTempsReel = [];

const HORAIRES_STATIQUES = {
    "TCAR:90": { // Métro - Direction Georges Braque (Période Bleue Soir)
        "Boulingrin": ["21:56", "22:11", "22:26", "22:41", "22:56", "23:11", "23:26", "23:41", "23:56", "00:11"], // [cite: 334, 376]
        "frequence_soir": 15 // minutes [cite: 346]
    }
    // Tu pourras ajouter le F6 et les autres périodes ici
};

function chercherHoraireTheorique(routeId) {
    const maintenant = new Date();
    const heureActuelle = maintenant.getHours() + ":" + maintenant.getMinutes().toString().padStart(2, '0');

    const data = HORAIRES_STATIQUES[routeId];
    if (!data) return null;

    // On cherche l'horaire dans le PDF qui est juste après l'heure actuelle 
    const prochain = data.Boulingrin.find(h => h > heureActuelle);
    return prochain ? prochain : null;
}

// === INITIALISATION DE LA CARTE MAPLIBRE 3D ===
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=IVox3aAq7YDuFvXSXXu8',
    center: [1.0993, 49.4431],
    zoom: 13.5,
    pitch: 60,
    bearing: -20,
    antialias: true
});

map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true
}), 'bottom-right');

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

let lignesFiltrees = new Set();
let marqueursBus = {};
let modeItineraireActif = false;
let tripsItineraire = new Set(); // Mémoire pour stocker LE bus exact
let tracesLignes = {};
let reseauArrets = {};

document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('ouverte');
});
document.getElementById('close-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('ouverte');
});
// Écouteur pour effacer l'itinéraire
document.getElementById('btn-effacer-it').addEventListener('click', () => {
    nettoyerAncienTrajet();
    document.getElementById('resultats-it').innerHTML = '';
    document.getElementById('input-depart').value = '';
    document.getElementById('input-arrivee').value = '';

    document.getElementById('btn-effacer-it').style.display = 'none';
    document.getElementById('btn-demarrer-it').style.display = 'none';

    // NOUVEAUTÉ : On relâche le filtre de sécurité strict !
    modeItineraireActif = false;
    tripsItineraire.clear();

    // On relance l'affichage normal
    dessinerTraces();
    chargerPositionsBus();
});
// Écouteur pour DÉMARRER l'itinéraire
document.getElementById('btn-demarrer-it').addEventListener('click', () => {
    // 1. On fait descendre la belle notification
    const notif = document.getElementById('notification-validation');
    notif.style.top = '20px'; // Fait glisser la bulle dans l'écran

    // 2. On la fait disparaître toute seule après 5 secondes
    setTimeout(() => {
        notif.style.top = '-100px';
    }, 10000);

    // 3. EFFET GPS : On fait voler la caméra directement sur le point de départ en zoomant !
    if (marqueursItineraire.length > 0) {
        // On récupère les coordonnées du tout premier drapeau (le départ)
        const pointDeDepart = marqueursItineraire[0].getLngLat();

        // Animation spectaculaire vers le départ
        map.flyTo({
            center: pointDeDepart,
            zoom: 17.5, // Très proche du sol
            pitch: 65,  // Fortement incliné pour la 3D
            bearing: 0, // On oriente vers le Nord
            speed: 1.2, // Vitesse de vol
            curve: 1.5  // Effet de courbure du vol
        });
    }
});

// === GESTION DU PANNEAU INFO-TRAFIC (DROITE) ===
document.getElementById('menu-trafic-toggle').addEventListener('click', () => {
    document.getElementById('sidebar-right').classList.add('ouverte');
});

document.getElementById('close-sidebar-right').addEventListener('click', () => {
    document.getElementById('sidebar-right').classList.remove('ouverte');
});

// Le moteur de recherche instantané
document.getElementById('search-trafic').addEventListener('input', (e) => {
    const texteRecherche = e.target.value.toLowerCase().trim();
    const alertes = document.querySelectorAll('#liste-perturbations li');

    alertes.forEach(alerte => {
        // On vérifie si le texte de l'alerte contient ce qu'on a tapé
        if (alerte.innerText.toLowerCase().includes(texteRecherche)) {
            alerte.style.display = 'block'; // On affiche
        } else {
            alerte.style.display = 'none'; // On cache
        }
    });
});

function dessinerTraces() {
    let featuresLignes = [];
    let featuresArrets = [];
    let arretsVus = new Set(); // Pour éviter de dessiner 2 fois un arrêt si deux lignes le partagent

    lignesFiltrees.forEach(routeId => {
        const couleurLigne = infosLignes[routeId] ? infosLignes[routeId].couleur : '#333';

        // 1. On prépare le tracé du bus
        const branches = tracesLignes[routeId];
        if (branches && branches.length > 0) {
            branches.forEach(brancheCoordonnees => {
                const coordsInversees = brancheCoordonnees.map(pt => [pt[1], pt[0]]);
                featuresLignes.push({
                    type: 'Feature',
                    properties: { color: couleurLigne },
                    geometry: { type: 'LineString', coordinates: coordsInversees }
                });
            });
        }

        // 2. On prépare tous les arrêts de ce bus
        for (const [idArret, arret] of Object.entries(reseauArrets)) {
            // Si le bus passe par cet arrêt, on le prépare pour l'affichage
            if (arret.lignes[routeId] !== undefined && !arretsVus.has(idArret)) {
                arretsVus.add(idArret);
                featuresArrets.push({
                    type: 'Feature',
                    properties: { nom: arret.n, couleur: couleurLigne },
                    geometry: { type: 'Point', coordinates: [arret.lon, arret.lat] }
                });
            }
        }
    });

    // --- MISE À JOUR DE LA CARTE ---

    // A. Affichage des tracés (Le ruban de couleur)
    const dataLignes = { type: 'FeatureCollection', features: featuresLignes };
    if (map.getSource('traces')) {
        map.getSource('traces').setData(dataLignes);
    } else {
        map.addSource('traces', { type: 'geojson', data: dataLignes });
        map.addLayer({
            id: 'traces-layer',
            type: 'line',
            source: 'traces',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.8 }
        });
    }

    // B. Affichage des arrêts (Les ronds blancs + le texte)
    const dataArrets = { type: 'FeatureCollection', features: featuresArrets };
    if (map.getSource('arrets-source')) {
        map.getSource('arrets-source').setData(dataArrets);
    } else {
        map.addSource('arrets-source', { type: 'geojson', data: dataArrets });

        // Les pastilles blanches avec contour coloré
        map.addLayer({
            id: 'arrets-cercle',
            type: 'circle',
            source: 'arrets-source',
            paint: {
                'circle-radius': 5,
                'circle-color': '#ffffff', // Blanc à l'intérieur
                'circle-stroke-width': 3,
                'circle-stroke-color': ['get', 'couleur'] // Contour de la couleur du bus
            }
        });

        // Le texte du nom de l'arrêt
        map.addLayer({
            id: 'arrets-texte',
            type: 'symbol',
            source: 'arrets-source',
            minzoom: 14.5, // 🚨 Le texte n'apparaît que si on zoome pour ne pas polluer l'écran !
            layout: {
                'text-field': ['get', 'nom'],
                'text-anchor': 'left',
                'text-offset': [0.8, 0],
                'text-size': 12
            },
            paint: {
                'text-color': '#1e293b',
                'text-halo-color': '#ffffff', // Léger contour blanc pour que le texte soit lisible sur les bâtiments
                'text-halo-width': 2
            }
        });
    }
}

function chargerPositionsBus() {
    const tempsActuel = new Date().getTime();
    const urlPositions = 'https://corsproxy.io/?' + encodeURIComponent('https://gtfs.bus-tracker.fr/gtfs-rt/tcar/vehicle-positions.json?nocache=' + tempsActuel);
    const urlTemps = 'https://corsproxy.io/?' + encodeURIComponent('https://gtfs.bus-tracker.fr/gtfs-rt/tcar/trip-updates.json?nocache=' + tempsActuel);

    Promise.all([
        fetch(urlPositions).then(res => res.json()),
        fetch(urlTemps).then(res => res.json())
    ])
        .then(([dataPositions, dataTemps]) => {
            if (dataTemps && dataTemps.entity) {
                donneesTempsReel = dataTemps.entity;
            }

            const tripUpdates = new Map();
            if (dataTemps && dataTemps.entity) {
                dataTemps.entity.forEach(e => {
                    if (e.tripUpdate && e.tripUpdate.trip && e.tripUpdate.trip.tripId) {
                        tripUpdates.set(e.tripUpdate.trip.tripId, e.tripUpdate);
                    }
                });
            }

            const idBusActifs = new Set();
            if (dataPositions && dataPositions.entity) {
                dataPositions.entity.forEach(entite => {
                    if (entite.vehicle && entite.vehicle.position) {
                        const lat = entite.vehicle.position.latitude;
                        const lon = entite.vehicle.position.longitude;
                        const rawRouteId = entite.vehicle.trip ? entite.vehicle.trip.routeId : "Inconnue";

                        // 🚨 LE VIGILE EST ICI : On élimine les lignes inconnues ("?") immédiatement !
                        if (rawRouteId !== 'TCAR:90' && !infosLignes[rawRouteId]) {
                            return; // On stoppe tout pour ce bus, il n'ira pas sur la carte.
                        }

                        const idBus = entite.vehicle.vehicle ? entite.vehicle.vehicle.id : "Inconnu";
                        const tripId = entite.vehicle.trip ? entite.vehicle.trip.tripId : null;

                        // Filtre Itinéraire / Menu
                        if (modeItineraireActif) {
                            if (!tripsItineraire.has(tripId)) return;
                        } else if (lignesFiltrees.size > 0) {
                            if (!lignesFiltrees.has(rawRouteId)) return;
                        }

                        idBusActifs.add(idBus);

                        // 1. Infos de base (Ligne et Destination)
                        const destination = (entite.vehicle.vehicle && entite.vehicle.vehicle.label) ? entite.vehicle.vehicle.label : "Destination inconnue";
                        const infoLigne = infosLignes[rawRouteId] || { nom: rawRouteId.replace("TCAR:", ""), couleur: "#555" };

                        // 2. LE RETARD ET L'AVANCE (Le retour !)
                        let infoTemps = "<i>Pas d'info temps réel</i>";
                        if (tripId && tripUpdates.has(tripId)) {
                            const update = tripUpdates.get(tripId);
                            if (update.stopTimeUpdate && update.stopTimeUpdate.length > 0) {
                                const delay = update.stopTimeUpdate[0].departure?.delay || 0;
                                const retMin = Math.round(delay / 60);
                                if (retMin > 0) infoTemps = `<span style="color:red">En retard de ${retMin} min</span>`;
                                else if (retMin < 0) infoTemps = `<span style="color:green">En avance de ${Math.abs(retMin)} min</span>`;
                                else infoTemps = `<span style="color:green">À l'heure exacte</span>`;
                            }
                        }

                        // 3. L'AFFLUENCE ET LES PLACES (Le retour !)
                        let texteAffluence = "";
                        if (entite.vehicle.occupancyStatus) {
                            const dicoAffluence = {
                                "EMPTY": "Vide",
                                "MANY_SEATS_AVAILABLE": "Beaucoup de places",
                                "FEW_SEATS_AVAILABLE": "Peu de places",
                                "STANDING_ROOM_ONLY": "Places debout",
                                "CRUSHED_STANDING_ROOM_ONLY": "Très bondé",
                                "FULL": "Complet",
                                "NOT_ACCEPTING_PASSENGERS": "Ne prend plus de passagers"
                            };
                            texteAffluence = `<br>Affluence : <b>${dicoAffluence[entite.vehicle.occupancyStatus] || "Inconnue"}</b>`;
                        }

                        // 4. On rassemble toutes les infos dans la belle bulle
                        const textePopup = `<b>Ligne ${infoLigne.nom}</b><br>Direction : ${destination}<br>État : ${infoTemps}${texteAffluence}`;

                        // --- GESTION DU MARQUEUR ---
                        if (marqueursBus[idBus]) {
                            const busInfo = marqueursBus[idBus];
                            const oldLngLat = busInfo.marker.getLngLat();
                            busInfo.startLngLat = [oldLngLat.lng, oldLngLat.lat];
                            busInfo.targetLngLat = [lon, lat];
                            busInfo.startTime = performance.now();
                            busInfo.popup.setHTML(textePopup);
                        } else {
                            const el = document.createElement('div');

                            // LOGIQUE D'ICÔNE (Plus besoin du "?")
                            if (rawRouteId === 'TCAR:90') {
                                el.className = 'bus-icon';
                                el.innerHTML = '🚇';
                            } else {
                                const info = infosLignes[rawRouteId];
                                el.className = 'line-badge-icon';
                                el.style.backgroundColor = info.couleur;
                                el.innerHTML = info.nom;
                            }

                            const popup = new maplibregl.Popup({ offset: 25 }).setHTML(textePopup);
                            const marker = new maplibregl.Marker({ element: el })
                                .setLngLat([lon, lat])
                                .setPopup(popup)
                                .addTo(map);

                            marqueursBus[idBus] = {
                                marker: marker,
                                popup: popup,
                                startLngLat: [lon, lat],
                                targetLngLat: [lon, lat],
                                startTime: null
                            };
                        }
                    }
                });
            }

            // Nettoyage
            for (const id in marqueursBus) {
                if (!idBusActifs.has(id)) {
                    marqueursBus[id].marker.remove();
                    delete marqueursBus[id];
                }
            }
            document.getElementById('heure-maj').textContent = "Mise à jour : " + new Date().toLocaleTimeString();
        })
        .catch(erreur => console.error("Erreur positions :", erreur));
}

const DUREE_ANIMATION = 2000;
function animerBus(timestamp) {
    for (const id in marqueursBus) {
        const bus = marqueursBus[id];
        if (bus.startTime && bus.startLngLat && bus.targetLngLat) {
            const tempsEcoule = timestamp - bus.startTime;
            let progression = tempsEcoule / DUREE_ANIMATION;
            if (progression >= 1) {
                progression = 1;
                bus.marker.setLngLat(bus.targetLngLat);
                bus.startTime = null;
            } else {
                const currentLng = bus.startLngLat[0] + (bus.targetLngLat[0] - bus.startLngLat[0]) * progression;
                const currentLat = bus.startLngLat[1] + (bus.targetLngLat[1] - bus.startLngLat[1]) * progression;
                bus.marker.setLngLat([currentLng, currentLat]);
            }
        }
    }
    requestAnimationFrame(animerBus);
}
requestAnimationFrame(animerBus);

// === INFO-TRAFIC EN DIRECT ===
function chargerInfoTrafic() {
    const urlTrafic = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent('https://api.mrn.cityway.fr/disrupt/api/v1/fr/disruptions');

    fetch(urlTrafic)
        .then(res => res.json())
        .then(data => {
            const liste = document.getElementById('liste-perturbations');
            liste.innerHTML = '';

            let aDesPerturbations = false;
            let listeAlertes = Array.isArray(data) ? data : (data.data || data.disruptions || []);

            // S'il y a au moins une alerte dans les données, on va afficher la bannière !
            if (listeAlertes.length > 0) {
                listeAlertes.forEach(alerte => {

                    // ON FORCE L'AFFICHAGE DÈS QU'IL Y A UNE ALERTE
                    aDesPerturbations = true;

                    const li = document.createElement('li');
                    li.style.marginBottom = "10px";
                    li.style.paddingBottom = "10px";
                    li.style.borderBottom = "1px solid #fecaca";

                    // 1. On récupère le titre (très robuste)
                    let titre = "Information réseau";
                    if (alerte.messages && alerte.messages.length > 0 && alerte.messages[0].title) {
                        titre = alerte.messages[0].title;
                    } else if (alerte.title) {
                        titre = alerte.title;
                    }

                    let texteAlerte = `<b style="display:block; margin-bottom:4px;">${titre}</b>`;

                    // 2. On essaie d'ajouter les badges des lignes SI on les trouve
                    let htmlBadges = "";
                    let idsVus = new Set();

                    if (alerte.impactedObjects && alerte.impactedObjects.length > 0) {
                        alerte.impactedObjects.forEach(obj => {
                            // On cherche la ligne dans tous les recoins de l'API Cityway
                            const ligne = obj.impactedLine || (obj.impactedPtElement ? obj.impactedPtElement.line : null) || obj.impactedRoute;

                            if (ligne && ligne.id && !idsVus.has(ligne.id)) {
                                idsVus.add(ligne.id);
                                const idLigne = ligne.id.replace('Astuce:', 'TCAR:');

                                if (infosLignes && infosLignes[idLigne]) {
                                    htmlBadges += `<span style="background:${infosLignes[idLigne].couleur}; color:white; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:11px; display:inline-block;">${infosLignes[idLigne].nom}</span>`;
                                } else {
                                    htmlBadges += `<span style="background:#94a3b8; color:white; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:11px; display:inline-block;">${ligne.shortName || '?'}</span>`;
                                }
                            }
                        });
                    }

                    // Si on a trouvé des lignes, on les affiche sous le titre
                    if (htmlBadges !== "") {
                        texteAlerte += `<div style="display:flex; gap:5px; flex-wrap:wrap;">${htmlBadges}</div>`;
                    }

                    li.innerHTML = texteAlerte;
                    liste.appendChild(li);
                });
            }
        })
        .catch(erreur => console.error("❌ Erreur Info-trafic :", erreur));
}

// === CONFIGURATION DU CONVERTISSEUR ET TRADUCTEUR ===
// 🚨 DÉFINITION OFFICIELLE ET BLINDÉE POUR PROJ4JS
proj4.defs("EPSG:3949", "+proj=lcc +lat_1=48.25 +lat_2=49.75 +lat_0=49 +lon_0=3 +x_0=1700000 +y_0=8200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

const correspondanceCodes = {
    "M": "90", "METRO": "90", "MÉTRO": "90", "TRAM": "90",
    "T1": "91", "T2": "92", "T3": "93", "T4": "94", "T5": "95",
    "F1": "01", "F2": "02", "F3": "03", "F4": "04", "F5": "05", "F6": "06", "F7": "07", "F8": "08",
    "N": "98", "NOCTAMBUS": "98", "CALYPSO": "99"
};

// 🚨 LES COULEURS SUR-MESURE MYASTUCE
const couleursPersonnalisees = {
    "A": "rgb(205, 25, 34)",
    "B": "rgb(35, 67, 145)",
    "C": "rgb(0, 159, 97)",
    "D1": "rgb(152, 194, 29)",
    "D2": "rgb(117, 70, 45)",
    "F": "rgb(214, 5, 111)",
    "G": "rgb(211, 216, 0)",
    "I": "rgb(56, 180, 182)",
    "F9": "rgb(36, 139, 203)"
};

const nomsBannis = ["E", "H", "J", "L29", "EXTENSION"];

async function chargerDonneesOfficielles() {
    const fichiers = {
        regulieres: 'lignes.geojson', // <-- Vérifie tes noms de fichiers
        scolaires: 'scolaires.geojson',
        arrets: 'arrets.geojson'
    };

    try {
        const [resReg, resScol, resArrets] = await Promise.all([
            fetch(fichiers.regulieres),
            fetch(fichiers.scolaires),
            fetch(fichiers.arrets)
        ]);

        const geoReg = await resReg.json();
        const dataScol = await resScol.json();
        const geoArrets = await resArrets.json();

        tracesLignes = {};

        // 🚨 LE CONVERTISSEUR RÉPARÉ
        const convertirEnGps = (coord) => {
            const lonX = parseFloat(coord[0]);
            const latY = parseFloat(coord[1]);

            if (lonX > 1000) {
                // On utilise les définitions strictes de Proj4
                const pt = proj4("EPSG:3949", "EPSG:4326", [lonX, latY]);
                return [pt[1], pt[0]]; // Retourne [Lat, Lon]
            }
            return [latY, lonX]; // Déjà en GPS
        };

        const obtenirCodeTcar = (nomBrut) => {
            let nomNettoye = String(nomBrut).replace(/^L/i, '').toUpperCase();
            return "TCAR:" + (correspondanceCodes[nomNettoye] || nomNettoye);
        };

        const extraireTraces = (elements) => {
            const liste = elements.features || elements.results || elements;
            if (!Array.isArray(liste)) return;

            liste.forEach(f => {
                const props = f.properties || f;
                const nomLigneBrut = props.NUM_LIGNE || props.numerolign || props.nom_ligne || props.nomcommercial;
                const geom = f.geometry || f.geo_shape?.geometry || f.geo_shape;
                const couleurLigne = props.COLOR_LIGN || props.couleur || "#94a3b8";

                if (!nomLigneBrut || !geom) return;

                const lignesTrouvees = String(nomLigneBrut).match(/[A-Za-z0-9éè]+/g) || [];

                lignesTrouvees.forEach(ligneBrute => {
                    const nomMajuscule = ligneBrute.toUpperCase();

                    // On bloque les lettres bizarres
                    if (nomsBannis.includes(nomMajuscule)) return;

                    const tcarCode = obtenirCodeTcar(ligneBrute);

                    // 🚨 LA MAGIE OPÈRE ICI :
                    // On choisit ta couleur personnalisée en priorité. Si elle n'existe pas, on prend celle du fichier.
                    const couleurFinale = couleursPersonnalisees[nomMajuscule] || couleurLigne;

                    if (!infosLignes[tcarCode]) {
                        // On enregistre la ligne avec SA bonne couleur
                        infosLignes[tcarCode] = { nom: nomMajuscule, couleur: couleurFinale };
                    }

                    if (!tracesLignes[tcarCode]) tracesLignes[tcarCode] = [];

                    if (geom.type === 'LineString') {
                        tracesLignes[tcarCode].push(geom.coordinates.map(convertirEnGps));
                    } else if (geom.type === 'MultiLineString') {
                        geom.coordinates.forEach(seg => tracesLignes[tcarCode].push(seg.map(convertirEnGps)));
                    }
                });
            });
        };

        extraireTraces(geoReg);
        extraireTraces(dataScol);

        // 🚨 NOUVEAU : On recolle les morceaux de routes cassés !
        for (const code in tracesLignes) {
            let segments = tracesLignes[code];
            let fusionActif = true;
            while (fusionActif) {
                fusionActif = false;
                for (let i = 0; i < segments.length; i++) {
                    for (let j = i + 1; j < segments.length; j++) {
                        const s1 = segments[i]; const s2 = segments[j];
                        const dist = (p1, p2) => Math.abs(p1[0] - p2[0]) + Math.abs(p1[1] - p2[1]);
                        const SEUIL = 0.0005; // ~50m
                        if (dist(s1[s1.length - 1], s2[0]) < SEUIL) { segments[i] = s1.concat(s2.slice(1)); segments.splice(j, 1); fusionActif = true; break; }
                        else if (dist(s1[0], s2[s2.length - 1]) < SEUIL) { segments[i] = s2.concat(s1.slice(1)); segments.splice(j, 1); fusionActif = true; break; }
                        else if (dist(s1[s1.length - 1], s2[s2.length - 1]) < SEUIL) { segments[i] = s1.concat(s2.slice(0, -1).reverse()); segments.splice(j, 1); fusionActif = true; break; }
                        else if (dist(s1[0], s2[0]) < SEUIL) { segments[i] = s1.slice(1).reverse().concat(s2); segments.splice(j, 1); fusionActif = true; break; }
                    }
                    if (fusionActif) break;
                }
            }
        }

        // --- ARRÊTS ---
        reseauArrets = {};
        const elementsArrets = geoArrets.features || geoArrets.results || [];
        elementsArrets.forEach(f => {
            const p = f.properties || f;
            const g = f.geometry || f.geo_point_2d || p.geo_point_2d;
            if (!p || !g) return;

            const id = p.code || p.id || p.nom || p.nom_arret;
            let lon = g.coordinates ? parseFloat(g.coordinates[0]) : parseFloat(g.lon || g[0]);
            let lat = g.coordinates ? parseFloat(g.coordinates[1]) : parseFloat(g.lat || g[1]);

            if (lon > 1000) {
                const pt = proj4("EPSG:3949", "EPSG:4326", [lon, lat]);
                lon = pt[0]; lat = pt[1];
            }

            if (id && lat && lon) {
                reseauArrets[id] = { n: p.nom || p.nom_arret, lat: lat, lon: lon, lignes: {} };
            }
        });

        console.log(`✅ TOUT EST CHARGÉ ! ${Object.keys(tracesLignes).length} lignes en mémoire.`);

        // --- ASSOCIATION MATHÉMATIQUE : ARRÊTS <-> LIGNES (Version Branches) ---
        for (const [idArret, arret] of Object.entries(reseauArrets)) {
            for (const [codeTcar, branches] of Object.entries(tracesLignes)) {
                let brancheIndex = 0;
                for (const branche of branches) {
                    let estSurCetteBranche = false;
                    for (const pt of branche) {
                        // Filtre rapide pour scanner autour de l'arrêt
                        if (Math.abs(arret.lat - pt[0]) < 0.003 && Math.abs(arret.lon - pt[1]) < 0.003) {
                            const dist = calculerDistanceMeters(arret.lat, arret.lon, pt[0], pt[1]);
                            if (dist < 150) { // Tolérance de 150m pour les grands quais
                                estSurCetteBranche = true;
                                break;
                            }
                        }
                    }
                    if (estSurCetteBranche) {
                        // 🚨 MAGIE : On enregistre la ligne ET sa branche (ex: TCAR:90_branch_0)
                        arret.lignes[`${codeTcar}_branch_${brancheIndex}`] = 1;
                    }
                    brancheIndex++;
                }
            }
        }
        console.log("✅ Tous les arrêts sont magnétisés sur leurs branches !");

        genererMenuLignes();
        dessinerTraces();

    } catch (e) {
        console.error("❌ Erreur de lecture interne :", e);
    }
}

function genererMenuLignes() {
    const grid = document.getElementById('lignes-grid');
    grid.innerHTML = ''; // On vide le conteneur principal

    const categories = {
        1: { titre: "🚇 Métro, TEOR et Fast", div: document.createElement('div') },
        2: { titre: "🚌 Lignes régulières", div: document.createElement('div') },
        3: { titre: "🌙 Lignes de nuit", div: document.createElement('div') },
        4: { titre: "🎒 Lignes scolaires", div: document.createElement('div') },
        5: { titre: "⛴️ Navette Fluviale", div: document.createElement('div') }
    };

    for (let i = 1; i <= 5; i++) {
        const headerDiv = document.createElement('div');
        headerDiv.className = 'categorie-header';

        const titre = document.createElement('h4');
        titre.textContent = categories[i].titre;
        titre.style.margin = "0";

        const fleche = document.createElement('span');
        fleche.textContent = "▼";
        fleche.className = 'categorie-fleche';

        headerDiv.appendChild(titre);
        headerDiv.appendChild(fleche);
        categories[i].div.appendChild(headerDiv);

        const sousGrille = document.createElement('div');
        sousGrille.className = 'sous-grille-boutons';
        sousGrille.style.display = 'none'; // Fermé par défaut
        categories[i].sousGrille = sousGrille;
        categories[i].div.appendChild(sousGrille);

        headerDiv.onclick = () => {
            if (sousGrille.style.display === 'none') {
                sousGrille.style.display = 'flex';
                fleche.style.transform = 'rotate(180deg)';
            } else {
                sousGrille.style.display = 'none';
                fleche.style.transform = 'rotate(0deg)';
            }
        };

        grid.appendChild(categories[i].div);
    }

    // 🚨 LE TRI VIP
    const lignesTriees = Object.entries(infosLignes).sort((a, b) => {
        const nomA = a[1].nom.toUpperCase();
        const nomB = b[1].nom.toUpperCase();

        const getPriorite = (nom) => {
            if (nom === "M" || nom === "METRO" || nom === "MÉTRO") return 1;
            if (nom.startsWith("T")) return 2;
            // Les Fast (F1 à F9), mais attention à ne pas prendre la ligne Filo'r "F"
            if (nom.startsWith("F") && nom !== "F") return 3;
            return 4; // Les autres
        };

        const prioA = getPriorite(nomA);
        const prioB = getPriorite(nomB);

        if (prioA !== prioB) return prioA - prioB;

        return a[1].nom.localeCompare(b[1].nom, undefined, { numeric: true });
    });

    // 🚨 LE CLASSEMENT DANS LES CATÉGORIES
    for (const [codeTcar, infos] of lignesTriees) {
        const nom = infos.nom.toUpperCase();
        let idCat = 2; // Catégorie par défaut : Lignes régulières

        // RÈGLE 1 : Métro, TEOR, Fast (F1 à F9)
        if (nom === "M" || nom === "METRO" || nom === "MÉTRO" || nom.startsWith("T") || (nom.startsWith("F") && nom !== "F")) {
            idCat = 1;
        }
        // RÈGLE 2 : Lignes de Nuit
        else if (nom === "N" || nom === "NOCTAMBUS") {
            idCat = 3;
        }
        // RÈGLE 3 : Navette Fluviale
        else if (nom === "CALYPSO") {
            idCat = 5;
        }
        // RÈGLE 4 : Scolaires (100 et plus, SAUF 529 et 530)
        else {
            const num = parseInt(nom, 10);
            if (!isNaN(num) && num >= 100 && num !== 529 && num !== 530) {
                idCat = 4;
            }
            // Tout le reste (A, B, C, F, G, I, D1, D2, 529, 530...) tombe par défaut dans idCat = 2 (Régulières)
        }

        const btn = document.createElement('button');
        btn.className = 'ligne-btn';
        btn.textContent = infos.nom;
        btn.style.borderColor = infos.couleur;
        btn.style.color = infos.couleur;

        btn.onclick = () => {
            if (lignesFiltrees.has(codeTcar)) {
                lignesFiltrees.delete(codeTcar);
                btn.style.backgroundColor = "transparent";
                btn.style.color = infos.couleur;
            } else {
                lignesFiltrees.add(codeTcar);
                btn.style.backgroundColor = infos.couleur;
                btn.style.color = "white";
            }
            chargerPositionsBus();
            dessinerTraces();
        };

        categories[idCat].sousGrille.appendChild(btn);
    }
}

// === CONFIGURATION DU CONVERTISSEUR (CC49 vers GPS) ===
// On définit le système de la Métropole de Rouen (CC49)
const CC49 = "+proj=lcc +lat_1=48.25 +lat_2=49.75 +lat_0=49 +lon_0=3 +x_0=1700000 +y_0=8200000 +ellps=GRS80 +units=m +no_defs";
const WGS84 = "EPSG:4326"; // Le système GPS standard

map.on('load', async () => {
    // On appelle la bonne fonction (Celle qui lit n'importe quel fichier)
    await chargerDonneesOfficielles();

    chargerPositionsBus();
    chargerInfoTrafic();

    setInterval(chargerPositionsBus, 20000);
    setInterval(chargerInfoTrafic, 300000);
});

const MAPTILER_KEY = 'IVox3aAq7YDuFvXSXXu8';

function calculerDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function geocoderAdresse(adresse) {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(adresse)}.json?key=${MAPTILER_KEY}&bbox=0.95,49.35,1.20,49.55`;
    try {
        const reponse = await fetch(url);
        const data = await reponse.json();
        if (data.features && data.features.length > 0) {
            return data.features[0].geometry.coordinates;
        }
    } catch (e) { console.error(e); }
    return null;
}

function dessinerLigneItineraire(geojsonGeom) {
    if (map.getSource('itineraire')) {
        map.getSource('itineraire').setData(geojsonGeom);
    } else {
        map.addSource('itineraire', { type: 'geojson', data: geojsonGeom });
        map.addLayer({
            id: 'itineraire-layer',
            type: 'line',
            source: 'itineraire',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': '#0f172a',
                'line-width': 5,
                'line-dasharray': [2, 2]
            }
        });
    }
}

// Outil 1 : Fouiller les données GTFS-RT pour trouver l'heure d'arrivée
function chercherProchainBus(routeIdToFind, stopIdToFind) {
    let meilleurPassage = null;
    let tempsRestantMin = Infinity;
    const maintenant = Math.floor(Date.now() / 1000); // L'heure actuelle en secondes

    // LIGNES SUPPRIMÉES ICI (entite n'existe pas ici)

    donneesTempsReel.forEach(e => {
        if (e.tripUpdate && e.tripUpdate.trip && e.tripUpdate.trip.routeId === routeIdToFind) {
            if (e.tripUpdate.stopTimeUpdate) {
                e.tripUpdate.stopTimeUpdate.forEach(stu => {
                    // Si le bus passe par notre arrêt de départ
                    if (stu.stopId && (stu.stopId === stopIdToFind || stopIdToFind.includes(stu.stopId))) {
                        const tempsPassage = stu.departure ? stu.departure.time : (stu.arrival ? stu.arrival.time : null);

                        if (tempsPassage && tempsPassage > maintenant) {
                            const delaiMinutes = Math.round((tempsPassage - maintenant) / 60);
                            if (delaiMinutes < tempsRestantMin) {
                                tempsRestantMin = delaiMinutes;
                                meilleurPassage = {
                                    minutes: delaiMinutes,
                                    retard: stu.departure && stu.departure.delay ? Math.round(stu.departure.delay / 60) : 0, // <--- LA VIRGULE MANQUANTE ÉTAIT ICI !
                                    tripId: e.tripUpdate.trip.tripId
                                };
                            }
                        }
                    }
                });
            }
        }
    });
    return meilleurPassage;
}
function formaterInfoLive(infoLive, nomLigne) {
    if (infoLive && infoLive.minutes !== undefined) {
        let texteRetard = infoLive.retard > 0 ? `<span style='color:#ef4444'>(+${infoLive.retard} min)</span>` : `<span style='color:#10b981'>(À l'heure)</span>`;
        return `<div style='color: #ea580c; font-weight: bold; font-size: 12px; margin-top: 5px; background: #fff7ed; padding: 4px 8px; border-radius: 4px; border: 1px solid #fed7aa;'>📡 En direct : ~${infoLive.minutes} min ${texteRetard}</div>`;
    } else {
        // --- LE PLAN B (FICHE HORAIRE DE SECOURS) ---
        let prochainHoraire = null;
        const maintenant = new Date();
        const h = maintenant.getHours();
        const m = maintenant.getMinutes();

        // Horaires statiques basés sur la documentation officielle
        if (nomLigne.includes("Métro") || nomLigne.includes("M")) {
            if (h === 21 && m <= 50) prochainHoraire = "21h50";
            else if (h === 22 && m <= 21) prochainHoraire = "22h21";
            else if (h === 22 && m <= 50) prochainHoraire = "22h50";
            else if (h === 23 && m <= 20) prochainHoraire = "23h20";
            else prochainHoraire = "23h50";
        }
        else if (nomLigne.includes("F6")) {
            if (h === 22 && m <= 11) prochainHoraire = "22h11";
            else if ((h === 22 && m > 11) || (h === 23 && m <= 7)) prochainHoraire = "23h07";
        }

        if (prochainHoraire) {
            return `<div style='color: #475569; font-weight: bold; font-size: 12px; margin-top: 5px; background: #f8fafc; padding: 4px 8px; border-radius: 4px; border: 1px solid #cbd5e1;'>📅 Fiche horaire : Prochain à ${prochainHoraire}</div>`;
        }

        return "<div style='color: #94a3b8; font-size: 11px; margin-top: 5px;'><i>🌙 Fin de service</i></div>";
    }
}

// === MOTEUR DE CALCUL MULTI-ITINÉRAIRES (AVEC TEMPS RÉEL INTÉGRÉ) ===
async function lancerCalcul(mode) {
    nettoyerAncienTrajet();

    const txtDepart = document.getElementById('input-depart').value;
    const txtArrivee = document.getElementById('input-arrivee').value;

    if (!txtDepart || !txtArrivee) return alert("Veuillez indiquer un départ et une arrivée.");

    let coordsDep = (txtDepart === "📍 Ma position" && coordsMaPosition) ? coordsMaPosition : await geocoderAdresse(txtDepart);
    const coordsArr = await geocoderAdresse(txtArrivee);

    if (!coordsDep || !coordsArr) return alert("Impossible de trouver ces adresses sur la carte.");

    if (mode === 'transit') {
        const RAYON_RECHERCHE = 2500;
        let arretsDepart = [];
        let arretsArrivee = [];

        for (const [id, arret] of Object.entries(reseauArrets)) {
            if (!arret.lat || arret.lat === 0) continue;
            const distDep = calculerDistanceMeters(coordsDep[1], coordsDep[0], arret.lat, arret.lon);
            if (distDep <= RAYON_RECHERCHE) arretsDepart.push({ id, ...arret, distDep });

            const distArr = calculerDistanceMeters(coordsArr[1], coordsArr[0], arret.lat, arret.lon);
            if (distArr <= RAYON_RECHERCHE) arretsArrivee.push({ id, ...arret, distArr });
        }

        if (arretsDepart.length === 0 || arretsArrivee.length === 0) return alert("Aucun arrêt trouvé à proximité.");

        arretsDepart.sort((a, b) => a.distDep - b.distDep); arretsDepart = arretsDepart.slice(0, 15);
        arretsArrivee.sort((a, b) => a.distArr - b.distArr); arretsArrivee = arretsArrivee.slice(0, 15);

        const arretsParLigne = {};
        for (const [id, arret] of Object.entries(reseauArrets)) {
            if (!arret.lat || arret.lat === 0) continue;
            for (const [ligne, indexLigne] of Object.entries(arret.lignes)) {
                if (!arretsParLigne[ligne]) arretsParLigne[ligne] = [];
                arretsParLigne[ligne].push({ id, ...arret, idx: indexLigne });
            }
        }

        let trajetsPossibles = [];

        for (const dep of arretsDepart) {
            for (const arr of arretsArrivee) {
                if (dep.n === arr.n) continue;

                const lignesDep = Object.keys(dep.lignes);
                const lignesArr = Object.keys(arr.lignes);

                const lignesCommunes = lignesDep.filter(p => lignesArr.includes(p));

                // 🚨 LES NOUVELLES RÈGLES DE RÉALISME 🚨
                const VITESSE_MARCHE = 55;     // 55 m/min = Allure tranquille en ville
                const VITESSE_TRANSPORT = 300; // 300 m/min = ~18 km/h en moyenne commerciale
                const TEMPS_ACCES = 2;         // +2 min pour sortir du bâtiment / descendre sur le quai

                // --- A. TRAJET DIRECT ---
                if (lignesCommunes.length > 0) {
                    const ligneComplete = lignesCommunes[0];
                    const baseLigne = ligneComplete.split('_branch_')[0];

                    const distBus = calculerDistanceMeters(dep.lat, dep.lon, arr.lat, arr.lon);

                    // Nouveaux calculs humains
                    const tMarche1 = Math.max(1, Math.round(dep.distDep / VITESSE_MARCHE) + TEMPS_ACCES);
                    const tBus = Math.max(1, Math.round(distBus / VITESSE_TRANSPORT));
                    const tMarche2 = Math.max(1, Math.round(arr.distArr / VITESSE_MARCHE) + TEMPS_ACCES);

                    const infoLive = chercherProchainBus(baseLigne, dep.id);
                    let attente = 5;
                    if (infoLive) {
                        if (infoLive.minutes >= tMarche1) {
                            attente = infoLive.minutes - tMarche1;
                        } else {
                            attente = 10;
                        }
                    }

                    const tTotal = tMarche1 + attente + tBus + tMarche2;

                    trajetsPossibles.push({ type: 'direct', dep, arr, ligne: ligneComplete, tMarche1, attente, tBus, tMarche2, tTotal });
                }
                // --- B. CORRESPONDANCE ---
                else {
                    for (const l1 of lignesDep) {
                        const pivotsPossibles1 = arretsParLigne[l1] || [];
                        for (const l2 of lignesArr) {
                            const pivotsPossibles2 = arretsParLigne[l2] || [];

                            for (const p1 of pivotsPossibles1) {
                                for (const p2 of pivotsPossibles2) {
                                    if (p1.n === dep.n || p2.n === arr.n) continue;
                                    if (Math.abs(p1.lat - p2.lat) > 0.008 || Math.abs(p1.lon - p2.lon) > 0.008) continue;

                                    const memeStation = (p1.n === p2.n);
                                    const distTransfert = memeStation ? 0 : calculerDistanceMeters(p1.lat, p1.lon, p2.lat, p2.lon);

                                    if (distTransfert <= 400 || memeStation) {
                                        const baseLigne1 = l1.split('_branch_')[0];

                                        const distBus1 = calculerDistanceMeters(dep.lat, dep.lon, p1.lat, p1.lon);
                                        const distBus2 = calculerDistanceMeters(p2.lat, p2.lon, arr.lat, arr.lon);

                                        // Nouveaux calculs humains
                                        const tMarche1 = Math.max(1, Math.round(dep.distDep / VITESSE_MARCHE) + TEMPS_ACCES);

                                        const infoLive1 = chercherProchainBus(baseLigne1, dep.id);
                                        let attente1 = 5;
                                        if (infoLive1) {
                                            if (infoLive1.minutes >= tMarche1) attente1 = infoLive1.minutes - tMarche1;
                                            else attente1 = 10;
                                        }

                                        const tBus1 = Math.max(1, Math.round(distBus1 / VITESSE_TRANSPORT));

                                        const penaliteMarche = memeStation ? 0 : 10;

                                        // On ralentit aussi la marche pendant la correspondance (et on ajoute 2 min d'orientation)
                                        const tMarcheTransfert = Math.max(3, Math.round(distTransfert / VITESSE_MARCHE) + 2);
                                        const attenteCorresp = 6;

                                        const tCorresp = tMarcheTransfert + penaliteMarche + attenteCorresp;
                                        const tBus2 = Math.max(1, Math.round(distBus2 / VITESSE_TRANSPORT));

                                        const tMarche2 = Math.max(1, Math.round(arr.distArr / VITESSE_MARCHE) + TEMPS_ACCES);

                                        const tTotal = tMarche1 + attente1 + tBus1 + tCorresp + tBus2 + tMarche2;

                                        trajetsPossibles.push({
                                            type: 'correspondance', dep, arr, pivot: p1, pivot2: p2, ligne1: l1, ligne2: l2,
                                            tMarche1, attente1, tBus1, tCorresp: tMarcheTransfert + attenteCorresp,
                                            tBus2, tMarche2, tTotal: (tTotal - penaliteMarche)
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (trajetsPossibles.length === 0) return alert("Aucun itinéraire trouvé.");

        trajetsPossibles.sort((a, b) => a.tTotal - b.tTotal);

        let trajetsUniques = [];
        let signaturesVues = new Set();
        for (const t of trajetsPossibles) {
            const sig = t.type === 'direct' ? `${t.ligne.split('_branch_')[0]}_${t.dep.n}` : `${t.ligne1.split('_branch_')[0]}_${t.ligne2.split('_branch_')[0]}_${t.pivot.n}`;
            if (!signaturesVues.has(sig)) {
                signaturesVues.add(sig);
                trajetsUniques.push(t);
                if (trajetsUniques.length === 3) break;
            }
        }

        const conteneurResultat = document.getElementById('resultats-it');
        conteneurResultat.innerHTML = '<h4 style="margin: 15px 0 10px 0; color: #334155;">Options suggérées :</h4>';

        const parserLigne = (ligneBrute) => {
            const baseId = ligneBrute.split('_branch_')[0];
            const info = infosLignes[baseId] || { nom: baseId.replace('TCAR:', ''), couleur: '#333' };
            return { baseId, nom: info.nom, couleur: info.couleur };
        };

        const activerTrajetSurCarte = async (trajet, divElement) => {
            document.querySelectorAll('.carte-trajet-option').forEach(el => {
                el.style.border = '1px solid #cbd5e1';
                el.style.boxShadow = 'none';
            });
            divElement.style.border = '2px solid #3b82f6';
            divElement.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';

            marqueursItineraire.forEach(m => m.remove());
            marqueursItineraire = [];

            await dessinerItineraireTransit(trajet, coordsDep, coordsArr);

            ajouterDrapeau(coordsDep, '🏠', "Votre départ");
            const idLigneTrajet = trajet.type === 'direct' ? trajet.ligne.split('_branch_')[0] : trajet.ligne1.split('_branch_')[0];
            let iconeDrapeau = (idLigneTrajet === 'TCAR:90') ? '🚇' : `<div class="line-badge-icon" style="background-color:${infosLignes[idLigneTrajet]?.couleur || '#333'}; width:24px; height:24px; font-size:10px;">${infosLignes[idLigneTrajet]?.nom || '🚌'}</div>`;
            ajouterDrapeau([trajet.dep.lon, trajet.dep.lat], iconeDrapeau, `Monter à : ${trajet.dep.n}`);

            tripsItineraire.clear(); modeItineraireActif = true;

            if (trajet.type === 'direct') {
                const live = chercherProchainBus(trajet.ligne.split('_branch_')[0], trajet.dep.id);
                if (live && live.tripId) tripsItineraire.add(live.tripId);
            } else {
                const live1 = chercherProchainBus(trajet.ligne1.split('_branch_')[0], trajet.dep.id);
                if (live1 && live1.tripId) tripsItineraire.add(live1.tripId);
                const live2 = chercherProchainBus(trajet.ligne2.split('_branch_')[0], trajet.pivot2.id);
                if (live2 && live2.tripId) tripsItineraire.add(live2.tripId);
            }

            if (map.getSource('traces')) map.getSource('traces').setData({ type: 'FeatureCollection', features: [] });
            chargerPositionsBus();

            const limites = new maplibregl.LngLatBounds();
            limites.extend(coordsDep); limites.extend(coordsArr);
            map.fitBounds(limites, { padding: 60, pitch: 50 });
        };

        trajetsUniques.forEach((trajet, index) => {
            const divTrajet = document.createElement('div');
            divTrajet.className = 'carte-trajet-option';
            divTrajet.style.cssText = `background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin-bottom: 10px; cursor: pointer; transition: all 0.2s ease;`;

            // --- NOUVEAU : CALCULS DES STATISTIQUES PREMIUM ---
            // 1. Les calories (basées sur le temps de marche total)
            const tempsMarcheTotal = trajet.tMarche1 + trajet.tMarche2;
            const kcal = Math.round(tempsMarcheTotal * 4.5);

            // 2. Le CO2 (basé sur la distance estimée en transport)
            const tempsBusTotal = trajet.type === 'direct' ? trajet.tBus : (trajet.tBus1 + trajet.tBus2);
            const distTransportKm = (tempsBusTotal * 330) / 1000; // 330 mètres par minute en moyenne
            const co2 = Math.round(distTransportKm * 72); // 72g par km

            // 3. Le Footer HTML avec les badges
            const htmlFooterPremium = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 13px; color: #64748b;">
                    <div style="display: flex; gap: 15px;">
                        <span title="Bilan Carbone (Émissions estimées)" style="display:flex; align-items:center; gap:4px; color: #10b981; font-weight: bold;">
                            🌱 ${co2}g CO₂
                        </span>
                        <span title="Bilan Santé (Calories brûlées en marchant)" style="display:flex; align-items:center; gap:4px; color: #ea580c; font-weight: bold;">
                            🔥 ${kcal} kcal
                        </span>
                    </div>
                    <div style="font-weight: bold; color: #0f172a; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                        🎫 1,80 €
                    </div>
                </div>`;
            // --------------------------------------------------

            let htmlDetails = "";
            if (trajet.type === 'direct') {
                const l = parserLigne(trajet.ligne);
                const infoLive = chercherProchainBus(l.baseId, trajet.dep.id);
                htmlDetails = `<h4 style="margin: 0 0 10px 0; color:#0f172a;">⏱️ ~${trajet.tTotal} min</h4>
    <div style="display: flex; gap: 10px; margin-bottom: 8px; font-size:14px;">🚶 <span>Marche <b>${trajet.tMarche1} min</b> jusqu'à <b>${trajet.dep.n}</b></span></div>
    <div style="display: flex; gap: 10px; border-left: 3px solid ${l.couleur}; padding-left: 10px; font-size:14px;">
    <span style="background: ${l.couleur}; color: white; padding: 3px 8px; border-radius: 4px; height: max-content; font-weight:bold;">${l.nom}</span>
    <span>Attente + Trajet ~<b>${trajet.attente + trajet.tBus} min</b><br>Descendre à <b>${trajet.arr.n}</b><br>${formaterInfoLive(infoLive, l.nom)}</span>
    </div>
    <div style="display: flex; gap: 10px; margin-top: 8px; font-size:14px;">🚶 <span>Marche <b>${trajet.tMarche2} min</b> jusqu'à l'arrivée</span></div>
    ${htmlFooterPremium}`; // Injection du footer premium
            } else {
                const l1 = parserLigne(trajet.ligne1);
                const l2 = parserLigne(trajet.ligne2);
                const infoLive1 = chercherProchainBus(l1.baseId, trajet.dep.id);
                const infoLive2 = chercherProchainBus(l2.baseId, trajet.pivot2.id);
                const textCorresp = trajet.pivot.n === trajet.pivot2.n ? `🔄 Quai à quai + Attente (~${trajet.tCorresp} min)` : `🔄 Transfert vers ${trajet.pivot2.n} (~${trajet.tCorresp} min)`;

                htmlDetails = `<h4 style="margin: 0 0 10px 0; color:#0f172a;">⏱️ ~${trajet.tTotal} min <span style="font-size:12px; font-weight:normal; color:#64748b;">(1 Corresp.)</span></h4>
    <div style="display: flex; gap: 10px; margin-bottom: 8px; font-size:14px;">🚶 <span>Marche <b>${trajet.tMarche1} min</b> jusqu'à <b>${trajet.dep.n}</b></span></div>
    <div style="display: flex; gap: 10px; border-left: 3px solid ${l1.couleur}; padding-left: 10px; font-size:14px;">
        <span style="background: ${l1.couleur}; color: white; padding: 3px 8px; border-radius: 4px; height: max-content; font-weight:bold;">${l1.nom}</span>
        <span>Attente + Trajet ~<b>${trajet.attente1 + trajet.tBus1} min</b><br>Descendre à <b>${trajet.pivot.n}</b><br>${formaterInfoLive(infoLive1, l1.nom)}</span>
    </div>
    <div style="margin: 8px 0; padding-left: 15px; font-size:13px; color:#ea580c; font-weight:bold;">${textCorresp}</div>
    <div style="display: flex; gap: 10px; border-left: 3px solid ${l2.couleur}; padding-left: 10px; font-size:14px;">
        <span style="background: ${l2.couleur}; color: white; padding: 3px 8px; border-radius: 4px; height: max-content; font-weight:bold;">${l2.nom}</span>
        <span>Trajet ~<b>${trajet.tBus2} min</b><br>Descendre à <b>${trajet.arr.n}</b><br>${formaterInfoLive(infoLive2, l2.nom)}</span>
    </div>
    <div style="display: flex; gap: 10px; margin-top: 8px; font-size:14px;">🚶 <span>Marche <b>${trajet.tMarche2} min</b> jusqu'à l'arrivée</span></div>
    ${htmlFooterPremium}`; // Injection du footer premium
            }

            divTrajet.innerHTML = htmlDetails;

            divTrajet.addEventListener('click', () => activerTrajetSurCarte(trajet, divTrajet));
            conteneurResultat.appendChild(divTrajet);

            if (index === 0) {
                activerTrajetSurCarte(trajet, divTrajet);
                document.getElementById('btn-effacer-it').style.display = 'block';
                document.getElementById('btn-demarrer-it').style.display = 'block';
            }
        });

        return;
    }

    const profilOsrm = (mode === 'marche') ? 'foot' : 'driving';
    document.getElementById('btn-effacer-it').style.display = 'block';
    document.getElementById('btn-demarrer-it').style.display = 'block';
    const urlOSRM = `https://router.project-osrm.org/route/v1/${profilOsrm}/${coordsDep[0]},${coordsDep[1]};${coordsArr[0]},${coordsArr[1]}?geometries=geojson`;

    try {
        const res = await fetch(urlOSRM);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
            const tracéGeom = data.routes[0].geometry;
            dessinerLigneItineraire(tracéGeom);
            modeItineraireActif = true; tripsItineraire.clear();
            if (map.getSource('traces')) map.getSource('traces').setData({ type: 'FeatureCollection', features: [] });
            chargerPositionsBus();
            const limites = new maplibregl.LngLatBounds();
            tracéGeom.coordinates.forEach(coord => limites.extend(coord));
            map.fitBounds(limites, { padding: 50, pitch: 45 });
        } else alert("Aucun itinéraire trouvé.");
    } catch (e) { alert("Erreur lors du calcul."); }
}

document.getElementById('btn-marche').addEventListener('click', () => lancerCalcul('marche'));
document.getElementById('btn-voiture').addEventListener('click', () => lancerCalcul('voiture'));
document.getElementById('btn-transit').addEventListener('click', () => lancerCalcul('transit'));

let coordsMaPosition = null;
const btnMaPosition = document.getElementById('btn-ma-position');
const inputDepart = document.getElementById('input-depart');

// === GESTION DES FAVORIS (Mémoire Locale) ===
function configurerFavori(idBouton, cleStockage, nomAffichage) {
    const btn = document.getElementById(idBouton);
    const inputDepart = document.getElementById('input-depart');

    // 1. Au chargement de la page, on regarde si on connaît déjà l'adresse
    const adresseSauvegardee = localStorage.getItem(cleStockage);
    if (adresseSauvegardee) {
        // On affiche l'adresse en tout petit sous le nom du bouton
        btn.innerHTML = `${nomAffichage} <br><span style="font-size:10px; color:#64748b; font-weight:normal;">${adresseSauvegardee}</span>`;
    }

    // 2. Quand on clique avec le bouton gauche (Utiliser ou Créer)
    btn.addEventListener('click', () => {
        const adresseEnMemoire = localStorage.getItem(cleStockage);

        if (adresseEnMemoire) {
            // Si l'adresse existe, on l'écrit direct dans la case départ !
            inputDepart.value = adresseEnMemoire;

            // Petit effet visuel pour confirmer le clic
            btn.style.backgroundColor = "#d1fae5";
            setTimeout(() => btn.style.backgroundColor = "white", 300);

        } else {
            // Sinon, c'est la première fois, on demande à l'utilisateur :
            const nouvelleAdresse = prompt(`Quelle est l'adresse exacte pour ${nomAffichage} ?`);

            if (nouvelleAdresse && nouvelleAdresse.trim() !== "") {
                // On sauvegarde dans le navigateur
                localStorage.setItem(cleStockage, nouvelleAdresse.trim());
                // On met à jour le bouton
                btn.innerHTML = `${nomAffichage} <br><span style="font-size:10px; color:#64748b; font-weight:normal;">${nouvelleAdresse.trim()}</span>`;
                // On remplit la case
                inputDepart.value = nouvelleAdresse.trim();
            }
        }
    });

    // 3. Quand on fait un CLIC DROIT (ou appui long sur mobile) pour modifier/effacer
    btn.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // On bloque le menu clic droit normal de Windows/Android

        const nouvelleAdresse = prompt(
            `Modifier ou effacer l'adresse pour ${nomAffichage} :\n(Laissez vide pour effacer le favori)`,
            localStorage.getItem(cleStockage) || ""
        );

        if (nouvelleAdresse !== null) {
            if (nouvelleAdresse.trim() === "") {
                localStorage.removeItem(cleStockage); // On supprime la mémoire
                btn.innerHTML = nomAffichage;         // On remet le bouton à zéro
            } else {
                localStorage.setItem(cleStockage, nouvelleAdresse.trim());
                btn.innerHTML = `${nomAffichage} <br><span style="font-size:10px; color:#64748b; font-weight:normal;">${nouvelleAdresse.trim()}</span>`;
            }
        }
    });
}

// On active la magie pour les deux boutons !
configurerFavori('btn-fav-domicile', 'fav_domicile', '🏠 Domicile');
configurerFavori('btn-fav-ecole', 'fav_ecole', '🎒 Lycée');

btnMaPosition.addEventListener('click', () => {
    inputDepart.value = "Recherche GPS en cours...";
    navigator.geolocation.getCurrentPosition(
        (position) => {
            coordsMaPosition = [position.coords.longitude, position.coords.latitude];
            inputDepart.value = "📍 Ma position";
        },
        (erreur) => {
            inputDepart.value = "";
            alert("Impossible d'obtenir ta position.");
        },
        { enableHighAccuracy: true }
    );
});

function ajouterDrapeau(coords, emoji, titre) {
    const el = document.createElement('div');
    el.className = 'marker-itineray';
    el.innerHTML = emoji;
    el.style.fontSize = '24px';
    el.style.cursor = 'pointer';
    el.title = titre;

    const m = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<b>${titre}</b>`))
        .addTo(map);
    marqueursItineraire.push(m);
}

function nettoyerAncienTrajet() {
    marqueursItineraire.forEach(m => m.remove());
    marqueursItineraire = [];

    if (map.getLayer('itineraire-layer')) map.removeLayer('itineraire-layer');
    if (map.getSource('itineraire')) map.removeSource('itineraire');

    // On nettoie aussi l'isochrone
    if (map.getLayer('isochrone-fill')) map.removeLayer('isochrone-fill');
    if (map.getLayer('isochrone-outline')) map.removeLayer('isochrone-outline');
    if (map.getSource('isochrone-source')) map.removeSource('isochrone-source');

    if (map.getLayer('itineraire-transit-bus')) map.removeLayer('itineraire-transit-bus');
    if (map.getLayer('itineraire-transit-marche')) map.removeLayer('itineraire-transit-marche');
    if (map.getSource('itineraire-transit')) map.removeSource('itineraire-transit');
}

// === DESSINATEUR D'ITINÉRAIRE (RÉPARÉ POUR LES RUES) ===
async function dessinerItineraireTransit(trajet, coordsDep, coordsArr) {
    let features = [];

    const obtenirCheminMarche = async (c1, c2) => {
        const url = `https://router.project-osrm.org/route/v1/foot/${c1[0]},${c1[1]};${c2[0]},${c2[1]}?geometries=geojson`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.routes && data.routes.length > 0) return data.routes[0].geometry.coordinates;
        } catch (e) { console.error("Erreur marche:", e); }
        return [c1, c2];
    };

    // 🚨 LE TRACEUR CORRIGÉ ICI 🚨
    const ajouterBus = (routeIdComplet, lat1, lon1, lat2, lon2, couleur) => {
        const routeId = routeIdComplet.split('_branch_')[0];
        const branches = tracesLignes[routeId];
        if (!branches) return;

        let meilleurSegment = [];
        let distGlobaleMin = Infinity;

        branches.forEach(branche => {
            let idx1 = -1, idx2 = -1;
            let d1 = Infinity, d2 = Infinity;

            for (let i = 0; i < branche.length; i++) {
                const distDep = calculerDistanceMeters(lat1, lon1, branche[i][0], branche[i][1]);
                if (distDep < d1) { d1 = distDep; idx1 = i; }

                const distArr = calculerDistanceMeters(lat2, lon2, branche[i][0], branche[i][1]);
                if (distArr < d2) { d2 = distArr; idx2 = i; }
            }

            if (d1 < 300 && d2 < 300 && (d1 + d2) < distGlobaleMin) {
                distGlobaleMin = d1 + d2;
                const start = Math.min(idx1, idx2);
                const end = Math.max(idx1, idx2);
                meilleurSegment = branche.slice(start, end + 1).map(pt => [pt[1], pt[0]]);
            }
        });

        if (meilleurSegment.length > 1) {
            features.push({ type: 'Feature', properties: { color: couleur, dashed: false }, geometry: { type: 'LineString', coordinates: meilleurSegment } });
        } else {
            features.push({ type: 'Feature', properties: { color: couleur, dashed: false }, geometry: { type: 'LineString', coordinates: [[lon1, lat1], [lon2, lat2]] } });
        }
    };

    const chemin1 = await obtenirCheminMarche(coordsDep, [trajet.dep.lon, trajet.dep.lat]);
    features.push({ type: 'Feature', properties: { color: '#64748b', dashed: true }, geometry: { type: 'LineString', coordinates: chemin1 } });

    if (trajet.type === 'direct') {
        const couleur = infosLignes[trajet.ligne.split('_branch_')[0]]?.couleur || '#333';
        ajouterBus(trajet.ligne, trajet.dep.lat, trajet.dep.lon, trajet.arr.lat, trajet.arr.lon, couleur);
    } else {
        const c1 = infosLignes[trajet.ligne1.split('_branch_')[0]]?.couleur || '#333';
        const c2 = infosLignes[trajet.ligne2.split('_branch_')[0]]?.couleur || '#333';

        ajouterBus(trajet.ligne1, trajet.dep.lat, trajet.dep.lon, trajet.pivot.lat, trajet.pivot.lon, c1);

        const cheminTrans = await obtenirCheminMarche([trajet.pivot.lon, trajet.pivot.lat], [trajet.pivot2.lon, trajet.pivot2.lat]);
        features.push({ type: 'Feature', properties: { color: '#64748b', dashed: true }, geometry: { type: 'LineString', coordinates: cheminTrans } });

        ajouterBus(trajet.ligne2, trajet.pivot2.lat, trajet.pivot2.lon, trajet.arr.lat, trajet.arr.lon, c2);
    }

    const cheminFinal = await obtenirCheminMarche([trajet.arr.lon, trajet.arr.lat], coordsArr);
    features.push({ type: 'Feature', properties: { color: '#64748b', dashed: true }, geometry: { type: 'LineString', coordinates: cheminFinal } });

    const dataGeoJSON = { type: 'FeatureCollection', features: features };
    if (map.getSource('itineraire-transit')) {
        map.getSource('itineraire-transit').setData(dataGeoJSON);
    } else {
        map.addSource('itineraire-transit', { type: 'geojson', data: dataGeoJSON });
        map.addLayer({ id: 'itineraire-transit-bus', type: 'line', source: 'itineraire-transit', filter: ['==', 'dashed', false], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 6 } });
        map.addLayer({ id: 'itineraire-transit-marche', type: 'line', source: 'itineraire-transit', filter: ['==', 'dashed', true], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#64748b', 'line-width': 4, 'line-dasharray': [2, 2] } });
    }
}