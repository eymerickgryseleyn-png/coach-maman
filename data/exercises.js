// Base de données exercices - classés par muscle et matériel
// Chaque exercice possède un SVG illustratif local (pas de dépendance externe)

const MUSCLE_GROUPS = [
  'Quadriceps','Ischio-jambiers','Fessiers','Mollets','Adducteurs','Abducteurs',
  'Pectoraux','Dorsaux','Deltoïdes','Trapèzes','Biceps','Triceps','Avant-bras',
  'Abdominaux','Lombaires','Obliques','Cardio','Mobilité','Stabilisateurs'
];

const EQUIPMENT_TYPES = [
  'Poids du corps','Haltères','Kettlebell','Barre','Élastique','Machine','TRX',
  'Swiss ball','Box / Step','Corde à sauter','Médecine ball','Banc','Aucun'
];

// SVG illustrations - silhouettes anatomiques (œuvres originales)
const SVG_DEFS = `<defs>
  <style>
    .b{stroke:#1f2937;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;fill:none}
    .h{fill:#1f2937;stroke:none}
    .j{fill:#1f2937}
    .e{fill:#2d7a5f;stroke:#1a5240;stroke-width:1.2}
    .e2{fill:#c97f23;stroke:#8a5618;stroke-width:1.2}
    .e3{fill:#2c6db5;stroke:#1c4a7c;stroke-width:1.2}
    .e4{fill:#7a4ea0;stroke:#523471;stroke-width:1.2}
    .g{stroke:#cbd5e0;stroke-width:1.5;stroke-dasharray:3 3;fill:none}
    .a{stroke:#2d7a5f;stroke-width:2;stroke-dasharray:5 3;fill:none}
    .muscle{fill:#fca5a5;opacity:.55}
  </style>
  <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
    <path d="M0 0 L10 5 L0 10 z" fill="#2d7a5f"/>
  </marker>
</defs>`;

const EX_SVG = {

  squat: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="60" cy="22" r="9" class="h"/>
    <path class="b" d="M60 31 L60 60"/>
    <ellipse cx="60" cy="46" rx="11" ry="7" class="muscle"/>
    <path class="b" d="M60 38 L40 52 M60 38 L80 52"/>
    <circle cx="40" cy="52" r="2.5" class="j"/><circle cx="80" cy="52" r="2.5" class="j"/>
    <path class="b" d="M60 60 L40 78 M60 60 L80 78"/>
    <circle cx="40" cy="78" r="3" class="j"/><circle cx="80" cy="78" r="3" class="j"/>
    <path class="b" d="M40 78 L40 104 M80 78 L80 104"/>
    <path class="b" d="M30 104 L48 104 M72 104 L90 104" stroke-width="5"/>
    <path class="a" d="M100 38 Q105 60 100 80" marker-end="url(#arr)"/>
  </svg>`,

  lunge: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="48" cy="22" r="9" class="h"/>
    <path class="b" d="M48 31 L52 62"/>
    <ellipse cx="50" cy="46" rx="9" ry="6" class="muscle"/>
    <path class="b" d="M50 40 L36 60 M50 40 L62 60"/>
    <path class="b" d="M52 62 L82 80"/>
    <circle cx="82" cy="80" r="3" class="j"/>
    <path class="b" d="M82 80 L82 104"/>
    <path class="b" d="M75 104 L92 104" stroke-width="5"/>
    <path class="b" d="M52 62 L30 75"/>
    <circle cx="30" cy="75" r="3" class="j"/>
    <path class="b" d="M30 75 L20 104"/>
    <path class="b" d="M14 104 L28 104" stroke-width="5"/>
  </svg>`,

  push: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="22" cy="46" r="8" class="h"/>
    <path class="b" d="M28 50 L96 64"/>
    <ellipse cx="55" cy="55" rx="22" ry="6" class="muscle"/>
    <path class="b" d="M30 54 L30 78"/>
    <circle cx="30" cy="78" r="3" class="j"/>
    <path class="b" d="M30 78 L40 96 L40 104"/>
    <path class="b" d="M96 64 L96 96"/>
    <path class="b" d="M88 104 L104 104" stroke-width="5"/>
    <path class="b" d="M36 104 L48 104" stroke-width="5"/>
    <path class="a" d="M22 70 Q12 75 12 88" marker-end="url(#arr)"/>
  </svg>`,

  pull: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="15" y1="14" x2="105" y2="14" stroke="#1f2937" stroke-width="5" stroke-linecap="round"/>
    <line x1="40" y1="14" x2="40" y2="24" class="b"/>
    <line x1="60" y1="14" x2="60" y2="24" class="b"/>
    <line x1="80" y1="14" x2="80" y2="24" class="b"/>
    <circle cx="60" cy="42" r="8" class="h"/>
    <path class="b" d="M60 50 L60 80"/>
    <ellipse cx="60" cy="62" rx="13" ry="7" class="muscle"/>
    <path class="b" d="M60 52 L40 24 M60 52 L80 24"/>
    <path class="b" d="M60 80 L50 105 M60 80 L70 105"/>
    <path class="a" d="M85 65 Q95 50 85 35" marker-end="url(#arr)"/>
  </svg>`,

  hinge: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="30" cy="30" r="9" class="h"/>
    <path class="b" d="M38 32 L88 50"/>
    <ellipse cx="65" cy="40" rx="20" ry="6" class="muscle" transform="rotate(20 65 40)"/>
    <path class="b" d="M88 50 L82 80"/>
    <circle cx="82" cy="80" r="3" class="j"/>
    <path class="b" d="M82 80 L82 104 M70 80 L70 104"/>
    <path class="b" d="M62 104 L92 104" stroke-width="5"/>
    <path class="b" d="M40 35 L40 70"/>
    <rect x="32" y="70" width="16" height="8" rx="2" class="e4"/>
    <path class="b" d="M40 70 L40 64"/>
    <path class="a" d="M100 35 Q108 55 100 75" marker-end="url(#arr)"/>
  </svg>`,

  plank: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="100" x2="110" y2="100" class="g"/>
    <circle cx="18" cy="55" r="8" class="h"/>
    <path class="b" d="M24 60 L100 70"/>
    <ellipse cx="60" cy="65" rx="34" ry="6" class="muscle"/>
    <path class="b" d="M22 60 L22 92 L34 92"/>
    <path class="b" d="M14 92 L34 92" stroke-width="5"/>
    <path class="b" d="M100 70 L100 96"/>
    <path class="b" d="M92 96 L108 96" stroke-width="5"/>
  </svg>`,

  bridge: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="105" x2="110" y2="105" class="g"/>
    <circle cx="22" cy="80" r="8" class="h"/>
    <path class="b" d="M28 76 L70 50"/>
    <ellipse cx="48" cy="63" rx="20" ry="6" class="muscle" transform="rotate(-30 48 63)"/>
    <path class="b" d="M70 50 L88 80"/>
    <circle cx="88" cy="80" r="3" class="j"/>
    <path class="b" d="M88 80 L88 102"/>
    <path class="b" d="M80 102 L98 102" stroke-width="5"/>
    <path class="a" d="M50 45 Q60 30 70 45" marker-end="url(#arr)"/>
  </svg>`,

  jump: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="60" cy="20" r="9" class="h"/>
    <path class="b" d="M60 29 L60 58"/>
    <path class="b" d="M60 34 L42 48 M60 34 L78 48"/>
    <path class="b" d="M60 58 L46 78 L46 90 M60 58 L74 78 L74 90"/>
    <path class="a" d="M30 65 L30 35" marker-end="url(#arr)"/>
    <path class="a" d="M95 65 L95 35" marker-end="url(#arr)"/>
  </svg>`,

  step: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <rect x="62" y="70" width="44" height="22" fill="#a8b5c9" stroke="#1f2937" stroke-width="2"/>
    <rect x="62" y="68" width="44" height="4" fill="#1f2937"/>
    <circle cx="36" cy="22" r="9" class="h"/>
    <path class="b" d="M36 31 L40 60"/>
    <ellipse cx="38" cy="46" rx="9" ry="6" class="muscle"/>
    <path class="b" d="M40 38 L22 54 M40 38 L56 50"/>
    <path class="b" d="M40 60 L82 78"/>
    <circle cx="82" cy="78" r="3" class="j"/>
    <path class="b" d="M40 60 L22 90 L22 104"/>
    <path class="b" d="M14 104 L30 104" stroke-width="5"/>
    <path class="a" d="M62 50 Q60 36 76 32" marker-end="url(#arr)"/>
  </svg>`,

  kb: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="42" cy="24" r="9" class="h"/>
    <path class="b" d="M44 33 L50 65"/>
    <ellipse cx="46" cy="48" rx="9" ry="6" class="muscle"/>
    <path class="b" d="M46 38 L74 50"/>
    <path class="b" d="M50 65 L38 92"/>
    <path class="b" d="M50 65 L66 92"/>
    <path class="b" d="M30 104 L46 104" stroke-width="5"/>
    <path class="b" d="M58 104 L74 104" stroke-width="5"/>
    <ellipse cx="86" cy="62" rx="14" ry="14" class="e4"/>
    <path class="b" d="M74 50 L86 56" stroke="#7a4ea0" stroke-width="4"/>
    <path d="M80 50 Q80 44 86 44 Q92 44 92 50" fill="none" stroke="#7a4ea0" stroke-width="3.5"/>
    <rect x="82" y="48" width="8" height="4" rx="1" fill="#7a4ea0"/>
    <path class="a" d="M105 50 Q108 70 95 88" marker-end="url(#arr)"/>
  </svg>`,

  rope: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <path class="a" d="M22 50 Q60 6 98 50" stroke-width="2.5" stroke-dasharray="4 3"/>
    <circle cx="60" cy="24" r="8" class="h"/>
    <path class="b" d="M60 32 L60 60"/>
    <ellipse cx="60" cy="46" rx="9" ry="6" class="muscle"/>
    <path class="b" d="M60 40 L40 50 M60 40 L80 50"/>
    <rect x="34" y="48" width="10" height="6" rx="2" fill="#c0392b"/>
    <rect x="76" y="48" width="10" height="6" rx="2" fill="#c0392b"/>
    <path class="b" d="M60 60 L50 84 M60 60 L70 84"/>
    <path class="b" d="M44 96 L56 96 M64 96 L76 96" stroke-width="5"/>
    <path class="b" d="M50 84 L50 96 M70 84 L70 96"/>
  </svg>`,

  cardio: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="62" cy="22" r="9" class="h"/>
    <path class="b" d="M60 31 L52 58"/>
    <ellipse cx="56" cy="45" rx="10" ry="6" class="muscle"/>
    <path class="b" d="M58 38 L36 32 M58 38 L82 58"/>
    <path class="b" d="M52 58 L32 80 L24 78"/>
    <path class="b" d="M52 58 L72 88 L80 104"/>
    <path class="b" d="M74 104 L88 104" stroke-width="5"/>
    <path class="a" d="M88 90 L102 78" marker-end="url(#arr)"/>
  </svg>`,

  carry: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="60" cy="20" r="9" class="h"/>
    <path class="b" d="M60 29 L60 68"/>
    <ellipse cx="60" cy="46" rx="10" ry="7" class="muscle"/>
    <path class="b" d="M60 36 L36 36 L36 64 M60 36 L84 36 L84 64"/>
    <path class="b" d="M60 68 L46 96 L46 104 M60 68 L74 96 L74 104"/>
    <path class="b" d="M38 104 L54 104 M66 104 L82 104" stroke-width="5"/>
    <rect x="26" y="64" width="20" height="14" rx="2" class="e4"/>
    <rect x="74" y="64" width="20" height="14" rx="2" class="e4"/>
  </svg>`,

  twist: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="40" cy="30" r="9" class="h"/>
    <path class="b" d="M44 36 L62 64"/>
    <ellipse cx="55" cy="52" rx="13" ry="6" class="muscle" transform="rotate(45 55 52)"/>
    <path class="b" d="M44 36 L78 50"/>
    <ellipse cx="86" cy="48" rx="6" ry="6" class="e2"/>
    <path class="b" d="M62 64 L48 88 L48 100 M62 64 L74 88 L74 100"/>
    <path class="b" d="M40 100 L56 100 M66 100 L82 100" stroke-width="5"/>
    <path class="a" d="M28 22 Q14 38 22 56" marker-end="url(#arr)"/>
  </svg>`,

  mobility: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="105" x2="110" y2="105" class="g"/>
    <circle cx="60" cy="24" r="8" class="h"/>
    <path class="b" d="M60 32 L60 60"/>
    <path class="b" d="M60 38 L30 56 M60 38 L90 56"/>
    <ellipse cx="60" cy="50" rx="9" ry="6" class="muscle"/>
    <path class="b" d="M60 60 Q40 78 30 95 M60 60 Q80 78 90 95"/>
    <path class="b" d="M22 95 L36 95 M84 95 L98 95" stroke-width="5"/>
    <path class="a" d="M30 70 Q60 50 90 70" stroke-dasharray="2 4"/>
  </svg>`,

  band: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="60" cy="22" r="9" class="h"/>
    <path class="b" d="M60 31 L60 64"/>
    <ellipse cx="60" cy="46" rx="10" ry="7" class="muscle"/>
    <path class="b" d="M60 38 L42 54 M60 38 L78 54"/>
    <path d="M30 60 Q60 50 90 60" stroke="#2c6db5" stroke-width="3" fill="none" stroke-dasharray="4 3"/>
    <circle cx="30" cy="60" r="4" fill="#2c6db5"/>
    <circle cx="90" cy="60" r="4" fill="#2c6db5"/>
    <path class="b" d="M60 64 L48 92 L48 104 M60 64 L72 92 L72 104"/>
    <path class="b" d="M40 104 L56 104 M64 104 L80 104" stroke-width="5"/>
  </svg>`,

  swiss: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="80" cy="78" r="26" fill="#e0ecf8" stroke="#2c6db5" stroke-width="2"/>
    <ellipse cx="65" cy="68" rx="10" ry="3" fill="#fff" opacity=".5"/>
    <circle cx="30" cy="36" r="8" class="h"/>
    <path class="b" d="M30 44 L40 76"/>
    <ellipse cx="35" cy="60" rx="9" ry="6" class="muscle" transform="rotate(15 35 60)"/>
    <path class="b" d="M30 50 L14 52 M30 50 L20 76"/>
    <path class="b" d="M40 76 L62 84"/>
    <path class="a" d="M48 96 Q80 100 100 78" marker-end="url(#arr)"/>
  </svg>`,

  rotate: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">${SVG_DEFS}
    <line x1="10" y1="108" x2="110" y2="108" class="g"/>
    <circle cx="60" cy="22" r="9" class="h"/>
    <path class="b" d="M60 31 L60 64"/>
    <ellipse cx="60" cy="46" rx="10" ry="7" class="muscle"/>
    <path class="b" d="M60 38 L40 32 M60 38 L80 50"/>
    <ellipse cx="84" cy="50" rx="6" ry="6" class="e2"/>
    <path class="b" d="M60 64 L48 92 L48 104 M60 64 L72 92 L72 104"/>
    <path class="b" d="M40 104 L56 104 M64 104 L80 104" stroke-width="5"/>
    <path class="a" d="M28 24 Q12 40 22 60" marker-end="url(#arr)"/>
    <path class="a" d="M92 24 Q108 40 98 60" marker-end="url(#arr)"/>
  </svg>`,
};

const EXERCISES = [
  // ===== QUADRICEPS =====
  { id:'q01', name:'Squat poids du corps', muscles:['Quadriceps','Fessiers','Ischio-jambiers'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'squat',
    cues:'Pieds largeur épaules, descendre comme pour s\'asseoir, genoux alignés avec les orteils, dos droit. Remonter en poussant dans les talons.' },
  { id:'q02', name:'Goblet squat', muscles:['Quadriceps','Fessiers','Adducteurs'], equipment:['Kettlebell','Haltères'], difficulty:'Débutant', svg:'squat',
    cues:'Tenir kettlebell contre la poitrine. Descendre profondément en gardant le buste droit.' },
  { id:'q03', name:'Squat barre arrière (back squat)', muscles:['Quadriceps','Fessiers','Lombaires'], equipment:['Barre'], difficulty:'Intermédiaire', svg:'squat',
    cues:'Barre sur le haut du dos. Engager les omoplates. Descendre cuisses parallèles minimum.' },
  { id:'q04', name:'Front squat', muscles:['Quadriceps','Abdominaux'], equipment:['Barre'], difficulty:'Avancé', svg:'squat',
    cues:'Barre sur l\'avant des épaules, coudes hauts. Buste très droit.' },
  { id:'q05', name:'Squat sumo', muscles:['Quadriceps','Adducteurs','Fessiers'], equipment:['Poids du corps','Haltères'], difficulty:'Débutant', svg:'squat',
    cues:'Pieds très écartés, orteils vers l\'extérieur. Descendre droit en bas.' },
  { id:'q06', name:'Squat sauté', muscles:['Quadriceps','Fessiers','Mollets'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'jump',
    cues:'Squat puis explosion vers le haut. Réception genoux fléchis, silencieuse.' },
  { id:'q07', name:'Fentes avant', muscles:['Quadriceps','Fessiers','Ischio-jambiers'], equipment:['Poids du corps','Haltères'], difficulty:'Débutant', svg:'lunge',
    cues:'Grand pas en avant, genou arrière proche du sol. Pousser sur le talon avant pour revenir.' },
  { id:'q08', name:'Fentes arrière', muscles:['Quadriceps','Fessiers'], equipment:['Poids du corps','Haltères'], difficulty:'Débutant', svg:'lunge',
    cues:'Recul d\'une jambe, genou arrière vers le sol. Plus stable pour les genoux fragiles.' },
  { id:'q09', name:'Fentes bulgares (split squat)', muscles:['Quadriceps','Fessiers'], equipment:['Banc','Haltères'], difficulty:'Intermédiaire', svg:'lunge',
    cues:'Pied arrière surélevé sur banc. Descente verticale, genou avant aligné cheville.' },
  { id:'q10', name:'Fentes marchées', muscles:['Quadriceps','Fessiers','Stabilisateurs'], equipment:['Haltères'], difficulty:'Intermédiaire', svg:'lunge',
    cues:'Enchaîner des fentes vers l\'avant en avançant. Excellent pour la marche.' },
  { id:'q11', name:'Fentes sautées', muscles:['Quadriceps','Fessiers','Mollets'], equipment:['Poids du corps'], difficulty:'Avancé', svg:'jump',
    cues:'Alterner les jambes par un saut explosif. Réception contrôlée.' },
  { id:'q12', name:'Step-up', muscles:['Quadriceps','Fessiers'], equipment:['Box / Step','Haltères'], difficulty:'Débutant', svg:'step',
    cues:'Monter sur le step, toute la plante du pied dessus, redescente contrôlée.' },
  { id:'q13', name:'Step-up explosif (jump step)', muscles:['Quadriceps','Fessiers','Mollets'], equipment:['Box / Step'], difficulty:'Intermédiaire', svg:'step',
    cues:'Montée explosive avec saut. Travail de la puissance pour la marche athlétique.' },
  { id:'q14', name:'Réception de step (drop step)', muscles:['Quadriceps','Stabilisateurs'], equipment:['Box / Step'], difficulty:'Intermédiaire', svg:'step',
    cues:'Descendre du step en réception sur une jambe, absorber l\'impact. Excellent excentrique.' },
  { id:'q15', name:'Chaise (wall sit)', muscles:['Quadriceps'], equipment:['Aucun'], difficulty:'Débutant', svg:'plank',
    cues:'Dos contre un mur, cuisses parallèles au sol. Maintenir la position en isométrie.' },
  { id:'q16', name:'Chaise lestée', muscles:['Quadriceps'], equipment:['Haltères','Kettlebell'], difficulty:'Intermédiaire', svg:'plank',
    cues:'Position chaise avec charge sur les cuisses.' },
  { id:'q17', name:'Pistol squat', muscles:['Quadriceps','Fessiers','Stabilisateurs'], equipment:['Poids du corps'], difficulty:'Avancé', svg:'squat',
    cues:'Squat sur une seule jambe, autre jambe tendue devant.' },
  { id:'q18', name:'Squat à l\'élastique', muscles:['Quadriceps','Fessiers','Abducteurs'], equipment:['Élastique'], difficulty:'Débutant', svg:'band',
    cues:'Mini-band au-dessus des genoux. Pousser les genoux vers l\'extérieur en descendant.' },
  { id:'q19', name:'Leg extension machine', muscles:['Quadriceps'], equipment:['Machine'], difficulty:'Débutant', svg:'squat',
    cues:'Isolation du quadriceps. Contrôler la descente.' },
  { id:'q20', name:'Squat tempo lent (3-2-1)', muscles:['Quadriceps','Fessiers'], equipment:['Poids du corps','Haltères'], difficulty:'Intermédiaire', svg:'squat',
    cues:'Descente 3s, pause 2s, remontée 1s. Travail du contrôle.' },

  // ===== ISCHIO-JAMBIERS =====
  { id:'i01', name:'Soulevé de terre roumain (RDL)', muscles:['Ischio-jambiers','Fessiers','Lombaires'], equipment:['Barre','Haltères'], difficulty:'Intermédiaire', svg:'hinge',
    cues:'Charnière de hanche, jambes peu fléchies, dos droit, sentir les ischios s\'étirer.' },
  { id:'i02', name:'Soulevé de terre kettlebell (SDT KB)', muscles:['Ischio-jambiers','Fessiers'], equipment:['Kettlebell'], difficulty:'Débutant', svg:'hinge',
    cues:'KB entre les pieds, charnière de hanche, dos plat, descendre en gardant le poids près du corps.' },
  { id:'i03', name:'Good morning', muscles:['Ischio-jambiers','Lombaires'], equipment:['Barre','Élastique'], difficulty:'Intermédiaire', svg:'hinge',
    cues:'Barre haut du dos, basculer le buste vers l\'avant à partir des hanches.' },
  { id:'i04', name:'Nordic curl', muscles:['Ischio-jambiers'], equipment:['Aucun'], difficulty:'Avancé', svg:'hinge',
    cues:'À genoux, pieds bloqués. Descendre lentement vers l\'avant en résistant.' },
  { id:'i05', name:'Glute-ham raise', muscles:['Ischio-jambiers','Fessiers'], equipment:['Machine'], difficulty:'Avancé', svg:'hinge',
    cues:'Pieds bloqués, descendre et remonter en utilisant les ischios.' },
  { id:'i06', name:'Leg curl couché', muscles:['Ischio-jambiers'], equipment:['Machine'], difficulty:'Débutant', svg:'hinge',
    cues:'Isoler les ischios. Contrôler la descente.' },
  { id:'i07', name:'Swiss ball curl', muscles:['Ischio-jambiers','Fessiers'], equipment:['Swiss ball'], difficulty:'Intermédiaire', svg:'swiss',
    cues:'Allongé au sol, talons sur le ballon. Rouler le ballon vers les fesses.' },
  { id:'i08', name:'SDT jambes tendues haltères', muscles:['Ischio-jambiers'], equipment:['Haltères'], difficulty:'Intermédiaire', svg:'hinge',
    cues:'Variation RDL avec haltères, jambes presque tendues.' },
  { id:'i09', name:'Single-leg RDL', muscles:['Ischio-jambiers','Fessiers','Stabilisateurs'], equipment:['Haltères','Kettlebell'], difficulty:'Intermédiaire', svg:'hinge',
    cues:'Sur une jambe, charnière de hanche, jambe libre tendue derrière.' },

  // ===== FESSIERS =====
  { id:'f01', name:'Pont fessier (hip thrust au sol)', muscles:['Fessiers','Ischio-jambiers'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'bridge',
    cues:'Allongé, talons proches des fessiers. Pousser le bassin vers le haut, contracter en haut.' },
  { id:'f02', name:'Hip thrust banc', muscles:['Fessiers','Ischio-jambiers'], equipment:['Banc','Barre','Haltères'], difficulty:'Intermédiaire', svg:'bridge',
    cues:'Épaules sur banc, barre sur les hanches. Extension complète des hanches.' },
  { id:'f03', name:'Pont fessier sur une jambe', muscles:['Fessiers'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'bridge',
    cues:'Pont avec une jambe levée. Travail unilatéral.' },
  { id:'f04', name:'Pont fessier élastique', muscles:['Fessiers','Abducteurs'], equipment:['Élastique'], difficulty:'Débutant', svg:'band',
    cues:'Élastique au-dessus des genoux. Pousser vers l\'extérieur en haut du pont.' },
  { id:'f05', name:'Pont fessier tempo lent', muscles:['Fessiers'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'bridge',
    cues:'3s en haut, 3s descente. Activation maximale.' },
  { id:'f06', name:'Hip abduction élastique', muscles:['Abducteurs','Fessiers'], equipment:['Élastique'], difficulty:'Débutant', svg:'band',
    cues:'Allongé sur le côté ou debout, ouvrir la jambe contre la résistance.' },
  { id:'f07', name:'Clamshells (coquillage)', muscles:['Abducteurs','Fessiers'], equipment:['Élastique'], difficulty:'Débutant', svg:'band',
    cues:'Allongé sur le côté, genoux pliés. Ouvrir le genou supérieur.' },
  { id:'f08', name:'Marche latérale élastique', muscles:['Abducteurs','Fessiers'], equipment:['Élastique'], difficulty:'Débutant', svg:'band',
    cues:'Mini-band aux chevilles, marche latérale tension constante.' },
  { id:'f09', name:'Donkey kicks', muscles:['Fessiers'], equipment:['Poids du corps','Élastique'], difficulty:'Débutant', svg:'band',
    cues:'À 4 pattes, pousser un talon vers le plafond, jambe pliée.' },
  { id:'f10', name:'Fire hydrants', muscles:['Abducteurs','Fessiers'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'band',
    cues:'À 4 pattes, ouvrir la jambe sur le côté.' },
  { id:'f11', name:'Hip thrust unilatéral', muscles:['Fessiers'], equipment:['Banc','Haltères'], difficulty:'Avancé', svg:'bridge',
    cues:'Hip thrust sur une seule jambe.' },

  // ===== MOLLETS =====
  { id:'m01', name:'Élévation mollets debout', muscles:['Mollets'], equipment:['Poids du corps','Haltères'], difficulty:'Débutant', svg:'lunge',
    cues:'Sur la pointe des pieds, contraction haute, descente contrôlée.' },
  { id:'m02', name:'Élévation mollets sur step', muscles:['Mollets'], equipment:['Box / Step'], difficulty:'Débutant', svg:'step',
    cues:'Talons dans le vide pour amplitude maximale.' },
  { id:'m03', name:'Isométrie mollets', muscles:['Mollets'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'plank',
    cues:'Sur la pointe des pieds, maintenir la position. Excellent pour la marche.' },
  { id:'m04', name:'Mollets assis (soleus)', muscles:['Mollets'], equipment:['Banc','Haltères'], difficulty:'Débutant', svg:'lunge',
    cues:'Assis, charges sur les genoux. Cible le soléaire.' },
  { id:'m05', name:'Mollets une jambe', muscles:['Mollets','Stabilisateurs'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'lunge',
    cues:'Travail unilatéral. Amplitude complète.' },
  { id:'m06', name:'Saut à la corde mollets', muscles:['Mollets','Cardio'], equipment:['Corde à sauter'], difficulty:'Débutant', svg:'rope',
    cues:'Petits sauts rapides, atterrissage sur la plante des pieds.' },

  // ===== PECTORAUX =====
  { id:'p01', name:'Pompes', muscles:['Pectoraux','Triceps','Deltoïdes'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'push',
    cues:'Mains largeur épaules, corps gainé, descendre poitrine au sol.' },
  { id:'p02', name:'Pompes genoux', muscles:['Pectoraux','Triceps'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'push',
    cues:'Variation accessible, sur les genoux.' },
  { id:'p03', name:'Pompes inclinées', muscles:['Pectoraux'], equipment:['Banc','Box / Step'], difficulty:'Débutant', svg:'push',
    cues:'Mains sur un support surélevé. Plus accessible.' },
  { id:'p04', name:'Pompes déclinées', muscles:['Pectoraux','Deltoïdes'], equipment:['Banc'], difficulty:'Intermédiaire', svg:'push',
    cues:'Pieds surélevés. Cible le haut des pecs.' },
  { id:'p05', name:'Développé couché barre', muscles:['Pectoraux','Triceps','Deltoïdes'], equipment:['Barre','Banc'], difficulty:'Intermédiaire', svg:'push',
    cues:'Allongé, barre au niveau de la poitrine, pousser vers le haut.' },
  { id:'p06', name:'Développé haltères', muscles:['Pectoraux','Triceps'], equipment:['Haltères','Banc'], difficulty:'Débutant', svg:'push',
    cues:'Mouvement libre. Amplitude maximale.' },
  { id:'p07', name:'Écarté haltères', muscles:['Pectoraux'], equipment:['Haltères','Banc'], difficulty:'Intermédiaire', svg:'push',
    cues:'Bras légèrement fléchis, ouvrir en arc de cercle.' },
  { id:'p08', name:'Dips poitrine', muscles:['Pectoraux','Triceps'], equipment:['Aucun'], difficulty:'Avancé', svg:'push',
    cues:'Buste penché en avant. Cible les pecs.' },
  { id:'p09', name:'Pompes diamant', muscles:['Triceps','Pectoraux'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'push',
    cues:'Mains rapprochées formant un diamant.' },

  // ===== DORSAUX =====
  { id:'d01', name:'Tractions', muscles:['Dorsaux','Biceps','Trapèzes'], equipment:['Aucun'], difficulty:'Avancé', svg:'pull',
    cues:'Suspension, tirer le menton au-dessus de la barre.' },
  { id:'d02', name:'Tractions assistées élastique', muscles:['Dorsaux','Biceps'], equipment:['Élastique'], difficulty:'Intermédiaire', svg:'pull',
    cues:'Élastique sous les pieds pour assister la montée.' },
  { id:'d03', name:'Tirage horizontal TRX', muscles:['Dorsaux','Biceps','Trapèzes'], equipment:['TRX'], difficulty:'Débutant', svg:'pull',
    cues:'Suspendu sous le TRX, tirer la poitrine vers les mains.' },
  { id:'d04', name:'Rowing haltère un bras', muscles:['Dorsaux','Biceps'], equipment:['Haltères','Banc'], difficulty:'Débutant', svg:'pull',
    cues:'Un genou et une main sur le banc, tirer l\'haltère vers la hanche.' },
  { id:'d05', name:'Rowing barre', muscles:['Dorsaux','Trapèzes','Biceps'], equipment:['Barre'], difficulty:'Intermédiaire', svg:'pull',
    cues:'Buste penché à 45°, tirer la barre au bas de la poitrine.' },
  { id:'d06', name:'Pull-over haltère', muscles:['Dorsaux','Pectoraux'], equipment:['Haltères','Banc'], difficulty:'Intermédiaire', svg:'pull',
    cues:'Allongé, descendre l\'haltère derrière la tête, ramener au-dessus.' },
  { id:'d07', name:'Tirage élastique', muscles:['Dorsaux','Biceps'], equipment:['Élastique'], difficulty:'Débutant', svg:'band',
    cues:'Élastique fixé, tirer vers le buste, coudes serrés.' },
  { id:'d08', name:'Superman', muscles:['Lombaires','Dorsaux','Fessiers'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'plank',
    cues:'Allongé sur le ventre, lever bras et jambes simultanément.' },

  // ===== ÉPAULES =====
  { id:'e01', name:'Développé militaire haltères', muscles:['Deltoïdes','Triceps'], equipment:['Haltères'], difficulty:'Débutant', svg:'push',
    cues:'Haltères au niveau des épaules, pousser au-dessus de la tête.' },
  { id:'e02', name:'Élévation latérale', muscles:['Deltoïdes'], equipment:['Haltères','Élastique'], difficulty:'Débutant', svg:'push',
    cues:'Bras légèrement pliés, lever sur les côtés jusqu\'à l\'horizontal.' },
  { id:'e03', name:'Élévation frontale', muscles:['Deltoïdes'], equipment:['Haltères'], difficulty:'Débutant', svg:'push',
    cues:'Lever les bras devant soi.' },
  { id:'e04', name:'Oiseau (rear delt)', muscles:['Deltoïdes','Trapèzes'], equipment:['Haltères'], difficulty:'Débutant', svg:'push',
    cues:'Buste penché, lever les bras sur les côtés. Cible le deltoïde postérieur.' },
  { id:'e05', name:'Face pull élastique', muscles:['Deltoïdes','Trapèzes'], equipment:['Élastique'], difficulty:'Débutant', svg:'band',
    cues:'Tirer l\'élastique vers le visage, coudes hauts.' },
  { id:'e06', name:'Push press', muscles:['Deltoïdes','Triceps','Quadriceps'], equipment:['Haltères','Barre','Kettlebell'], difficulty:'Intermédiaire', svg:'push',
    cues:'Impulsion des jambes pour lancer la charge au-dessus de la tête.' },

  // ===== BICEPS =====
  { id:'b01', name:'Curl haltères', muscles:['Biceps'], equipment:['Haltères'], difficulty:'Débutant', svg:'pull',
    cues:'Bras le long du corps, fléchir vers les épaules.' },
  { id:'b02', name:'Curl marteau', muscles:['Biceps','Avant-bras'], equipment:['Haltères'], difficulty:'Débutant', svg:'pull',
    cues:'Prise neutre, paume face au corps.' },
  { id:'b03', name:'Curl barre', muscles:['Biceps'], equipment:['Barre'], difficulty:'Débutant', svg:'pull',
    cues:'Barre prise supination, monter à la poitrine.' },
  { id:'b04', name:'Curl élastique', muscles:['Biceps'], equipment:['Élastique'], difficulty:'Débutant', svg:'band',
    cues:'Élastique sous les pieds, fléchir les bras.' },
  { id:'b05', name:'Curl Zottman', muscles:['Biceps','Avant-bras'], equipment:['Haltères'], difficulty:'Intermédiaire', svg:'pull',
    cues:'Montée supination, redescente pronation.' },

  // ===== TRICEPS =====
  { id:'t01', name:'Dips banc', muscles:['Triceps','Pectoraux'], equipment:['Banc'], difficulty:'Débutant', svg:'push',
    cues:'Mains derrière sur banc, descendre et remonter.' },
  { id:'t02', name:'Extension triceps haltère', muscles:['Triceps'], equipment:['Haltères'], difficulty:'Débutant', svg:'push',
    cues:'Haltère derrière la tête, étendre les bras.' },
  { id:'t03', name:'Kickback triceps', muscles:['Triceps'], equipment:['Haltères'], difficulty:'Débutant', svg:'push',
    cues:'Buste penché, étendre le bras vers l\'arrière.' },
  { id:'t04', name:'Pompes diamant', muscles:['Triceps','Pectoraux'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'push',
    cues:'Mains rapprochées formant un diamant.' },
  { id:'t05', name:'Extension triceps élastique', muscles:['Triceps'], equipment:['Élastique'], difficulty:'Débutant', svg:'band',
    cues:'Élastique haut, pousser vers le bas.' },

  // ===== ABDOMINAUX =====
  { id:'a01', name:'Planche / gainage', muscles:['Abdominaux','Lombaires','Stabilisateurs'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'plank',
    cues:'Avant-bras au sol, corps aligné de la tête aux pieds.' },
  { id:'a02', name:'Planche latérale', muscles:['Obliques','Abdominaux'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'plank',
    cues:'Sur un coude, hanches hautes, alignement.' },
  { id:'a03', name:'Crunchs', muscles:['Abdominaux'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'plank',
    cues:'Allongé, décoller les épaules vers les genoux.' },
  { id:'a04', name:'Crunchs Swiss ball', muscles:['Abdominaux'], equipment:['Swiss ball'], difficulty:'Intermédiaire', svg:'swiss',
    cues:'Sur le ballon, amplitude étendue.' },
  { id:'a05', name:'Roulade ab wheel', muscles:['Abdominaux','Stabilisateurs'], equipment:['Aucun'], difficulty:'Avancé', svg:'plank',
    cues:'Rouler la roue vers l\'avant, revenir contrôlé.' },
  { id:'a06', name:'Dead bug', muscles:['Abdominaux','Stabilisateurs'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'plank',
    cues:'Allongé, jambes et bras pliés vers le plafond, alterner extension.' },
  { id:'a07', name:'Hollow hold', muscles:['Abdominaux'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'plank',
    cues:'Allongé, jambes et épaules décollées, lombaires plaquées.' },
  { id:'a08', name:'V-sit', muscles:['Abdominaux'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'plank',
    cues:'Position en V, équilibre sur les fessiers.' },
  { id:'a09', name:'Mountain climbers', muscles:['Abdominaux','Cardio'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'cardio',
    cues:'Position de planche, ramener alternativement les genoux à la poitrine.' },
  { id:'a10', name:'Russian twist', muscles:['Obliques','Abdominaux'], equipment:['Poids du corps','Médecine ball','Kettlebell'], difficulty:'Débutant', svg:'twist',
    cues:'Assis, pencher en arrière, rotation du buste avec charge.' },
  { id:'a11', name:'Wood chopper', muscles:['Obliques','Abdominaux'], equipment:['Élastique','Médecine ball'], difficulty:'Intermédiaire', svg:'twist',
    cues:'Mouvement diagonal de bûcheron, rotation buste.' },
  { id:'a12', name:'Pallof press', muscles:['Abdominaux','Obliques','Stabilisateurs'], equipment:['Élastique'], difficulty:'Intermédiaire', svg:'band',
    cues:'Anti-rotation. Tendre les bras devant soi contre la résistance latérale.' },
  { id:'a13', name:'Bird dog', muscles:['Lombaires','Abdominaux','Stabilisateurs'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'plank',
    cues:'À 4 pattes, étendre bras opposé à jambe.' },
  { id:'a14', name:'Planche dynamique (planches walk)', muscles:['Abdominaux','Deltoïdes'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'plank',
    cues:'Passer de planche coudes à planche bras tendus.' },

  // ===== CARDIO / EXPLOSIVITÉ =====
  { id:'c01', name:'Corde à sauter (saut basique)', muscles:['Mollets','Cardio','Stabilisateurs'], equipment:['Corde à sauter'], difficulty:'Débutant', svg:'rope',
    cues:'Petits sauts, atterrissage sur la plante. 1-2 cm du sol.' },
  { id:'c02', name:'Corde à sauter (alternance)', muscles:['Mollets','Cardio'], equipment:['Corde à sauter'], difficulty:'Intermédiaire', svg:'rope',
    cues:'Saut alterné, comme un footing sur place.' },
  { id:'c03', name:'Corde à sauter (double under)', muscles:['Mollets','Cardio'], equipment:['Corde à sauter'], difficulty:'Avancé', svg:'rope',
    cues:'Deux passages de corde par saut.' },
  { id:'c04', name:'Burpees', muscles:['Cardio','Quadriceps','Pectoraux'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'jump',
    cues:'Squat - planche - pompe - squat - saut.' },
  { id:'c05', name:'Jumping jacks', muscles:['Cardio','Mollets'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'jump',
    cues:'Sauts en écartant bras et jambes.' },
  { id:'c06', name:'High knees', muscles:['Cardio','Quadriceps'], equipment:['Poids du corps'], difficulty:'Débutant', svg:'cardio',
    cues:'Genoux hauts sur place, rythme rapide.' },
  { id:'c07', name:'Broad jump (saut en longueur)', muscles:['Quadriceps','Fessiers','Mollets'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'jump',
    cues:'Saut horizontal, réception contrôlée.' },
  { id:'c08', name:'Box jump', muscles:['Quadriceps','Fessiers','Mollets'], equipment:['Box / Step'], difficulty:'Intermédiaire', svg:'jump',
    cues:'Sauter sur la box, réception genoux fléchis.' },
  { id:'c09', name:'Saut vertical', muscles:['Quadriceps','Fessiers','Mollets'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'jump',
    cues:'Saut le plus haut possible, bras pour la propulsion.' },
  { id:'c10', name:'KB swing', muscles:['Fessiers','Ischio-jambiers','Cardio'], equipment:['Kettlebell'], difficulty:'Débutant', svg:'kb',
    cues:'Hip hinge, projeter le kettlebell à hauteur d\'épaules par la poussée des hanches.' },
  { id:'c11', name:'KB clean & press', muscles:['Cardio','Deltoïdes','Quadriceps'], equipment:['Kettlebell'], difficulty:'Intermédiaire', svg:'kb',
    cues:'Tirer le kettlebell jusqu\'au rack, puis pousser au-dessus.' },
  { id:'c12', name:'Snatch kettlebell', muscles:['Cardio','Deltoïdes','Dorsaux'], equipment:['Kettlebell'], difficulty:'Avancé', svg:'kb',
    cues:'Du sol au-dessus de la tête en un mouvement.' },
  { id:'c13', name:'Skater jumps', muscles:['Fessiers','Stabilisateurs','Cardio'], equipment:['Poids du corps'], difficulty:'Intermédiaire', svg:'jump',
    cues:'Sauts latéraux d\'un pied à l\'autre.' },

  // ===== MOBILITÉ / MOUVEMENT =====
  { id:'mb01', name:'Cat-cow', muscles:['Mobilité','Lombaires'], equipment:['Aucun'], difficulty:'Débutant', svg:'mobility',
    cues:'À 4 pattes, alterner dos rond / dos creux. Mobilité de la colonne.' },
  { id:'mb02', name:'World\'s greatest stretch', muscles:['Mobilité'], equipment:['Aucun'], difficulty:'Débutant', svg:'mobility',
    cues:'Fente, rotation buste, étirement complet.' },
  { id:'mb03', name:'Rotation thoracique', muscles:['Mobilité'], equipment:['Aucun'], difficulty:'Débutant', svg:'mobility',
    cues:'À 4 pattes, ouvrir un bras vers le ciel.' },
  { id:'mb04', name:'90/90 hip stretch', muscles:['Mobilité'], equipment:['Aucun'], difficulty:'Débutant', svg:'mobility',
    cues:'Hanches à 90°, mobilité de la hanche.' },
  { id:'mb05', name:'Jefferson curl', muscles:['Lombaires','Mobilité','Ischio-jambiers'], equipment:['Haltères'], difficulty:'Intermédiaire', svg:'hinge',
    cues:'Flexion vertèbre par vertèbre avec petite charge. Mobilité chaîne postérieure.' },
  { id:'mb06', name:'Pigeon pose', muscles:['Mobilité','Fessiers'], equipment:['Aucun'], difficulty:'Débutant', svg:'mobility',
    cues:'Étirement profond du fessier et du psoas.' },
  { id:'mb07', name:'Squat à plat (deep squat hold)', muscles:['Mobilité','Adducteurs'], equipment:['Aucun'], difficulty:'Débutant', svg:'squat',
    cues:'Position basse de squat tenue. Mobilité hanche / cheville.' },
  { id:'mb08', name:'Étirement ischios couché', muscles:['Mobilité','Ischio-jambiers'], equipment:['Élastique'], difficulty:'Débutant', svg:'mobility',
    cues:'Allongé, jambe tendue vers le ciel avec élastique.' },
  { id:'mb09', name:'Hip CARs', muscles:['Mobilité'], equipment:['Aucun'], difficulty:'Débutant', svg:'mobility',
    cues:'Rotations contrôlées de hanche. Excellent réveil articulaire.' },
  { id:'mb10', name:'Étirement mollets (mur)', muscles:['Mobilité','Mollets'], equipment:['Aucun'], difficulty:'Débutant', svg:'mobility',
    cues:'Mains au mur, jambe tendue derrière, talon au sol.' },

  // ===== PORT/CARRY =====
  { id:'cr01', name:'Farmer carry', muscles:['Trapèzes','Avant-bras','Stabilisateurs'], equipment:['Haltères','Kettlebell'], difficulty:'Débutant', svg:'carry',
    cues:'Marcher avec charges lourdes dans chaque main. Posture droite.' },
  { id:'cr02', name:'Suitcase carry', muscles:['Obliques','Stabilisateurs'], equipment:['Haltères','Kettlebell'], difficulty:'Débutant', svg:'carry',
    cues:'Charge dans une seule main. Anti-flexion latérale.' },
  { id:'cr03', name:'Overhead carry', muscles:['Deltoïdes','Stabilisateurs'], equipment:['Kettlebell','Haltères'], difficulty:'Intermédiaire', svg:'carry',
    cues:'Charge tenue au-dessus de la tête en marchant.' },

  // ===== TRAVAIL CHEVILLE / STABILISATEURS (clé pour marche longue) =====
  { id:'st01', name:'Équilibre sur une jambe', muscles:['Stabilisateurs','Mollets'], equipment:['Aucun'], difficulty:'Débutant', svg:'plank',
    cues:'Sur une jambe yeux ouverts puis fermés. Progression : surface instable.' },
  { id:'st02', name:'Single leg balance + reach', muscles:['Stabilisateurs','Fessiers'], equipment:['Aucun'], difficulty:'Intermédiaire', svg:'plank',
    cues:'Sur une jambe, basculer vers l\'avant et toucher le sol.' },
  { id:'st03', name:'Marche du fermier sur une ligne', muscles:['Stabilisateurs'], equipment:['Haltères','Kettlebell'], difficulty:'Intermédiaire', svg:'carry',
    cues:'Marche talon-pointe sur une ligne avec charges.' },
  { id:'st04', name:'Cheville inversion / éversion élastique', muscles:['Stabilisateurs'], equipment:['Élastique'], difficulty:'Débutant', svg:'band',
    cues:'Renforcer la cheville dans tous les plans.' },
  { id:'st05', name:'Toe yoga', muscles:['Stabilisateurs'], equipment:['Aucun'], difficulty:'Débutant', svg:'mobility',
    cues:'Lever le gros orteil sans bouger les autres, et inversement.' },
];

// expose globalement
window.MUSCLE_GROUPS = MUSCLE_GROUPS;
window.EQUIPMENT_TYPES = EQUIPMENT_TYPES;
window.EX_SVG = EX_SVG;
window.EXERCISES = EXERCISES;
