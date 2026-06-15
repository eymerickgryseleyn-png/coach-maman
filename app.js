// ============================================================
// COACH MAMAN - app.js v2 (multi-athlètes, PWA, GPX, photos, coach, PDF)
// ============================================================

const STORAGE_KEY = 'coachmaman.v1';

function blankAthlete(name = 'Athlète') {
  return {
    profile: {
      name, age: '', job: '', objective: '', objectiveDate: '',
      restHR: 60, maxHR: 170
    },
    startDate: DEFAULT_PLAN.startDate,
    weeks: JSON.parse(JSON.stringify(DEFAULT_PLAN.weeks)),
    sessions: JSON.parse(JSON.stringify(SAMPLE_SESSIONS)),
    workDays: {},
    wellness: [],
    done: {},
    records: []
  };
}

const defaultState = () => ({
  _v: 2,
  athletes: {
    'maman': {
      ...blankAthlete('Maman'),
      profile: { ...DEFAULT_PLAN.athlete, restHR: 49, maxHR: 167 }
    }
  },
  currentAthleteId: 'maman',
  settings: {
    weekStartsMonday: true,
    coachMode: false,
    coachName: 'Coach',
    reminderEnabled: false,
    reminderTime: '08:00'
  }
});

function migrate(old) {
  // v1: top-level profile/sessions/etc.
  if (old && old._v >= 2) return old;
  if (!old || !old.profile) return defaultState();
  const id = (old.profile?.name || 'athlete').toLowerCase().replace(/\s+/g, '_');
  return {
    _v: 2,
    athletes: {
      [id]: {
        profile: { restHR: 60, maxHR: 170, ...old.profile },
        startDate: old.startDate || DEFAULT_PLAN.startDate,
        weeks: old.weeks || JSON.parse(JSON.stringify(DEFAULT_PLAN.weeks)),
        sessions: old.sessions || [],
        workDays: old.workDays || {},
        wellness: old.wellness || [],
        done: old.done || {},
        records: old.records || []
      }
    },
    currentAthleteId: id,
    settings: { weekStartsMonday: true, coachMode: false, coachName: 'Coach',
      reminderEnabled: false, reminderTime: '08:00', ...(old.settings||{}) }
  };
}

let state;
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch { return defaultState(); }
}
function saveState() {
  // Marque l'athlète courant avec la date de modif locale
  const a = state.athletes?.[state.currentAthleteId];
  if (a) a._lastModTs = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Stockage plein — supprime des photos');
  }
  // Pousse vers le cloud si la sync est active
  cloudPushDebounced();
}

// ===================== SYNC FIREBASE (cloud) =====================
const FB_KEY = 'coachmaman.cloud';
const fbState = {
  enabled: false,
  roomCode: null,
  writerId: null,           // identifiant unique de CET appareil
  app: null, auth: null, db: null,
  unsubscribers: {},
  lastWriteTs: 0,
  status: 'off',            // 'off' | 'connecting' | 'live' | 'error'
  lastError: null
};

function loadCloudPrefs() {
  try {
    const raw = localStorage.getItem(FB_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      fbState.enabled = !!p.enabled;
      fbState.roomCode = p.roomCode || null;
      fbState.writerId = p.writerId || null;
    }
  } catch {}
  if (!fbState.writerId) {
    fbState.writerId = 'w_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    saveCloudPrefs();
  }
}
function saveCloudPrefs() {
  localStorage.setItem(FB_KEY, JSON.stringify({
    enabled: fbState.enabled,
    roomCode: fbState.roomCode,
    writerId: fbState.writerId
  }));
}

function setCloudStatus(s, err = null) {
  fbState.status = s;
  fbState.lastError = err;
  // Met à jour l'indicateur si la vue Paramètres est ouverte
  const el = document.querySelector('#cloudStatusInline');
  if (el) el.innerHTML = renderCloudStatusInline();
}

function renderCloudStatusInline() {
  const map = {
    off:        '<span class="cloud-st off">⚪ Désactivée</span>',
    connecting: '<span class="cloud-st pending">🟡 Connexion…</span>',
    live:       '<span class="cloud-st live">🟢 Synchronisé en temps réel</span>',
    error:      `<span class="cloud-st err">🔴 Erreur : ${fbState.lastError || 'inconnue'}</span>`
  };
  return map[fbState.status] || map.off;
}

async function initFirebaseSync() {
  loadCloudPrefs();
  if (!window.FIREBASE_READY) {
    setCloudStatus('off');
    return;
  }
  if (!window.__fb) {
    // SDK pas encore chargé — attend l'event
    window.addEventListener('firebase-loaded', () => initFirebaseSync(), { once: true });
    return;
  }
  if (!fbState.enabled || !fbState.roomCode) {
    setCloudStatus('off');
    return;
  }
  setCloudStatus('connecting');
  try {
    fbState.app = window.__fb.initializeApp(window.FIREBASE_CONFIG);
    fbState.auth = window.__fb.getAuth(fbState.app);
    await window.__fb.signInAnonymously(fbState.auth);
    fbState.db = window.__fb.getFirestore(fbState.app);
    // Stamp toutes les athlètes locaux avec un ts si manquant
    // (protège les données locales contre un cloud obsolète au 1er démarrage)
    let stamped = false;
    Object.values(state.athletes).forEach(a => {
      if (!a._lastModTs) { a._lastModTs = Date.now(); stamped = true; }
    });
    if (stamped) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    }
    startCloudListeners();
    setCloudStatus('live');
  } catch (e) {
    console.error('Firebase init error:', e);
    setCloudStatus('error', e.message);
  }
}

function startCloudListeners() {
  // Écoute tous les athlètes de la room
  // (un seul doc par athlète pour rester simple)
  Object.values(fbState.unsubscribers).forEach(u => u && u());
  fbState.unsubscribers = {};
  Object.keys(state.athletes).forEach(id => listenAthlete(id));
}

function notifyNewSession(count) {
  if (!('Notification' in window)) return;
  const msg = count === 1
    ? '🏋️ Nouvelle séance ajoutée — va voir ce qui t\'attend !'
    : `🏋️ ${count} nouvelles séances — va voir ce qui t'attend !`;
  if (Notification.permission === 'granted') {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'notify', title: 'Coach Maman', body: msg, tag: 'new-session' });
    } else {
      new Notification('Coach Maman', { body: msg, icon: './icon.svg' });
    }
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') {
        new Notification('Coach Maman', { body: msg, icon: './icon.svg' });
      }
    });
  }
}

function listenAthlete(athleteId) {
  if (!fbState.db || !fbState.roomCode) return;
  const ref = window.__fb.doc(fbState.db, 'rooms', fbState.roomCode, 'athletes', athleteId);
  fbState.unsubscribers[athleteId] = window.__fb.onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data || !data.athlete) return;
    // Ignore les snapshots venant de NOTRE propre écriture
    if (data.writerId === fbState.writerId) return;
    // Compare timestamps : n'applique que si la version cloud est PLUS RÉCENTE que la locale
    const cloudTs = +data.ts || 0;
    const localTs = +(state.athletes[athleteId]?._lastModTs) || 0;
    if (cloudTs <= localTs) {
      // Cloud plus ancien → push notre version pour rattraper
      console.log('[sync] cloud version older, pushing local');
      cloudPushDebounced();
      return;
    }
    // Applique la version cloud MAIS le cloud ne doit JAMAIS écraser le plan
    // (weeks/startDate) si l'appareil a déjà un plan issu de l'Excel. Le plan vient
    // toujours de l'Excel via syncFromExcel() sur chaque appareil. Sans ça, un vieux
    // plan resté dans le cloud réinjecte de mauvaises semaines (toutes en
    // "compétition/affutage") par-dessus la lecture Excel.
    const localA = state.athletes[athleteId] || {};
    const localFromExcel = Array.isArray(localA.weeks) && localA.weeks.some(w => w && w.startDate);
    const merged = { ...data.athlete, _lastModTs: cloudTs };
    if (localFromExcel) {
      merged.weeks = localA.weeks;
      if (localA.startDate) merged.startDate = localA.startDate;
    }
    // Fusion sessions (union par clé unique)
    const localSessions = Array.isArray(localA.sessions) ? localA.sessions : [];
    const cloudSessions = Array.isArray(merged.sessions) ? merged.sessions : [];
    if (localSessions.length > 0 || cloudSessions.length > 0) {
      const sessionKey = s => `${s.date||''}_${s.type||''}_${s.distance||0}_${s.duree||0}_${s.week||0}_${s.day||0}`;
      const map = new Map();
      localSessions.forEach(s => map.set(sessionKey(s), s));
      let newCount = 0;
      cloudSessions.forEach(s => { const k = sessionKey(s); if (!map.has(k)) { map.set(k, s); newCount++; } });
      merged.sessions = [...map.values()];
      if (newCount > 0) notifyNewSession(newCount);
    }
    // Fusion wellness (union par date, version la plus complète gagne)
    const localWellness = Array.isArray(localA.wellness) ? localA.wellness : [];
    const cloudWellness = Array.isArray(merged.wellness) ? merged.wellness : [];
    if (localWellness.length > 0 || cloudWellness.length > 0) {
      const wmap = new Map();
      localWellness.forEach(w => wmap.set(w.date, w));
      cloudWellness.forEach(w => {
        const existing = wmap.get(w.date);
        if (!existing) { wmap.set(w.date, w); }
        else {
          const eKeys = Object.keys(existing).length;
          const cKeys = Object.keys(w).length;
          if (cKeys > eKeys) wmap.set(w.date, w);
        }
      });
      merged.wellness = [...wmap.values()].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }
    // Fusion done (union des clés, garde la version avec le plus de données)
    const localDone = localA.done || {};
    const cloudDone = merged.done || {};
    merged.done = { ...cloudDone, ...localDone };
    // Fusion records (union par clé exercise+date)
    const localRecords = Array.isArray(localA.records) ? localA.records : [];
    const cloudRecords = Array.isArray(merged.records) ? merged.records : [];
    if (localRecords.length > 0 || cloudRecords.length > 0) {
      const rmap = new Map();
      localRecords.forEach(r => rmap.set(`${r.exercise||''}_${r.date||''}`, r));
      cloudRecords.forEach(r => { const k = `${r.exercise||''}_${r.date||''}`; if (!rmap.has(k)) rmap.set(k, r); });
      merged.records = [...rmap.values()];
    }
    state.athletes[athleteId] = merged;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
    const active = document.querySelector('.nav-item.active')?.dataset.view || 'dashboard';
    if (typeof render === 'function') render(active);
    toast('☁ Synchronisé depuis un autre appareil');
  }, (err) => {
    console.error('onSnapshot error:', err);
    setCloudStatus('error', err.message);
  });
}

let cloudPushTimer = null;
function cloudPushDebounced() {
  if (!fbState.enabled || !fbState.db || !fbState.roomCode) return;
  // On pousse si la sync est vivante OU en erreur (pour retenter après un échec
  // ponctuel), mais pas pendant la connexion initiale.
  if (fbState.status !== 'live' && fbState.status !== 'error') return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(cloudPushAll, 800);
}

// Nettoie un objet pour Firestore : remplace les undefined par null récursivement
function sanitizeForFirestore(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(sanitizeForFirestore);
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      const v = sanitizeForFirestore(value[k]);
      // Saute les fonctions ou objets non sérialisables
      if (typeof v === 'function') continue;
      out[k] = v;
    }
    return out;
  }
  // Number, string, boolean — OK
  if (typeof value === 'number' && !isFinite(value)) return null;
  return value;
}

async function cloudPushAll() {
  if (!fbState.db || !fbState.roomCode) return;
  fbState.lastWriteTs = Date.now();
  try {
    for (const id of Object.keys(state.athletes)) {
      const ref = window.__fb.doc(fbState.db, 'rooms', fbState.roomCode, 'athletes', id);
      const cleanAthlete = sanitizeForFirestore(state.athletes[id]);
      // Garde-fou : Firestore limite un document à ~1 Mo. Au-delà, setDoc échoue
      // et bloquait toute la sync sans rien dire. On prévient clairement.
      const approxSize = JSON.stringify(cleanAthlete).length;
      if (approxSize > 1000000) {
        const ko = Math.round(approxSize / 1024);
        setCloudStatus('error', `Données trop volumineuses (${ko} Ko > limite ~1 Mo)`);
        toast(`⚠ Sync impossible : ${ko} Ko dépassent la limite Firestore (1 Mo). Réduis les photos / imports.`);
        return;
      }
      const localTs = +state.athletes[id]._lastModTs || fbState.lastWriteTs;
      await window.__fb.setDoc(ref, {
        athlete: cleanAthlete,
        writerId: fbState.writerId,
        ts: localTs           // ← le ts de la dernière modif locale
      }, { merge: false });
    }
    setCloudStatus('live');
  } catch (e) {
    console.error('cloud push error:', e);
    setCloudStatus('error', e.message);
    toast('⚠ Échec synchro cloud : ' + (e.message || 'erreur inconnue'));
  }
}

// Activation depuis l'UI
async function enableCloudSync(roomCode) {
  if (!window.FIREBASE_READY) {
    toast('Config Firebase manquante (voir FIREBASE_SETUP.md)');
    return false;
  }
  fbState.roomCode = (roomCode || '').trim();
  fbState.enabled = true;
  saveCloudPrefs();
  await initFirebaseSync();
  if (fbState.status === 'live') {
    // Pousse l'état actuel pour la 1ʳᵉ fois
    cloudPushAll();
    return true;
  }
  return false;
}

function disableCloudSync() {
  fbState.enabled = false;
  Object.values(fbState.unsubscribers).forEach(u => u && u());
  fbState.unsubscribers = {};
  saveCloudPrefs();
  setCloudStatus('off');
}

function generateRoomCode() {
  // 10 caractères alphanumériques, faciles à taper (pas de l/I/0/O)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

window.enableCloudSync = enableCloudSync;
window.disableCloudSync = disableCloudSync;
window.generateRoomCode = generateRoomCode;

// proxy vers l'athlète actuel
function A() { return state.athletes[state.currentAthleteId]; }

state = loadState();

// ===================== SYNC EXCEL =====================
// Lit "/planif.xlsx" (servi par serve.ps1 depuis le fichier parent) et
// remplace les semaines de l'athlète actuel par celles du fichier Excel.
// Le numéro de semaine vient de la ligne 48 du sheet "Plannification générale"
// (les semaines du calendrier que l'utilisateur a saisies).
async function syncFromExcel({ silent = false } = {}) {
  if (typeof XLSX === 'undefined') {
    if (!silent) toast('SheetJS non chargé');
    return false;
  }
  try {
    // En prod (GitHub Pages) le xlsx est dans /data/. En local serve.ps1 a une route /planif.xlsx.
    // On détecte selon le hostname pour éviter un 404 visible dans la console.
    const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
    const url = isLocal ? 'planif.xlsx' : 'data/planif.xlsx';
    const resp = await fetch(url, { cache: 'no-cache' }).catch(() => null);
    if (!resp || !resp.ok) throw new Error('xlsx introuvable');
    const buf = await resp.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: false });
    const sheetName = wb.SheetNames.find(n => /plannification/i.test(n)) || wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    if (!sheet) throw new Error('feuille introuvable');

    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

    // Lignes (0-indexées) : 2=macro(R3), 4=meso(R5), 6=micro(R7), 10=quality(R11),
    // 45=startDate(R46), 47=weekNumber(R48)
    const ROW_MACRO = 2, ROW_MESO = 4, ROW_MICRO = 6, ROW_QUAL = 10;
    const ROW_DATE = 45, ROW_WEEKNUM = 47;

    const weekRow = grid[ROW_WEEKNUM] || [];
    const dateRow = grid[ROW_DATE] || [];

    // Étend une ligne en respectant les VRAIES fusions de cellules de l'Excel,
    // SANS propager au-delà de la dernière cellule réellement remplie.
    // (Avant, on recopiait la dernière valeur jusqu'au bout : les semaines non
    //  planifiées héritaient à tort de la dernière phase « compétition/affutage ».)
    const merges = sheet['!merges'] || [];
    const expandRow = (rowIdx) => {
      const row = grid[rowIdx] || [];
      const out = [];
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        out[c] = (v === null || v === undefined || v === '') ? null : v;
      }
      // Applique chaque fusion horizontale qui couvre cette ligne
      merges.forEach(m => {
        if (m.s.r <= rowIdx && rowIdx <= m.e.r) {
          const anchor = (grid[m.s.r] || [])[m.s.c];
          if (anchor !== null && anchor !== undefined && anchor !== '') {
            for (let c = m.s.c; c <= m.e.c; c++) out[c] = anchor;
          }
        }
      });
      return out;
    };
    const macroP = expandRow(ROW_MACRO);
    const mesoP = expandRow(ROW_MESO);
    const microP = expandRow(ROW_MICRO);
    const qualP = expandRow(ROW_QUAL);

    // Conversion date série Excel -> ISO yyyy-mm-dd
    const excelDateToISO = (v) => {
      if (v == null || v === '') return null;
      if (typeof v === 'string') {
        const d = new Date(v);
        return isNaN(d) ? null : d.toISOString().slice(0, 10);
      }
      const ms = (v - 25569) * 86400 * 1000;
      const d = new Date(ms);
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    };

    // Les semaines commencent à la colonne C (index 2)
    const newWeeks = [];
    let firstDate = null;
    for (let col = 2; col < weekRow.length; col++) {
      const n = weekRow[col];
      if (n === null || n === undefined || n === '') continue;
      const startISO = excelDateToISO(dateRow[col]);
      if (!firstDate && startISO) firstDate = startISO;
      // Si une phase n'est pas définie dans l'Excel pour cette semaine, on laisse
      // VIDE (pas de valeur inventée) : la vue affichera « — » et l'utilisateur
      // saura qu'il reste à planifier ces semaines dans l'Excel.
      newWeeks.push({
        n: Number(n) || (col - 1),
        startDate: startISO,
        macro: macroP[col] || '',
        meso: mesoP[col] || '',
        micro: microP[col] || '',
        quality: qualP[col] || '',
        note: ''
      });
    }
    if (newWeeks.length === 0) throw new Error('aucune semaine trouvée');

    const oldWeeks = A().weeks || [];
    newWeeks.forEach((w, i) => {
      if (oldWeeks[i]?.note) w.note = oldWeeks[i].note;
    });

    A().weeks = newWeeks;
    if (firstDate) A().startDate = firstDate;
    saveState();
    if (!silent) toast(`Plan synchronisé : ${newWeeks.length} semaines`);
    return true;
  } catch (e) {
    if (!silent) toast('Sync Excel échoué : ' + e.message);
    console.warn('syncFromExcel:', e);
    return false;
  }
}
window.syncFromExcel = syncFromExcel;

// ===================== HELPERS =====================
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.hidden = true, 2400);
}
function fmtDate(d) {
  if (!d) return '';
  if (!(d instanceof Date)) d = new Date(d);
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtDateShort(d) {
  if (!d) return '';
  if (!(d instanceof Date)) d = new Date(d);
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
}
function toISO(d) {
  if (!(d instanceof Date)) d = new Date(d);
  // Utilise les composants LOCAUX (pas UTC) pour éviter le décalage de fuseau horaire
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// Parse une date "yyyy-mm-dd" en heure LOCALE (évite le décalage UTC d'une journée)
function parseLocalDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  return new Date(v);
}
// Début (lundi) d'une semaine : on privilégie la date PROPRE de la semaine
// (issue de l'Excel) pour rester aligné avec les numéros de semaine calendaires.
// Fallback : startDate global + index×7 (anciens plans sans dates par semaine).
function weekStartDate(weekIndex) {
  const wk = A().weeks?.[weekIndex];
  if (wk && wk.startDate) {
    const d = parseLocalDate(wk.startDate);
    if (!isNaN(d)) return d;
  }
  return addDays(parseLocalDate(A().startDate), weekIndex * 7);
}
function weekRange(weekIndex) {
  const start = weekStartDate(weekIndex);
  return { start, end: addDays(start, 6) };
}
// Semaine en cours = la dernière semaine dont la date de début est <= aujourd'hui.
// Utilise les dates propres de chaque semaine si elles existent (plan Excel),
// pour que le dashboard, la planification et les séances pointent TOUS la même semaine.
function currentWeekIndex() {
  const weeks = A().weeks || [];
  if (!weeks.length) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (weeks.some(w => w.startDate)) {
    let idx = 0;
    for (let i = 0; i < weeks.length; i++) {
      const s = weekStartDate(i); s.setHours(0, 0, 0, 0);
      if (s.getTime() <= today.getTime()) idx = i; else break;
    }
    return idx;
  }
  const start = parseLocalDate(A().startDate);
  const diff = Math.floor((today - start) / 86400000);
  return Math.max(0, Math.min(weeks.length - 1, Math.floor(diff / 7)));
}
const DAYS_FR = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

function typeClass(t) {
  return ({ 'Marche':'marche','Renfo':'renfo','CAP':'cap','Mobilité':'mob',
    'Jujitsu':'jujitsu','Compétition':'jujitsu','Repos':'' })[t] || '';
}
function tagClass(t) {
  return ({ 'Marche':'accent','Renfo':'info','CAP':'purple','Mobilité':'warn',
    'Jujitsu':'danger','Compétition':'danger','Repos':'' })[t] || '';
}
function trainingLoad(rpe, duree) { return (Number(rpe)||0) * (Number(duree)||0); }

// ===================== ZONES FC (Karvonen) =====================
function fcZones() {
  const { restHR, maxHR } = A().profile;
  const reserve = maxHR - restHR;
  const z = (lo, hi) => ({ lo: Math.round(restHR + reserve * lo), hi: Math.round(restHR + reserve * hi) });
  return [
    { n:1, name:'Récupération', cls:'z1', short:'Récup', ...z(0.50, 0.60) },
    { n:2, name:'Endurance',    cls:'z2', short:'Endur.', ...z(0.60, 0.70) },
    { n:3, name:'Tempo',        cls:'z3', short:'Tempo', ...z(0.70, 0.80) },
    { n:4, name:'Seuil',        cls:'z4', short:'Seuil', ...z(0.80, 0.90) },
    { n:5, name:'VO2max',       cls:'z5', short:'VO2max', ...z(0.90, 1.00) },
  ];
}

// Infos détaillées par zone (affichées dans la modal ⓘ)
const FC_ZONE_INFO = [
  {
    n: 1, name: 'Récupération', range: '50–60% FC réserve',
    rpe: 'RPE 1-2',
    description: 'Effort très facile, conversation totalement aisée. Respiration calme et régulière.',
    physio: 'Mobilise les graisses comme carburant principal. Pas de stress cardiovasculaire significatif.',
    when: 'Récupération active après séance intense · Échauffement · Retour au calme · Jour de repos actif',
    duration: 'Sans limite (plusieurs heures possibles)'
  },
  {
    n: 2, name: 'Endurance', range: '60–70% FC réserve',
    rpe: 'RPE 3-4',
    description: 'Effort confortable, conversation facile par phrases complètes. Tu peux maintenir cet effort longtemps.',
    physio: 'Développe la capacité aérobie de base. Améliore la densité capillaire et mitochondriale. Brûle un mélange graisses/glucides.',
    when: 'Sorties longues · Travail foncier de base · La majorité du volume d\'entraînement (70-80%)',
    duration: '45 min à 4h+'
  },
  {
    n: 3, name: 'Tempo', range: '70–80% FC réserve',
    rpe: 'RPE 5-6',
    description: 'Effort soutenu. Conversation possible par phrases courtes, légèrement essoufflé. "Confortablement dur".',
    physio: 'Améliore l\'endurance spécifique et l\'efficacité énergétique. Brûle principalement les glucides.',
    when: 'Travail à l\'allure cible compétition · Blocs de 20-40 min · Sorties moyennes intenses',
    duration: '20 min à 1h30'
  },
  {
    n: 4, name: 'Seuil', range: '80–90% FC réserve',
    rpe: 'RPE 7-8',
    description: 'Effort dur. Conversation devient difficile (quelques mots). C\'est la zone où le lactate s\'accumule.',
    physio: 'Repousse le seuil anaérobie. Améliore la tolérance au lactate et la puissance aérobie maximale.',
    when: 'Intervalles longs 5-15 min · Travail de seuil · Tests de progression',
    duration: '20-60 min cumulés (par intervalles)'
  },
  {
    n: 5, name: 'VO2max', range: '90–100% FC réserve',
    rpe: 'RPE 9-10',
    description: 'Effort maximal ou quasi-maximal. Conversation impossible. Très dur, peut être tenu 3-8 min max.',
    physio: 'Développe la consommation maximale d\'oxygène. Améliore le pic de puissance cardiovasculaire.',
    when: 'Intervalles courts 30s-3min · Travail de VMA · Compétitions courtes',
    duration: '3-10 min cumulés (par séries courtes)'
  }
];

function openFcZonesInfo() {
  modal(`
    <div class="modal-title">ⓘ Comprendre les zones de FC</div>
    <div class="text-mute" style="font-size:13px;margin-bottom:14px">
      Les zones sont calculées avec la <strong>méthode Karvonen</strong> : on prend la « réserve cardiaque » (FC max − FC repos) et on découpe en 5 plages. Plus précis que de simplement utiliser un % de la FC max.
    </div>
    ${FC_ZONE_INFO.map(z => `
      <div class="zone-info-card">
        <div class="zone-info-head">
          <span class="zone-info-badge z${z.n}">Z${z.n}</span>
          <div>
            <div class="zone-info-title">${z.name}</div>
            <div class="zone-info-sub">${z.range} · ${z.rpe}</div>
          </div>
        </div>
        <p class="zone-info-desc">${z.description}</p>
        <div class="zone-info-meta">
          <div><strong>🔬 Effet physiologique :</strong> ${z.physio}</div>
          <div><strong>🎯 Quand l'utiliser :</strong> ${z.when}</div>
          <div><strong>⏱ Durée typique :</strong> ${z.duration}</div>
        </div>
      </div>
    `).join('')}
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" onclick="closeModal()">Fermer</button>
    </div>
  `);
}
window.openFcZonesInfo = openFcZonesInfo;

// Détecte la FC max réelle depuis les activités importées (top valeurs observées)
function detectMaxHRFromImports() {
  const observed = Object.values(A().done)
    .map(d => +d.fcMax)
    .filter(v => v && v > 100 && v < 230) // filtre valeurs aberrantes
    .sort((a, b) => b - a);
  if (observed.length === 0) return null;
  // Médiane des 5 valeurs les plus hautes (évite un pic isolé bizarre)
  const top5 = observed.slice(0, 5);
  const median = top5[Math.floor(top5.length / 2)];
  return { suggested: top5[0], median, count: observed.length, top5 };
}

function renderFcZones() {
  return `
    <div class="fc-zones-header">
      <span class="text-mute" style="font-size:12px">Karvonen 5 zones</span>
      <button class="fc-info-btn" onclick="openFcZonesInfo()" title="Comprendre les zones">ⓘ Infos zones</button>
    </div>
    <div class="fc-zones">${fcZones().map(z => `
    <div class="fc-zone ${z.cls}">
      <div class="fcz-name">Z${z.n} ${z.short}</div>
      <div class="fcz-range">${z.lo}–${z.hi}</div>
    </div>
  `).join('')}</div>`;
}
function rpeToZone(rpe) {
  if (!rpe) return null;
  if (rpe <= 2) return 1;
  if (rpe <= 4) return 2;
  if (rpe <= 6) return 3;
  if (rpe <= 8) return 4;
  return 5;
}

// ===================== ROUTING =====================
const TITLES = {
  dashboard: ['Tableau de bord','Vue d\'ensemble de la préparation'],
  planning: ['Planification','Macro · Méso · Micro cycles'],
  sessions: ['Séances','Détail des entraînements semaine par semaine'],
  imports: ['Imports Garmin','Glisser GPX / TCX / FIT → auto-association aux séances'],
  compare: ['Comparaison de séances','Suivre les progrès sur les mêmes formats'],
  wellness: ['Wellness','Questionnaire quotidien et suivi'],
  records: ['Records personnels','Suivi des performances'],
  settings: ['Paramètres','Profil et préférences']
};
function go(view) {
  $$('.view').forEach(v => v.classList.remove('active','print-target'));
  $(`#view-${view}`).classList.add('active');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  const [title, sub] = TITLES[view];
  $('#pageTitle').textContent = title;
  $('#pageSub').textContent = sub;
  render(view);
  window.scrollTo({ top:0 });
}
$$('.nav-item').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));

// ===================== MODAL =====================
function modal(html, onMount) {
  $('#modalBody').innerHTML = html;
  $('#modal').hidden = false;
  if (onMount) onMount($('#modalBody'));
}
function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }
window.closeModal = closeModal;
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function render(view) {
  ({
    dashboard: renderDashboard, planning: renderPlanning, sessions: renderSessions,
    imports: renderImports, compare: renderCompare, wellness: renderWellness,
    records: renderRecords, settings: renderSettings
  })[view]();
}

// ===================== ATHLETE SWITCHER =====================
function renderAthleteSwitcher() {
  const ids = Object.keys(state.athletes);
  $('#athleteSwitcher').innerHTML = `
    <select class="athlete-select" id="athleteSelect">
      ${ids.map(id => `<option value="${id}" ${id===state.currentAthleteId?'selected':''}>${state.athletes[id].profile.name||id}</option>`).join('')}
    </select>
    <button class="athlete-add" id="addAthleteBtn">+ Ajouter un athlète</button>
  `;
  $('#athleteSelect').addEventListener('change', e => {
    state.currentAthleteId = e.target.value;
    saveState();
    updateProfileSidebar();
    go('dashboard');
  });
  $('#addAthleteBtn').addEventListener('click', () => {
    const name = prompt('Nom du nouvel athlète :');
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now().toString(36).slice(-4);
    state.athletes[id] = blankAthlete(name);
    state.currentAthleteId = id;
    saveState();
    renderAthleteSwitcher();
    updateProfileSidebar();
    go('dashboard');
  });
}

// ===================== DASHBOARD =====================
function renderDashboard() {
  const wi = currentWeekIndex();
  const wk = A().weeks[wi];
  const { start, end } = weekRange(wi);
  const lastWellness = A().wellness.slice(-1)[0];
  const wellnessAvg = lastWellness
    ? Math.round((lastWellness.sleep + lastWellness.fatigue + lastWellness.soreness + lastWellness.stress + lastWellness.mood) / 5 * 10) / 10
    : null;

  const acwr = computeACWR();

  $('#view-dashboard').innerHTML = `
    ${todayFocus()}
    <div class="grid grid-3 mb-16">
      <div class="kpi">
        <div class="kpi-bar"></div>
        <div class="kpi-label">Semaine en cours</div>
        <div class="kpi-value">S${wk.n}<span style="font-size:14px;color:var(--text-mute)"> · ${wi+1}/${A().weeks.length}</span></div>
        <div class="kpi-sub">${fmtDateShort(start)} → ${fmtDateShort(end)}</div>
      </div>
      <div class="kpi info">
        <div class="kpi-bar"></div>
        <div class="kpi-label">Mésocycle</div>
        <div class="kpi-value" style="font-size:18px">${wk.meso || 'À planifier'}</div>
        <div class="kpi-sub">Micro : ${wk.micro || '—'}</div>
      </div>
      <div class="kpi ${acwr.color}">
        <div class="kpi-bar"></div>
        <div class="kpi-label">Ratio ACWR</div>
        <div class="kpi-value">${acwr.value !== null ? acwr.value.toFixed(2) : '—'}</div>
        <div class="kpi-sub">${acwr.label}</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-h">
          <h3>Wellness des 14 derniers jours</h3>
          ${lastWellness ? `<span class="tag accent">Dernier : ${wellnessAvg}/5</span>` : '<span class="tag">Aucune donnée</span>'}
        </div>
        <div class="chart-wrap"><canvas id="dashWellnessChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-h">
          <h3>Planifié vs Réalisé · 8 semaines</h3>
          <span class="tag info">Charge Foster</span>
        </div>
        <div class="chart-wrap lg"><canvas id="dashPlanVsActualChart"></canvas></div>
        <div class="pva-slider-wrap">
          <div class="pva-slider-label" id="pvaSliderLabel">—</div>
          <input type="range" id="pvaSlider" min="0" max="100" value="100" step="0.1" class="pva-slider">
          <div class="pva-nav">
            <button class="btn btn-ghost btn-sm" id="pvaPrev">◀ &minus;1 sem.</button>
            <button class="btn btn-ghost btn-sm" id="pvaNow">📍 Maintenant</button>
            <button class="btn btn-ghost btn-sm" id="pvaNext">+1 sem. ▶</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-h">
        <h3>Distance hebdomadaire · 8 semaines</h3>
        <span class="tag accent">Par activité</span>
      </div>
      <div class="chart-wrap lg"><canvas id="dashDistanceChart"></canvas></div>
      <div id="distLegend" class="dist-legend"></div>
      <div class="pva-slider-wrap">
        <div class="pva-slider-label" id="distSliderLabel">—</div>
        <input type="range" id="distSlider" min="0" max="100" value="100" step="0.1" class="pva-slider">
        <div class="pva-nav">
          <button class="btn btn-ghost btn-sm" id="distPrev">◀ &minus;1 sem.</button>
          <button class="btn btn-ghost btn-sm" id="distNow">📍 Maintenant</button>
          <button class="btn btn-ghost btn-sm" id="distNext">+1 sem. ▶</button>
        </div>
      </div>
    </div>

    <h3 class="section-title">Semaine en cours · ${wk.macro || 'Phase à planifier'}</h3>
    ${renderWeekCalendar(wi)}
  `;

  drawDashboardCharts();
  attachDayHandlers(wi);
  $$('[data-go-session]').forEach(el => el.addEventListener('click', () => {
    currentSessionWeek = +el.dataset.goSession;
    go('sessions');
  }));

  // Sliders synchronisés (charge + distance) — bouger l'un déplace l'autre
  const syncSliders = (source) => {
    const pva = $('#pvaSlider'), dist = $('#distSlider');
    if (!pva || !dist) return;
    if (source === 'pva') dist.value = pva.value;
    else if (source === 'dist') pva.value = dist.value;
  };
  $('#pvaSlider')?.addEventListener('input', () => { syncSliders('pva'); applyPvaSlider(); });
  $('#distSlider')?.addEventListener('input', () => { syncSliders('dist'); applyPvaSlider(); });
  $('#pvaPrev')?.addEventListener('click', () => shiftPvaWindow(-1));
  $('#pvaNext')?.addEventListener('click', () => shiftPvaWindow(1));
  $('#pvaNow')?.addEventListener('click', () => centerPvaOnToday());
  $('#distPrev')?.addEventListener('click', () => shiftPvaWindow(-1));
  $('#distNext')?.addEventListener('click', () => shiftPvaWindow(1));
  $('#distNow')?.addEventListener('click', () => centerPvaOnToday());
}

// ===== Slider Planifié vs Réalisé : centre l'offset de la fenêtre 8 semaines =====
let pvaOffset = 0; // décalage en semaines par rapport à la semaine en cours
const PVA_WINDOW = 8;

function pvaWeekRange() {
  const totalWeeks = A().weeks.length;
  const wi = currentWeekIndex();
  const idealStart = Math.max(0, wi - 4 + pvaOffset);
  const maxStart = Math.max(0, totalWeeks - PVA_WINDOW);
  const start = Math.max(0, Math.min(maxStart, idealStart));
  return { start, end: Math.min(totalWeeks, start + PVA_WINDOW) };
}

function applyPvaSlider() {
  const slider = $('#pvaSlider');
  const distSlider = $('#distSlider');
  if (!slider) return;
  const totalWeeks = A().weeks.length;
  const maxStart = Math.max(0, totalWeeks - PVA_WINDOW);
  if (maxStart === 0) {
    slider.disabled = true;
    slider.style.opacity = 0.4;
    if (distSlider) { distSlider.disabled = true; distSlider.style.opacity = 0.4; }
  } else {
    const pos = +slider.value / 100;
    const start = Math.round(pos * maxStart);
    pvaOffset = start - Math.max(0, currentWeekIndex() - 4);
  }
  // Synchronise visuellement le slider du graphique distance
  if (distSlider && distSlider.value !== slider.value) distSlider.value = slider.value;
  drawPvaChart();
  drawDistanceChart();
  // Met à jour le label du slider distance
  const distLabel = $('#distSliderLabel');
  if (distLabel) {
    const { start: s, end: e } = pvaWeekRange();
    const firstWk = A().weeks[s], lastWk = A().weeks[e - 1];
    distLabel.textContent = `S${firstWk?.n ?? '?'} → S${lastWk?.n ?? '?'}  ·  ${e - s} semaines`;
  }
}

function shiftPvaWindow(deltaWeeks) {
  const slider = $('#pvaSlider');
  if (!slider) return;
  const totalWeeks = A().weeks.length;
  const maxStart = Math.max(0, totalWeeks - PVA_WINDOW);
  if (maxStart === 0) return;
  const { start } = pvaWeekRange();
  const next = Math.max(0, Math.min(maxStart, start + deltaWeeks));
  slider.value = (next / maxStart) * 100;
  applyPvaSlider();
}

function centerPvaOnToday() {
  const slider = $('#pvaSlider');
  if (!slider) return;
  const totalWeeks = A().weeks.length;
  const maxStart = Math.max(0, totalWeeks - PVA_WINDOW);
  if (maxStart === 0) return;
  const wi = currentWeekIndex();
  const wanted = Math.max(0, Math.min(maxStart, wi - 4));
  slider.value = (wanted / maxStart) * 100;
  pvaOffset = 0;
  applyPvaSlider();
}

let selectedRecordActivity = 'Toutes'; // filtre activité dans la vue Records

function computeACWR() {
  const now = Date.now();
  const loads = Object.values(A().done).filter(d => d.date)
    .map(d => ({ date: new Date(d.date), load: trainingLoad(d.rpe, d.duree || 0) }));
  if (loads.length < 3) return { value: null, label: 'Données insuffisantes', color: '' };
  const acute = loads.filter(l => now - l.date <= 7*86400000).reduce((a,l) => a + l.load, 0);
  const chronic = loads.filter(l => now - l.date <= 28*86400000).reduce((a,l) => a + l.load, 0) / 4;
  if (chronic === 0) return { value: null, label: 'Données insuffisantes', color: '' };
  const ratio = acute / chronic;
  let label, color;
  if (ratio < 0.8) { label = 'Sous-charge'; color = 'info'; }
  else if (ratio <= 1.3) { label = 'Zone optimale'; color = ''; }
  else if (ratio <= 1.5) { label = 'Surveillance'; color = 'warn'; }
  else { label = 'Risque élevé'; color = 'warn'; }
  return { value: ratio, label, color };
}

function drawDashboardCharts() {
  const ctx1 = $('#dashWellnessChart');
  if (ctx1) {
    const last14 = A().wellness.slice(-14);
    new Chart(ctx1, {
      type: 'line',
      data: {
        labels: last14.map(w => fmtDateShort(w.date)),
        datasets: [{
          label: 'Wellness moyen',
          data: last14.map(w => (w.sleep + w.fatigue + w.soreness + w.stress + w.mood) / 5),
          borderColor: '#2d7a5f',
          backgroundColor: 'rgba(45,122,95,0.12)',
          fill: true, tension: 0.35, pointRadius: 4
        }]
      },
      options: { responsive:true, maintainAspectRatio:false,
        scales:{ y:{ min:1, max:5, ticks:{ stepSize:1 } } },
        plugins:{ legend:{ display:false } } }
    });
  }
  drawPvaChart();
  drawDistanceChart();
  // Position initiale du slider PVA centrée sur "maintenant"
  centerPvaOnToday();
}

// ===== Distance par activité (8 semaines) — barres empilées colorées =====
const ACTIVITY_COLORS = {
  'Marche':       { bg: 'rgba(45, 122, 95, 0.85)',  border: '#2d7a5f' },
  'Course':       { bg: 'rgba(212, 84, 84, 0.85)',  border: '#c44545' },
  'CAP':          { bg: 'rgba(212, 84, 84, 0.85)',  border: '#c44545' },
  'Trail':        { bg: 'rgba(160, 80, 40, 0.85)',  border: '#8c5028' },
  'Vélo':         { bg: 'rgba(44, 109, 181, 0.85)', border: '#2c6db5' },
  'Cyclisme':     { bg: 'rgba(44, 109, 181, 0.85)', border: '#2c6db5' },
  'Natation':     { bg: 'rgba(0, 176, 220, 0.85)',  border: '#00b0dc' },
  'Renfo':        { bg: 'rgba(170, 110, 200, 0.85)', border: '#9a5bb5' },
  'Mobilité':     { bg: 'rgba(220, 170, 60, 0.85)', border: '#d4a228' },
  'Jujitsu':      { bg: 'rgba(40, 40, 60, 0.85)',   border: '#1a1f2e' },
  'Compétition':  { bg: 'rgba(255, 100, 60, 0.85)', border: '#dd6038' },
  'Autre':        { bg: 'rgba(150, 150, 150, 0.85)', border: '#909090' }
};

// Classe UNE chaîne (sport ou type) vers une catégorie connue, ou null si inconnue
function categoryOf(str) {
  const s = (str || '').toString().toLowerCase();
  if (!s) return null;
  if (/marche|walk|hik|rando/.test(s)) return 'Marche';
  if (/course|run|cap|jog/.test(s) && !/parcours/.test(s)) return 'Course';
  if (/trail/.test(s)) return 'Trail';
  if (/v[eé]lo|cycl|bike|vtt|ride/.test(s)) return 'Vélo';
  if (/natat|swim/.test(s)) return 'Natation';
  if (/renfo|muscu|strength|force|gym|weight/.test(s)) return 'Renfo';
  if (/mobil|yoga|stretch|pilate/.test(s)) return 'Mobilité';
  if (/juju|jiu|bjj/.test(s)) return 'Jujitsu';
  if (/comp[eé]tit|race/.test(s)) return 'Compétition';
  return null; // inconnu (ex : TCX "Other")
}

// Catégorie d'une activité réalisée. On essaie d'abord le sport déclaré par le
// fichier (Garmin), puis — s'il est inconnu/"Other" — on retombe sur le TYPE de
// la séance planifiée (ex : Marche). Ainsi un TCX/GPX prend la vraie couleur.
function activityCategory(sport, type) {
  return categoryOf(sport) || categoryOf(type) || 'Autre';
}

function drawDistanceChart() {
  const canvas = $('#dashDistanceChart');
  if (!canvas) return;
  if (drawDistanceChart._chart) drawDistanceChart._chart.destroy();

  const { start: startW, end: endW } = pvaWeekRange();
  const wi = currentWeekIndex();
  const labels = [];
  const weeksData = []; // par semaine : { 'Marche': 12.3, 'Course': 5.2, ... }
  const isCurrent = [];

  for (let w = startW; w < endW; w++) {
    const wk = A().weeks[w];
    const yr = wk.startDate ? new Date(wk.startDate).getFullYear() : '';
    labels.push(`S${wk.n}${yr ? ` ${String(yr).slice(2)}` : ''}`);
    isCurrent.push(w === wi);
    const r = weekRange(w);
    const startISO = toISO(r.start), endISO = toISO(r.end);
    const perCat = {};
    Object.entries(A().done).forEach(([key, d]) => {
      if (!d.date || d.date < startISO || d.date > endISO) return;
      const dist = parseFloat(d.distance);
      if (!isFinite(dist) || dist <= 0) return;
      // Récupère le type via la session parente (clé = week-day-idx)
      const [wk, dy] = key.split('-').map(Number);
      const parentSession = A().sessions.find(s => s.week === wk && s.day === dy);
      const cat = activityCategory(d.sport, parentSession?.type);
      perCat[cat] = (perCat[cat] || 0) + dist;
    });
    weeksData.push(perCat);
  }

  // Identifie toutes les catégories présentes (pour créer un dataset chacune)
  const allCats = new Set();
  weeksData.forEach(w => Object.keys(w).forEach(c => allCats.add(c)));
  const cats = [...allCats];

  if (cats.length === 0) {
    // Pas de données — affiche un placeholder
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    $('#distLegend').innerHTML = '<div class="text-mute" style="text-align:center;padding:30px 0">Aucune distance enregistrée sur cette période. Importe des activités ou enregistre une séance avec une distance.</div>';
    return;
  }

  const datasets = cats.map(cat => {
    const color = ACTIVITY_COLORS[cat] || ACTIVITY_COLORS['Autre'];
    return {
      label: cat,
      data: weeksData.map(w => +(w[cat] || 0).toFixed(1)),
      backgroundColor: color.bg,
      borderColor: color.border,
      borderWidth: 1,
      borderRadius: 4,
      borderSkipped: false,
      maxBarThickness: 50,
      stack: 'dist'
    };
  });

  drawDistanceChart._chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 400 },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '600' } } },
        y: {
          stacked: true, beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { size: 11 }, callback: v => v + ' km' }
        }
      },
      plugins: {
        legend: { display: false }, // on a une légende custom plus jolie
        tooltip: {
          backgroundColor: 'rgba(26,31,46,0.95)',
          padding: 10, cornerRadius: 8,
          titleFont: { size: 13, weight: '700' },
          bodyFont: { size: 12 },
          callbacks: {
            title: items => labels[items[0].dataIndex] + (isCurrent[items[0].dataIndex] ? ' · Cette semaine' : ''),
            label: ctx => `${ctx.dataset.label} : ${ctx.parsed.y.toFixed(1)} km`,
            footer: items => {
              const total = items.reduce((s, i) => s + i.parsed.y, 0);
              return `Total : ${total.toFixed(1)} km`;
            }
          }
        }
      }
    }
  });

  // Légende custom : pastilles de couleur + nom + total km
  const totals = {};
  weeksData.forEach(w => Object.entries(w).forEach(([cat, km]) => { totals[cat] = (totals[cat] || 0) + km; }));
  $('#distLegend').innerHTML = cats.map(cat => {
    const color = ACTIVITY_COLORS[cat] || ACTIVITY_COLORS['Autre'];
    return `<div class="dist-leg-chip">
      <span class="dist-leg-dot" style="background:${color.bg};border:1px solid ${color.border}"></span>
      <strong>${cat}</strong>
      <span class="text-mute">${totals[cat].toFixed(1)} km</span>
    </div>`;
  }).join('');
}

function drawPvaChart() {
  const ctx2 = $('#dashPlanVsActualChart');
  if (!ctx2) return;
  if (drawPvaChart._chart) drawPvaChart._chart.destroy();

  const { start: startW, end: endW } = pvaWeekRange();
  const wi = currentWeekIndex();
  const labels = [];
  const planned = [];
  const actual = [];
  const isCurrent = [];
  for (let w = startW; w < endW; w++) {
    const wk = A().weeks[w];
    const yr = wk.startDate ? new Date(wk.startDate).getFullYear() : '';
    labels.push(`S${wk.n}${yr ? ` ${String(yr).slice(2)}` : ''}`);
    const wkSessions = A().sessions.filter(s => s.week === w + 1);
    planned.push(wkSessions.reduce((a, s) => a + trainingLoad(s.rpe, s.duree), 0));
    const r = weekRange(w);
    const startISO = toISO(r.start), endISO = toISO(r.end);
    const wkDone = Object.values(A().done).filter(d => d.date && d.date >= startISO && d.date <= endISO);
    actual.push(wkDone.reduce((a, d) => a + trainingLoad(d.rpe, d.duree || 0), 0));
    isCurrent.push(w === wi);
  }

  // Gradients verticaux pour des barres jolies
  const canvas = ctx2;
  const c = canvas.getContext('2d');
  const h = canvas.height || 280;
  const gradPlanned = c.createLinearGradient(0, 0, 0, h);
  gradPlanned.addColorStop(0, 'rgba(0,176,240,0.85)');
  gradPlanned.addColorStop(1, 'rgba(0,176,240,0.35)');
  const gradActual = c.createLinearGradient(0, 0, 0, h);
  gradActual.addColorStop(0, 'rgba(45,122,95,1)');
  gradActual.addColorStop(1, 'rgba(45,122,95,0.55)');

  drawPvaChart._chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Planifié',
          data: planned,
          backgroundColor: gradPlanned,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 36,
          borderWidth: isCurrent.map(c => c ? 2 : 0),
          borderColor: isCurrent.map(c => c ? '#1a1f2e' : 'transparent')
        },
        {
          label: 'Réalisé',
          data: actual,
          backgroundColor: gradActual,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 36,
          borderWidth: isCurrent.map(c => c ? 2 : 0),
          borderColor: isCurrent.map(c => c ? '#1a1f2e' : 'transparent')
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 300 },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11, weight: '600' } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { size: 11 } }
        }
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, boxHeight: 14, padding: 14, font: { size: 12, weight: '500' } } },
        tooltip: {
          backgroundColor: 'rgba(26,31,46,0.95)',
          padding: 10, cornerRadius: 8,
          titleFont: { size: 13, weight: '700' },
          bodyFont: { size: 12 },
          callbacks: {
            title: items => labels[items[0].dataIndex] + (isCurrent[items[0].dataIndex] ? ' · Cette semaine' : '')
          }
        }
      }
    }
  });

  // Mise à jour du label du slider
  const label = $('#pvaSliderLabel');
  if (label) {
    const firstWk = A().weeks[startW], lastWk = A().weeks[endW - 1];
    label.textContent = `S${firstWk?.n ?? '?'} → S${lastWk?.n ?? '?'}  ·  ${endW - startW} semaines`;
  }
}

// ===================== PLANIFICATION =====================
// Mapping nom de phase -> classe CSS (couleur)
const PHASE_CLASS = {
  // Macro
  'Période de préparation': 'ph-macro-prep',
  'Période Affutage et compétition': 'ph-macro-affut',
  'Période de transition': 'ph-macro-trans',
  'Hors saison': 'ph-macro-hors',
  // Méso
  'Préparation spécifique': 'ph-meso-prepspe',
  'Développement charge progressive': 'ph-meso-progres',
  'Développement charge dégressive': 'ph-meso-degres',
  'Maintien': 'ph-meso-maintien',
  'Affutage': 'ph-meso-affut',
  'Compétition': 'ph-meso-compet',
  // Micro
  'Graduel': 'ph-micro-graduel',
  'Approche': 'ph-micro-approche',
  'Développement': 'ph-micro-devel',
  'Choc': 'ph-micro-choc',
  'Récupération': 'ph-micro-recup',
  // Qualité
  'Capacité aérobie': 'ph-q-cap-aero',
  'Puissance aérobie': 'ph-q-puis-aero',
  'Endurance spécifique': 'ph-q-end-spe',
  'Consolidation spécifique': 'ph-q-consol',
  'Aérobie spécifique courte': 'ph-q-aero-courte',
  'Endurance force': 'ph-q-end-force',
  'Puissance force': 'ph-q-puis-force',
  'Force max': 'ph-q-force-max',
  'Vitesse': 'ph-q-vitesse',
  'Musculation': 'ph-q-musc',
  'Mobilité': 'ph-q-mob'
};

const MONTH_NAMES = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

let planView = 'gantt'; // 'gantt' | 'table'
let planYearFilter = 'all'; // 'all' | '2025' | '2026' | ...

function weekYear(w, idx) {
  if (w.startDate) return new Date(w.startDate).getFullYear();
  const d = weekStartDate(idx);
  return d.getFullYear();
}

function availableYears() {
  const set = new Set();
  A().weeks.forEach((w, i) => set.add(weekYear(w, i)));
  return [...set].sort();
}

function renderPlanning() {
  const years = availableYears();
  $('#view-planning').innerHTML = `
    <div class="plan-toolbar">
      <div class="plan-meta">
        <span>Début : <strong>${fmtDate(A().startDate)}</strong></span>
        <span>·</span>
        <span><strong>${A().weeks.length}</strong> semaines</span>
        <span>·</span>
        <span>Objectif : <strong>${A().profile.objective || '—'}</strong></span>
      </div>
      <div class="row">
        <label class="text-mute" style="font-size:12px">Année :</label>
        <select id="planYearSelect" style="padding:4px 8px">
          <option value="all" ${planYearFilter==='all'?'selected':''}>Toutes</option>
          ${years.map(y => {
            const curYr = weekYear(A().weeks[currentWeekIndex()], currentWeekIndex());
            return `<option value="${y}" ${String(planYearFilter)===String(y)?'selected':''}>${y}${y===curYr?' ← actuelle':''}</option>`;
          }).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" id="planGoCurrent">📍 Cette semaine</button>
        <button class="btn btn-ghost btn-sm" id="addWeekBtn">+ Semaine</button>
        <button class="btn btn-ghost btn-sm" id="removeWeekBtn">– Semaine</button>
      </div>
    </div>
    <div id="planContent"></div>
  `;
  $('#planYearSelect').addEventListener('change', e => {
    planYearFilter = e.target.value;
    renderPlanTable();
  });
  $('#planGoCurrent').addEventListener('click', () => {
    const curIdx = currentWeekIndex();
    const curYr = weekYear(A().weeks[curIdx], curIdx);
    if (planYearFilter !== 'all' && String(planYearFilter) !== String(curYr)) {
      planYearFilter = String(curYr);
      $('#planYearSelect').value = String(curYr);
      renderPlanTable();
    }
    // attend le rendu puis scrolle vers la semaine
    setTimeout(() => {
      const row = $(`#planContent .cycle-row[data-w="${curIdx}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('flash');
        setTimeout(() => row.classList.remove('flash'), 1600);
      }
    }, 50);
  });
  $('#addWeekBtn').addEventListener('click', () => {
    const last = A().weeks[A().weeks.length-1];
    A().weeks.push({ n: A().weeks.length+1, macro:last.macro, meso:last.meso, micro:'Récupération', quality:last.quality, note:'' });
    saveState(); renderPlanning();
  });
  $('#removeWeekBtn').addEventListener('click', () => {
    if (A().weeks.length > 1) { A().weeks.pop(); saveState(); renderPlanning(); }
  });
  renderPlanTable();
}

function renderPlanGantt() {
  const weeks = A().weeks;
  const cur = currentWeekIndex();
  const dates = weeks.map((_, i) => weekStartDate(i));

  // Group consecutive weeks by month for the month header row
  const monthGroups = [];
  dates.forEach((d, i) => {
    const m = d.getMonth(), y = d.getFullYear();
    const last = monthGroups[monthGroups.length-1];
    if (last && last.m === m && last.y === y) last.span++;
    else monthGroups.push({ m, y, span: 1 });
  });

  // Build merged spans for each cycle row
  const buildSpans = (key) => {
    const out = []; let cur = null;
    weeks.forEach((w, i) => {
      const v = w[key] || '';
      if (cur && cur.value === v) cur.span++;
      else { cur = { value: v, span: 1, startIdx: i }; out.push(cur); }
    });
    return out;
  };

  const macroSpans = buildSpans('macro');
  const mesoSpans = buildSpans('meso');
  const microSpans = buildSpans('micro');
  const qualSpans = buildSpans('quality');

  const phaseCell = (sp, kind) => {
    const cls = PHASE_CLASS[sp.value] || '';
    const inCurrent = cur >= sp.startIdx && cur < sp.startIdx + sp.span;
    return `<td class="phase ${cls} ${inCurrent?'current-week-cell':''}"
              colspan="${sp.span}"
              data-kind="${kind}"
              data-start="${sp.startIdx}"
              data-span="${sp.span}"
              title="${sp.value} · ${sp.span} sem.">
      ${sp.value || '—'}
      <span class="phase-edit">✎</span>
    </td>`;
  };

  $('#planContent').innerHTML = `
    <div class="plan-board">
      <table class="plan-grid">
        <thead>
          <tr>
            <th class="row-label">Mois</th>
            ${monthGroups.map(g => `<th class="month-cell" colspan="${g.span}">${MONTH_NAMES[g.m]} ${String(g.y).slice(2)}</th>`).join('')}
          </tr>
          <tr>
            <th class="row-label">Semaine</th>
            ${weeks.map((w, i) => `<th class="week-cell ${i===cur?'current-week':''}" data-jump="${i}">S${w.n}</th>`).join('')}
          </tr>
          <tr>
            <th class="row-label">Premier jour</th>
            ${dates.map(d => `<td class="date-cell">${fmtDateShort(d)}</td>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th class="row-label">Macrocycle</th>
            ${macroSpans.map(sp => phaseCell(sp, 'macro')).join('')}
          </tr>
          <tr>
            <th class="row-label">Mésocycle</th>
            ${mesoSpans.map(sp => phaseCell(sp, 'meso')).join('')}
          </tr>
          <tr>
            <th class="row-label">Microcycle</th>
            ${microSpans.map(sp => phaseCell(sp, 'micro')).join('')}
          </tr>
          <tr>
            <th class="row-label">Qualité physique</th>
            ${qualSpans.map(sp => phaseCell(sp, 'quality')).join('')}
          </tr>
        </tbody>
      </table>
    </div>

    ${renderPlanLegend()}
  `;

  // wire cell edits (popover)
  $$('#planContent td.phase').forEach(td => td.addEventListener('click', e => {
    e.stopPropagation();
    openPhasePopover(td);
  }));
  // wire week jump
  $$('#planContent th[data-jump]').forEach(th => th.addEventListener('click', () => {
    currentSessionWeek = +th.dataset.jump;
    go('sessions');
  }));

  // close popover on outside click
  document.addEventListener('click', closePhasePopover, { once: true });
}

function renderPlanLegend() {
  const macros = MACROCYCLES;
  const mesos = MESOCYCLES;
  const micros = MICROCYCLES;
  const qual = QUALITES_PHYSIQUES;
  const dot = v => `<span class="legend-dot ${PHASE_CLASS[v]||''}"></span>`;
  return `
    <div class="plan-legend">
      <div class="legend-group"><span class="lg-title">Macro</span>
        ${macros.map(v => `<span class="legend-chip">${dot(v)}${v}</span>`).join('')}
      </div>
    </div>
    <div class="plan-legend">
      <div class="legend-group"><span class="lg-title">Méso</span>
        ${mesos.map(v => `<span class="legend-chip">${dot(v)}${v}</span>`).join('')}
      </div>
    </div>
    <div class="plan-legend">
      <div class="legend-group"><span class="lg-title">Micro</span>
        ${micros.map(v => `<span class="legend-chip">${dot(v)}${v}</span>`).join('')}
      </div>
    </div>
    <div class="plan-legend">
      <div class="legend-group"><span class="lg-title">Qualité</span>
        ${qual.map(v => `<span class="legend-chip">${dot(v)}${v}</span>`).join('')}
      </div>
    </div>
  `;
}

function closePhasePopover() {
  document.querySelectorAll('.phase-popover').forEach(p => p.remove());
}

function openPhasePopover(td) {
  closePhasePopover();
  const kind = td.dataset.kind;
  const start = +td.dataset.start;
  const span = +td.dataset.span;
  const options = ({
    macro: MACROCYCLES, meso: MESOCYCLES, micro: MICROCYCLES, quality: QUALITES_PHYSIQUES
  })[kind];
  const fieldName = ({ macro:'Macrocycle', meso:'Mésocycle', micro:'Microcycle', quality:'Qualité' })[kind];
  const current = A().weeks[start][kind];

  const pop = document.createElement('div');
  pop.className = 'phase-popover';
  pop.innerHTML = `
    <div class="pp-head">${fieldName} · S${A().weeks[start].n}${span>1?'-S'+A().weeks[start+span-1].n:''}</div>
    ${options.map(o => `<button class="pp-opt ${o===current?'current':''}" data-v="${o.replace(/"/g,'&quot;')}">
      <span class="legend-dot ${PHASE_CLASS[o]||''}" style="margin-right:6px;vertical-align:-2px"></span>${o}
    </button>`).join('')}
  `;
  document.body.appendChild(pop);

  // position
  const rect = td.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(window.innerWidth - 240, rect.left + rect.width/2 - 110)) + 'px';
  pop.style.top = (window.scrollY + rect.bottom + 6) + 'px';

  pop.addEventListener('click', e => e.stopPropagation());
  pop.querySelectorAll('.pp-opt').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.v;
    for (let i = start; i < start + span; i++) A().weeks[i][kind] = v;
    saveState();
    closePhasePopover();
    renderPlanning();
    toast('Plan mis à jour');
  }));

  // close on outside click (re-bind because previous was once)
  setTimeout(() => document.addEventListener('click', closePhasePopover, { once: true }), 0);
}

function renderPlanTable() {
  $('#planContent').innerHTML = `
    <div class="cycle-table">
      <div class="cycle-row head">
        <div class="cycle-cell">Sem.</div>
        <div class="cycle-cell">Macrocycle</div>
        <div class="cycle-cell">Mésocycle</div>
        <div class="cycle-cell">Microcycle</div>
        <div class="cycle-cell">Qualité</div>
        <div class="cycle-cell"></div>
      </div>
      ${A().weeks.map((w, idx) => {
        if (planYearFilter !== 'all' && String(weekYear(w, idx)) !== String(planYearFilter)) return '';
        const r = weekRange(idx);
        const yr = weekYear(w, idx);
        const curIdx = currentWeekIndex();
        const isCurrent = idx === curIdx;
        const isPast = idx < curIdx;
        const rowCls = isCurrent ? 'current-row' : (isPast ? 'past-row' : 'future-row');
        return `
        <div class="cycle-row ${rowCls}" data-w="${idx}">
          <div class="cycle-cell week-num" title="${fmtDate(r.start)} → ${fmtDate(r.end)}">
            ${isCurrent ? '<span class="week-badge">📍 EN COURS</span>' : ''}
            <div>S${w.n}<br><span style="font-size:10px;opacity:.6">${yr}</span></div>
          </div>
          <div class="cycle-cell" data-label="Macrocycle">
            <select data-field="macro">${MACROCYCLES.map(m => `<option ${m===w.macro?'selected':''}>${m}</option>`).join('')}</select>
          </div>
          <div class="cycle-cell" data-label="Mésocycle">
            <select data-field="meso">${MESOCYCLES.map(m => `<option ${m===w.meso?'selected':''}>${m}</option>`).join('')}</select>
          </div>
          <div class="cycle-cell" data-label="Microcycle">
            <select data-field="micro">${MICROCYCLES.map(m => `<option ${m===w.micro?'selected':''}>${m}</option>`).join('')}</select>
          </div>
          <div class="cycle-cell" data-label="Qualité">
            <select data-field="quality">${QUALITES_PHYSIQUES.map(m => `<option ${m===w.quality?'selected':''}>${m}</option>`).join('')}</select>
          </div>
          <div class="cycle-cell" style="justify-content:center">
            <button class="btn-icon" data-act="viewWeek" title="Voir semaine">→</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
  $$('#planContent .cycle-row[data-w]').forEach(row => {
    const idx = +row.dataset.w;
    row.querySelectorAll('select').forEach(sel => {
      // Empêche le clic sur le select de propager au row
      sel.addEventListener('click', e => e.stopPropagation());
      sel.addEventListener('change', e => {
        e.stopPropagation();
        A().weeks[idx][sel.dataset.field] = sel.value;
        saveState();
        toast('Plan mis à jour');
      });
    });
    // Clic sur le bouton flèche → sessions
    row.querySelector('[data-act="viewWeek"]').addEventListener('click', e => {
      e.stopPropagation();
      currentSessionWeek = idx; go('sessions');
    });
    // Clic sur toute la ligne (en dehors des contrôles) → sessions
    row.addEventListener('click', e => {
      if (e.target.closest('select, button, input')) return;
      currentSessionWeek = idx;
      go('sessions');
    });
  });
}

// ===================== SESSIONS =====================
let currentSessionWeek = 0;

function renderSessions() {
  const wIdx = currentSessionWeek;
  const w = A().weeks[wIdx];
  const r = weekRange(wIdx);
  $('#view-sessions').classList.add('print-target');
  $('#view-sessions').innerHTML = `
    <div class="print-header">
      <h2>${A().profile.name} — Semaine ${w.n}</h2>
      <div>${fmtDate(r.start)} au ${fmtDate(r.end)} · ${w.macro} · ${w.meso} · ${w.micro}</div>
    </div>

    <div class="plan-toolbar">
      <div class="row">
        <button class="btn btn-ghost btn-sm" id="prevWeek">←</button>
        <div>
          <div style="font-weight:700;font-size:15px">
            Semaine ${w.n} · ${w.meso}
            ${wIdx === currentWeekIndex()
              ? '<span class="tag accent" style="margin-left:8px">📍 En cours</span>'
              : `<span class="tag" style="margin-left:8px">${wIdx < currentWeekIndex() ? '⬅ Passée' : '➡ À venir'}</span>`}
          </div>
          <div class="text-mute">Du ${fmtDate(r.start)} au ${fmtDate(r.end)} · Microcycle : ${w.micro}</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="nextWeek">→</button>
      </div>
      <div class="row">
        <label class="text-mute" style="font-size:12px">Aller à :</label>
        <select id="jumpYear" style="padding:4px 8px">
          ${availableYears().map(y => {
            const isCurYear = y === weekYear(A().weeks[currentWeekIndex()], currentWeekIndex());
            return `<option value="${y}" ${y===weekYear(w,wIdx)?'selected':''}>${y}${isCurYear?' ← actuelle':''}</option>`;
          }).join('')}
        </select>
        <select id="jumpWeek" style="padding:4px 8px">
          ${A().weeks.map((ww, i) => ({ww, i, yr: weekYear(ww,i)}))
            .filter(o => o.yr === weekYear(w,wIdx))
            .map(o => {
              const isCurrent = o.i === currentWeekIndex();
              const isViewing = o.i === wIdx;
              const marker = isCurrent ? ' 📍 (en cours)' : '';
              return `<option value="${o.i}" ${isViewing?'selected':''}>${isCurrent?'▶ ':''}S${o.ww.n}${marker}</option>`;
            }).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" id="goToCurrentWeek" title="Revenir à la semaine en cours">📍 Cette semaine</button>
        <button class="btn btn-ghost btn-sm" id="printWeekBtn" title="Imprimer / PDF">🖨 Imprimer</button>
        <button class="btn btn-accent btn-sm" id="addSessionBtn">+ Nouvelle séance</button>
      </div>
    </div>

    ${renderWeekCalendar(wIdx)}

    <h3 class="section-title">Zones FC cible</h3>
    ${renderFcZones()}

    <h3 class="section-title">Détail des séances</h3>
    <div id="sessionsListWeek"></div>
  `;

  $('#prevWeek').addEventListener('click', () => { if (currentSessionWeek > 0) { currentSessionWeek--; renderSessions(); } });
  $('#nextWeek').addEventListener('click', () => { if (currentSessionWeek < A().weeks.length-1) { currentSessionWeek++; renderSessions(); } });
  $('#jumpYear')?.addEventListener('change', e => {
    const y = +e.target.value;
    const firstIdx = A().weeks.findIndex((ww, i) => weekYear(ww, i) === y);
    if (firstIdx >= 0) { currentSessionWeek = firstIdx; renderSessions(); }
  });
  $('#jumpWeek')?.addEventListener('change', e => {
    currentSessionWeek = +e.target.value;
    renderSessions();
  });
  $('#goToCurrentWeek')?.addEventListener('click', () => {
    currentSessionWeek = currentWeekIndex();
    renderSessions();
  });
  $('#addSessionBtn').addEventListener('click', () => openSessionEditor(null, wIdx));
  $('#printWeekBtn').addEventListener('click', () => {
    // expand all sessions before print
    $$('#sessionsListWeek .session-block').forEach(b => b.classList.add('open'));
    $$('#sessionsListWeek .session-block').forEach((b, i) => renderDoneBox(+b.dataset.i));
    setTimeout(() => window.print(), 200);
  });

  attachDayHandlers(wIdx);
  renderSessionListWeek(wIdx);
}

function renderWeekCalendar(wIdx) {
  const r = weekRange(wIdx);
  return `<div class="week-cal">
    ${DAYS_FR.map((d, i) => {
      const date = addDays(r.start, i);
      const iso = toISO(date);
      const isWork = !!A().workDays[iso];
      const sessions = A().sessions.filter(s => s.week === wIdx+1 && s.day === i+1);
      return `<div class="day-card ${isWork?'work':''}" data-day="${i+1}" data-date="${iso}">
        <div class="day-head">
          <div>
            <div class="day-name">${d}</div>
            <div class="day-date">${fmtDateShort(date)}</div>
          </div>
          <span class="day-tag ${isWork?'work':'rest'}" data-toggle-work>${isWork?'Travail':'OFF'}</span>
        </div>
        <div class="day-sessions">
          ${sessions.map((s, idx) => {
            const dkey = `${wIdx+1}-${i+1}-${idx}`;
            const done = !!A().done[dkey];
            return `<div class="session-pill ${typeClass(s.type)}" data-sidx="${idx}">
              <div class="sp-name">${s.type}${done?' ✓':''}</div>
              <div class="sp-sub">${s.title || s.qualite || ''}${s.duree?` · ${s.duree}'`:''}</div>
            </div>`;
          }).join('') || '<div class="text-mute" style="font-size:11px;padding-top:4px">Rien de prévu</div>'}
        </div>
        <button class="btn btn-ghost btn-sm" data-add-session style="margin-top:auto;font-size:11px;padding:4px 8px">+ Ajouter</button>
      </div>`;
    }).join('')}
  </div>`;
}

function attachDayHandlers(wIdx) {
  $$('.day-card').forEach(card => {
    const day = +card.dataset.day;
    card.querySelector('[data-toggle-work]')?.addEventListener('click', e => {
      e.stopPropagation();
      const iso = card.dataset.date;
      A().workDays[iso] = !A().workDays[iso];
      saveState();
      render($('.nav-item.active').dataset.view);
    });
    card.querySelector('[data-add-session]')?.addEventListener('click', e => {
      e.stopPropagation();
      openSessionEditor(null, wIdx, day);
    });
    card.querySelectorAll('.session-pill').forEach(p => {
      p.addEventListener('click', () => {
        const sidx = +p.dataset.sidx;
        const session = A().sessions.filter(s => s.week === wIdx+1 && s.day === day)[sidx];
        const globalIdx = A().sessions.indexOf(session);
        openSessionEditor(globalIdx, wIdx, day);
      });
    });
  });
}

function renderSessionListWeek(wIdx) {
  const list = A().sessions
    .map((s, i) => ({ s, i }))
    .filter(x => x.s.week === wIdx+1)
    .sort((a,b) => a.s.day - b.s.day);
  if (!list.length) {
    $('#sessionsListWeek').innerHTML = `<div class="empty"><div class="empty-ico">📋</div>Aucune séance pour cette semaine.<br><span class="text-mute">Clique sur "+ Nouvelle séance" pour commencer.</span></div>`;
    return;
  }
  $('#sessionsListWeek').innerHTML = list.map(({s, i}) => {
    const dkey = `${s.week}-${s.day}-0`;
    const done = A().done[dkey];
    const zone = rpeToZone(s.rpe);
    const z = zone ? fcZones()[zone-1] : null;
    return `<div class="session-block" data-i="${i}">
      <div class="session-bhead">
        <div class="row" style="gap:14px">
          <span class="tag ${tagClass(s.type)}">${s.type}</span>
          <div>
            <div class="session-btitle">Jour ${s.day} · ${s.title || s.qualite}</div>
            <div class="session-bdate">${s.qualite || ''} ${s.duree?`· ${s.duree}'`:''} ${s.rpe?`· RPE ${s.rpe}`:''}${z?` · FC cible ${z.lo}–${z.hi}`:''}</div>
          </div>
        </div>
        <div class="row">
          ${done?`<span class="tag accent">✓ Réalisée</span>`:''}
          ${done?.coachComment?`<span class="tag info" title="Commentaire coach">💬</span>`:''}
          ${done?.photos?.length?`<span class="tag purple">📷 ${done.photos.length}</span>`:''}
          <button class="btn-icon" data-act="edit" title="Modifier">✎</button>
          <button class="btn-icon" data-act="delete" title="Supprimer">×</button>
          <button class="btn-icon" data-act="toggle">⌄</button>
        </div>
      </div>
      <div class="session-bbody">
        <div class="section-title" style="margin-top:0">Description</div>
        <div class="session-detail">${(s.details||'').replace(/</g,'&lt;') || '<em>Aucun détail</em>'}</div>
        ${z?`<div class="fc-targets"><span class="ftg">Zone ${z.n} ${z.name}</span><span class="ftg">FC ${z.lo}–${z.hi} bpm</span></div>`:''}
        ${Array.isArray(s.renfoPhotos) && s.renfoPhotos.length ? `
          <div class="section-title">📷 Photos renfo</div>
          <div class="renfo-gallery">${s.renfoPhotos.map(p => `
            <div class="renfo-gallery-item">
              <img src="${p.src}" loading="lazy">
              ${p.caption ? `<div class="renfo-caption">${p.caption.replace(/</g,'&lt;')}</div>` : ''}
            </div>`).join('')}
          </div>` : ''}
        <div class="section-title">Résultats / Réalisation</div>
        <div id="doneBox-${i}"></div>
      </div>
    </div>`;
  }).join('');

  $$('#sessionsListWeek .session-block').forEach(block => {
    const i = +block.dataset.i;
    block.querySelector('[data-act="toggle"]').addEventListener('click', () => {
      block.classList.toggle('open');
      if (block.classList.contains('open')) renderDoneBox(i);
    });
    block.querySelector('.session-bhead').addEventListener('click', e => {
      if (e.target.closest('[data-act]')) return;
      block.classList.toggle('open');
      if (block.classList.contains('open')) renderDoneBox(i);
    });
    block.querySelector('[data-act="edit"]').addEventListener('click', e => {
      e.stopPropagation(); openSessionEditor(i);
    });
    block.querySelector('[data-act="delete"]').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Supprimer cette séance ?')) {
        A().sessions.splice(i, 1); saveState(); renderSessions();
      }
    });
  });
}

function renderDoneBox(globalIdx) {
  const s = A().sessions[globalIdx];
  const dkey = `${s.week}-${s.day}-0`;
  const d = A().done[dkey] || {};
  const box = $(`#doneBox-${globalIdx}`);
  if (!box) return;
  box.innerHTML = `
    <div class="grid grid-4" style="gap:10px">
      <div><label class="text-mute">Date</label><input type="date" data-f="date" value="${d.date||''}"></div>
      <div><label class="text-mute">Distance (km)</label><input type="number" step="0.01" data-f="distance" value="${d.distance||''}"></div>
      <div><label class="text-mute">Vitesse moy. (km/h)</label><input type="number" step="0.01" data-f="vitesse" value="${d.vitesse||''}"></div>
      <div><label class="text-mute">Durée (min)</label><input type="number" data-f="duree" value="${d.duree||s.duree||''}"></div>
      <div><label class="text-mute">FC moyenne</label><input type="number" data-f="fcMoy" value="${d.fcMoy||''}"></div>
      <div><label class="text-mute">FC max</label><input type="number" data-f="fcMax" value="${d.fcMax||''}"></div>
      <div><label class="text-mute">RPE perçu</label><input type="number" min="1" max="10" data-f="rpe" value="${d.rpe||s.rpe||''}"></div>
      <div><label class="text-mute">Charge (auto)</label><input type="text" readonly id="loadAuto-${globalIdx}" value="${trainingLoad(d.rpe||s.rpe, d.duree||s.duree)}"></div>
    </div>

    <div style="margin-top:10px"><label class="text-mute">Commentaire athlète</label><textarea data-f="comment">${d.comment||''}</textarea></div>

    ${state.settings.coachMode ? `
      <div style="margin-top:10px"><label class="text-mute">Commentaire coach (${state.settings.coachName||'Coach'})</label>
        <textarea data-f="coachComment" placeholder="Feedback technique, ajustement pour la suite...">${d.coachComment||''}</textarea>
      </div>
    ` : (d.coachComment ? `<div class="coach-fb"><div class="cfb-head">💬 ${state.settings.coachName||'Coach'}</div><p>${(d.coachComment||'').replace(/</g,'&lt;')}</p></div>` : '')}

    <div class="section-title" style="font-size:13px">📥 Import Garmin (.GPX / .TCX / .FIT)</div>
    <div class="gpx-drop" data-gpx-drop>
      Glisser un fichier <strong>.GPX</strong>, <strong>.TCX</strong> ou <strong>.FIT</strong> ici ou <strong>cliquer pour sélectionner</strong><br>
      <span class="text-mute">Auto-remplissage : distance, durée, FC moy/max, calories, dénivelé, cadence</span>
      <input type="file" accept=".gpx,.tcx,.fit" hidden data-gpx-input>
    </div>

    <div class="section-title" style="font-size:13px">📷 Photos</div>
    <div class="photo-gallery" id="photoGallery-${globalIdx}"></div>

    <div class="modal-actions">
      <button class="btn btn-ghost btn-sm" data-act="unmark">Marquer non réalisée</button>
      <button class="btn btn-accent btn-sm" data-act="save">💾 Enregistrer</button>
    </div>
  `;

  // auto-update charge
  const updateLoad = () => {
    const rpe = +box.querySelector('[data-f="rpe"]').value;
    const duree = +box.querySelector('[data-f="duree"]').value;
    $(`#loadAuto-${globalIdx}`).value = trainingLoad(rpe, duree);
  };
  box.querySelector('[data-f="rpe"]').addEventListener('input', updateLoad);
  box.querySelector('[data-f="duree"]').addEventListener('input', updateLoad);

  // auto-calc vitesse if distance + duree
  const updateSpeed = () => {
    const distInput = box.querySelector('[data-f="distance"]');
    const dureeInput = box.querySelector('[data-f="duree"]');
    const speedInput = box.querySelector('[data-f="vitesse"]');
    const dist = +distInput.value, dur = +dureeInput.value;
    if (dist && dur && !speedInput.dataset.touched) {
      speedInput.value = (dist / (dur/60)).toFixed(2);
    }
  };
  box.querySelector('[data-f="distance"]').addEventListener('input', updateSpeed);
  box.querySelector('[data-f="duree"]').addEventListener('input', updateSpeed);
  box.querySelector('[data-f="vitesse"]').addEventListener('input', e => e.target.dataset.touched = '1');

  // save
  box.querySelector('[data-act="save"]').addEventListener('click', () => {
    const obj = { ...A().done[dkey] };
    box.querySelectorAll('[data-f]').forEach(el => obj[el.dataset.f] = el.value);
    if (!obj.date) obj.date = toISO(addDays(weekStartDate(s.week-1), s.day-1));
    A().done[dkey] = obj;
    saveState();
    toast('Séance enregistrée ✓');
    renderSessionListWeek(s.week-1);
  });
  box.querySelector('[data-act="unmark"]').addEventListener('click', () => {
    delete A().done[dkey]; saveState(); renderSessionListWeek(s.week-1);
  });

  // GPX
  const drop = box.querySelector('[data-gpx-drop]');
  const gpxInput = box.querySelector('[data-gpx-input]');
  drop.addEventListener('click', () => gpxInput.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag');
    const f = e.dataTransfer.files[0]; if (f) processActivity(f, box);
  });
  gpxInput.addEventListener('change', e => { if (e.target.files[0]) processActivity(e.target.files[0], box); });

  // photos
  renderPhotoGallery(globalIdx, dkey);
}

// ===================== GARMIN PARSERS (GPX / TCX / FIT) =====================
async function processActivity(file, box) {
  try {
    const r = await parseActivity(file);
    if (r.distance) box.querySelector('[data-f="distance"]').value = r.distance.toFixed(2);
    if (r.duree) box.querySelector('[data-f="duree"]').value = Math.round(r.duree);
    if (r.fcMoy) box.querySelector('[data-f="fcMoy"]').value = r.fcMoy;
    if (r.fcMax) box.querySelector('[data-f="fcMax"]').value = r.fcMax;
    if (r.startDate) box.querySelector('[data-f="date"]').value = r.startDate;
    if (r.distance && r.duree) {
      box.querySelector('[data-f="vitesse"]').value = (r.distance / (r.duree/60)).toFixed(2);
    }
    box.querySelector('[data-f="duree"]').dispatchEvent(new Event('input'));
    toast(`${r.format} importé : ${r.distance?.toFixed(2)||'?'} km · ${Math.round(r.duree||0)} min`);
  } catch (e) {
    toast('Fichier invalide : ' + e.message);
  }
}

function parseGPX(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML invalide');
  const pts = [...doc.querySelectorAll('trkpt')].map(p => {
    const lat = parseFloat(p.getAttribute('lat'));
    const lon = parseFloat(p.getAttribute('lon'));
    const time = p.querySelector('time')?.textContent;
    const ele = parseFloat(p.querySelector('ele')?.textContent);
    const hr = parseInt(p.getElementsByTagNameNS('*', 'hr')[0]?.textContent
            || p.querySelector('extensions hr')?.textContent
            || p.querySelector('*|hr')?.textContent || '');
    return { lat, lon, time, ele: isFinite(ele)?ele:null, hr: isFinite(hr) ? hr : null };
  }).filter(p => isFinite(p.lat));

  if (!pts.length) throw new Error('Aucun point GPS trouvé');

  let dist = 0;
  for (let i = 1; i < pts.length; i++) {
    dist += haversine(pts[i-1].lat, pts[i-1].lon, pts[i].lat, pts[i].lon);
  }
  let duree = null;
  if (pts[0].time && pts[pts.length-1].time) {
    duree = (new Date(pts[pts.length-1].time) - new Date(pts[0].time)) / 60000;
  }
  const hrs = pts.map(p => p.hr).filter(h => h);
  const fcMoy = hrs.length ? Math.round(hrs.reduce((a,b)=>a+b,0)/hrs.length) : null;
  const fcMax = hrs.length ? Math.max(...hrs) : null;
  const startDate = pts[0].time ? pts[0].time.slice(0,10) : null;
  const eleGain = computeElevGain(pts.map(p => p.ele).filter(e => e != null));
  const name = doc.querySelector('trk > name')?.textContent || doc.querySelector('metadata > name')?.textContent || null;
  const sport = doc.querySelector('*|type')?.textContent || null;
  return { format:'GPX', distance: dist, duree, fcMoy, fcMax, startDate, eleGain, name, sport };
}

function parseTCX(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML invalide');
  const acts = [...doc.getElementsByTagName('*')].filter(n => n.localName === 'Activity');
  if (!acts.length) throw new Error('Aucune Activity dans le TCX');
  const act = acts[0];
  const sport = act.getAttribute('Sport') || null;
  const id = act.getElementsByTagName('Id')[0]?.textContent || null;
  const startDate = id ? id.slice(0,10) : null;
  const laps = [...act.getElementsByTagName('Lap')];

  let dist = 0, secs = 0, calories = 0;
  let hrSum = 0, hrCount = 0, hrMax = 0;
  let cadSum = 0, cadCount = 0;
  laps.forEach(l => {
    const td = +l.getElementsByTagName('TotalTimeSeconds')[0]?.textContent || 0;
    const dm = +l.getElementsByTagName('DistanceMeters')[0]?.textContent || 0;
    const cal = +l.getElementsByTagName('Calories')[0]?.textContent || 0;
    secs += td; dist += dm; calories += cal;
    const avgHr = +l.getElementsByTagName('AverageHeartRateBpm')[0]?.getElementsByTagName('Value')[0]?.textContent || 0;
    const maxHr = +l.getElementsByTagName('MaximumHeartRateBpm')[0]?.getElementsByTagName('Value')[0]?.textContent || 0;
    if (avgHr) { hrSum += avgHr * td; hrCount += td; }
    if (maxHr > hrMax) hrMax = maxHr;
    const cad = +l.getElementsByTagName('Cadence')[0]?.textContent || 0;
    if (cad) { cadSum += cad; cadCount++; }
  });

  // fallback: parse trackpoints if no HR at lap level
  if (!hrCount) {
    const tps = [...act.getElementsByTagName('Trackpoint')];
    tps.forEach(tp => {
      const v = +tp.getElementsByTagName('HeartRateBpm')[0]?.getElementsByTagName('Value')[0]?.textContent || 0;
      if (v) { hrSum += v; hrCount++; if (v > hrMax) hrMax = v; }
    });
    if (hrCount) hrSum = hrSum * 60; // pseudo-weighted by time, then divide by 60 below
  }
  // elev gain from trackpoints
  const eles = [...act.getElementsByTagName('Trackpoint')].map(tp =>
    parseFloat(tp.getElementsByTagName('AltitudeMeters')[0]?.textContent || '')
  ).filter(v => isFinite(v));

  return {
    format: 'TCX',
    distance: dist / 1000,
    duree: secs / 60,
    fcMoy: hrCount ? Math.round(hrSum / hrCount) : null,
    fcMax: hrMax || null,
    startDate,
    calories: calories || null,
    cadence: cadCount ? Math.round(cadSum / cadCount) : null,
    eleGain: computeElevGain(eles),
    sport,
    name: sport ? `${sport} ${startDate}` : startDate
  };
}

function computeElevGain(elevations) {
  if (!elevations.length) return null;
  let gain = 0;
  for (let i = 1; i < elevations.length; i++) {
    const d = elevations[i] - elevations[i-1];
    if (d > 0) gain += d;
  }
  return Math.round(gain);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ===================== LAZY-LOAD HELPERS =====================
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some(s => s.src === src)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('Échec chargement ' + src));
    document.head.appendChild(s);
  });
}

let _fitLoaded = false;
async function parseFIT(buffer) {
  if (!_fitLoaded) {
    await loadScript('https://cdn.jsdelivr.net/npm/fit-file-parser@1.9.0/dist/fit-parser.min.js');
    _fitLoaded = true;
  }
  return new Promise((resolve, reject) => {
    const Parser = window.FitParser || (window.fitFileParser && window.fitFileParser.default) || window.fitParser;
    if (!Parser) return reject(new Error('FIT parser non chargé'));
    const fp = new Parser({ force: true, speedUnit: 'km/h', lengthUnit: 'km', temperatureUnit: 'celsius', elapsedRecordField: true, mode: 'cascade' });
    fp.parse(buffer, (err, data) => {
      if (err) return reject(new Error('FIT illisible: ' + err));
      try {
        const activity = data.activity || data;
        const sessions = activity.sessions || (data.activity?.sessions) || [];
        const session = sessions[0] || activity.session || {};
        const start = session.start_time || activity.timestamp || activity.local_timestamp;
        const distance = session.total_distance || 0;
        const duration = (session.total_elapsed_time || session.total_timer_time || 0) / 60;
        const fcMoy = session.avg_heart_rate || null;
        const fcMax = session.max_heart_rate || null;
        const cad = session.avg_cadence ? Math.round(session.avg_cadence * 2) : null; // cadence pas
        const calories = session.total_calories || null;
        const eleGain = session.total_ascent || null;
        const sport = session.sport || activity.sport || null;
        const startDate = start ? new Date(start).toISOString().slice(0,10) : null;
        resolve({
          format: 'FIT', distance, duree: duration, fcMoy, fcMax, startDate,
          calories, cadence: cad, eleGain, sport, name: sport ? `${sport} ${startDate}` : startDate
        });
      } catch (e) { reject(new Error('FIT structure imprévue: ' + e.message)); }
    });
  });
}

async function parseActivity(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'gpx') {
    const text = await file.text();
    return parseGPX(text);
  }
  if (ext === 'tcx') {
    const text = await file.text();
    return parseTCX(text);
  }
  if (ext === 'fit') {
    const buf = await file.arrayBuffer();
    return parseFIT(buf);
  }
  throw new Error('Format non supporté : .' + ext);
}

// ===================== CSV PARSER (multi-activités) =====================
// Détecte automatiquement séparateur, encodage BOM, et colonnes FR/EN
function parseCSV(text) {
  // BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // Détection séparateur en parcourant les 5 premières lignes non-vides
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 5);
  const candidates = [',', ';', '\t', '|'];
  const sep = candidates
    .map(c => ({ c, score: lines.reduce((acc, l) => acc + l.split(c).length, 0) }))
    .sort((a,b) => b.score - a.score)[0].c;

  const rows = csvToRows(text, sep);
  if (rows.length < 2) throw new Error('CSV vide ou pas de données');

  // Essayer les 5 premières lignes comme potentielle en-tête, garder celle qui matche le mieux
  let best = { score: -1, headerRow: 0, idx: {}, header: [] };
  for (let h = 0; h < Math.min(5, rows.length); h++) {
    const header = rows[h].map(c => normalize(c));
    const nonEmpty = header.filter(c => c).length;
    if (nonEmpty < 3) continue; // header trop pauvre
    const idx = mapHeaderToFields(header);
    const matches = Object.keys(idx).length;
    const score = matches * 10 + nonEmpty;
    if (score > best.score) best = { score, headerRow: h, idx, header };
  }

  if (best.score < 0 || best.idx.date == null) {
    // Cas fréquent : l'utilisateur a fait "Exporter l'intervalle" (les tours/splits
    // d'UNE activité). Ce fichier n'a PAS de colonne date, c'est normal.
    const isSplits = best.header.some(h =>
      /^intervalle|^tour\b|^lap\b|^split|^fractionn|^r[eé]capitulatif/.test(h));
    if (isSplits) {
      throw new Error(
        `Ce fichier est un export des TOURS / INTERVALLES d'une seule activité — ` +
        `il ne contient aucune date, donc impossible de le rattacher à une séance.\n\n` +
        `➡ Pour importer cette activité : sur Garmin Connect, ouvre l'activité → ⚙ → ` +
        `"Exporter en .TCX" (ou .GPX) et glisse ce fichier ici.\n` +
        `➡ Pour importer tout ton historique d'un coup : page "Activités" (liste) → ` +
        `menu ⋯ en haut → "Exporter au format CSV".`
      );
    }
    // Aperçu pour diagnostic
    const preview = rows.slice(0, 4).map((r, i) => `Ligne ${i+1}: ${r.slice(0, 6).join(' | ')}${r.length>6?' …':''}`).join('\n');
    throw new Error(
      `Aucune colonne date détectée.\n\n` +
      `Aperçu du fichier :\n${preview}\n\n` +
      `Ce CSV ne ressemble pas à l'export "Activities" de Garmin Connect.\n` +
      `Va sur connect.garmin.com/modern/activities → menu ⋯ → "Exporter au format CSV".`
    );
  }

  const out = [];
  for (let r = best.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => !c || !c.trim())) continue;
    try {
      const a = rowToActivity(row, best.idx);
      if (a) out.push(a);
    } catch (e) { /* skip */ }
  }
  if (!out.length) throw new Error('Colonnes reconnues mais aucune ligne de données valide après l\'en-tête');
  return out;
}

function csvToRows(text, sep) {
  const rows = [];
  let row = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i+1];
    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else field += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === sep) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
        if (ch === '\r' && next === '\n') i++;
      } else field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normalize(s) {
  return (s||'').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Mappe les colonnes du header vers les champs standards
function mapHeaderToFields(header) {
  const idx = {};
  const patterns = {
    date: [/^date$/, /^date.*activit/, /^jour$/, /^when$/, /^start.*date/, /^start.*time/, /^begin/, /^activity.*date/, /^debut/],
    title: [/^titre$/, /^title$/, /^nom$/, /^name$/, /^activity.*name/],
    sport: [/^type/, /^activit.*type/, /^sport/, /^discipline/, /^activity.*type/],
    distance: [/^distance(\s*\(.*\))?$/, /^distance.*km/, /^dist\b/, /^km$/, /^miles$/, /^distance.*m\b/],
    duree: [/^temps$/, /^duree/, /^duration/, /^total.*time/, /^elapsed/, /^moving/, /^time$/],
    fcMoy: [/^fc.*moy/, /^fc.*avg/, /^avg.*hr/, /^heart.*avg/, /^avg.*heart/, /^moyenne.*fc/, /^bpm.*moy/, /^average.*hr/],
    fcMax: [/^fc.*max/, /^max.*fc/, /^max.*hr/, /^hr.*max/, /^maximum.*hr/, /^maximum.*fc/],
    calories: [/^cal/, /^kcal/, /^energ/],
    cadence: [/^cadence/, /^cad.*moy/, /^avg.*cadence/],
    eleGain: [/^denivel/, /^elev.*gain/, /^gain.*elev/, /^total.*ascent/, /^ascent/, /^d\+/, /^d \+/],
    vitesse: [/^vitesse.*moy/, /^avg.*speed/, /^speed/],
    allure: [/^allure/, /^pace/]
  };
  header.forEach((h, i) => {
    for (const [field, regs] of Object.entries(patterns)) {
      if (idx[field] != null) continue;
      if (regs.some(re => re.test(h))) { idx[field] = i; break; }
    }
  });
  return idx;
}

function rowToActivity(row, idx) {
  const get = k => idx[k] != null ? (row[idx[k]] || '').toString().trim() : '';
  const raw = {
    date: get('date'),
    title: get('title'),
    sport: get('sport'),
    distance: get('distance'),
    duree: get('duree'),
    fcMoy: get('fcMoy'),
    fcMax: get('fcMax'),
    calories: get('calories'),
    cadence: get('cadence'),
    eleGain: get('eleGain'),
    vitesse: get('vitesse'),
    allure: get('allure')
  };
  const startDate = parseCSVDate(raw.date);
  if (!startDate) return null;
  const distance = parseCSVDistance(raw.distance);
  const duree = parseCSVDuration(raw.duree);
  const fcMoy = parseCSVInt(raw.fcMoy);
  const fcMax = parseCSVInt(raw.fcMax);
  const calories = parseCSVInt(raw.calories);
  const cadence = parseCSVInt(raw.cadence);
  const eleGain = parseCSVInt(raw.eleGain);
  return {
    format: 'CSV',
    startDate, distance, duree, fcMoy, fcMax, calories, cadence, eleGain,
    sport: raw.sport || null,
    name: raw.title || raw.sport || `Activité ${startDate}`
  };
}

function parseCSVDate(s) {
  if (!s) return null;
  s = s.trim();
  // ISO 8601
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // YYYY/MM/DD
  let m = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  // DD/MM/YYYY or DD-MM-YYYY (FR default)
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // try Date.parse fallback
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0,10);
  return null;
}

function parseCSVDistance(s) {
  if (!s) return null;
  s = s.toString().replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g,'');
  const v = parseFloat(s);
  if (!isFinite(v)) return null;
  // si valeur très grande → probablement en mètres
  return v > 1000 ? v / 1000 : v;
}

function parseCSVDuration(s) {
  if (!s) return null;
  s = s.toString().trim();
  // format HH:MM:SS ou MM:SS
  if (/:/.test(s)) {
    const parts = s.split(':').map(p => parseFloat(p.replace(',','.')));
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0]*60 + parts[1] + parts[2]/60;
    if (parts.length === 2) return parts[0] + parts[1]/60;
  }
  // format "1h23m45s" / "1h 23min"
  let total = 0;
  const h = s.match(/(\d+(?:[.,]\d+)?)\s*h/i);
  const min = s.match(/(\d+(?:[.,]\d+)?)\s*(?:min|m\b)/i);
  const sec = s.match(/(\d+(?:[.,]\d+)?)\s*s/i);
  if (h) total += parseFloat(h[1].replace(',','.')) * 60;
  if (min) total += parseFloat(min[1].replace(',','.'));
  if (sec) total += parseFloat(sec[1].replace(',','.')) / 60;
  if (total > 0) return total;
  // nombre brut : >999 = secondes, sinon minutes
  const v = parseFloat(s.replace(',','.'));
  if (isFinite(v)) return v > 999 ? v/60 : v;
  return null;
}

function parseCSVInt(s) {
  if (!s) return null;
  const v = parseInt(s.toString().replace(/[^\d]/g, ''));
  return isFinite(v) ? v : null;
}

// ===================== IMPORTS GARMIN =====================
let importQueue = []; // [{id, name, status, parsed?, error?, matchKey?, applied?}]
let importCounter = 0;

function renderImports() {
  $('#view-imports').innerHTML = `
    <div class="imp-drop" id="impDrop">
      <div class="imp-ico">📥</div>
      <div class="imp-title">Glisser des fichiers ici</div>
      <div class="imp-sub">
        Formats supportés : <strong>.GPX</strong> · <strong>.TCX</strong> · <strong>.FIT</strong> · <strong>.CSV</strong> · <strong>.ZIP</strong>
        <br>Plusieurs fichiers acceptés — un CSV peut contenir des centaines d'activités d'un coup
      </div>
      <input type="file" id="impInput" multiple accept=".gpx,.tcx,.fit,.csv,.zip" hidden>
    </div>

    <div class="row" style="justify-content:space-between;margin-bottom:10px">
      <div class="text-mute" id="impStatus"></div>
      <div class="row">
        <button class="btn btn-ghost btn-sm" id="impClear">🗑 Vider la liste</button>
        <button class="btn btn-accent btn-sm" id="impApplyAll">✓ Tout appliquer</button>
      </div>
    </div>

    <div id="impSummary"></div>
    <div class="imp-list" id="impList"></div>

    <div class="card mt-16">
      <div class="card-h"><h3>Comment récupérer tes fichiers ?</h3></div>
      <div style="font-size:13px;line-height:1.7;color:var(--text-soft)">
        <strong>📄 CSV (recommandé pour l'historique complet) :</strong><br>
        1. Sur Garmin Connect → <em>Activités</em> (vue liste)<br>
        2. Filtre tes activités si besoin (type, période)<br>
        3. Tout en haut à droite, icône <strong>⤓ Exporter au format CSV</strong><br>
        4. Glisse le CSV ici → toutes les activités du fichier sont importées et auto-associées<br><br>
        <strong>📍 Activité individuelle (GPX / TCX / FIT) :</strong><br>
        1. Garmin Connect → ouvre une activité<br>
        2. Icône <strong>⚙</strong> en haut à droite → "Exporter en .TCX"<br>
        3. Glisse le fichier ici (données plus riches : GPS, dénivelé, cadence)<br><br>
        <strong>📦 Export en masse Garmin (toutes tes données) :</strong><br>
        1. Va sur <code>garmin.com/account/datamanagement/exportdata</code><br>
        2. Demande "Exporter mes données" → email avec un ZIP<br>
        3. Glisse le ZIP entier ici<br><br>
        <strong>💡 Astuce :</strong> CSV → idéal pour des dizaines de séances vite fait. TCX/FIT → idéal pour une séance précise avec toutes les données.
      </div>
    </div>
  `;

  const drop = $('#impDrop'), input = $('#impInput');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag');
    handleImportFiles([...e.dataTransfer.files]);
  });
  input.addEventListener('change', e => handleImportFiles([...e.target.files]));

  $('#impClear').addEventListener('click', () => { importQueue = []; renderImportList(); renderImportSummary(); });
  $('#impApplyAll').addEventListener('click', applyAllMatches);

  renderImportList();
  renderImportSummary();
}

async function handleImportFiles(files) {
  // 1) expand ZIPs into individual files
  const expanded = [];
  for (const f of files) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (ext === 'zip') {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
        const zip = await JSZip.loadAsync(f);
        let count = 0;
        for (const fname of Object.keys(zip.files)) {
          const entry = zip.files[fname];
          if (entry.dir) continue;
          const e2 = fname.split('.').pop().toLowerCase();
          if (!['gpx','tcx','fit','csv'].includes(e2)) continue;
          const blob = await entry.async('blob');
          expanded.push(new File([blob], fname.split('/').pop(), { type: blob.type }));
          count++;
        }
        toast(`ZIP : ${count} fichiers extraits`);
      } catch (e) {
        toast('Erreur ZIP : ' + e.message);
      }
    } else {
      expanded.push(f);
    }
  }

  // 2) handle CSVs immediately (1 file = N activities)
  for (const f of expanded.filter(x => x.name.toLowerCase().endsWith('.csv'))) {
    try {
      const text = await f.text();
      const activities = parseCSV(text);
      activities.forEach((a, i) => {
        const item = {
          id: ++importCounter,
          name: `${f.name} · ligne ${i+2}${a.name?' · '+a.name:''}`,
          parsed: a,
          matchKey: autoMatchSession(a),
          status: 'pending'
        };
        item.status = item.matchKey ? 'matched' : 'pending';
        importQueue.push(item);
      });
      toast(`CSV "${f.name}" : ${activities.length} activités importées`);
    } catch (e) {
      importQueue.push({
        id: ++importCounter, name: f.name, status: 'error', error: e.message
      });
    }
  }

  // 3) queue file-based formats (GPX/TCX/FIT) for parsing
  for (const f of expanded.filter(x => !x.name.toLowerCase().endsWith('.csv'))) {
    importQueue.push({
      id: ++importCounter,
      name: f.name,
      file: f,
      status: 'parsing'
    });
  }
  renderImportList();
  renderImportSummary();

  // 4) parse in series (FIT lib safety)
  for (const item of importQueue.filter(x => x.status === 'parsing')) {
    try {
      const parsed = await parseActivity(item.file);
      item.parsed = parsed;
      item.matchKey = autoMatchSession(parsed);
      item.status = item.matchKey ? 'matched' : 'pending';
    } catch (e) {
      item.status = 'error';
      item.error = e.message;
    }
  }

  // 5) AUTO-APPLY : si auto-match trouvé, on applique direct et on sauve
  let autoApplied = 0;
  importQueue.filter(x => x.matchKey && !x.applied && x.parsed).forEach(item => {
    applyImport(item.id);
    autoApplied++;
  });
  // celles SANS match → on les crée comme nouvelles séances aussi
  let autoCreated = 0;
  importQueue.filter(x => x.status === 'pending' && !x.applied && x.parsed && x.parsed.startDate).forEach(item => {
    applyImport(item.id);
    autoCreated++;
  });

  renderImportList();
  renderImportSummary();
  const total = autoApplied + autoCreated;
  if (total > 0) {
    toast(`✓ ${total} activité${total>1?'s':''} enregistrée${total>1?'s':''} automatiquement`);
  } else {
    toast('Import terminé');
  }
}

function autoMatchSession(parsed) {
  if (!parsed.startDate) return null;
  const target = new Date(parsed.startDate);
  // type guess
  const sportLow = (parsed.sport || '').toLowerCase();
  const guessType = sportLow.includes('walk') || sportLow.includes('hik') || sportLow.includes('march') ? 'Marche'
    : sportLow.includes('run') || sportLow.includes('cours') ? 'CAP'
    : null;

  // candidates: same date first, then ±1 day
  let candidates = [];
  A().sessions.forEach((s, idx) => {
    if (A().done[`${s.week}-${s.day}-0`]) return; // skip already done
    const startW = weekStartDate(s.week-1);
    const sessDate = addDays(startW, s.day-1);
    const diff = Math.abs((sessDate - target) / 86400000);
    if (diff <= 2) {
      let score = 5 - diff;
      if (guessType && s.type === guessType) score += 3;
      candidates.push({ s, idx, diff, score, key: `${s.week}-${s.day}-0` });
    }
  });
  candidates.sort((a,b) => b.score - a.score);
  return candidates[0]?.key || null;
}

function renderImportSummary() {
  const total = importQueue.length;
  if (!total) { $('#impSummary').innerHTML = ''; return; }
  const matched = importQueue.filter(x => x.status === 'matched').length;
  const pending = importQueue.filter(x => x.status === 'pending').length;
  const applied = importQueue.filter(x => x.applied).length;
  const errors = importQueue.filter(x => x.status === 'error').length;
  $('#impSummary').innerHTML = `<div class="imp-summary">
    <div class="imp-stat"><div class="imp-stat-val">${total}</div><div class="imp-stat-lbl">Total</div></div>
    <div class="imp-stat"><div class="imp-stat-val" style="color:var(--accent)">${matched}</div><div class="imp-stat-lbl">Déjà planifiées</div></div>
    <div class="imp-stat"><div class="imp-stat-val" style="color:var(--warn)">${pending}</div><div class="imp-stat-lbl">Nouvelles séances</div></div>
    <div class="imp-stat"><div class="imp-stat-val" style="color:var(--accent)">${applied}</div><div class="imp-stat-lbl">Enregistrées</div></div>
  </div>`;
  $('#impStatus').textContent = errors ? `${errors} erreur(s)` : `${total} fichier(s) en file`;
}

function renderImportList() {
  if (!importQueue.length) {
    $('#impList').innerHTML = `<div class="empty"><div class="empty-ico">📥</div>Aucun fichier importé pour l'instant<br><span class="text-mute">Glisse-dépose des fichiers Garmin ci-dessus</span></div>`;
    return;
  }
  $('#impList').innerHTML = importQueue.map(item => {
    const cls = item.applied ? 'applied' : item.status;
    if (item.status === 'parsing') {
      return `<div class="imp-item pending" data-id="${item.id}">
        <div>
          <div class="imp-name">${item.name}</div>
          <div class="imp-meta"><span>⏳ Analyse en cours...</span></div>
          <div class="imp-progress"><div class="imp-progress-fill" style="width:60%;animation:none"></div></div>
        </div>
        <div></div>
        <div></div>
      </div>`;
    }
    if (item.status === 'error') {
      const safeErr = (item.error || 'Erreur inconnue').replace(/</g, '&lt;');
      return `<div class="imp-item error" data-id="${item.id}">
        <div>
          <div class="imp-name">${item.name}</div>
          <div class="imp-meta"><span style="color:var(--danger);white-space:pre-line;display:block;line-height:1.5">❌ ${safeErr}</span></div>
        </div>
        <div></div>
        <div><button class="btn-icon" data-rm="${item.id}" title="Retirer">×</button></div>
      </div>`;
    }
    const p = item.parsed;
    const matchOpts = buildMatchOptions(item);
    const target = previewImportTarget(p);
    return `<div class="imp-item ${cls}" data-id="${item.id}">
      <div>
        <div class="imp-name">${item.name} <span class="tag">${p.format}</span></div>
        <div class="imp-meta">
          ${p.startDate?`<span>📅 <strong>${fmtDate(p.startDate)}</strong></span>`:''}
          ${p.sport?`<span>🏷 <strong>${p.sport}</strong></span>`:''}
          ${p.distance?`<span>📏 <strong>${p.distance.toFixed(2)}</strong> km</span>`:''}
          ${p.duree?`<span>⏱ <strong>${Math.round(p.duree)}</strong> min</span>`:''}
          ${p.fcMoy?`<span>♥ <strong>${p.fcMoy}</strong> / ${p.fcMax||'–'}</span>`:''}
          ${p.calories?`<span>🔥 <strong>${p.calories}</strong> kcal</span>`:''}
          ${p.eleGain?`<span>⛰ <strong>${p.eleGain}</strong> m D+</span>`:''}
          ${p.cadence?`<span>👣 <strong>${p.cadence}</strong></span>`:''}
        </div>
        ${target ? `<div class="imp-target">→ Semaine <strong>S${target.weekN}</strong> (${target.year}) · ${target.dayName}</div>` : '<div class="imp-target imp-target-err">⚠ Date hors du plan</div>'}
      </div>
      <div class="imp-match">
        <label class="text-mute">Associer à</label>
        <select data-match="${item.id}">
          <option value="">— Créer une nouvelle séance —</option>
          ${matchOpts}
        </select>
      </div>
      <div class="imp-actions">
        ${item.applied
          ? `<span class="tag accent">✓ Appliqué</span>
             ${target ? `<button class="btn btn-ghost btn-sm" data-goto="${target.wIdx}">📂 Voir</button>` : ''}`
          : `<button class="btn btn-accent btn-sm" data-apply="${item.id}">✓ Appliquer</button>`}
        <button class="btn-icon" data-rm="${item.id}" title="Retirer">×</button>
      </div>
    </div>`;
  }).join('');

  $$('#impList [data-match]').forEach(sel => sel.addEventListener('change', e => {
    const item = importQueue.find(x => x.id == sel.dataset.match);
    item.matchKey = e.target.value || null;
    item.status = item.matchKey ? 'matched' : 'pending';
    renderImportSummary();
  }));
  $$('#impList [data-apply]').forEach(b => b.addEventListener('click', () => applyImport(+b.dataset.apply)));
  $$('#impList [data-goto]').forEach(b => b.addEventListener('click', () => {
    currentSessionWeek = +b.dataset.goto;
    go('sessions');
  }));
  $$('#impList [data-rm]').forEach(b => b.addEventListener('click', () => {
    importQueue = importQueue.filter(x => x.id != b.dataset.rm);
    renderImportList(); renderImportSummary();
  }));
}

// Calcule la semaine de planification où l'activité importée va atterrir
function previewImportTarget(p) {
  if (!p?.startDate) return null;
  const dt = new Date(p.startDate);
  const start = new Date(A().startDate);
  const diffDays = Math.floor((dt - start) / 86400000);
  if (diffDays < 0) return null;
  const wIdx = Math.floor(diffDays / 7);
  if (wIdx >= A().weeks.length) return null;
  const w = A().weeks[wIdx];
  const dayIdx = diffDays - wIdx * 7;
  return {
    wIdx,
    weekN: w.n,
    year: w.startDate ? new Date(w.startDate).getFullYear() : weekStartDate(wIdx).getFullYear(),
    dayName: DAYS_FR[Math.max(0, Math.min(6, dayIdx))]
  };
}

function buildMatchOptions(item) {
  // list all unfilled sessions, sorted by date proximity
  const target = item.parsed?.startDate ? new Date(item.parsed.startDate) : null;
  const opts = A().sessions.map((s, idx) => {
    const key = `${s.week}-${s.day}-0`;
    const startW = weekStartDate(s.week-1);
    const sessDate = addDays(startW, s.day-1);
    const diff = target ? Math.abs((sessDate - target)/86400000) : 999;
    return { s, idx, key, sessDate, diff, taken: !!A().done[key] };
  }).filter(o => !o.taken || o.key === item.matchKey)
    .sort((a,b) => a.diff - b.diff);
  return opts.map(o =>
    `<option value="${o.key}" ${o.key === item.matchKey?'selected':''}>${fmtDate(o.sessDate)} · S${A().weeks[o.s.week-1]?.n ?? o.s.week}J${o.s.day} · ${o.s.type} · ${o.s.title||o.s.qualite||''}</option>`
  ).join('');
}

function applyImport(id) {
  const item = importQueue.find(x => x.id === id);
  if (!item || !item.parsed) return;
  const p = item.parsed;
  let key = item.matchKey;
  let session;

  if (!key) {
    // create new session
    const startISO = p.startDate;
    if (!startISO) { toast('Date manquante pour créer la séance'); return; }
    const dt = new Date(startISO);
    const wIdx = Math.max(0, Math.floor((dt - new Date(A().startDate)) / 86400000 / 7));
    while (A().weeks.length <= wIdx) {
      const last = A().weeks[A().weeks.length-1];
      A().weeks.push({ n: A().weeks.length+1, macro:last.macro, meso:last.meso, micro:'Récupération', quality:last.quality, note:'' });
    }
    const startW = weekStartDate(wIdx);
    const dayIdx = Math.floor((dt - startW) / 86400000);
    const day = Math.max(1, Math.min(7, dayIdx + 1));
    const act = normalizeActivity(p.sport);
    const type = act === 'Course' || act === 'Trail' ? 'CAP'
      : act === 'Renfo' ? 'Renfo'
      : act === 'Mobilité' || act === 'Yoga' ? 'Mobilité'
      : 'Marche';
    session = {
      week: wIdx+1, day, type,
      title: p.name || `${type} ${fmtDate(p.startDate)}`,
      qualite: '', objectif: 'Importé Garmin',
      duree: Math.round(p.duree||0),
      rpe: 3, details: `Activité importée depuis Garmin (${p.format})`
    };
    A().sessions.push(session);
    key = `${session.week}-${session.day}-0`;
  } else {
    session = A().sessions.find(s => `${s.week}-${s.day}-0` === key);
  }

  // fill done
  const existing = A().done[key] || {};
  A().done[key] = {
    ...existing,
    date: p.startDate,
    distance: p.distance ? p.distance.toFixed(2) : existing.distance,
    duree: p.duree ? Math.round(p.duree) : existing.duree,
    vitesse: (p.distance && p.duree) ? (p.distance / (p.duree/60)).toFixed(2) : existing.vitesse,
    fcMoy: p.fcMoy || existing.fcMoy,
    fcMax: p.fcMax || existing.fcMax,
    calories: p.calories || existing.calories,
    eleGain: p.eleGain || existing.eleGain,
    cadence: p.cadence || existing.cadence,
    sport: p.sport || existing.sport || null,
    rpe: existing.rpe || session.rpe || 3,
    source: 'Garmin ' + p.format,
    sourceFile: item.name,
    comment: existing.comment || ''
  };
  saveState();
  item.applied = true;
  toast(`Appliqué à S${session.week}J${session.day}`);
  renderImportList();
  renderImportSummary();
}

function applyAllMatches() {
  let n = 0;
  importQueue.filter(x => x.matchKey && !x.applied && x.parsed).forEach(item => {
    applyImport(item.id); n++;
  });
  if (n === 0) toast('Rien à appliquer (sélectionne d\'abord une association)');
  else toast(`${n} séance(s) appliquée(s)`);
}

// ===================== PHOTOS =====================
function renderPhotoGallery(globalIdx, dkey) {
  const gal = $(`#photoGallery-${globalIdx}`); if (!gal) return;
  const photos = A().done[dkey]?.photos || [];
  gal.innerHTML = photos.map((p, pi) => `
    <div class="photo-thumb" data-pi="${pi}">
      <img src="${p}" alt="">
      <button class="photo-del" data-pdel="${pi}">×</button>
    </div>
  `).join('') + `<label class="photo-upload-btn">+<input type="file" accept="image/*" capture="environment" hidden data-photo-input multiple></label>`;

  gal.querySelectorAll('[data-pi]').forEach(t => {
    t.addEventListener('click', e => {
      if (e.target.dataset.pdel != null) return;
      showLightbox(photos[+t.dataset.pi]);
    });
  });
  gal.querySelectorAll('[data-pdel]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const cur = A().done[dkey];
    cur.photos.splice(+b.dataset.pdel, 1);
    saveState(); renderPhotoGallery(globalIdx, dkey);
  }));
  gal.querySelector('[data-photo-input]').addEventListener('change', async e => {
    for (const f of e.target.files) await addPhoto(f, dkey);
    renderPhotoGallery(globalIdx, dkey);
  });
}

async function addPhoto(file, dkey) {
  if (!file.type.startsWith('image/')) return;
  const resized = await resizeImage(file, 800, 0.78);
  if (!A().done[dkey]) A().done[dkey] = {};
  if (!A().done[dkey].photos) A().done[dkey].photos = [];
  if (A().done[dkey].photos.length >= 8) { toast('Max 8 photos'); return; }
  A().done[dkey].photos.push(resized);
  saveState();
}

function resizeImage(file, maxW, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function showLightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${src}">`;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}

// ===================== SESSION EDITOR =====================
function openSessionEditor(globalIdx, wIdx, dayIdx) {
  const isNew = globalIdx == null;
  const s = isNew
    ? { week: (wIdx ?? currentSessionWeek)+1, day: dayIdx || 1, type:'Marche', title:'', qualite:'', objectif:'', duree:60, rpe:3, details:'' }
    : { ...A().sessions[globalIdx] };
  modal(`
    <div class="modal-title">${isNew?'Nouvelle séance':'Modifier la séance'}</div>
    <div class="modal-sub">Semaine ${A().weeks[s.week-1]?.n ?? s.week} · ${DAYS_FR[s.day-1]}</div>

    <div style="margin-bottom:14px"><label class="text-mute">Type d'activité</label>
      <div class="type-picker" id="seTypePicker">
        ${TYPES_SEANCE.map(t => `<button type="button" class="type-chip ${typeClass(t)} ${t===s.type?'active':''}" data-type="${t}">${t}</button>`).join('')}
      </div>
      <input type="hidden" id="seType" value="${s.type}">
    </div>

    <div class="grid grid-2">
      <div><label class="text-mute">Jour</label>
        <select id="seDay">${DAYS_FR.map((d,i) => `<option value="${i+1}" ${i+1===s.day?'selected':''}>${d}</option>`).join('')}</select>
      </div>
      <div><label class="text-mute">Semaine</label>
        <select id="seWeek">${A().weeks.map((w, i) => {
          const yr = w.startDate ? new Date(w.startDate).getFullYear() : '';
          return `<option value="${i+1}" ${i+1===s.week?'selected':''}>S${w.n}${yr?` (${yr})`:''} · ${w.meso}</option>`;
        }).join('')}</select>
      </div>
      <div><label class="text-mute">Qualité</label>
        <select id="seQ"><option value=""></option>${QUALITES_PHYSIQUES.map(q => `<option ${q===s.qualite?'selected':''}>${q}</option>`).join('')}</select>
      </div>
      <div><label class="text-mute">Durée (min)</label><input type="number" id="seDuree" value="${s.duree||''}"></div>
      <div><label class="text-mute">RPE cible</label><input type="number" min="1" max="10" id="seRPE" value="${s.rpe||''}"></div>
      <div><label class="text-mute">Distance (km)</label><input type="number" step="0.01" id="seDistance" value="${s.distance||''}" placeholder="optionnel"></div>
      <div><label class="text-mute">Allure (min/km)</label><input type="text" id="seAllure" value="${s.allure||''}" placeholder="ex : 6:30"></div>
      <div style="grid-column: span 2"><label class="text-mute">Titre</label><input type="text" id="seTitle" value="${s.title||''}"></div>
      <div style="grid-column: span 2"><label class="text-mute">Objectif physiologique</label><input type="text" id="seObj" value="${s.objectif||''}"></div>
    </div>

    <!-- Bloc renforcement, visible uniquement si type=Renfo -->
    <div id="seRenfoBlock" style="${s.type==='Renfo'?'':'display:none'};margin-top:10px;padding:12px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border)">
      <div class="section-title" style="margin:0 0 10px;font-size:13px">💪 Renforcement — Photos</div>
      <div id="sePhotosList"></div>
      <button type="button" class="btn btn-accent btn-sm" id="seAddPhoto" style="margin-top:8px">📷 Ajouter une photo</button>
      <input type="file" id="sePhotoInput" accept="image/*" style="display:none" multiple>
    </div>

    <div style="margin-top:10px"><label class="text-mute">Séance détaillée</label>
      <textarea id="seDetails" rows="8" placeholder="15' échauffement&#10;..." style="font-family:ui-monospace,monospace;font-size:13px;width:100%">${s.details||''}</textarea>
    </div>

    <div class="modal-actions">
      ${!isNew?`<button class="btn btn-danger btn-sm" id="seDelete">Supprimer</button>`:''}
      <button class="btn btn-ghost btn-sm" id="seCancel">Annuler</button>
      <button class="btn btn-primary btn-sm" id="seSave">💾 Enregistrer</button>
    </div>
  `, () => {
    $('#seCancel').addEventListener('click', closeModal);
    // Sélecteur de type en boutons (lisible, tactile). Met à jour l'input caché
    // + affiche/masque le bloc Renfo.
    $$('#seTypePicker .type-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('#seTypePicker .type-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        $('#seType').value = chip.dataset.type;
        $('#seRenfoBlock').style.display = chip.dataset.type === 'Renfo' ? '' : 'none';
      });
    });

    // === Photos renfo (image + légende) ===
    let renfoPhotos = Array.isArray(s.renfoPhotos) ? [...s.renfoPhotos] : [];

    function resizeImage(file, maxW = 800) {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
          const img = new Image();
          img.onload = () => {
            const ratio = Math.min(1, maxW / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = img.width * ratio;
            canvas.height = img.height * ratio;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    const renderPhotos = () => {
      if (renfoPhotos.length === 0) {
        $('#sePhotosList').innerHTML = '<div class="text-mute" style="text-align:center;padding:14px 0;font-size:13px">Aucune photo. Ajoute des images pour illustrer la séance.</div>';
        return;
      }
      $('#sePhotosList').innerHTML = renfoPhotos.map((p, i) => `
        <div class="renfo-photo-row" data-i="${i}">
          <div style="display:flex;align-items:flex-start;gap:8px">
            <img src="${p.src}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0">
            <div style="flex:1;min-width:0">
              <input type="text" data-cap="${i}" value="${(p.caption||'').replace(/"/g,'&quot;')}" placeholder="Légende (ex : Squat goblet, 3×12)" style="width:100%;font-size:13px">
            </div>
            <button type="button" class="btn-icon" data-rmph="${i}" title="Retirer" style="flex-shrink:0;font-size:18px">×</button>
          </div>
        </div>
      `).join('');
      $$('#sePhotosList [data-cap]').forEach(inp => {
        inp.addEventListener('input', e => { renfoPhotos[+e.target.dataset.cap].caption = e.target.value; });
      });
      $$('#sePhotosList [data-rmph]').forEach(btn => {
        btn.addEventListener('click', () => { renfoPhotos.splice(+btn.dataset.rmph, 1); renderPhotos(); });
      });
    };
    renderPhotos();

    $('#seAddPhoto').addEventListener('click', () => $('#sePhotoInput').click());
    $('#sePhotoInput').addEventListener('change', async e => {
      const files = [...e.target.files];
      if (!files.length) return;
      for (const f of files) {
        const src = await resizeImage(f);
        renfoPhotos.push({ src, caption: '' });
      }
      renderPhotos();
      e.target.value = '';
    });

    $('#seSave').addEventListener('click', () => {
      const type = $('#seType').value;
      const obj = {
        type, day: +$('#seDay').value, week: +$('#seWeek').value,
        qualite: $('#seQ').value, duree: +$('#seDuree').value || 0, rpe: +$('#seRPE').value || 0,
        title: $('#seTitle').value, objectif: $('#seObj').value, details: $('#seDetails').value,
        distance: +$('#seDistance').value || null,
        allure: $('#seAllure').value || null
      };
      if (type === 'Renfo') {
        obj.renfoPhotos = renfoPhotos.filter(p => p.src);
      }
      if (isNew) A().sessions.push(obj);
      else A().sessions[globalIdx] = obj;
      saveState();
      closeModal();
      toast(isNew?'Séance ajoutée':'Séance modifiée');
      renderSessions();
    });
    $('#seDelete')?.addEventListener('click', () => {
      A().sessions.splice(globalIdx, 1); saveState(); closeModal(); renderSessions();
    });
  });
}

// ===================== COMPARE =====================
let compareLeft = null, compareRight = null;

function renderCompare() {
  const completed = Object.keys(A().done).map(k => {
    const [w, d, idx] = k.split('-').map(Number);
    const session = A().sessions.find(s => s.week === w && s.day === d);
    if (!session) return null;
    return { key:k, session, done: A().done[k] };
  }).filter(Boolean).sort((a,b) => (b.done.date||'').localeCompare(a.done.date||''));

  if (compareLeft && !completed.find(c => c.key === compareLeft)) compareLeft = null;
  if (compareRight && !completed.find(c => c.key === compareRight)) compareRight = null;

  $('#view-compare').innerHTML = `
    <div class="card mb-16">
      <div class="card-h"><h3>Choisir 2 séances à comparer</h3></div>
      ${completed.length < 2 ? `<div class="empty"><div class="empty-ico">⇄</div>Il faut au moins 2 séances réalisées pour comparer</div>` : `
      <div class="cmp-picker">
        <div>
          <label class="text-mute">Séance A (référence)</label>
          <select id="cmpLeft">
            <option value="">— choisir —</option>
            ${completed.map(c => `<option value="${c.key}" ${c.key===compareLeft?'selected':''}>${c.done.date||''} · S${c.session.week}J${c.session.day} · ${c.session.type} · ${c.session.title||c.session.qualite}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-mute">Séance B (à comparer)</label>
          <select id="cmpRight">
            <option value="">— choisir —</option>
            ${completed.map(c => `<option value="${c.key}" ${c.key===compareRight?'selected':''}>${c.done.date||''} · S${c.session.week}J${c.session.day} · ${c.session.type} · ${c.session.title||c.session.qualite}</option>`).join('')}
          </select>
        </div>
      </div>
      `}
    </div>
    <div id="cmpResult"></div>
  `;
  $('#cmpLeft')?.addEventListener('change', e => { compareLeft = e.target.value; renderCompare(); });
  $('#cmpRight')?.addEventListener('change', e => { compareRight = e.target.value; renderCompare(); });

  if (compareLeft && compareRight) {
    const L = completed.find(c => c.key === compareLeft);
    const R = completed.find(c => c.key === compareRight);
    $('#cmpResult').innerHTML = renderCompareResult(L, R);
  }
}

function renderCompareResult(L, R) {
  const compare = (l, r, higherBetter = true) => {
    l = +l; r = +r;
    if (!isFinite(l) || !isFinite(r) || (!l && !r)) return '<span class="compare-diff equal">—</span>';
    if (l === r) return '<span class="compare-diff equal">=</span>';
    const better = higherBetter ? r > l : r < l;
    const diff = l ? Math.round((r-l)/l*100) : 0;
    return `<span class="compare-diff ${better?'better':'worse'}">${diff>0?'+':''}${diff}%</span>`;
  };
  const row = (label, lv, rv, unit, higherBetter=true) => `
    <div class="compare-row">
      <span class="label">${label}</span>
      <span class="val">${lv||'—'}${unit&&lv?` ${unit}`:''} → ${rv||'—'}${unit&&rv?` ${unit}`:''} ${lv&&rv?compare(lv,rv,higherBetter):''}</span>
    </div>`;

  // Détecte la zone FC pour une valeur donnée
  const zoneFor = (hr) => {
    if (!hr || !isFinite(+hr)) return null;
    const zones = fcZones();
    const z = zones.find(z => +hr >= z.lo && +hr <= z.hi) || (+hr > zones[4].hi ? zones[4] : zones[0]);
    return z;
  };
  const zoneTag = (hr) => {
    const z = zoneFor(hr);
    if (!z) return '';
    return `<span class="zone-tag ${z.cls}">Z${z.n} ${z.short}</span>`;
  };

  // Barre visuelle FC avec position dans la plage globale
  const { restHR, maxHR } = A().profile;
  const fcBar = (hr, label) => {
    if (!hr || !isFinite(+hr)) return `
      <div class="fc-bar-row">
        <div class="fc-bar-label">${label}</div>
        <div class="fc-bar-empty">— Pas de donnée FC</div>
      </div>`;
    const pct = Math.max(0, Math.min(100, ((+hr - restHR) / (maxHR - restHR)) * 100));
    const z = zoneFor(hr);
    return `
      <div class="fc-bar-row">
        <div class="fc-bar-label">${label}</div>
        <div class="fc-bar-track">
          <div class="fc-bar-zones">
            ${fcZones().map(zz => `<div class="fc-bar-zone-seg ${zz.cls}" style="width:20%" title="Z${zz.n} ${zz.short}"></div>`).join('')}
          </div>
          <div class="fc-bar-marker" style="left:${pct}%" title="${hr} bpm"></div>
        </div>
        <div class="fc-bar-value"><strong>${hr}</strong> bpm ${zoneTag(hr)}</div>
      </div>`;
  };

  const hasFC = (L.done.fcMoy || L.done.fcMax) && (R.done.fcMoy || R.done.fcMax);

  return `
    <div class="compare-grid">
      <div class="compare-card">
        <div class="card-title">Séance A</div>
        <div style="font-weight:700;font-size:15px">${L.session.title||L.session.qualite||L.session.type}</div>
        <div class="text-mute">${fmtDate(L.done.date)} · S${A().weeks[L.session.week-1]?.n ?? L.session.week}J${L.session.day}</div>
      </div>
      <div class="compare-card">
        <div class="card-title">Séance B</div>
        <div style="font-weight:700;font-size:15px">${R.session.title||R.session.qualite||R.session.type}</div>
        <div class="text-mute">${fmtDate(R.done.date)} · S${A().weeks[R.session.week-1]?.n ?? R.session.week}J${R.session.day}</div>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-h"><h3>📊 Comparaison cardiaque</h3>${!hasFC?'<span class="tag warn">Données FC partielles</span>':''}</div>
      <div class="fc-compare">
        <div class="fc-compare-col">
          <div class="fc-compare-title">Séance A</div>
          ${fcBar(L.done.fcMoy, 'FC moyenne')}
          ${fcBar(L.done.fcMax, 'FC max')}
        </div>
        <div class="fc-compare-col">
          <div class="fc-compare-title">Séance B</div>
          ${fcBar(R.done.fcMoy, 'FC moyenne')}
          ${fcBar(R.done.fcMax, 'FC max')}
        </div>
      </div>
      <div class="fc-compare-summary">
        ${L.done.fcMoy && R.done.fcMoy ? `
          <div class="fc-summary-item">
            <span>FC moy : </span>
            <strong>${L.done.fcMoy}</strong> → <strong>${R.done.fcMoy}</strong> bpm
            ${compare(L.done.fcMoy, R.done.fcMoy, false)}
            <span class="text-mute">(${(+R.done.fcMoy - +L.done.fcMoy > 0 ? '+' : '')}${+R.done.fcMoy - +L.done.fcMoy} bpm)</span>
          </div>` : ''}
        ${L.done.fcMax && R.done.fcMax ? `
          <div class="fc-summary-item">
            <span>FC max : </span>
            <strong>${L.done.fcMax}</strong> → <strong>${R.done.fcMax}</strong> bpm
            ${compare(L.done.fcMax, R.done.fcMax, false)}
            <span class="text-mute">(${(+R.done.fcMax - +L.done.fcMax > 0 ? '+' : '')}${+R.done.fcMax - +L.done.fcMax} bpm)</span>
          </div>` : ''}
        ${!L.done.fcMoy && !L.done.fcMax ? '<div class="text-mute">⚠ Séance A : aucune donnée FC enregistrée</div>' : ''}
        ${!R.done.fcMoy && !R.done.fcMax ? '<div class="text-mute">⚠ Séance B : aucune donnée FC enregistrée</div>' : ''}
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-h"><h3>Autres métriques</h3></div>
      ${row('Distance', L.done.distance, R.done.distance, 'km', true)}
      ${row('Vitesse moyenne', L.done.vitesse, R.done.vitesse, 'km/h', true)}
      ${row('Durée', L.done.duree, R.done.duree, 'min', true)}
      ${row('FC moyenne', L.done.fcMoy, R.done.fcMoy, 'bpm', false)}
      ${row('FC max', L.done.fcMax, R.done.fcMax, 'bpm', false)}
      ${row('RPE perçu', L.done.rpe, R.done.rpe, '/10', false)}
      ${row('Charge Foster', trainingLoad(L.done.rpe, L.done.duree), trainingLoad(R.done.rpe, R.done.duree), '', true)}
    </div>
  `;
}

// ===================== WELLNESS =====================
function renderWellness() {
  $('#view-wellness').innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <div class="card-h">
          <h3>Questionnaire du jour</h3>
          <span class="tag accent">${toISO(new Date())}</span>
        </div>
        <div id="wellnessForm"></div>
      </div>
      <div class="card">
        <div class="card-h"><h3>Évolution 30 jours</h3></div>
        <div class="chart-wrap lg"><canvas id="wellnessChart"></canvas></div>
      </div>
    </div>
    <h3 class="section-title">Historique</h3>
    <div id="wellnessList"></div>
  `;
  renderWellnessForm();
  drawWellnessChart();
  renderWellnessList();
}

function renderWellnessForm() {
  const today = toISO(new Date());
  const cur = A().wellness.find(w => w.date === today) || { date: today };
  const form = $('#wellnessForm');
  form.innerHTML = WELLNESS_QUESTIONS.map(q => `
    <div class="wellness-q">
      <label>${q.label}</label>
      <div class="qhint">${q.hint}</div>
      <div class="scale" data-q="${q.id}">
        ${[1,2,3,4,5].map(v => `<button class="scale-opt ${cur[q.id]===v?'selected v'+v:''}" data-v="${v}">${v}</button>`).join('')}
      </div>
      <div class="scale-labels"><span>${q.labels[0]}</span><span>${q.labels[4]}</span></div>
    </div>
  `).join('') + `
    <div class="wellness-q">
      <label>Note / contexte (optionnel)</label>
      <textarea id="wellNote" placeholder="Ex : retour de garde, douleur cheville droite...">${cur.note||''}</textarea>
    </div>
    <button class="btn btn-primary" id="wellSave" style="width:100%">💾 Enregistrer</button>
  `;
  form.querySelectorAll('.scale').forEach(scale => {
    scale.addEventListener('click', e => {
      const b = e.target.closest('.scale-opt'); if (!b) return;
      scale.querySelectorAll('.scale-opt').forEach(x => x.classList.remove('selected','v1','v2','v3','v4','v5'));
      b.classList.add('selected','v'+b.dataset.v);
      cur[scale.dataset.q] = +b.dataset.v;
    });
  });
  $('#wellSave').addEventListener('click', () => {
    cur.note = $('#wellNote').value; cur.date = cur.date || today;
    if (WELLNESS_QUESTIONS.some(q => !cur[q.id])) { toast('Réponds à toutes les questions'); return; }
    const idx = A().wellness.findIndex(w => w.date === cur.date);
    if (idx >= 0) A().wellness[idx] = cur; else A().wellness.push(cur);
    A().wellness.sort((a,b) => a.date.localeCompare(b.date));
    saveState();
    toast('Wellness enregistré ✓');
    drawWellnessChart(); renderWellnessList();
  });
}

function drawWellnessChart() {
  const canvas = $('#wellnessChart'); if (!canvas) return;
  if (drawWellnessChart._chart) drawWellnessChart._chart.destroy();
  const last30 = A().wellness.slice(-30);
  const labels = last30.map(w => fmtDateShort(w.date));
  const colors = { sleep:'#2c6db5', fatigue:'#c97f23', soreness:'#c0392b', stress:'#7a4ea0', mood:'#2d7a5f' };
  const sets = WELLNESS_QUESTIONS.map(q => ({
    label: q.label, data: last30.map(w => w[q.id]),
    borderColor: colors[q.id], backgroundColor: 'transparent', tension: 0.3, pointRadius: 2
  }));
  drawWellnessChart._chart = new Chart(canvas, {
    type:'line', data:{ labels, datasets: sets },
    options:{ responsive:true, maintainAspectRatio:false,
      scales:{ y:{ min:1, max:5, ticks:{ stepSize:1 } } },
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{ size:11 } } } } }
  });
}

function renderWellnessList() {
  const list = A().wellness.slice().reverse();
  if (!list.length) {
    $('#wellnessList').innerHTML = `<div class="empty"><div class="empty-ico">♥</div>Aucun wellness enregistré</div>`;
    return;
  }
  $('#wellnessList').innerHTML = `<div class="wellness-list">${list.map(w => {
    const avg = (w.sleep + w.fatigue + w.soreness + w.stress + w.mood) / 5;
    return `<div class="wellness-item">
      <div>${fmtDate(w.date)}</div>
      <div>
        <div style="display:flex;gap:6px;margin-bottom:6px">
          ${WELLNESS_QUESTIONS.map(q => `<span class="tag" title="${q.label}: ${w[q.id]}/5">${q.label[0]}${w[q.id]}</span>`).join('')}
        </div>
        ${w.note?`<div class="text-mute">${w.note}</div>`:''}
      </div>
      <div>
        <div class="wellness-score" style="color:${avg>=4?'var(--accent)':avg>=3?'var(--warn)':'var(--danger)'}">${avg.toFixed(1)}</div>
        <div class="scorebar"><div class="scorebar-fill" style="width:${avg/5*100}%"></div></div>
      </div>
      <button class="btn-icon" data-del="${w.date}" title="Supprimer">×</button>
    </div>`;
  }).join('')}</div>`;
  $$('#wellnessList [data-del]').forEach(b => b.addEventListener('click', () => {
    A().wellness = A().wellness.filter(w => w.date !== b.dataset.del);
    saveState(); renderWellness();
  }));
}

// ===================== EXERCISES =====================
let exFilters = { muscle: 'Tous', equipment: 'Tous', q: '' };

function renderExercises() {
  $('#view-exercises').innerHTML = `
    <div class="ex-toolbar">
      <input type="text" id="exSearch" class="ex-search" placeholder="Rechercher un exercice…" value="${exFilters.q}">
      <select id="exMuscle"><option>Tous</option>${MUSCLE_GROUPS.map(m => `<option ${exFilters.muscle===m?'selected':''}>${m}</option>`).join('')}</select>
      <select id="exEquip"><option>Tous</option>${EQUIPMENT_TYPES.map(m => `<option ${exFilters.equipment===m?'selected':''}>${m}</option>`).join('')}</select>
      <span class="text-mute" id="exCount"></span>
    </div>
    <div class="filter-chips" id="muscleChips">
      ${['Tous', ...MUSCLE_GROUPS].map(m => `<button class="chip ${exFilters.muscle===m?'active':''}" data-m="${m}">${m}</button>`).join('')}
    </div>
    <div style="height:10px"></div>
    <div class="filter-chips" id="equipChips">
      ${['Tous', ...EQUIPMENT_TYPES].map(m => `<button class="chip ${exFilters.equipment===m?'active':''}" data-e="${m}">${m}</button>`).join('')}
    </div>
    <h3 class="section-title">Exercices</h3>
    <div class="ex-grid" id="exGrid"></div>
  `;
  $('#exSearch').addEventListener('input', e => { exFilters.q = e.target.value; redrawExGrid(); });
  $('#exMuscle').addEventListener('change', e => { exFilters.muscle = e.target.value; renderExercises(); });
  $('#exEquip').addEventListener('change', e => { exFilters.equipment = e.target.value; renderExercises(); });
  $$('#muscleChips .chip').forEach(c => c.addEventListener('click', () => { exFilters.muscle = c.dataset.m; renderExercises(); }));
  $$('#equipChips .chip').forEach(c => c.addEventListener('click', () => { exFilters.equipment = c.dataset.e; renderExercises(); }));
  redrawExGrid();
}

function redrawExGrid() {
  const q = exFilters.q.toLowerCase();
  const list = EXERCISES.filter(ex => {
    if (exFilters.muscle !== 'Tous' && !ex.muscles.includes(exFilters.muscle)) return false;
    if (exFilters.equipment !== 'Tous' && !ex.equipment.includes(exFilters.equipment)) return false;
    if (q && !ex.name.toLowerCase().includes(q) && !ex.muscles.some(m => m.toLowerCase().includes(q))) return false;
    return true;
  });
  $('#exCount').textContent = `${list.length} exercice${list.length>1?'s':''}`;
  $('#exGrid').innerHTML = list.map(ex => `
    <div class="ex-card" data-id="${ex.id}">
      <div class="ex-img">${EX_SVG[ex.svg] || EX_SVG.squat}</div>
      <div class="ex-body">
        <div class="ex-name">${ex.name}</div>
        <div class="ex-meta">
          ${ex.muscles.slice(0,2).map(m => `<span class="tag accent">${m}</span>`).join('')}
          <span class="tag">${ex.equipment[0]}</span>
        </div>
      </div>
    </div>
  `).join('') || `<div class="empty" style="grid-column: 1/-1"><div class="empty-ico">🔍</div>Aucun exercice trouvé</div>`;
  $$('#exGrid .ex-card').forEach(c => c.addEventListener('click', () => openExercise(c.dataset.id)));
}

function openExercise(id) {
  const ex = EXERCISES.find(e => e.id === id); if (!ex) return;
  modal(`
    <div class="modal-title">${ex.name}</div>
    <div class="modal-sub">${ex.difficulty}</div>
    <div style="display:grid;grid-template-columns:200px 1fr;gap:18px;align-items:start">
      <div style="background:radial-gradient(ellipse at top,#fff,#e2e8f0);border-radius:14px;padding:14px;display:grid;place-items:center;height:200px;border:1px solid var(--border)">
        <div style="width:170px;height:170px">${EX_SVG[ex.svg]}</div>
      </div>
      <div>
        <div class="section-title" style="margin-top:0">Muscles ciblés</div>
        <div class="row wrap">${ex.muscles.map(m => `<span class="tag accent">${m}</span>`).join('')}</div>
        <div class="section-title">Matériel</div>
        <div class="row wrap">${ex.equipment.map(m => `<span class="tag info">${m}</span>`).join('')}</div>
      </div>
    </div>
    <div class="section-title">Exécution / Conseils</div>
    <p style="font-size:13.5px;line-height:1.65;color:var(--text-soft)">${ex.cues}</p>
  `);
}

// ===================== RECORDS AUTO (Strava-style) =====================
const DISTANCE_BENCHMARKS = [
  { label: '1 km',   km: 1 },
  { label: '5 km',   km: 5 },
  { label: '10 km',  km: 10 },
  { label: '15 km',  km: 15 },
  { label: '20 km',  km: 20 },
  { label: 'Semi (21.1 km)', km: 21.1 },
  { label: '30 km',  km: 30 },
  { label: '42.2 km (marathon)', km: 42.2 },
  { label: '50 km',  km: 50 }
];

function fmtTimeMin(min) {
  if (!isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  const s = Math.round((min - Math.floor(min)) * 60);
  if (h > 0) return `${h}h${String(m).padStart(2,'0')}${s?'\''+String(s).padStart(2,'0'):''}`;
  return `${m}'${String(s).padStart(2,'0')}"`;
}
function fmtPace(minPerKm) {
  if (!isFinite(minPerKm) || minPerKm <= 0) return '—';
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}'${String(s).padStart(2,'0')}"/km`;
}

// Liste des activités proposées dans le menu déroulant des records
const ACTIVITIES = ['Marche','Randonnée','Trail','Course','Vélo','VTT','Natation','Aviron','Kayak','Ski','Ski de fond','Roller','Triathlon','Renfo','Mobilité','Yoga','Pilates','Elliptique','Rameur','Crossfit','Boxe','Escalade','Danse','Autre'];

function normalizeActivity(raw) {
  const s = (raw || '').toString().toLowerCase().trim();
  if (!s) return 'Autre';
  if (/cap\b|^run|running|jog|cours/.test(s) && !/parcours/.test(s)) return 'Course';
  if (/trail/.test(s)) return 'Trail';
  if (/walk|march/.test(s)) return 'Marche';
  if (/hike|hik|rando/.test(s)) return 'Randonnée';
  if (/mtb|vtt|mountain.*bik/.test(s)) return 'VTT';
  if (/bik|cycl|velo|vélo|ride|spin/.test(s)) return 'Vélo';
  if (/swim|nat/.test(s)) return 'Natation';
  if (/row\b|rowing|aviron/.test(s)) return 'Aviron';
  if (/kayak|canoe|paddle/.test(s)) return 'Kayak';
  if (/ski.*(fond|nord|cross)|xc.*ski|nordic/.test(s)) return 'Ski de fond';
  if (/ski|snowboard/.test(s)) return 'Ski';
  if (/roller|inline/.test(s)) return 'Roller';
  if (/triathlon/.test(s)) return 'Triathlon';
  if (/strength|renfo|musc|gym|weight|haltèr|halter/.test(s)) return 'Renfo';
  if (/mobil|stretch|étir|etir/.test(s)) return 'Mobilité';
  if (/yoga/.test(s)) return 'Yoga';
  if (/pilate/.test(s)) return 'Pilates';
  if (/ellipt/.test(s)) return 'Elliptique';
  if (/rameur|erg/.test(s)) return 'Rameur';
  if (/crossfit|hiit|wod/.test(s)) return 'Crossfit';
  if (/box|kick/.test(s)) return 'Boxe';
  if (/escalade|climb/.test(s)) return 'Escalade';
  if (/danc|dans/.test(s)) return 'Danse';
  // Fallback sur le type planifié
  if (s === 'marche') return 'Marche';
  if (s === 'cap') return 'Course';
  if (s === 'renfo') return 'Renfo';
  if (s === 'mobilité' || s === 'mobilite') return 'Mobilité';
  return 'Autre';
}

function computeAutoRecords() {
  const sessions = [];
  Object.entries(A().done).forEach(([key, d]) => {
    const dist = parseFloat(d.distance), dur = parseFloat(d.duree);
    if (!isFinite(dist) || dist <= 0 || !isFinite(dur) || dur <= 0) return;
    const plannedType = A().sessions.find(s => `${s.week}-${s.day}-0` === key)?.type || null;
    sessions.push({
      key, date: d.date, distance: dist, duree: dur,
      vitesse: parseFloat(d.vitesse) || (dist / (dur/60)),
      fcMoy: +d.fcMoy || null, fcMax: +d.fcMax || null,
      rpe: +d.rpe || null, load: trainingLoad(d.rpe, d.duree),
      source: d.source || null,
      sport: plannedType,
      // sport déclaré par le fichier en priorité ; s'il est inconnu ("Other"), on
      // retombe sur le type de la séance planifiée pour ne pas tout classer "Autre"
      activity: normalizeActivity(d.sport) !== 'Autre'
        ? normalizeActivity(d.sport)
        : normalizeActivity(plannedType)
    });
  });

  // Best per distance threshold (estimation par allure moyenne sur séances couvrant cette distance)
  const distRecords = DISTANCE_BENCHMARKS.map(b => {
    const eligible = sessions.filter(s => s.distance >= b.km);
    if (!eligible.length) return { ...b, best: null };
    const candidates = eligible.map(s => ({
      ...s,
      timeAtBench: s.duree * (b.km / s.distance),
      pace: s.duree / s.distance
    }));
    candidates.sort((a,b) => a.timeAtBench - b.timeAtBench);
    return { ...b, best: candidates[0] };
  });

  // Cumuls et autres records
  const cum = {
    totalDist: sessions.reduce((a,s) => a + s.distance, 0),
    totalMin: sessions.reduce((a,s) => a + s.duree, 0),
    totalSessions: sessions.length,
    longestDist: [...sessions].sort((a,b) => b.distance - a.distance)[0],
    longestDur: [...sessions].sort((a,b) => b.duree - a.duree)[0],
    fastestPace: [...sessions].sort((a,b) => (a.duree/a.distance) - (b.duree/b.distance))[0],
    maxLoad: [...sessions].sort((a,b) => b.load - a.load)[0],
    maxHR: sessions.filter(s => s.fcMax).sort((a,b) => b.fcMax - a.fcMax)[0]
  };

  // Plus gros volume hebdo (en km et en min)
  const byWeek = {};
  sessions.forEach(s => {
    if (!s.date) return;
    const d = new Date(s.date);
    const day = (d.getDay() + 6) % 7; // lundi = 0
    const monday = addDays(d, -day);
    const wk = toISO(monday);
    if (!byWeek[wk]) byWeek[wk] = { km:0, min:0, n:0 };
    byWeek[wk].km += s.distance; byWeek[wk].min += s.duree; byWeek[wk].n++;
  });
  const weekArr = Object.entries(byWeek).map(([k,v]) => ({ start:k, ...v }));
  cum.maxWeekKm = [...weekArr].sort((a,b) => b.km - a.km)[0];
  cum.maxWeekMin = [...weekArr].sort((a,b) => b.min - a.min)[0];

  return { distRecords, cum, sessions };
}

// ===================== RECORDS =====================
function renderActivityRecordsSection(allSessions) {
  // Liste des activités présentes + liste complète
  const present = Array.from(new Set(allSessions.map(s => s.activity))).filter(Boolean);
  const ordered = [...present, ...ACTIVITIES.filter(a => !present.includes(a))];

  const options = ['Toutes', ...ordered].map(a => {
    const n = a === 'Toutes' ? allSessions.length : allSessions.filter(s => s.activity === a).length;
    const sel = a === selectedRecordActivity ? 'selected' : '';
    const lbl = a === 'Toutes' ? `Toutes les activités (${n})` : `${a}${n ? ` (${n})` : ''}`;
    return `<option value="${a}" ${sel}>${lbl}</option>`;
  }).join('');

  const filtered = selectedRecordActivity === 'Toutes'
    ? allSessions
    : allSessions.filter(s => s.activity === selectedRecordActivity);

  let body;
  if (!filtered.length) {
    body = `<div class="empty"><div class="empty-ico">🔍</div>Aucune séance enregistrée pour <strong>${selectedRecordActivity}</strong><br><span class="text-mute">Importe une activité Garmin de ce type ou complète une séance manuellement</span></div>`;
  } else {
    const totalDist = filtered.reduce((a,s) => a + s.distance, 0);
    const totalMin = filtered.reduce((a,s) => a + s.duree, 0);
    const longestDist = [...filtered].sort((a,b) => b.distance - a.distance)[0];
    const longestDur = [...filtered].sort((a,b) => b.duree - a.duree)[0];
    const fastestPace = [...filtered].sort((a,b) => (a.duree/a.distance) - (b.duree/b.distance))[0];
    const maxLoad = [...filtered].sort((a,b) => b.load - a.load)[0];
    const maxHR = filtered.filter(s => s.fcMax).sort((a,b) => b.fcMax - a.fcMax)[0];

    // Records par distance pour cette activité
    const distCards = DISTANCE_BENCHMARKS.map(b => {
      const eligible = filtered.filter(s => s.distance >= b.km);
      if (!eligible.length) return null;
      const cand = eligible.map(s => ({ ...s, timeAtBench: s.duree * (b.km / s.distance), pace: s.duree / s.distance }))
        .sort((a,c) => a.timeAtBench - c.timeAtBench)[0];
      return `<div class="card pr-card">
        <div class="kpi-label">${b.label}</div>
        <div class="kpi-value">${fmtTimeMin(cand.timeAtBench)}</div>
        <div class="kpi-sub">Allure ${fmtPace(cand.pace)}${cand.fcMoy?` · FC ${cand.fcMoy}`:''}<br><span class="text-mute">${fmtDate(cand.date)}</span></div>
      </div>`;
    }).filter(Boolean).join('');

    body = `
      <div class="grid grid-4 mb-16">
        <div class="kpi"><div class="kpi-bar"></div>
          <div class="kpi-label">Volume total</div>
          <div class="kpi-value">${totalDist.toFixed(1)}<span style="font-size:14px;color:var(--text-mute)"> km</span></div>
          <div class="kpi-sub">${filtered.length} séance${filtered.length>1?'s':''}</div>
        </div>
        <div class="kpi info"><div class="kpi-bar"></div>
          <div class="kpi-label">Temps total</div>
          <div class="kpi-value">${fmtTimeMin(totalMin)}</div>
          <div class="kpi-sub">cumulé</div>
        </div>
        <div class="kpi purple"><div class="kpi-bar"></div>
          <div class="kpi-label">Distance max</div>
          <div class="kpi-value">${longestDist.distance.toFixed(2)}<span style="font-size:14px;color:var(--text-mute)"> km</span></div>
          <div class="kpi-sub">${fmtDate(longestDist.date)}</div>
        </div>
        <div class="kpi warn"><div class="kpi-bar"></div>
          <div class="kpi-label">Charge Foster max</div>
          <div class="kpi-value">${maxLoad?Math.round(maxLoad.load):'—'}</div>
          <div class="kpi-sub">${maxLoad?fmtDate(maxLoad.date):'—'}</div>
        </div>
      </div>
      ${distCards ? `<h4 class="section-title" style="margin-top:8px">⏱ Meilleurs temps par distance — ${selectedRecordActivity}</h4>
        <div class="grid grid-3 mb-16">${distCards}</div>` : ''}
      <h4 class="section-title">🏆 Autres records — ${selectedRecordActivity}</h4>
      <div class="grid grid-3">
        <div class="card pr-card"><div class="kpi-label">⏱ Durée max</div>
          <div class="kpi-value">${fmtTimeMin(longestDur.duree)}</div>
          <div class="kpi-sub">${longestDur.distance.toFixed(2)} km · ${fmtDate(longestDur.date)}</div></div>
        <div class="card pr-card"><div class="kpi-label">⚡ Meilleure allure moy.</div>
          <div class="kpi-value" style="font-size:22px">${fmtPace(fastestPace.duree/fastestPace.distance)}</div>
          <div class="kpi-sub">${fastestPace.distance.toFixed(2)} km · ${fmtDate(fastestPace.date)}</div></div>
        ${maxHR?`<div class="card pr-card"><div class="kpi-label">♥ FC max</div>
          <div class="kpi-value">${maxHR.fcMax}<span style="font-size:14px;color:var(--text-mute)"> bpm</span></div>
          <div class="kpi-sub">${fmtDate(maxHR.date)}</div></div>`:''}
      </div>
    `;
  }

  return `
    <h3 class="section-title" style="margin-top:24px">🎯 Records par activité</h3>
    <div class="card" style="padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <label class="text-mute" style="font-weight:600">Activité :</label>
      <select id="recordActivitySelect" style="min-width:240px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:14px">
        ${options}
      </select>
      <span class="text-mute" style="font-size:13px">— ${filtered.length} séance${filtered.length>1?'s':''} sur ${allSessions.length}</span>
    </div>
    ${body}
  `;
}

function renderRecords() {
  const { distRecords, cum, sessions } = computeAutoRecords();
  const empty = sessions.length === 0;

  const distCards = distRecords.filter(r => r.best).map(r => {
    const b = r.best;
    return `<div class="card pr-card" style="position:relative">
      <div class="kpi-label">${r.label}</div>
      <div class="kpi-value">${fmtTimeMin(b.timeAtBench)}</div>
      <div class="kpi-sub">
        Allure ${fmtPace(b.pace)} ${b.fcMoy?`· FC ${b.fcMoy}`:''}
        <br><span class="text-mute">${fmtDate(b.date)}${b.source?` · ${b.source}`:''}</span>
      </div>
    </div>`;
  }).join('');

  const overview = empty ? '' : `
    <div class="grid grid-4 mb-16">
      <div class="kpi"><div class="kpi-bar"></div>
        <div class="kpi-label">Volume total</div>
        <div class="kpi-value">${cum.totalDist.toFixed(1)}<span style="font-size:14px;color:var(--text-mute)"> km</span></div>
        <div class="kpi-sub">${cum.totalSessions} séance${cum.totalSessions>1?'s':''}</div>
      </div>
      <div class="kpi info"><div class="kpi-bar"></div>
        <div class="kpi-label">Temps total</div>
        <div class="kpi-value">${fmtTimeMin(cum.totalMin)}</div>
        <div class="kpi-sub">cumulé sur ${cum.totalSessions} séance${cum.totalSessions>1?'s':''}</div>
      </div>
      <div class="kpi purple"><div class="kpi-bar"></div>
        <div class="kpi-label">Plus grosse semaine</div>
        <div class="kpi-value">${cum.maxWeekKm?cum.maxWeekKm.km.toFixed(1):'—'}<span style="font-size:14px;color:var(--text-mute)"> km</span></div>
        <div class="kpi-sub">${cum.maxWeekKm?`Semaine du ${fmtDate(cum.maxWeekKm.start)}`:'—'}</div>
      </div>
      <div class="kpi warn"><div class="kpi-bar"></div>
        <div class="kpi-label">Charge Foster max</div>
        <div class="kpi-value">${cum.maxLoad?Math.round(cum.maxLoad.load):'—'}</div>
        <div class="kpi-sub">${cum.maxLoad?fmtDate(cum.maxLoad.date):'—'}</div>
      </div>
    </div>
  `;

  const otherRecords = empty ? '' : `
    <h3 class="section-title">Autres records</h3>
    <div class="grid grid-3">
      ${cum.longestDist?`<div class="card pr-card"><div class="kpi-label">🏁 Distance max</div>
        <div class="kpi-value">${cum.longestDist.distance.toFixed(2)}<span style="font-size:14px;color:var(--text-mute)"> km</span></div>
        <div class="kpi-sub">${fmtTimeMin(cum.longestDist.duree)} · ${fmtDate(cum.longestDist.date)}</div></div>`:''}
      ${cum.longestDur?`<div class="card pr-card"><div class="kpi-label">⏱ Durée max</div>
        <div class="kpi-value">${fmtTimeMin(cum.longestDur.duree)}</div>
        <div class="kpi-sub">${cum.longestDur.distance.toFixed(2)} km · ${fmtDate(cum.longestDur.date)}</div></div>`:''}
      ${cum.fastestPace?`<div class="card pr-card"><div class="kpi-label">⚡ Meilleure allure moyenne</div>
        <div class="kpi-value" style="font-size:22px">${fmtPace(cum.fastestPace.duree/cum.fastestPace.distance)}</div>
        <div class="kpi-sub">${cum.fastestPace.distance.toFixed(2)} km · ${fmtDate(cum.fastestPace.date)}</div></div>`:''}
      ${cum.maxHR?`<div class="card pr-card"><div class="kpi-label">♥ FC max enregistrée</div>
        <div class="kpi-value">${cum.maxHR.fcMax}<span style="font-size:14px;color:var(--text-mute)"> bpm</span></div>
        <div class="kpi-sub">${fmtDate(cum.maxHR.date)}</div></div>`:''}
      ${cum.maxWeekMin?`<div class="card pr-card"><div class="kpi-label">📅 Plus grosse semaine (temps)</div>
        <div class="kpi-value">${fmtTimeMin(cum.maxWeekMin.min)}</div>
        <div class="kpi-sub">${cum.maxWeekMin.n} séances · ${fmtDate(cum.maxWeekMin.start)}</div></div>`:''}
    </div>
  `;

  $('#view-records').innerHTML = `
    <div class="plan-toolbar">
      <div class="text-mute">Records auto-calculés depuis tes séances + records manuels (charges, etc.)</div>
      <button class="btn btn-accent btn-sm" id="addPRBtn">+ Record manuel</button>
    </div>

    ${overview}

    ${empty
      ? `<div class="empty"><div class="empty-ico">★</div>Aucune séance avec distance + durée enregistrée<br><span class="text-mute">Importe depuis Garmin ou complète manuellement les séances réalisées</span></div>`
      : `
        <h3 class="section-title">🏃 Meilleurs temps par distance</h3>
        <div class="grid grid-3">${distCards || '<div class="text-mute">Aucune distance assez longue pour ces benchmarks</div>'}</div>
        ${otherRecords}
      `}

    ${empty ? '' : renderActivityRecordsSection(sessions)}

    ${A().records.length > 0 ? `
      <h3 class="section-title">💪 Records manuels (charges, isométries...)</h3>
      <div class="grid grid-3">
        ${A().records.slice().reverse().map((r, ri) => `<div class="card pr-card" style="position:relative">
          <div class="kpi-label">${r.exercise}</div>
          <div class="kpi-value">${r.value}<span style="font-size:14px;color:var(--text-mute);margin-left:4px">${r.unit||''}</span></div>
          <div class="kpi-sub">${fmtDate(r.date)}${r.note?` · ${r.note}`:''}</div>
          <button class="btn-icon" style="position:absolute;top:10px;right:10px" data-pr="${A().records.length-1-ri}">×</button>
        </div>`).join('')}
      </div>
    ` : ''}
  `;
  $('#addPRBtn').addEventListener('click', () => {
    modal(`
      <div class="modal-title">Nouveau record</div>
      <div class="grid grid-2">
        <div><label class="text-mute">Exercice / Discipline</label><input type="text" id="prEx" placeholder="Ex : SDT KB"></div>
        <div><label class="text-mute">Date</label><input type="date" id="prDate" value="${toISO(new Date())}"></div>
        <div><label class="text-mute">Valeur</label><input type="number" step="0.01" id="prVal"></div>
        <div><label class="text-mute">Unité</label><input type="text" id="prUnit" placeholder="kg / km / min"></div>
        <div style="grid-column:span 2"><label class="text-mute">Note (optionnelle)</label><input type="text" id="prNote"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm" onclick="closeModal()">Annuler</button>
        <button class="btn btn-primary btn-sm" id="prSave">Enregistrer</button>
      </div>
    `);
    $('#prSave').addEventListener('click', () => {
      const r = { exercise:$('#prEx').value, value:$('#prVal').value, unit:$('#prUnit').value, date:$('#prDate').value, note:$('#prNote').value };
      if (!r.exercise || !r.value) { toast('Exercice et valeur requis'); return; }
      A().records.push(r); saveState(); closeModal(); renderRecords();
    });
  });
  $$('#view-records [data-pr]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Supprimer ce record ?')) { A().records.splice(+b.dataset.pr, 1); saveState(); renderRecords(); }
  }));
  const actSel = $('#recordActivitySelect');
  if (actSel) actSel.addEventListener('change', e => {
    selectedRecordActivity = e.target.value;
    renderRecords();
  });
}

// ===================== SETTINGS =====================
function renderSettings() {
  const zones = fcZones();
  $('#view-settings').innerHTML = `
    <div class="card">
      <div class="card-h"><h3>Profil de l'athlète</h3></div>
      <div class="grid grid-2">
        <div><label class="text-mute">Nom</label><input type="text" id="pName" value="${A().profile.name||''}"></div>
        <div><label class="text-mute">Âge</label><input type="number" id="pAge" value="${A().profile.age||''}"></div>
        <div><label class="text-mute">Métier</label><input type="text" id="pJob" value="${A().profile.job||''}"></div>
        <div><label class="text-mute">Objectif</label><input type="text" id="pObj" value="${A().profile.objective||''}"></div>
        <div><label class="text-mute">Date objectif</label><input type="date" id="pDate" value="${A().profile.objectiveDate||''}"></div>
        <div><label class="text-mute">Début du cycle</label><input type="date" id="pStart" value="${A().startDate||''}"></div>
        <div><label class="text-mute">FC repos (bpm)</label><input type="number" id="pRestHR" value="${A().profile.restHR||60}"></div>
        <div><label class="text-mute">FC max (bpm)</label><input type="number" id="pMaxHR" value="${A().profile.maxHR||170}"></div>
      </div>
      ${(() => {
        const det = detectMaxHRFromImports();
        if (!det) return '';
        return `
        <div class="hr-detect">
          <div>
            <div class="label">🎯 Détection auto FC max</div>
            <div class="sub">${det.count} activité(s) avec FC analysée(s) · Top observé : <strong>${det.suggested} bpm</strong> · Médiane top 5 : <strong>${det.median} bpm</strong></div>
            <div class="sub" style="margin-top:4px">Top 5 : ${det.top5.join(' · ')} bpm</div>
          </div>
          <div class="row" style="gap:6px">
            <button class="btn btn-ghost btn-sm" id="useMedianHR" title="Plus prudent">Appliquer ${det.median}</button>
            <button class="btn btn-accent btn-sm" id="useMaxHR" title="Le pic observé">Appliquer ${det.suggested}</button>
          </div>
        </div>`;
      })()}
      <div class="section-title">Zones de fréquence cardiaque (Karvonen)</div>
      <div class="text-mute" style="font-size:12px;margin-bottom:8px">
        Calculées à partir de FC repos (${A().profile.restHR||49}) et FC max (${A().profile.maxHR||170}). Clique sur ⓘ pour le détail de chaque zone.
      </div>
      ${renderFcZones()}
      <div class="modal-actions"><button class="btn btn-primary btn-sm" id="pSave">💾 Sauvegarder profil</button></div>
    </div>

    <div class="card mt-16">
      <div class="card-h"><h3>Athlètes</h3></div>
      <div class="settings-row">
        <div>
          <div class="label">${Object.keys(state.athletes).length} athlète(s)</div>
          <div class="sub">Actuel : ${A().profile.name}</div>
        </div>
        <div class="row">
          <button class="btn btn-ghost btn-sm" id="renameAth">✎ Renommer</button>
          ${Object.keys(state.athletes).length > 1 ? `<button class="btn btn-danger btn-sm" id="deleteAth">Supprimer</button>` : ''}
        </div>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-h"><h3>Mode coach</h3></div>
      <div class="settings-row">
        <div>
          <div class="label">Activer le mode coach</div>
          <div class="sub">Ajoute un champ "Commentaire coach" sur chaque séance</div>
        </div>
        <label class="switch"><input type="checkbox" id="coachOn" ${state.settings.coachMode?'checked':''}><span class="slider"></span></label>
      </div>
      <div class="settings-row">
        <div>
          <div class="label">Nom du coach</div>
          <div class="sub">Affiché à côté de chaque commentaire</div>
        </div>
        <input type="text" id="coachName" value="${state.settings.coachName||''}" style="max-width:200px">
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-h">
        <h3>☁ Synchronisation cloud (Firebase)</h3>
        <span id="cloudStatusInline">${renderCloudStatusInline()}</span>
      </div>
      ${!window.FIREBASE_READY ? `
        <div class="hr-detect" style="background:rgba(212,140,40,0.08);border-color:rgba(212,140,40,0.3)">
          <div>
            <div class="label" style="color:var(--warn)">⚠ Configuration manquante</div>
            <div class="sub">Pour activer la sync, remplis <code>data/firebase-config.js</code> avec tes clés Firebase. Voir <strong>FIREBASE_SETUP.md</strong> à la racine du projet pour le pas-à-pas.</div>
          </div>
        </div>
      ` : `
        <div class="settings-block">
          <div class="label">Code de pair (room code)</div>
          <div class="sub">Code partagé entre ton téléphone et celui de ta mère. Génère-le une fois et tape-le <strong>à l'identique</strong> sur les 2 appareils.</div>
          <div class="row" style="gap:8px;align-items:center;margin-top:10px">
            <input type="text" id="cloudRoomCode" class="room-code-input" value="${fbState.roomCode||''}" placeholder="ex : ABCD2345EF" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false">
            <button class="btn btn-ghost" id="cloudGenCode" title="Générer un nouveau code" style="flex:0 0 auto;min-width:48px">🎲</button>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="label">Activer la sync</div>
            <div class="sub">Une fois activée, toutes tes modifs sont poussées dans le cloud et reçues sur les autres appareils en temps réel.</div>
          </div>
          ${fbState.enabled
            ? `<button class="btn btn-danger btn-sm" id="cloudDisable">Désactiver</button>`
            : `<button class="btn btn-accent btn-sm" id="cloudEnable">✓ Activer la sync</button>`}
        </div>
        <div class="settings-row">
          <div>
            <div class="label">Forcer une synchro maintenant</div>
            <div class="sub">Envoie l'état actuel dans le cloud (utile après import massif).</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="cloudPushNow" ${!fbState.enabled?'disabled':''}>☁ Pousser maintenant</button>
        </div>
      `}
    </div>

    <div class="card mt-16">
      <div class="card-h"><h3>🔔 Rappel quotidien wellness</h3></div>
      <div class="settings-row">
        <div>
          <div class="label">Activer les notifications</div>
          <div class="sub">Pour fonctionner partout : installe l'app (« Ajouter à l'écran d'accueil ») et autorise les notifications</div>
        </div>
        <label class="switch"><input type="checkbox" id="remOn" ${state.settings.reminderEnabled?'checked':''}><span class="slider"></span></label>
      </div>
      <div class="settings-row">
        <div>
          <div class="label">Heure du rappel</div>
          <div class="sub">Rappel quotidien à cette heure</div>
        </div>
        <input type="time" id="remTime" value="${state.settings.reminderTime||'08:00'}" style="max-width:140px">
      </div>
      <div class="settings-row">
        <div>
          <div class="label">Tester maintenant</div>
          <div class="sub">Envoie une notification de test pour vérifier que ça marche</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="testNotifBtn">🔔 Tester</button>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-h"><h3>Données</h3></div>
      <div class="settings-row">
        <div><div class="label">Synchroniser depuis l'Excel</div><div class="sub">Recharge les semaines depuis « Planif marche maman.xlsx »</div></div>
        <button class="btn btn-ghost btn-sm" id="syncExcelBtn">🔄 Resynchroniser Excel</button>
      </div>
      <div class="settings-row">
        <div><div class="label">Exporter une sauvegarde</div><div class="sub">JSON contenant tous les athlètes</div></div>
        <button class="btn btn-ghost btn-sm" id="exportBtn2">↓ Exporter</button>
      </div>
      <div class="settings-row">
        <div><div class="label">Importer une sauvegarde</div><div class="sub">Remplace les données existantes</div></div>
        <button class="btn btn-ghost btn-sm" id="importBtn2">↑ Importer</button>
      </div>
      <div class="settings-row">
        <div><div class="label">Réinitialiser</div><div class="sub">Tout effacer</div></div>
        <button class="btn btn-danger btn-sm" id="resetBtn">⟲ Réinitialiser</button>
      </div>
    </div>
  `;

  // === Boutons cloud sync ===
  $('#cloudGenCode')?.addEventListener('click', () => {
    $('#cloudRoomCode').value = generateRoomCode();
  });
  $('#cloudEnable')?.addEventListener('click', async () => {
    const code = ($('#cloudRoomCode').value || '').trim().toUpperCase();
    if (code.length < 6) { toast('Code trop court (6 caractères minimum)'); return; }
    const btn = $('#cloudEnable');
    btn.disabled = true; btn.textContent = '⏳ Connexion…';
    const ok = await enableCloudSync(code);
    if (ok) { toast('☁ Sync activée'); renderSettings(); }
    else { toast('Échec d\'activation — voir console'); btn.disabled = false; btn.textContent = '✓ Activer la sync'; }
  });
  $('#cloudDisable')?.addEventListener('click', () => {
    disableCloudSync();
    toast('Sync désactivée');
    renderSettings();
  });
  $('#cloudPushNow')?.addEventListener('click', async () => {
    await cloudPushAll();
    toast('Snapshot envoyé');
  });

  $('#useMedianHR')?.addEventListener('click', () => {
    const det = detectMaxHRFromImports();
    if (!det) return;
    $('#pMaxHR').value = det.median;
    A().profile.maxHR = det.median;
    saveState();
    toast(`FC max → ${det.median} bpm`);
    renderSettings();
  });
  $('#useMaxHR')?.addEventListener('click', () => {
    const det = detectMaxHRFromImports();
    if (!det) return;
    $('#pMaxHR').value = det.suggested;
    A().profile.maxHR = det.suggested;
    saveState();
    toast(`FC max → ${det.suggested} bpm`);
    renderSettings();
  });

  $('#pSave').addEventListener('click', () => {
    A().profile.name = $('#pName').value;
    A().profile.age = +$('#pAge').value || '';
    A().profile.job = $('#pJob').value;
    A().profile.objective = $('#pObj').value;
    A().profile.objectiveDate = $('#pDate').value;
    A().profile.restHR = +$('#pRestHR').value || 60;
    A().profile.maxHR = +$('#pMaxHR').value || 170;
    A().startDate = $('#pStart').value;
    saveState();
    updateProfileSidebar();
    renderAthleteSwitcher();
    toast('Profil sauvegardé');
    renderSettings();
  });

  $('#renameAth').addEventListener('click', () => {
    const n = prompt('Nouveau nom :', A().profile.name);
    if (n) { A().profile.name = n; saveState(); updateProfileSidebar(); renderAthleteSwitcher(); renderSettings(); }
  });
  $('#deleteAth')?.addEventListener('click', () => {
    if (!confirm('Supprimer cet athlète et toutes ses données ?')) return;
    delete state.athletes[state.currentAthleteId];
    state.currentAthleteId = Object.keys(state.athletes)[0];
    saveState(); renderAthleteSwitcher(); updateProfileSidebar(); go('dashboard');
  });

  $('#coachOn').addEventListener('change', e => {
    state.settings.coachMode = e.target.checked;
    document.body.classList.toggle('coach-mode', e.target.checked);
    $('#coachSwitch').checked = e.target.checked;
    saveState();
  });
  $('#coachName').addEventListener('change', e => { state.settings.coachName = e.target.value; saveState(); });

  $('#remOn').addEventListener('change', async e => {
    if (e.target.checked) {
      if (!('Notification' in window)) { toast('Pas de support'); e.target.checked = false; return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Permission refusée'); e.target.checked = false; return; }
    }
    state.settings.reminderEnabled = e.target.checked;
    saveState();
    scheduleReminder();
  });
  $('#remTime').addEventListener('change', e => {
    state.settings.reminderTime = e.target.value; saveState(); scheduleReminder();
  });
  $('#testNotifBtn').addEventListener('click', async () => {
    if (!('Notification' in window)) { toast('Pas de support de notifications sur ce navigateur'); return; }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Permission refusée — autorise les notifications dans les paramètres du navigateur'); return; }
    const body = `Bonjour ${A().profile.name||''} ! N'oublie pas ton wellness du jour 💪`;
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'notify', title: 'Coach Maman', body });
    } else if ('Notification' in window) {
      new Notification('Coach Maman', { body, icon: 'icon.svg' });
    }
    toast('Notification envoyée');
  });

  $('#syncExcelBtn').addEventListener('click', async () => {
    const btn = $('#syncExcelBtn');
    btn.disabled = true; const lbl = btn.textContent; btn.textContent = '⏳ Sync…';
    const ok = await syncFromExcel();
    btn.disabled = false; btn.textContent = lbl;
    if (ok) renderSettings();
  });
  $('#exportBtn2').addEventListener('click', exportData);
  $('#importBtn2').addEventListener('click', () => $('#importFile').click());
  $('#resetBtn').addEventListener('click', () => {
    if (confirm('Tout effacer ? Action irréversible.')) {
      localStorage.removeItem(STORAGE_KEY);
      state = loadState(); updateProfileSidebar(); renderAthleteSwitcher(); go('dashboard');
      toast('Données réinitialisées');
    }
  });
}

function updateProfileSidebar() {
  $('#profileName').textContent = A().profile.name || '—';
  $('#profileSub').textContent = `${A().profile.age||''}${A().profile.age?' ans':''}${A().profile.job?' · '+A().profile.job:''}`;
  $('#profileAvatar').textContent = (A().profile.name||'?')[0].toUpperCase();
  $('#coachSwitch').checked = !!state.settings.coachMode;
  document.body.classList.toggle('coach-mode', !!state.settings.coachMode);
}

// ===================== EXPORT / IMPORT =====================
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `coachmaman-${toISO(new Date())}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('Sauvegarde téléchargée');
}
$('#exportBtn')?.addEventListener('click', exportData);
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      state = migrate(obj);
      saveState();
      updateProfileSidebar();
      renderAthleteSwitcher();
      toast('Import réussi');
      go('dashboard');
    } catch { toast('Fichier invalide'); }
  };
  reader.readAsText(f);
});

$('#quickWellness').addEventListener('click', () => go('wellness'));
$('#homeBtn').addEventListener('click', () => go('dashboard'));

// coach mode quick toggle in sidebar
$('#coachSwitch').addEventListener('change', e => {
  state.settings.coachMode = e.target.checked;
  document.body.classList.toggle('coach-mode', e.target.checked);
  saveState();
  toast(e.target.checked ? 'Mode coach activé' : 'Mode coach désactivé');
});

window.addEventListener('scroll', () => {
  $('.topbar').classList.toggle('scrolled', window.scrollY > 4);
}, { passive: true });

// ===================== GLOBAL DROP - tout-en-un =====================
const ACTIVITY_EXTS = ['gpx','tcx','fit','csv','zip'];
const IMAGE_EXTS = ['png','jpg','jpeg','webp','gif','heic'];

let dragDepth = 0;
window.addEventListener('dragenter', e => {
  if (!e.dataTransfer?.types?.includes('Files')) return;
  dragDepth++;
  $('#globalDrop').hidden = false;
});
window.addEventListener('dragover', e => {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
});
window.addEventListener('dragleave', e => {
  if (!e.dataTransfer?.types?.includes('Files')) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) $('#globalDrop').hidden = true;
});
window.addEventListener('drop', async e => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  dragDepth = 0;
  $('#globalDrop').hidden = true;
  await routeDroppedFiles([...e.dataTransfer.files]);
});

async function routeDroppedFiles(files) {
  const activities = [];
  const images = [];
  let backupFile = null;

  for (const f of files) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (ACTIVITY_EXTS.includes(ext)) activities.push(f);
    else if (IMAGE_EXTS.includes(ext)) images.push(f);
    else if (ext === 'json') backupFile = f;
  }

  // sauvegarde JSON : importer le state
  if (backupFile) {
    try {
      const obj = JSON.parse(await backupFile.text());
      if (obj.athletes || obj.profile) {
        if (confirm(`Importer la sauvegarde "${backupFile.name}" ? Les données actuelles seront remplacées.`)) {
          state = migrate(obj);
          saveState();
          updateProfileSidebar(); renderAthleteSwitcher();
          toast('Sauvegarde importée ✓');
          go('dashboard');
        }
      } else toast('JSON non reconnu comme sauvegarde');
    } catch { toast('JSON invalide'); }
  }

  // photos : ajouter à la séance en cours d'édition (s'il y en a une)
  if (images.length) {
    const openBlock = $('.session-block.open');
    if (openBlock) {
      const globalIdx = +openBlock.dataset.i;
      const s = A().sessions[globalIdx];
      const dkey = `${s.week}-${s.day}-0`;
      for (const f of images) await addPhoto(f, dkey);
      renderPhotoGallery(globalIdx, dkey);
      toast(`${images.length} photo(s) ajoutée(s) à S${s.week}J${s.day}`);
    } else {
      toast('Ouvre d\'abord une séance pour y attacher les photos');
    }
  }

  // activités : router vers la vue Imports
  if (activities.length) {
    go('imports');
    setTimeout(() => handleImportFiles(activities), 100);
  }

  if (!activities.length && !images.length && !backupFile) {
    toast('Aucun fichier supporté trouvé');
  }
}

// ===================== PWA: SERVICE WORKER + INSTALL + AUTO-UPDATE =====================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Vérifie une mise à jour toutes les 5 min tant que l'app est ouverte
    setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
    // Vérifie tout de suite au démarrage
    reg.update().catch(() => {});
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(newSW);
        }
      });
    });
  }).catch(() => {});

  // Quand le SW prend le contrôle, recharge la page une fois pour appliquer
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'sw-updated') {
      // une nouvelle version est active : message discret
      toast('App mise à jour ✨');
    }
  });
}

function showUpdateBanner(newSW) {
  let banner = document.getElementById('updateBanner');
  if (banner) return;
  banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <span>🎉 Nouvelle version disponible</span>
    <button class="btn btn-primary btn-sm">Recharger</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector('button').addEventListener('click', () => {
    newSW.postMessage({ type: 'skip-waiting' });
    // controllerchange déclenchera le reload
  });
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#installBtn').hidden = true;
});

// ===================== REMINDERS =====================
let reminderTimer = null;
function scheduleReminder() {
  if (reminderTimer) clearTimeout(reminderTimer);
  if (!state.settings.reminderEnabled) return;
  const [h, m] = (state.settings.reminderTime||'08:00').split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next - now;
  reminderTimer = setTimeout(() => {
    // skip if already done today
    const today = toISO(new Date());
    const already = A().wellness.find(w => w.date === today);
    if (!already && 'Notification' in window && Notification.permission === 'granted') {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'notify',
          title: 'Coach Maman',
          body: `${A().profile.name}, c'est l'heure de ton wellness du jour 💚`
        });
      } else {
        new Notification('Coach Maman', { body: `${A().profile.name}, c'est l'heure de ton wellness du jour 💚`, icon: 'icon.svg' });
      }
    }
    scheduleReminder();
  }, delay);
}

// ===================== ONBOARDING =====================
function maybeOnboarding() {
  if (localStorage.getItem('coachmaman.onboarded')) return;
  modal(`
    <div class="modal-title">Bienvenue 👋</div>
    <div class="modal-sub">Coach Maman — préparation physique tout-en-un</div>
    <div style="font-size:13.5px;line-height:1.7;color:var(--text-soft);margin:14px 0">
      Voici tes raccourcis essentiels :
      <ul style="margin:10px 0 10px 18px">
        <li><strong>Tableau de bord</strong> — vue d'ensemble, charge d'entraînement, ratio risque (ACWR)</li>
        <li><strong>Planification</strong> — macro / méso / micro cycles éditables en direct</li>
        <li><strong>Séances</strong> — calendrier hebdo, séances détaillées, import GPX, photos</li>
        <li><strong>Wellness</strong> — questionnaire quotidien 5 questions + graphiques</li>
        <li><strong>Exercices</strong> — ${EXERCISES.length} exercices filtrables par muscle/matériel</li>
      </ul>
      <div style="background:var(--accent-soft);padding:10px 12px;border-radius:8px;color:var(--accent);font-size:12px;margin-top:10px">
        💡 <strong>Astuce :</strong> active le <strong>Mode coach</strong> en bas de la barre latérale pour ajouter tes commentaires sur chaque séance réalisée.
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" id="onbStart">C'est parti 🚀</button>
    </div>
  `, () => {
    $('#onbStart').addEventListener('click', () => {
      localStorage.setItem('coachmaman.onboarded', '1');
      closeModal();
    });
  });
}

// ===================== TODAY'S FOCUS WIDGET =====================
function todayFocus() {
  const today = toISO(new Date());
  const wi = currentWeekIndex();
  const r = weekRange(wi);
  const dayIdx = Math.floor((new Date() - r.start) / 86400000); // 0-6
  if (dayIdx < 0 || dayIdx > 6) return '';
  const todaySessions = A().sessions.filter(s => s.week === wi+1 && s.day === dayIdx+1);
  const isWork = !!A().workDays[today];
  const wellDone = A().wellness.find(w => w.date === today);

  if (!todaySessions.length && !isWork) {
    return `<div class="card mb-16" style="border-left:4px solid var(--accent)">
      <div class="card-h"><h3>📅 ${DAYS_FR[dayIdx]} ${fmtDateShort(new Date())}</h3>
        ${wellDone?'<span class="tag accent">✓ Wellness fait</span>':'<button class="btn btn-ghost btn-sm" onclick="go(\'wellness\')">Faire le wellness</button>'}
      </div>
      <div class="text-mute">Pas de séance prévue — jour de repos ou activité libre.</div>
    </div>`;
  }
  return `<div class="card mb-16" style="border-left:4px solid var(--accent)">
    <div class="card-h">
      <h3>📅 Aujourd'hui — ${DAYS_FR[dayIdx]} ${fmtDateShort(new Date())}</h3>
      <div class="row">
        ${isWork?'<span class="tag warn">Travail</span>':''}
        ${wellDone?'<span class="tag accent">✓ Wellness</span>':'<button class="btn btn-accent btn-sm" onclick="go(\'wellness\')">+ Wellness</button>'}
      </div>
    </div>
    <div class="row wrap" style="gap:10px">
      ${todaySessions.map((s, si) => {
        const dkey = `${wi+1}-${dayIdx+1}-${si}`;
        const done = !!A().done[dkey];
        return `<div class="session-pill ${typeClass(s.type)}" style="flex:1;min-width:220px" data-go-session="${wi}">
          <div class="sp-name">${s.type}${done?' ✓':''} · ${s.title||s.qualite||''}</div>
          <div class="sp-sub">${s.duree?s.duree+'\' · ':''}${s.rpe?'RPE '+s.rpe:''}</div>
        </div>`;
      }).join('') || '<div class="text-mute">Pas de séance planifiée</div>'}
    </div>
  </div>`;
}

window.go = go;

// ===================== REFRESH AU FOCUS =====================
// Quand l'onglet redevient visible (ou que la fenêtre reprend le focus),
// on recharge l'état depuis localStorage et on re-render la vue courante.
let lastFocusISO = toISO(new Date());
function softRefresh() {
  // recharge le state au cas où une autre fenêtre l'aurait modifié
  state = loadState();
  // si on a changé de jour, re-render pour que "aujourd'hui" / semaine en cours s'actualisent
  const todayISO = toISO(new Date());
  const dayChanged = todayISO !== lastFocusISO;
  lastFocusISO = todayISO;
  // re-render la vue active
  const active = $('.nav-item.active')?.dataset.view || 'dashboard';
  render(active);
  // reprogramme le rappel wellness
  scheduleReminder();
  if (dayChanged) toast('🌅 Nouveau jour — données actualisées');
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') softRefresh();
});
window.addEventListener('focus', softRefresh);

// Vérification périodique : si minuit est passé pendant que l'app est ouverte
// (par exemple tu laisses la page wellness affichée toute la nuit), on re-render.
setInterval(() => {
  const todayISO = toISO(new Date());
  if (todayISO !== lastFocusISO) {
    lastFocusISO = todayISO;
    const active = $('.nav-item.active')?.dataset.view || 'dashboard';
    render(active);
    scheduleReminder();
    toast('🌅 Nouveau jour — la date a été actualisée');
  }
}, 60_000); // toutes les minutes
// synchronise les fenêtres ouvertes en parallèle
window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEY) {
    state = loadState();
    const active = $('.nav-item.active')?.dataset.view || 'dashboard';
    render(active);
  }
});

// ===================== INIT =====================
renderAthleteSwitcher();
updateProfileSidebar();
go('dashboard');
scheduleReminder();
maybeOnboarding();

// Initialisation Firebase sync (si configurée et activée)
initFirebaseSync();
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// Auto-sync depuis l'Excel au démarrage (silencieux si offline / pas de fichier)
syncFromExcel({ silent: true }).then(ok => {
  if (ok) {
    const active = $('.nav-item.active')?.dataset.view || 'dashboard';
    render(active);
  }
});
