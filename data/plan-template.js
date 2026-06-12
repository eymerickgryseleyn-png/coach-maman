// Modèle de planification basé sur l'Excel "Plannif 50km marche maman"

const MACROCYCLES = ['Période de préparation','Période Affutage et compétition','Période de transition','Hors saison'];

const MESOCYCLES = [
  'Préparation spécifique',
  'Développement charge progressive',
  'Développement charge dégressive',
  'Maintien',
  'Affutage',
  'Compétition'
];

const MICROCYCLES = ['Graduel','Approche','Développement','Choc','Récupération','Compétition'];

const QUALITES_PHYSIQUES = [
  'Capacité aérobie',
  'Puissance aérobie',
  'Endurance spécifique',
  'Consolidation spécifique',
  'Aérobie spécifique courte',
  'Endurance force',
  'Puissance force',
  'Force max',
  'Vitesse',
  'Musculation',
  'Mobilité'
];

const TYPES_SEANCE = ['Marche','Renfo','CAP','Mobilité','Jujitsu','Compétition','Repos'];

// Plan initial - structure inspirée du fichier Excel
// 24 semaines de préparation type
const DEFAULT_PLAN = {
  athlete: {
    name: 'Maman',
    age: 53,
    job: 'Aide-soignante',
    objective: '50 km marche',
    objectiveDate: ''
  },
  // début du cycle (lundi)
  startDate: '2025-12-01',
  weeks: Array.from({length: 24}, (_, i) => {
    let macro = 'Période de préparation';
    let meso, micro;
    if (i < 4) { meso = 'Préparation spécifique'; micro = 'Graduel'; }
    else if (i < 10) { meso = 'Développement charge progressive'; micro = 'Développement'; }
    else if (i < 14) { meso = 'Développement charge dégressive'; micro = 'Choc'; }
    else if (i < 18) { meso = 'Maintien'; micro = 'Approche'; }
    else if (i < 22) { meso = 'Affutage'; micro = 'Récupération'; }
    else { meso = 'Compétition'; micro = 'Compétition'; macro = 'Période Affutage et compétition'; }
    return {
      n: i + 1,
      macro, meso, micro,
      quality: i < 10 ? 'Capacité aérobie' : i < 16 ? 'Puissance aérobie' : 'Endurance spécifique',
      note: ''
    };
  })
};

// Séances exemples (extraites de l'Excel)
const SAMPLE_SESSIONS = [
  { week:1, day:1, type:'Marche', title:'Marche continue + retour au calme', qualite:'Capacité aérobie',
    objectif:'Améliorer la capacité aérobie',
    duree:60, rpe:3,
    details:"15' Échauffement\n35' marche continue\n10' retour au calme\nRPE cible 3 - 4" },
  { week:1, day:2, type:'Renfo', title:'Renfo membres inférieurs', qualite:'Endurance force',
    objectif:'Renforcer les membres inférieurs', duree:45, rpe:4,
    details:"12' mobilité\n6 x 30-30 chaise\n3 x 12 Squat tempo lent\n3 x 10 fentes bulgares tempo lent\n3 x 10 pont fessier tempo lent\nGainage 6 - 7'" },
  { week:1, day:3, type:'Marche', title:'Marche + cadence', qualite:'Travail cadence et technique',
    objectif:'Travail cadence',
    duree:65, rpe:4,
    details:"15' Échauffement\n35' marche continue\n6 x 100 cadence rapide\n5' retour au calme\nRPE cible 3-4" },
  { week:1, day:4, type:'Marche', title:'Sortie longue', qualite:'Endurance', objectif:'Amélioration de la capacité aérobie',
    duree:90, rpe:3,
    details:"Sortie longue\n15' échauffement\n75' marche continue\nRPE cible 3" },

  { week:2, day:1, type:'Marche', title:'Sortie 70\'', qualite:'Capacité aérobie', objectif:'Capacité aérobie',
    duree:70, rpe:4,
    details:"Sortie 70'\n3 x 10' @ RPE 4 - 5\nRécup 3'\n15' facile" },
  { week:2, day:2, type:'Renfo', title:'Renfo + corde à sauter', qualite:'Endurance force',
    objectif:'Renforcement',
    duree:50, rpe:5,
    details:"Mobilité 10'\nCorde à sauter 6 x 1'\n4 x 6 Squat sauté\n3 x 6 SDT KB\n3 x 6 réception de step\nCircuit gainage" },
  { week:2, day:3, type:'Marche', title:'Sortie continue 75\'', qualite:'Capacité aérobie',
    objectif:'Endurance',
    duree:75, rpe:3,
    details:"Sortie 75'\n10' échauffement\n60' rythme continu\n5' retour au calme\nRPE 3" },
  { week:2, day:4, type:'Marche', title:'Sortie longue 120\'', qualite:'Endurance',
    objectif:'Capacité aérobie',
    duree:120, rpe:3,
    details:"Sortie 120'\n15' facile\n90' régulier\n15' calme\nRPE 3" },
];

// Wellness - 5 questions clés (validé scientifiquement, Hooper-Mackinnon adapté)
const WELLNESS_QUESTIONS = [
  { id:'sleep', label:'Qualité du sommeil', hint:'Comment as-tu dormi ?',
    labels:['Très mauvais','Mauvais','Moyen','Bon','Excellent'] },
  { id:'fatigue', label:'Niveau de fatigue', hint:'Énergie ressentie ce matin',
    labels:['Très fatigué','Fatigué','Normal','En forme','Très en forme'] },
  { id:'soreness', label:'Courbatures / douleurs', hint:'Sensations musculaires',
    labels:['Très douloureux','Douloureux','Présent','Léger','Aucune'] },
  { id:'stress', label:'Stress', hint:'Niveau de stress mental',
    labels:['Très stressée','Stressée','Normale','Détendue','Très détendue'] },
  { id:'mood', label:'Humeur', hint:'Comment te sens-tu ?',
    labels:['Très bas','Bas','Moyen','Bon','Très bon'] },
];

window.MACROCYCLES = MACROCYCLES;
window.MESOCYCLES = MESOCYCLES;
window.MICROCYCLES = MICROCYCLES;
window.QUALITES_PHYSIQUES = QUALITES_PHYSIQUES;
window.TYPES_SEANCE = TYPES_SEANCE;
window.DEFAULT_PLAN = DEFAULT_PLAN;
window.SAMPLE_SESSIONS = SAMPLE_SESSIONS;
window.WELLNESS_QUESTIONS = WELLNESS_QUESTIONS;
