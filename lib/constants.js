// ============================================================
// Constantes partagées par tous les modules du serveur.
// ============================================================

// Centre du monde : le cadre final est toujours centré sur ce point.
const CENTER = 2500;

// Identifiant de groupe des pièces fixées dans le cadre (mode "accroché").
const LOCKED = 'LOCKED';

// Préfixe du groupe "fixé dans le mini-cadre" d'un focus (F:<memberId>).
const FOCUS_LOCK_PREFIX = 'F:';

const DEFAULT_SETTINGS = {
  background: 'dark',
  customBackgroundUrl: null,
  music: 'none',
  // Musique perso quand music === 'custom' : { kind: 'file'|'url'|'youtube', url?, youtubeId?, name }
  customMusic: null,
  showFrame: true,
  showSeams: true,
  ghostImage: false,
  lockMode: 'locked', // 'locked' (accroché au cadre) | 'free' (bloc libre)
  guestsCanEdit: false,
};

// Délai avant de ranger automatiquement le focus d'un joueur déconnecté
// (un simple rechargement de page le retrouve intact).
const FOCUS_GRACE_MS = 60_000;

// Une demande d'aide sans réponse expire au bout de ce délai.
const HINT_TIMEOUT_MS = 45_000;

const MAX_PIECES = 1100;
const FOCUS_SIZES = [25, 50, 100];

module.exports = {
  CENTER,
  LOCKED,
  FOCUS_LOCK_PREFIX,
  DEFAULT_SETTINGS,
  FOCUS_GRACE_MS,
  HINT_TIMEOUT_MS,
  MAX_PIECES,
  FOCUS_SIZES,
};
