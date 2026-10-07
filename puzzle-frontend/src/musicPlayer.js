// ============================================================
// Lecteur de musique d'ambiance : une seule interface pour les flux
// radio / fichiers (<audio>) et pour YouTube (API officielle).
//
// État renvoyé : idle | loading | playing | paused (son coupé) |
// blocked (le navigateur attend un clic) | error.
// - Une radio qui décroche est relancée toute seule (et au bout de
//   15 s sans progression).
// - Son coupé : la lecture s'arrête vraiment (pas de téléchargement
//   inutile) ; une radio repart au direct quand on remet le son.
// - Lecture bloquée : elle démarre au premier clic ou touche, n'importe où.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { loadYouTubeApi, youtubeErrorText } from './music';

const MAX_RETRIES = 3;

function createAudioPlayer(src, live, onStatus) {
  const a = new Audio();
  a.preload = 'none';
  a.loop = !live;
  let wantPlay = false;
  let destroyed = false;
  let retries = 0;
  let retryTimer = null;
  let lastTime = -1;
  let stuckTicks = 0;

  const start = () => {
    if (destroyed || !wantPlay) return;
    onStatus('loading');
    // Une radio repart toujours du direct ; un fichier reprend où il était.
    if (live || !a.getAttribute('src')) a.src = src;
    a.play().catch((err) => {
      if (destroyed || !wantPlay) return;
      if (err?.name === 'NotAllowedError') onStatus('blocked');
    });
  };

  const onError = () => {
    if (destroyed || !wantPlay || !a.getAttribute('src')) return;
    if (retries < MAX_RETRIES) {
      retries += 1;
      onStatus('loading');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(start, 1500 * retries);
    } else {
      onStatus('error', live
        ? 'Impossible de se connecter à cette radio (hors ligne, ou lien qui n’est pas un flux audio).'
        : 'Impossible de lire ce fichier audio.');
    }
  };

  a.addEventListener('playing', () => { retries = 0; stuckTicks = 0; onStatus('playing'); });
  a.addEventListener('waiting', () => { if (wantPlay) onStatus('loading'); });
  a.addEventListener('error', onError);
  a.addEventListener('ended', () => { if (live && wantPlay) start(); });

  // Garde-fou : une radio figée 15 s (réseau coupé sans erreur) est relancée.
  const watchdog = setInterval(() => {
    if (!live || !wantPlay || a.paused) { stuckTicks = 0; return; }
    if (a.currentTime === lastTime) stuckTicks += 1; else stuckTicks = 0;
    lastTime = a.currentTime;
    if (stuckTicks >= 3) { stuckTicks = 0; start(); }
  }, 5000);

  return {
    setVolume(v) { a.volume = Math.max(0, Math.min(1, v)); },
    play() {
      if (wantPlay) return;
      wantPlay = true;
      retries = 0;
      start();
    },
    pause() {
      wantPlay = false;
      clearTimeout(retryTimer);
      a.pause();
      if (live) { a.removeAttribute('src'); a.load(); }
      onStatus('paused');
    },
    retry() {
      if (!wantPlay) return;
      retries = 0;
      start();
    },
    destroy() {
      destroyed = true;
      wantPlay = false;
      clearTimeout(retryTimer);
      clearInterval(watchdog);
      a.pause();
      a.removeAttribute('src');
      a.load();
    },
  };
}

// Lecteur YouTube invisible (200×200 transparent : YouTube refuse les
// lecteurs trop petits), en boucle.
function createYouTubePlayer(videoId, host, onStatus) {
  let player = null;
  let ready = false;
  let wantPlay = false;
  let destroyed = false;
  let volume = 0.5;
  let blockTimer = null;
  const el = document.createElement('div');
  host.appendChild(el);

  // Si rien ne démarre après quelques secondes, le navigateur attend un clic.
  const armBlockedCheck = () => {
    clearTimeout(blockTimer);
    blockTimer = setTimeout(() => {
      if (destroyed || !wantPlay || !ready) return;
      const s = player.getPlayerState();
      if (s !== 1 && s !== 3) onStatus('blocked');
    }, 4000);
  };
  const startPlayback = () => {
    if (!ready || !wantPlay) return;
    player.setVolume(Math.round(volume * 100));
    player.unMute();
    player.playVideo();
    armBlockedCheck();
  };

  onStatus('loading');
  loadYouTubeApi().then((YT) => {
    if (destroyed) return;
    player = new YT.Player(el, {
      width: 200,
      height: 200,
      videoId,
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, loop: 1, playlist: videoId, origin: window.location.origin },
      events: {
        onReady: () => { ready = true; startPlayback(); },
        onStateChange: (e) => {
          if (destroyed) return;
          if (e.data === 1) { clearTimeout(blockTimer); onStatus('playing'); }
          else if (e.data === 3) onStatus('loading');
          else if (e.data === 0 && wantPlay) player.playVideo();
        },
        onError: (e) => { if (!destroyed) onStatus('error', youtubeErrorText(e.data)); },
      },
    });
  }).catch((err) => { if (!destroyed) onStatus('error', err.message); });

  return {
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (ready) player.setVolume(Math.round(volume * 100));
    },
    play() {
      if (wantPlay) return;
      wantPlay = true;
      onStatus('loading');
      startPlayback();
    },
    pause() {
      wantPlay = false;
      clearTimeout(blockTimer);
      if (ready) player.pauseVideo();
      onStatus('paused');
    },
    retry() { startPlayback(); },
    destroy() {
      destroyed = true;
      clearTimeout(blockTimer);
      try { player?.destroy(); } catch { /* lecteur pas encore prêt */ }
      el.remove();
    },
  };
}

// Joue `track` (voir resolveTrack) au volume donné. `hostRef` : élément
// (invisible) où loger le lecteur YouTube.
export function useMusicPlayer(track, volume, muted, hostRef) {
  // L'état est rattaché à la piste qui l'a produit : juste après un
  // changement (ou un arrêt), on n'affiche jamais l'état de l'ancienne.
  const [state, setState] = useState({ key: null, status: 'idle', error: '' });
  const playerRef = useRef(null);
  const audible = !muted && volume > 0;
  const trackKey = track?.key || 'none';
  const current = !track ? { status: 'idle', error: '' }
    : state.key === trackKey ? state
      : { status: 'loading', error: '' };

  useEffect(() => {
    if (!track) return undefined;
    const onStatus = (status, error = '') => setState({ key: track.key, status, error });
    const player = track.kind === 'youtube'
      ? createYouTubePlayer(track.youtubeId, hostRef.current, onStatus)
      : createAudioPlayer(track.src, track.live, onStatus);
    playerRef.current = player;
    return () => {
      player.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
    // `track` est décrit entièrement par sa clé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(volume);
    if (audible) player.play();
    else player.pause();
  }, [trackKey, volume, audible]);

  // Lecture bloquée par le navigateur : elle part au premier geste.
  useEffect(() => {
    if (current.status !== 'blocked') return undefined;
    const kick = () => playerRef.current?.retry();
    window.addEventListener('pointerdown', kick, true);
    window.addEventListener('keydown', kick, true);
    return () => {
      window.removeEventListener('pointerdown', kick, true);
      window.removeEventListener('keydown', kick, true);
    };
  }, [current.status]);

  return { status: current.status, error: current.error, retry: () => playerRef.current?.retry() };
}
