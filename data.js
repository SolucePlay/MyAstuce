// === DICTIONNAIRES ===
const infosLignes = {
    // === Le Métro et les TEOR ===
    "TCAR:90": { nom: "Métro", couleur: "#123E8B" },
    "TCAR:91": { nom: "T1", couleur: "#E63027" },
    "TCAR:92": { nom: "T2", couleur: "#008F5B" },
    "TCAR:93": { nom: "T3", couleur: "#6D1C74" },
    "TCAR:94": { nom: "T4", couleur: "#F5C500" },
    "TCAR:95": { nom: "T5", couleur: "#14b8a6" }, // Ajouté

    // === Les lignes FAST ===
    "TCAR:01": { nom: "F1", couleur: "#E6007E" },
    "TCAR:02": { nom: "F2", couleur: "#A2559D" },
    "TCAR:03": { nom: "F3", couleur: "#FFDD00" },
    "TCAR:04": { nom: "F4", couleur: "#EC6408" },
    "TCAR:05": { nom: "F5", couleur: "#AFCA0B" },
    "TCAR:06": { nom: "F6", couleur: "#00ACE5" },
    "TCAR:07": { nom: "F7", couleur: "#008F5B" },
    "TCAR:08": { nom: "F8", couleur: "#0090D7" },

    // === Les lignes de bus régulières ===
    "TCAR:10": { nom: "10", couleur: "#F8AE4C" },
    "TCAR:11": { nom: "11", couleur: "#00ACE5" },
    "TCAR:13": { nom: "13", couleur: "#f43f5e" }, // Ajouté
    "TCAR:14": { nom: "14", couleur: "#8b5cf6" }, // Ajouté
    "TCAR:15": { nom: "15", couleur: "#74B95B" },
    "TCAR:20": { nom: "20", couleur: "#C29FCB" },
    "TCAR:22": { nom: "22", couleur: "#d946ef" }, // Ajouté
    "TCAR:26": { nom: "26", couleur: "#f43f5e" }, // Ajouté
    "TCAR:27": { nom: "27", couleur: "#74B95B" },
    "TCAR:28": { nom: "28", couleur: "#06b6d4" }, // Ajouté
    "TCAR:33": { nom: "33", couleur: "#f97316" }, // Ajouté
    "TCAR:35": { nom: "35", couleur: "#84cc16" }, // Ajouté
    "TCAR:36": { nom: "36", couleur: "#64748b" }, // Ajouté
    "TCAR:37": { nom: "37", couleur: "#ec4899" }, // Ajouté
    "TCAR:38": { nom: "38", couleur: "#10b981" }, // Ajouté
    "TCAR:41": { nom: "41", couleur: "#F8AE4C" },
    "TCAR:42": { nom: "42", couleur: "#8b5cf6" },
    "TCAR:43": { nom: "43", couleur: "#3b82f6" }, // Ajouté
    "TCAR:44": { nom: "44", couleur: "#f59e0b" }, // Ajouté
    
    // Ligne scolaire (déjà présente dans ton code précédent)
    "TCAR:300": { nom: "300", couleur: "#3b82f6" }, // Ajouté (Couleur Bleue)
    "TCAR:301": { nom: "301", couleur: "#f59e0b" }, // Ajouté (Couleur Orange)
    "TCAR:302": { nom: "302", couleur: "#84cc16" }, // Ajouté (Couleur Verte)
    "TCAR:303": { nom: "303", couleur: "#ec4899" }, // Ajouté (Couleur Rose)
    "TCAR:305": { nom: "305", couleur: "#10b981" }, // Ajouté (Couleur Vert Émeraude)
    "TCAR:310": { nom: "310", couleur: "#f43f5e" },
    "TCAR:311": { nom: "311", couleur: "#74B95B" },
    "TCAR:313": { nom: "313", couleur: "#06b6d4" },
    "TCAR:314": { nom: "314", couleur: "#f97316" },
    "TCAR:315": { nom: "315", couleur: "#f97316" },
    "TCAR:322": { nom: "322", couleur: "#f43f5e" },
    "TCAR:330": { nom: "330", couleur: "#84cc16" },
    "TCAR:331": { nom: "331", couleur: "#64748b" },
    "TCAR:332": { nom: "332", couleur: "#ec4899" },
    "TCAR:333": { nom: "333", couleur: "#10b981" },
    "TCAR:334": { nom: "334", couleur: "#f43f5e" },
    "TCAR:335": { nom: "335", couleur: "#74B95B" },
    "TCAR:336": { nom: "336", couleur: "#06b6d4" },
    "TCAR:340": { nom: "340", couleur: "#f97316" },
    "TCAR:341": { nom: "341", couleur: "#f97316" },
    "TCAR:342": { nom: "342", couleur: "#f43f5e" },
    "TCAR:343": { nom: "343", couleur: "#74B95B" },
    "TCAR:350": { nom: "350", couleur: "#06b6d4" },
    "TCAR:351": { nom: "351", couleur: "#f97316" },
    "TCAR:360": { nom: "360", couleur: "#f97316" },
    "TCAR:361": { nom: "361", couleur: "#f43f5e" },
    "TCAR:363": { nom: "363", couleur: "#74B95B" },
    "TCAR:364": { nom: "364", couleur: "#06b6d4" },
    "TCAR:201": { nom: "201", couleur: "#f97316" },
    "TCAR:202": { nom: "202", couleur: "#f97316" },
    "TCAR:203": { nom: "203", couleur: "#f43f5e" },
    "TCAR:204": { nom: "204", couleur: "#74B95B" },
    "TCAR:205": { nom: "205", couleur: "#06b6d4" },
    "TCAR:206": { nom: "206", couleur: "#f97316" },
    "TCAR:207": { nom: "207", couleur: "#f97316" },
    "TCAR:208": { nom: "208", couleur: "#f43f5e" },
    "TCAR:210": { nom: "210", couleur: "#74B95B" },
    "TCAR:211": { nom: "211", couleur: "#06b6d4" },
    "TCAR:212": { nom: "212", couleur: "#f97316" },
    "TCAR:213": { nom: "213", couleur: "#f97316" },
    "TCAR:214": { nom: "214", couleur: "#f43f5e" },
    "TCAR:220": { nom: "220", couleur: "#84cc16" },
    "TCAR:221": { nom: "221", couleur: "#64748b" },
    "TCAR:222": { nom: "222", couleur: "#ec4899" },
    "TCAR:224": { nom: "224", couleur: "#10b981" },
    "TCAR:225": { nom: "225", couleur: "#f43f5e" },
    "TCAR:227": { nom: "227", couleur: "#f97316" },
    "TCAR:228": { nom: "228", couleur: "#f97316" },
    "TCAR:229": { nom: "229", couleur: "#f43f5e" },
    "TCAR:100": { nom: "100", couleur: "#74B95B" },
    "TCAR:101": { nom: "101", couleur: "#06b6d4" },
    "TCAR:102": { nom: "102", couleur: "#f97316" },
    "TCAR:103": { nom: "103", couleur: "#f97316" },
    "TCAR:104": { nom: "104", couleur: "#f43f5e" },
    "TCAR:106": { nom: "106", couleur: "#74B95B" },

    "TCAR:529": { nom: "529", couleur: "#84cc16" },
    "TCAR:530": { nom: "530", couleur: "#64748b" },

    // === Lignes spéciales ===
    "TCAR:98": { nom: "Noctambus", couleur: "#1e1b4b" }, // Ajouté (Couleur Nuit)
    "TCAR:99": { nom: "Calypso", couleur: "#0ea5e9" }    // Ajouté (Couleur Eau)
};

const traductionsAffluence = {
    "EMPTY": "🟢 Bus vide",
    "MANY_SEATS_AVAILABLE": "🟢 Beaucoup de places",
    "FEW_SEATS_AVAILABLE": "🟡 Peu de places assises",
    "STANDING_ROOM_ONLY": "🟠 Places debout uniquement",
    "CRUSHED_STANDING_ROOM_ONLY": "🔴 Bus bondé",
    "FULL": "🔴 Complet"
};

// === LE DICTIONNAIRE DE TRADUCTION ===
const nomsLignes = {
    // Le Métro et les TEOR
    "TCAR:90": "Métro",
    "TCAR:91": "T1",
    "TCAR:92": "T2",
    "TCAR:93": "T3",
    "TCAR:94": "T4",
    "TCAR:95": "T5",

    // Les lignes FAST
    "TCAR:01": "F1",
    "TCAR:02": "F2",
    "TCAR:03": "F3",
    "TCAR:04": "F4",
    "TCAR:05": "F5",
    "TCAR:06": "F6",
    "TCAR:07": "F7",
    "TCAR:08": "F8",

    // Les lignes de bus majeures
    "TCAR:10": "10",
    "TCAR:11": "11",
    "TCAR:13": "13",
    "TCAR:14": "14",
    "TCAR:15": "15",
    "TCAR:20": "20",
    "TCAR:22": "22",    // [cite: 2]
    "TCAR:27": "27",    // [cite: 3]
    "TCAR:28": "28",    // [cite: 3]
    "TCAR:33": "33",    // [cite: 4]
    "TCAR:35": "35",    // [cite: 5]
    "TCAR:36": "36",    // [cite: 6]
    "TCAR:37": "37",    // [cite: 6]
    "TCAR:38": "38",    // [cite: 6]
    "TCAR:41": "41",    // [cite: 6]
    "TCAR:42": "42",    // [cite: 6]
    "TCAR:43": "43",    // [cite: 6]
    "TCAR:44": "44",

    // Lignes spéciales
    "TCAR:98": "Noctambus",
    "TCAR:99": "Calypso"
};