// ============================================================
// Identité persistante du joueur.
//
// Un UUID est généré une seule fois et stocké dans le navigateur.
// Il sert à reconnaître la même personne après un rechargement de
// page ou une reconnexion, pour que :
//  - le créateur d'une room reste "admin" même s'il revient plus tard
//  - un pseudo ne puisse pas être piraté par quelqu'un d'autre dans la room
//  - les réglages personnels (pseudo, curseur) soient retrouvés
//  - la liste "Mes parties" de l'accueil retrouve ses parties
// ============================================================

const STORAGE_KEY = 'puzzle_client_id';
const PREFS_KEY = 'puzzle_prefs';

function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  // Repli pour les très vieux navigateurs
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getClientId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage indisponible (navigation privée très stricte) : identité éphémère
    return generateId();
  }
}

export function getStoredProfile() {
  try {
    return {
      pseudo: localStorage.getItem('puzzle_pseudo') || '',
      color: localStorage.getItem('puzzle_color') || '',
      cursorShape: localStorage.getItem('puzzle_cursor_shape') || 'dot',
      cursorImage: localStorage.getItem('puzzle_cursor_image') || null,
    };
  } catch {
    return { pseudo: '', color: '', cursorShape: 'dot', cursorImage: null };
  }
}

export function saveStoredProfile(partial) {
  try {
    if (partial.pseudo !== undefined) localStorage.setItem('puzzle_pseudo', partial.pseudo);
    if (partial.color !== undefined) localStorage.setItem('puzzle_color', partial.color);
    if (partial.cursorShape !== undefined) localStorage.setItem('puzzle_cursor_shape', partial.cursorShape);
    if (partial.cursorImage !== undefined) {
      if (partial.cursorImage) localStorage.setItem('puzzle_cursor_image', partial.cursorImage);
      else localStorage.removeItem('puzzle_cursor_image');
    }
  } catch { /* stockage indisponible : on continue sans persister */ }
}

// ---------- Préférences personnelles (jamais partagées) ----------
export const DEFAULT_PREFS = {
  quality: 'auto', // auto | max | balanced | eco
  musicVolume: 0.5,
  musicMuted: false,
  sfxVolume: 0.8,
  sfxMuted: false,
  showOwnCursor: true,
  cursorScale: 1, // taille de tous les curseurs à l'écran (pour soi seulement)
  showModel: false,
  modelSize: 'm',
};

export function getPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return { ...DEFAULT_PREFS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignoré */ }
}
