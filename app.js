let marqueursItineraire = []; // Liste pour stocker les drapeaux de trajet
let donneesTempsReel = [];



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

const grid = document.getElementById('lignes-grid');
for (const [codeTcar, infos] of Object.entries(infosLignes)) {
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
    grid.appendChild(btn);
}

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
    let features = [];
    lignesFiltrees.forEach(routeId => {
        const branches = tracesLignes[routeId];
        const couleur = infosLignes[routeId] ? infosLignes[routeId].couleur : '#333';
        if (branches && branches.length > 0) {
            branches.forEach(brancheCoordonnees => {
                const coordsInversees = brancheCoordonnees.map(pt => [pt[1], pt[0]]);
                features.push({
                    type: 'Feature',
                    properties: { color: couleur },
                    geometry: { type: 'LineString', coordinates: coordsInversees }
                });
            });
        }
    });
    const dataGeoJSON = { type: 'FeatureCollection', features: features };
    if (map.getSource('traces')) {
        map.getSource('traces').setData(dataGeoJSON);
    } else {
        map.addSource('traces', { type: 'geojson', data: dataGeoJSON });
        map.addLayer({
            id: 'traces-layer',
            type: 'line',
            source: 'traces',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': ['get', 'color'],
                'line-width': 5,
                'line-opacity': 0.8
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

map.on('load', () => {
    chargerPositionsBus();
    chargerInfoTrafic(); // NOUVEAUTÉ : On charge les alertes !

    setInterval(chargerPositionsBus, 20000);
    setInterval(chargerInfoTrafic, 300000); // On rafraîchit l'info-trafic toutes les 5 minutes (300 000 ms)
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

// Outil 2 : Mettre ça en forme proprement pour l'affichage
function formaterInfoLive(infoLive) {
    if (!infoLive) return "<div style='color: #94a3b8; font-size: 11px; margin-top: 5px;'><i>📡 Aucun bus en approche détecté</i></div>";

    let texteRetard = "";
    if (infoLive.retard > 0) texteRetard = `<span style='color:#ef4444'>(+${infoLive.retard} min)</span>`;
    else if (infoLive.retard < 0) texteRetard = `<span style='color:#10b981'>(${infoLive.retard} min)</span>`;
    else texteRetard = `<span style='color:#10b981'>(À l'heure)</span>`;

    return `<div style='color: #ea580c; font-weight: bold; font-size: 12px; margin-top: 5px; background: #fff7ed; padding: 4px 8px; border-radius: 4px; display: inline-block; border: 1px solid #fed7aa;'>📡 Arrive dans ~${infoLive.minutes} min ${texteRetard}</div>`;
}

async function lancerCalcul(mode) {
    nettoyerAncienTrajet();

    const txtDepart = document.getElementById('input-depart').value;
    const txtArrivee = document.getElementById('input-arrivee').value;

    if (!txtDepart || !txtArrivee) {
        return alert("Veuillez indiquer un départ et une arrivée.");
    }

    let coordsDep;
    if (txtDepart === "📍 Ma position" && coordsMaPosition) {
        coordsDep = coordsMaPosition;
    } else {
        coordsDep = await geocoderAdresse(txtDepart);
    }
    const coordsArr = await geocoderAdresse(txtArrivee);

    if (!coordsDep || !coordsArr) {
        return alert("Impossible de trouver ces adresses sur la carte.");
    }

    if (mode === 'transit') {
        const RAYON_RECHERCHE = 1500;
        let arretsDepart = [];
        let arretsArrivee = [];

        // 1. Chercher les arrêts
        for (const [id, arret] of Object.entries(reseauArrets)) {
            if (!arret.lat || arret.lat === 0) continue;
            const distDep = calculerDistanceMeters(coordsDep[1], coordsDep[0], arret.lat, arret.lon);
            if (distDep <= RAYON_RECHERCHE) arretsDepart.push({ id: id, ...arret, distDep });

            const distArr = calculerDistanceMeters(coordsArr[1], coordsArr[0], arret.lat, arret.lon);
            if (distArr <= RAYON_RECHERCHE) arretsArrivee.push({ id: id, ...arret, distArr });
        }

        if (arretsDepart.length === 0 || arretsArrivee.length === 0) return alert("Aucun arrêt trouvé à proximité.");

        // === OPTIMISATION 1 : Le Filtre Entonnoir (Le secret de la vitesse) ===
        // On trie par distance et on ne garde QUE les 15 plus proches. Ça évite les millions de calculs !
        arretsDepart.sort((a, b) => a.distDep - b.distDep);
        arretsDepart = arretsDepart.slice(0, 15);

        arretsArrivee.sort((a, b) => a.distArr - b.distArr);
        arretsArrivee = arretsArrivee.slice(0, 15);

        // === OPTIMISATION 2 : L'Annuaire des Lignes ===
        // On classe instantanément les arrêts par ligne pour ne plus jamais chercher à l'aveugle
        const arretsParLigne = {};
        for (const [id, arret] of Object.entries(reseauArrets)) {
            if (!arret.lat || arret.lat === 0) continue;
            for (const [ligne, indexLigne] of Object.entries(arret.lignes)) {
                if (!arretsParLigne[ligne]) arretsParLigne[ligne] = [];
                arretsParLigne[ligne].push({ id: id, ...arret, idx: indexLigne });
            }
        }

        let meilleurTrajet = null;
        let tempsMin = Infinity;

        // 3. Boucle principale (Maintenant ultra-rapide)
        for (const dep of arretsDepart) {
            for (const arr of arretsArrivee) {
                if (dep.n === arr.n) continue;

                const lignesDep = Object.keys(dep.lignes);
                const lignesArr = Object.keys(arr.lignes);

                // --- A. TRAJET DIRECT ---
                const lignesCommunes = lignesDep.filter(p => lignesArr.includes(p) && dep.lignes[p] < arr.lignes[p]);

                if (lignesCommunes.length > 0) {
                    const distBus = calculerDistanceMeters(dep.lat, dep.lon, arr.lat, arr.lon);
                    const tMarche1 = Math.max(1, Math.round(dep.distDep / 80));
                    const tBus = Math.max(1, Math.round(distBus / 330));
                    const tMarche2 = Math.max(1, Math.round(arr.distArr / 80));
                    const tTotal = tMarche1 + tBus + tMarche2;

                    if (tTotal < tempsMin) {
                        tempsMin = tTotal;
                        meilleurTrajet = { type: 'direct', dep, arr, ligne: lignesCommunes[0], tMarche1, tBus, tMarche2, tTotal };
                    }
                }
                // --- B. 1 CORRESPONDANCE ---
                else {
                    for (const l1 of lignesDep) {
                        const idxDep = dep.lignes[l1];
                        // On ne regarde QUE les arrêts qui sont APRÈS notre point de départ sur cette ligne
                        const pivotsPossibles1 = arretsParLigne[l1].filter(a => a.idx > idxDep);

                        for (const l2 of lignesArr) {
                            const idxArr = arr.lignes[l2];
                            // On ne regarde QUE les arrêts qui sont AVANT notre arrivée sur cette ligne
                            const pivotsPossibles2 = arretsParLigne[l2].filter(a => a.idx < idxArr);

                            for (const p1 of pivotsPossibles1) {
                                for (const p2 of pivotsPossibles2) {
                                    // Ignorer les arrêts inutiles
                                    if (p1.n === dep.n || p2.n === arr.n) continue;

                                    // Filtre géométrique hyper-rapide (un carré de recherche brut)
                                    if (Math.abs(p1.lat - p2.lat) > 0.008 || Math.abs(p1.lon - p2.lon) > 0.008) continue;

                                    // La vraie distance mathématique précise
                                    const distTransfert = (p1.id === p2.id) ? 0 : calculerDistanceMeters(p1.lat, p1.lon, p2.lat, p2.lon);

                                    // Si on peut changer de quai avec max 600m de marche
                                    if (distTransfert <= 600) {
                                        const distBus1 = calculerDistanceMeters(dep.lat, dep.lon, p1.lat, p1.lon);
                                        const distBus2 = calculerDistanceMeters(p2.lat, p2.lon, arr.lat, arr.lon);

                                        const tMarche1 = Math.max(1, Math.round(dep.distDep / 80));
                                        const tBus1 = Math.max(1, Math.round(distBus1 / 330));
                                        const tCorresp = Math.max(3, Math.round(distTransfert / 80) + 3);
                                        const tBus2 = Math.max(1, Math.round(distBus2 / 330));
                                        const tMarche2 = Math.max(1, Math.round(arr.distArr / 80));
                                        const tTotal = tMarche1 + tBus1 + tCorresp + tBus2 + tMarche2;

                                        if (tTotal < tempsMin) {
                                            tempsMin = tTotal;
                                            meilleurTrajet = {
                                                type: 'correspondance', dep, arr,
                                                pivot: p1, pivot2: p2,
                                                ligne1: l1, ligne2: l2,
                                                tMarche1, tBus1, tCorresp, tBus2, tMarche2, tTotal
                                            };
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // === L'AFFICHAGE DU RÉSULTAT COMMENCE ICI ===
        if (meilleurTrajet) {
            const conteneurResultat = document.getElementById('resultats-it');
            const parserLigne = (ligneBrute) => {
                const parts = ligneBrute.split('::');
                const baseId = parts[0];
                const direction = parts[1] ? `vers ${parts[1]}` : '';
                const info = infosLignes[baseId] || { nom: baseId.replace('TCAR:', ''), couleur: '#333' };
                return { baseId, direction, nom: info.nom, couleur: info.couleur };
            };

            let htmlResultat = "";
            if (meilleurTrajet.type === 'direct') {
                const l = parserLigne(meilleurTrajet.ligne);

                // MAGIE : Appel temps réel pour le bus direct !
                const infoLive = chercherProchainBus(l.baseId, meilleurTrajet.dep.id);
                const htmlLive = formaterInfoLive(infoLive);

                htmlResultat = `<div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin-top: 15px;"><h4 style="margin: 0 0 10px 0;">Durée : ~${meilleurTrajet.tTotal} min (Direct)</h4><div style="display: flex; gap: 10px; margin-bottom: 8px;">🚶 <span>Marche <b>${meilleurTrajet.tMarche1} min</b> jusqu'à <b>${meilleurTrajet.dep.n}</b></span></div><div style="display: flex; gap: 10px; border-left: 3px solid ${l.couleur}; padding-left: 10px;"><span style="background: ${l.couleur}; color: white; padding: 3px 8px; border-radius: 4px; height: max-content;">${l.nom}</span><span>Trajet ~<b>${meilleurTrajet.tBus} min</b> ${l.direction}<br>Descendre à <b>${meilleurTrajet.arr.n}</b><br>${htmlLive}</span></div><div style="display: flex; gap: 10px; margin-top: 8px;">🚶 <span>Marche <b>${meilleurTrajet.tMarche2} min</b> jusqu'à l'arrivée</span></div></div>`;
            } else {
                const l1 = parserLigne(meilleurTrajet.ligne1);
                const l2 = parserLigne(meilleurTrajet.ligne2);

                // MAGIE : Appel temps réel pour les DEUX bus !
                const infoLive1 = chercherProchainBus(l1.baseId, meilleurTrajet.dep.id);
                const infoLive2 = chercherProchainBus(l2.baseId, meilleurTrajet.pivot2.id);

                const mentionMarcheTransfert = (meilleurTrajet.pivot.n !== meilleurTrajet.pivot2.n) ? ` (vers ${meilleurTrajet.pivot2.n})` : '';

                htmlResultat = `<div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin-top: 15px;"><h4 style="margin: 0 0 10px 0;">Durée : ~${meilleurTrajet.tTotal} min (Correspondance)</h4><div style="display: flex; gap: 10px; margin-bottom: 8px;">🚶 <span>Marche <b>${meilleurTrajet.tMarche1} min</b> jusqu'à <b>${meilleurTrajet.dep.n}</b></span></div><div style="display: flex; gap: 10px; border-left: 3px solid ${l1.couleur}; padding-left: 10px;"><span style="background: ${l1.couleur}; color: white; padding: 3px 8px; border-radius: 4px; height: max-content;">${l1.nom}</span><span>Trajet ~<b>${meilleurTrajet.tBus1} min</b> ${l1.direction}<br>Descendre à <b>${meilleurTrajet.pivot.n}</b><br>${formaterInfoLive(infoLive1)}</span></div><div style="margin: 8px 0; padding-left: 15px;">🔄 Transfert ~<b>${meilleurTrajet.tCorresp} min</b>${mentionMarcheTransfert}</div><div style="display: flex; gap: 10px; border-left: 3px solid ${l2.couleur}; padding-left: 10px;"><span style="background: ${l2.couleur}; color: white; padding: 3px 8px; border-radius: 4px; height: max-content;">${l2.nom}</span><span>Trajet ~<b>${meilleurTrajet.tBus2} min</b> ${l2.direction}<br>Descendre à <b>${meilleurTrajet.arr.n}</b><br>${formaterInfoLive(infoLive2)}</span></div><div style="display: flex; gap: 10px; margin-top: 8px;">🚶 <span>Marche <b>${meilleurTrajet.tMarche2} min</b> jusqu'à l'arrivée</span></div></div>`;
            }
            if (conteneurResultat) conteneurResultat.innerHTML = htmlResultat;

            document.getElementById('btn-effacer-it').style.display = 'block';
            document.getElementById('btn-demarrer-it').style.display = 'block';

            await dessinerItineraireTransit(meilleurTrajet, coordsDep, coordsArr);

            ajouterDrapeau(coordsDep, '🏠', "Votre départ");
            // On récupère l'ID de la ligne (directe ou correspondance)
            // Détermination de l'icône du drapeau
            const idLigneTrajet = meilleurTrajet.type === 'direct' ? meilleurTrajet.ligne.split('::')[0] : meilleurTrajet.ligne1.split('::')[0];
            let iconeDrapeau = '🚌';

            if (idLigneTrajet === 'TCAR:90') {
                iconeDrapeau = '🚇';
            } else if (['TCAR:91', 'TCAR:92', 'TCAR:93', 'TCAR:94'].includes(idLigneTrajet)) {
                const info = infosLignes[idLigneTrajet];
                // On crée un petit badge HTML pour le drapeau aussi !
                iconeDrapeau = `<div class="line-badge-icon" style="background-color:${info.couleur}; width:24px; height:24px; font-size:10px;">${info.nom}</div>`;
            }

            ajouterDrapeau([meilleurTrajet.dep.lon, meilleurTrajet.dep.lat], iconeDrapeau, `Monter à : ${meilleurTrajet.dep.n}`);

            // === ISOLER LE(S) VÉHICULE(S) EXACT(S) ===
            tripsItineraire.clear();
            modeItineraireActif = true; // On bloque les autres bus

            if (meilleurTrajet.type === 'direct') {
                if (infoLive && infoLive.tripId) tripsItineraire.add(infoLive.tripId);
            } else {
                if (infoLive1 && infoLive1.tripId) tripsItineraire.add(infoLive1.tripId);
                if (infoLive2 && infoLive2.tripId) tripsItineraire.add(infoLive2.tripId);
            }

            // On cache les gros tracés du menu pour ne laisser que le bel itinéraire découpé
            if (map.getSource('traces')) map.getSource('traces').setData({ type: 'FeatureCollection', features: [] });

            // On met à jour la carte avec les bons bus !
            chargerPositionsBus();

            const limites = new maplibregl.LngLatBounds();
            limites.extend(coordsDep);
            limites.extend(coordsArr);
            map.fitBounds(limites, { padding: 60, pitch: 50 });
        } else {
            alert("Aucun itinéraire trouvé.");
        }
        return;
    }

    // === CALCUL POUR LA MARCHE OU LA VOITURE (OSRM) ===
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

            // === NOUVEAUTÉ : ON CACHE TOUS LES BUS ET LES LIGNES ===
            modeItineraireActif = true;
            tripsItineraire.clear(); // La liste est vide : AUCUN bus ne sera affiché !

            // On cache les grosses lignes du menu si elles étaient allumées
            if (map.getSource('traces')) map.getSource('traces').setData({ type: 'FeatureCollection', features: [] });

            // On force la mise à jour (ça va faire disparaître tous les bus)
            chargerPositionsBus();
            // ========================================================

            const limites = new maplibregl.LngLatBounds();
            tracéGeom.coordinates.forEach(coord => limites.extend(coord));
            map.fitBounds(limites, { padding: 50, pitch: 45 });
        } else {
            alert("Aucun itinéraire trouvé.");
        }
    } catch (e) {
        alert("Erreur lors du calcul.");
    }
} // <-- Fin de la fonction lancerCalcul

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

// === DESSINATEUR DE SEGMENTS D'ITINÉRAIRE (VERSION RUES RÉELLES) ===
async function dessinerItineraireTransit(trajet, coordsDep, coordsArr) {
    let features = [];

    // --- OUTIL 1 : Aller chercher le vrai chemin piéton sur OSRM ---
    const obtenirCheminMarche = async (c1, c2) => {
        const url = `https://router.project-osrm.org/route/v1/foot/${c1[0]},${c1[1]};${c2[0]},${c2[1]}?geometries=geojson`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.routes && data.routes.length > 0) {
                return data.routes[0].geometry.coordinates;
            }
        } catch (e) { console.error("Erreur marche OSRM:", e); }
        return [c1, c2]; // Si erreur, on remet la ligne droite par sécurité
    };

    // --- OUTIL 2 : Découper la ligne de bus (inchangé) ---
    const ajouterBus = (routeId, lat1, lon1, lat2, lon2, couleur) => {
        const branches = tracesLignes[routeId];
        if (!branches) return;
        let meilleurSegment = [];
        let distMin = Infinity;
        branches.forEach(branche => {
            let i1 = 0, i2 = 0, d1 = Infinity, d2 = Infinity;
            for (let i = 0; i < branche.length; i++) {
                const distDep = calculerDistanceMeters(lat1, lon1, branche[i][0], branche[i][1]);
                if (distDep < d1) { d1 = distDep; i1 = i; }
                const distArr = calculerDistanceMeters(lat2, lon2, branche[i][0], branche[i][1]);
                if (distArr < d2) { d2 = distArr; i2 = i; }
            }
            if (d1 + d2 < distMin) {
                distMin = d1 + d2;
                const start = Math.min(i1, i2);
                const end = Math.max(i1, i2);
                meilleurSegment = branche.slice(start, end + 1).map(pt => [pt[1], pt[0]]);
            }
        });
        if (meilleurSegment.length > 0) {
            features.push({
                type: 'Feature',
                properties: { color: couleur, dashed: false },
                geometry: { type: 'LineString', coordinates: meilleurSegment }
            });
        }
    };

    // --- CONSTRUCTION DE L'ITINÉRAIRE ---

    // 1. Marche : Maison -> Premier arrêt
    const chemin1 = await obtenirCheminMarche(coordsDep, [trajet.dep.lon, trajet.dep.lat]);
    features.push({ type: 'Feature', properties: { color: '#64748b', dashed: true }, geometry: { type: 'LineString', coordinates: chemin1 } });

    // 2. Le(s) Bus
    if (trajet.type === 'direct') {
        const routeId = trajet.ligne.split('::')[0];
        const couleur = infosLignes[routeId] ? infosLignes[routeId].couleur : '#333';
        ajouterBus(routeId, trajet.dep.lat, trajet.dep.lon, trajet.arr.lat, trajet.arr.lon, couleur);
    } else {
        const routeId1 = trajet.ligne1.split('::')[0];
        const routeId2 = trajet.ligne2.split('::')[0];
        const c1 = infosLignes[routeId1] ? infosLignes[routeId1].couleur : '#333';
        const c2 = infosLignes[routeId2] ? infosLignes[routeId2].couleur : '#333';

        ajouterBus(routeId1, trajet.dep.lat, trajet.dep.lon, trajet.pivot.lat, trajet.pivot.lon, c1);

        // Marche de transfert entre les deux bus
        const cheminTrans = await obtenirCheminMarche([trajet.pivot.lon, trajet.pivot.lat], [trajet.pivot2.lon, trajet.pivot2.lat]);
        features.push({ type: 'Feature', properties: { color: '#64748b', dashed: true }, geometry: { type: 'LineString', coordinates: cheminTrans } });

        ajouterBus(routeId2, trajet.pivot2.lat, trajet.pivot2.lon, trajet.arr.lat, trajet.arr.lon, c2);
    }

    // 3. Marche : Dernier arrêt -> Arrivée
    const cheminFinal = await obtenirCheminMarche([trajet.arr.lon, trajet.arr.lat], coordsArr);
    features.push({ type: 'Feature', properties: { color: '#64748b', dashed: true }, geometry: { type: 'LineString', coordinates: cheminFinal } });

    // --- AFFICHAGE ---
    const dataGeoJSON = { type: 'FeatureCollection', features: features };
    if (map.getSource('itineraire-transit')) {
        map.getSource('itineraire-transit').setData(dataGeoJSON);
    } else {
        map.addSource('itineraire-transit', { type: 'geojson', data: dataGeoJSON });
        map.addLayer({
            id: 'itineraire-transit-bus', type: 'line', source: 'itineraire-transit',
            filter: ['==', 'dashed', false],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 6 }
        });
        map.addLayer({
            id: 'itineraire-transit-marche', type: 'line', source: 'itineraire-transit',
            filter: ['==', 'dashed', true],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#64748b', 'line-width': 4, 'line-dasharray': [2, 2] }
        });
    }
}