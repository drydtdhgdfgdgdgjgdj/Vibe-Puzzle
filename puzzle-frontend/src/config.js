// ============================================================
// CONFIG — personnalisation du jeu. Rien d'autre à toucher pour :
//   - ajouter une image de puzzle prédéfinie
//   - ajouter un fond (couleur, image, vidéo ou animation intégrée)
//   - ajouter une musique d'ambiance (fichier audio ou lien YouTube)
// Guide détaillé (formats, 4K, commandes ffmpeg) : GUIDE-MEDIAS.md
// ============================================================

// --- 1. Images de puzzle proposées par défaut ---
// Le plus simple : dépose l'image dans medias-originaux/puzzles/, lance
// `npm run medias` (redimensionne à 4096 px max + crée la vignette), puis
// colle la ligne puzzle(...) qu'il affiche. Voir GUIDE-MEDIAS.md.
// Conseil qualité : au moins 3000 px de large (les pièces sont découpées
// dans la photo d'origine : plus elle est grande, plus le zoom est net).
// `thumb` = vignette légère du carrousel d'accueil (sinon l'image entière).
const puzzle = (id, name) => ({ id, name, url: `/puzzles/${id}.jpg`, thumb: `/puzzles/${id}-mini.jpg` });

export const PRESET_IMAGES = [
  { id: 1, name: "L'œil coloré", url: '/oeuil.jpg' },
  { id: 2, name: 'Ciel matinal', url: '/ciel.jpg' },
  { id: 3, name: 'Montgolfière', url: '/ballon.jpeg' },
  puzzle('vague-de-kanagawa', 'Vague de Kanagawa'),
  puzzle('voie-lactee-sur-les-alpes', 'Voie lactée sur les Alpes'),
  puzzle('cratere-du-kawah-ijen', 'Cratère du Kawah Ijen'),
  puzzle('crateres-lunaires', 'Cratères lunaires'),
  puzzle('rochers-du-desert', 'Rochers du désert'),
  puzzle('ferrari-296-gt', 'Ferrari 296 GT'),
  puzzle('mansory-vivere', 'Mansory Vivere'),
  puzzle('the-legend-of-zelda', 'The Legend of Zelda'),
  puzzle('les-simpson', 'Les Simpson'),
];

// --- 2. Fonds d'écran (accueil + table de jeu) ---
// type "color"    -> couleur ou dégradé CSS
// type "animated" -> animation intégrée, sans fichier, nette en 4K
//                    (value : 'aurora' | 'stars' | 'flow')
// type "image"    -> fichier dans /public, ex: "/fonds/foret.jpg"
// type "video"    -> fichier vidéo (mp4/webm) dans /public, en boucle,
//                    muet, toujours plein écran quel que soit le zoom.
//                    `poster` = image affichée pendant le chargement.
//                    `thumb`  = petite vignette (240 px) du sélecteur.
//                    Toujours MUETTE : le navigateur refuse de lancer tout
//                    seul une vidéo avec du son (voir GUIDE-MEDIAS.md).
//                    Noms de fichiers : minuscules, sans espaces ni accents.
// L'hôte peut aussi envoyer sa propre photo de fond depuis les réglages.
const video = (id, name) => ({
  id, name, type: 'video', value: `/fonds/${id}.mp4`, poster: `/fonds/${id}.jpg`, thumb: `/fonds/${id}-mini.jpg`,
});

export const BACKGROUNDS = [
  { id: 'dark', name: 'Sombre', type: 'color', value: '#0e0f12' },
  { id: 'night', name: 'Nuit violette', type: 'color', value: 'linear-gradient(160deg, #0f0c29, #302b63, #24243e)' },
  { id: 'forest', name: 'Forêt profonde', type: 'color', value: 'linear-gradient(160deg, #0b3d2e, #145a32)' },
  { id: 'sunset', name: 'Coucher de soleil', type: 'color', value: 'linear-gradient(160deg, #ff7e5f, #feb47b)' },
  { id: 'aurora', name: 'Aurore (animé)', type: 'animated', value: 'aurora' },
  { id: 'stars', name: 'Ciel étoilé (animé)', type: 'animated', value: 'stars' },
  { id: 'flow', name: 'Dégradé vivant (animé)', type: 'animated', value: 'flow' },
  { id: 'rain', name: 'Pluie (animé)', type: 'animated', value: 'rain' },
  // Vidéos : fichiers dans public/fonds/ (<id>.mp4, <id>.jpg, <id>-mini.jpg),
  // créés par `npm run medias` depuis medias-originaux/fonds/.
  video('pluie', 'Pluie'),
  video('foret-sous-la-pluie', 'Forêt sous la pluie'),
  video('maison-sous-la-pluie', 'Maison sous la pluie'),
  video('lofi-au-mont-fuji', 'Lofi au mont Fuji'),
  video('ambiance', 'Ambiance'),
  video('winter-mood', 'Winter mood'),
  video('vacances-mood', 'Vacances mood'),
  video('voyage-imaginaire', 'Voyage imaginaire'),
  video('trait-bleu', 'Trait bleu'),
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
  rain: 'repeating-linear-gradient(14deg, rgba(200,222,250,0.5) 0 0.8px, transparent 0.8px 6px), linear-gradient(180deg, #0a1018, #16243a)',
};

// --- 3. Musique d'ambiance ---
// Choisie dans le panneau "note de musique" (bas à droite), partagée par
// toute la partie. Chaque piste est l'une de ces trois sortes :
//   src: 'https://…'             -> radio en continu (flux direct, le plus
//                                   fiable) ; mettre `live: false` pour un
//                                   fichier qui doit boucler
//   src: '/musique/fichier.mp3'  -> fichier déposé dans public/musique/
//                                   (`live: false` aussi)
//   youtubeId: 'xxxxxxxxxxx'     -> la partie après "v=" dans le lien YouTube
//                                   (certaines vidéos, dont la radio lofi
//                                   principale de Lofi Girl, refusent d'être
//                                   lues hors de YouTube)
// group  : rubrique du panneau (voir MUSIC_GROUPS)
// cover  : deux couleurs du dégradé de la vignette
// nowPlaying (facultatif) : d'où lire le titre en cours
//   { lautfm: 'nom-de-la-station' } ou { radiofrance: numéro de la webradio }
// Chaque radio ci-dessous a été vérifiée dans Chrome en octobre 2026.
export const MUSIC_GROUPS = [
  { id: 'lofi', name: 'Lofi & chill', icon: 'coffee' },
  { id: 'groove', name: 'Groove & électro', icon: 'waves' },
  { id: 'jazz', name: 'Jazz & classique', icon: 'piano' },
  { id: 'world', name: 'Éclectique', icon: 'globe' },
];

export const MUSIC_TRACKS = [
  { id: 'none', name: 'Aucune' },
  { id: 'lofi', name: 'Lofi', genre: 'Lofi hip-hop, sans pause', group: 'lofi', src: 'https://stream.laut.fm/lofi', cover: ['#f6a5c0', '#7b5cff'], nowPlaying: { lautfm: 'lofi' } },
  { id: 'lofi-cafe', name: 'Lofi Café', genre: 'Beats doux pour se concentrer', group: 'lofi', src: 'https://live.hunter.fm/lofi_high', cover: ['#d4a373', '#8d5b4c'] },
  { id: 'chillhop', name: 'Chillhop', genre: 'Hip-hop instrumental (FluxFM)', group: 'lofi', src: 'https://streams.fluxfm.de/Chillhop/mp3-128/streams.fluxfm.de/', cover: ['#43cea2', '#185a9d'] },
  { id: 'ilove-chillhop', name: 'I Love Chillhop', genre: 'Chill, R&B, lofi', group: 'lofi', src: 'https://streams.ilovemusic.de/iloveradio17.mp3', cover: ['#ff758c', '#ff7eb3'] },
  { id: 'synthwave', name: 'Synthwave', genre: 'Radio Lofi Girl (YouTube)', group: 'lofi', youtubeId: '4xDzrJKXOOY', cover: ['#fc466b', '#3f5efb'] },
  { id: 'fip-groove', name: 'FIP Groove', genre: 'Soul, funk, hip-hop', group: 'groove', src: 'https://icecast.radiofrance.fr/fipgroove-midfi.mp3', cover: ['#f7971e', '#e44d26'], nowPlaying: { radiofrance: 66 } },
  { id: 'fip-electro', name: 'FIP Electro', genre: 'Électro douce', group: 'groove', src: 'https://icecast.radiofrance.fr/fipelectro-midfi.mp3', cover: ['#00c6ff', '#0052d4'], nowPlaying: { radiofrance: 74 } },
  { id: 'rp-mellow', name: 'Radio Paradise Mellow', genre: 'Pop, folk, tout en douceur', group: 'groove', src: 'https://stream.radioparadise.com/mellow-128', cover: ['#a8e063', '#3a8d2f'] },
  { id: 'fip-jazz', name: 'FIP Jazz', genre: 'Jazz de toutes les époques', group: 'jazz', src: 'https://icecast.radiofrance.fr/fipjazz-midfi.mp3', cover: ['#c9a27e', '#6b4a3a'], nowPlaying: { radiofrance: 65 } },
  { id: 'fm-jazz', name: 'La Jazz', genre: 'France Musique', group: 'jazz', src: 'https://icecast.radiofrance.fr/francemusiquelajazz-midfi.mp3', cover: ['#614385', '#516395'], nowPlaying: { radiofrance: 405 } },
  { id: 'fm-easy', name: 'Classique Easy', genre: 'France Musique, classique doux', group: 'jazz', src: 'https://icecast.radiofrance.fr/francemusiqueeasyclassique-midfi.mp3', cover: ['#8e9eab', '#3e5151'], nowPlaying: { radiofrance: 401 } },
  { id: 'fip', name: 'FIP', genre: 'Éclectique, sans pub', group: 'world', src: 'https://icecast.radiofrance.fr/fip-midfi.mp3', cover: ['#ee0979', '#ff6a00'], nowPlaying: { radiofrance: 7 } },
  { id: 'fip-monde', name: 'FIP Monde', genre: 'Musiques du monde', group: 'world', src: 'https://icecast.radiofrance.fr/fipworld-midfi.mp3', cover: ['#11998e', '#2bc46a'], nowPlaying: { radiofrance: 69 } },
  // Exemple de fichier déposé dans public/musique/ :
  // { id: 'pluie', name: 'Pluie douce', genre: 'Bruit de pluie', group: 'world', src: '/musique/pluie.mp3', live: false, cover: ['#4b6cb7', '#182848'] },
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
