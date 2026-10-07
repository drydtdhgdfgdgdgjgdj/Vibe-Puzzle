// ============================================================
// Musique d'ambiance : traduction d'un réglage (radio prédéfinie ou
// musique perso) en piste jouable, lecture des liens collés par les
// joueurs, titre en cours des radios et chargement de l'API YouTube.
// ============================================================
import { MUSIC_TRACKS } from './config';

export const MAX_MUSIC_FILE_BYTES = 20 * 1024 * 1024;
const CUSTOM_COVER = ['#5b8cff', '#b57bff'];

// Piste à jouer pour un réglage { music, customMusic } ; null = silence.
// `key` change dès qu'il faut relancer le lecteur.
export function resolveTrack(musicId, customMusic) {
  if (musicId === 'custom' && customMusic) {
    const base = { id: 'custom', custom: true, name: customMusic.name || 'Musique perso', cover: CUSTOM_COVER };
    if (customMusic.kind === 'youtube') {
      return { ...base, kind: 'youtube', youtubeId: customMusic.youtubeId, genre: 'Vidéo YouTube', key: `yt:${customMusic.youtubeId}` };
    }
    const file = customMusic.kind === 'file' || customMusic.kind === 'local';
    return {
      ...base, kind: 'audio', src: customMusic.url, live: !file && !/\.(mp3|ogg|oga|m4a|aac|wav|flac|opus|webm)(\?|$)/i.test(customMusic.url),
      genre: file ? 'Fichier audio' : 'Lien audio', key: `src:${customMusic.url}`,
    };
  }
  const t = MUSIC_TRACKS.find((m) => m.id === musicId);
  if (!t || t.id === 'none') return null;
  if (t.youtubeId) return { ...t, kind: 'youtube', key: `yt:${t.youtubeId}` };
  if (t.src) return { ...t, kind: 'audio', live: t.live !== false, key: `src:${t.src}` };
  return null;
}

// Identifiant d'une vidéo YouTube dans un lien (watch, youtu.be, live, shorts…).
export function youtubeIdFrom(text) {
  try {
    const u = new URL(text);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v') || u.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{11})/)?.[1] || null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

// Lien collé -> musique perso, ou { error } s'il n'est pas utilisable.
export function parseMusicLink(text) {
  const raw = (text || '').trim();
  if (!raw) return { error: 'Colle un lien.' };
  const ytId = youtubeIdFrom(raw);
  if (ytId) return { music: { kind: 'youtube', youtubeId: ytId, name: 'Vidéo YouTube' } };
  let u;
  try { u = new URL(raw); } catch { return { error: 'Ce n’est pas un lien valide (il doit commencer par https://).' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Le lien doit commencer par https://.' };
  if (/\.(m3u8?|pls)(\?|$)/i.test(u.pathname)) {
    return { error: 'C’est une liste de lecture (.m3u / .pls) : ouvre-la et copie le lien de la radio qu’elle contient.' };
  }
  const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
  const name = last && /\.\w{2,4}$/.test(last) ? last.replace(/\.\w{2,4}$/, '') : u.hostname.replace(/^www\./, '');
  return { music: { kind: 'url', url: u.href, name: name.slice(0, 80) } };
}

// Titre de la vidéo (pour l'afficher à la place de "Vidéo YouTube").
export async function fetchYouTubeTitle(youtubeId) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.title === 'string' ? data.title.slice(0, 80) : null;
  } catch {
    return null;
  }
}

// Morceau en cours d'une radio : { title, artist, cover? } ou null.
export async function fetchNowPlaying(np, signal) {
  if (!np) return null;
  if (np.lautfm) {
    const res = await fetch(`https://api.laut.fm/station/${encodeURIComponent(np.lautfm)}/current_song`, { signal });
    const d = await res.json();
    return d?.title ? { title: d.title, artist: d.artist?.name || '' } : null;
  }
  if (np.radiofrance) {
    const res = await fetch(`https://api.radiofrance.fr/livemeta/pull/${Number(np.radiofrance)}`, { signal });
    const d = await res.json();
    const level = d?.levels?.[0];
    const step = level && d.steps?.[level.items?.[level.position]];
    if (!step?.title) return null;
    const artist = step.highlightedArtists?.join(', ') || step.authors || step.performers || '';
    return { title: step.title, artist, cover: step.visuelYoutube || null };
  }
  return null;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

// API officielle du lecteur YouTube, chargée une seule fois et seulement
// si une piste YouTube est choisie.
let youtubeApi = null;
export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeApi) {
    youtubeApi = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { youtubeApi = null; reject(new Error('YouTube ne répond pas.')); };
      document.head.appendChild(script);
    });
  }
  return youtubeApi;
}

export function youtubeErrorText(code) {
  if (code === 101 || code === 150 || code === 153) return 'Cette vidéo refuse d’être lue en dehors de YouTube. Essaie une radio ou une autre vidéo.';
  if (code === 100) return 'Vidéo introuvable (supprimée ou privée).';
  if (code === 2) return 'Lien YouTube invalide.';
  return 'Le lecteur YouTube a rencontré une erreur.';
}
