// ============================================================
// CONFIG — personnalisation du jeu. Rien d'autre à toucher pour :
//   - ajouter une image de puzzle prédéfinie
//   - ajouter un fond (couleur, image, vidéo ou animation intégrée)
//   - ajouter une musique d'ambiance (fichier audio ou lien YouTube)
// Guide détaillé (formats, 4K, commandes ffmpeg) : GUIDE-MEDIAS.md
// ============================================================

// --- 1. Images de puzzle proposées par défaut ---
// Fichier déposé dans puzzle-frontend/public/, puis une ligne ici.
// Conseil qualité : au moins 3000 px de large (les pièces sont découpées
// dans la photo d'origine : plus elle est grande, plus le zoom est net).
export const PRESET_IMAGES = [
  { id: 1, name: "L'œil coloré", url: '/oeuil.jpg' },
  { id: 2, name: 'Ciel matinal', url: '/ciel.jpg' },
  { id: 3, name: 'Montgolfière', url: '/ballon.jpeg' },
];

// --- 2. Fonds d'écran (accueil + table de jeu) ---
// type "color"    -> couleur ou dégradé CSS
// type "animated" -> animation intégrée, sans fichier, nette en 4K
//                    (value : 'aurora' | 'stars' | 'flow')
// type "image"    -> fichier dans /public, ex: "/fonds/foret.jpg"
// type "video"    -> fichier vidéo (mp4/webm) dans /public, en boucle,
//                    muet, toujours plein écran quel que soit le zoom.
//                    `poster` = image affichée pendant le chargement.
// L'hôte peut aussi envoyer sa propre photo de fond depuis les réglages.
export const BACKGROUNDS = [
  { id: 'dark', name: 'Sombre', type: 'color', value: '#0e0f12' },
  { id: 'night', name: 'Nuit violette', type: 'color', value: 'linear-gradient(160deg, #0f0c29, #302b63, #24243e)' },
  { id: 'forest', name: 'Forêt profonde', type: 'color', value: 'linear-gradient(160deg, #0b3d2e, #145a32)' },
  { id: 'sunset', name: 'Coucher de soleil', type: 'color', value: 'linear-gradient(160deg, #ff7e5f, #feb47b)' },
  { id: 'aurora', name: 'Aurore (animé)', type: 'animated', value: 'aurora' },
  { id: 'stars', name: 'Ciel étoilé (animé)', type: 'animated', value: 'stars' },
  { id: 'flow', name: 'Dégradé vivant (animé)', type: 'animated', value: 'flow' },
  // Exemples à décommenter une fois les fichiers déposés dans public/fonds/ :
  // { id: 'rain', name: 'Pluie la nuit', type: 'video', value: '/fonds/pluie.mp4', poster: '/fonds/pluie.jpg' },
  // { id: 'lofi-room', name: 'Chambre lofi', type: 'video', value: '/fonds/lofi-room.mp4' },
  // { id: 'foret', name: 'Forêt', type: 'image', value: '/fonds/foret.jpg' },
];

// Fond à afficher pour un identifiant de réglage ('custom' = photo de l'hôte).
export function findBackground(id, customUrl) {
  if (id === 'custom' && customUrl) return { id: 'custom', name: 'Photo perso', type: 'image', value: customUrl };
  return BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0];
}

// Aperçu (petite vignette) des fonds animés dans les sélecteurs.
export const ANIMATED_PREVIEWS = {
  aurora: 'radial-gradient(circle at 30% 30%, #2de2a6 0%, transparent 55%), radial-gradient(circle at 75% 60%, #7b5cff 0%, transparent 55%), #0b1020',
  stars: 'radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 60%, #fff, transparent), radial-gradient(1.5px 1.5px at 45% 80%, #fff, transparent), linear-gradient(180deg, #050816, #141a3a)',
  flow: 'linear-gradient(120deg, #ff6a88, #6a5cff, #20c3d0)',
};

// --- 3. Musique d'ambiance ---
// Deux possibilités par piste :
//   src: '/musique/fichier.mp3'  -> fichier déposé dans public/musique/
//                                   (le plus fiable : volume réglable, pas de pub)
//   youtubeId: 'xxxxxxxxxxx'     -> la partie après "v=" dans le lien YouTube
//                                   (radio en direct ou vidéo, jouée en boucle)
export const MUSIC_TRACKS = [
  { id: 'none', name: 'Aucune' },
  { id: 'lofi', name: 'Lofi Girl (radio YouTube)', youtubeId: 'jfKfPfyJRdk' },
  // { id: 'pluie', name: 'Pluie douce', src: '/musique/pluie.mp3' },
  // { id: 'piano', name: 'Piano calme', src: '/musique/piano.mp3' },
];

// --- 4. Couleurs de curseur proposées ---
export const CURSOR_COLORS = ['#5b8cff', '#3ecf8e', '#f2a93c', '#f05a5a', '#b57bff', '#36c7c7'];

// --- 5. Lien d'invitation Discord (bouton dans le lobby) ---
// Laisse vide ('') pour masquer le bouton.
export const DISCORD_INVITE_URL = '';

// --- 6. Réglages de génération ---
export const MIN_PIECES = 12;
export const MAX_PIECES = 1000;

// --- 7. Qualité graphique (préférence personnelle) ---
export const QUALITY_OPTIONS = [
  { id: 'auto', name: 'Auto', hint: 'Choisit selon ton ordinateur.' },
  { id: 'max', name: 'Max', hint: 'Le plus net (écrans 4K), plus gourmand.' },
  { id: 'balanced', name: 'Équilibré', hint: 'Net et fluide sur la plupart des PC.' },
  { id: 'eco', name: 'Économie', hint: 'Pour les petits PC : sans ombres, fond animé figé.' },
];

// --- 8. Tailles de focus proposées ---
export const FOCUS_SIZES = [25, 50, 100];
