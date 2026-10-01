import { useEffect, useRef, useState } from 'react';
import { MusicIcon, VolumeIcon, VolumeOffIcon, PlayIcon } from '../icons';
import { MUSIC_TRACKS } from '../config';

// Lecteur YouTube invisible, piloté par postMessage (enablejsapi=1) pour
// régler le volume sans charger la bibliothèque YouTube.
function YouTubePlayer({ videoId, volume }) {
  const ref = useRef(null);
  const send = (func, args = []) => {
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  };
  useEffect(() => {
    send('setVolume', [Math.round(volume * 100)]);
    send(volume <= 0 ? 'mute' : 'unMute');
  }, [volume]);
  const onLoad = () => {
    // Le lecteur met un instant à être prêt : on réapplique le volume.
    [300, 1200, 3000].forEach((ms) => setTimeout(() => {
      send('setVolume', [Math.round(volume * 100)]);
      send(volume <= 0 ? 'mute' : 'unMute');
      send('playVideo');
    }, ms));
  };
  const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&enablejsapi=1&controls=0&playsinline=1`;
  return (
    <iframe
      ref={ref}
      key={videoId}
      title="ambiance-sonore"
      src={src}
      allow="autoplay; encrypted-media"
      onLoad={onLoad}
      style={{ position: 'fixed', left: 0, bottom: 0, width: 2, height: 2, opacity: 0.01, pointerEvents: 'none', border: 0 }}
    />
  );
}

// Le bouton ne bouge jamais : il est le point d'ancrage (position fixed),
// et le panneau déroulant grandit vers le haut à partir de lui.
export default function MusicWidget({ trackId, onChangeTrack, editable = true, requestOnly = false, pending = false, volume, muted, onVolume, onMute }) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const audioRef = useRef(null);
  const track = MUSIC_TRACKS.find((t) => t.id === trackId) || MUSIC_TRACKS[0];
  const effectiveVolume = muted ? 0 : volume;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = effectiveVolume;
    a.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }, [track.src, effectiveVolume]);

  const unblock = () => {
    audioRef.current?.play().then(() => setBlocked(false)).catch(() => {});
  };

  const playing = !!(track.src || track.youtubeId);

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 150 }}>
      {open && (
        <div className="panel" style={{ position: 'absolute', bottom: 'calc(100% + 10px)', right: 0, width: 250, padding: 14 }}>
          <div className="label" style={{ marginBottom: 10 }}>Ambiance sonore</div>
          {editable || requestOnly ? (
            <select className="field" style={{ width: '100%' }} value={track.id} onChange={(e) => onChangeTrack(e.target.value)}>
              {MUSIC_TRACKS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>{track.name}</p>
          )}
          {requestOnly && (
            <p className="hint-text" style={{ marginTop: 8 }}>
              {pending ? 'Demande envoyée à l’hôte…' : 'Ton choix sera proposé à l’hôte.'}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button className="btn btn-icon btn-icon-sm" onClick={() => onMute(!muted)} title={muted ? 'Remettre le son' : 'Couper le son (pour moi)'}>
              {muted ? <VolumeOffIcon size={15} /> : <VolumeIcon size={15} />}
            </button>
            <input
              type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
              onChange={(e) => { onVolume(Number(e.target.value)); if (muted) onMute(false); }}
              style={{ flex: 1 }}
              aria-label="Volume de la musique"
            />
          </div>
          <p className="hint-text" style={{ marginTop: 8 }}>Le volume ne change que pour toi.</p>
        </div>
      )}

      {track.src && <audio ref={audioRef} key={track.src} src={track.src} loop autoPlay preload="auto" />}
      {track.youtubeId && <YouTubePlayer videoId={track.youtubeId} volume={effectiveVolume} />}

      {blocked && track.src && (
        <button className="btn btn-secondary btn-sm" onClick={unblock} style={{ position: 'absolute', right: 52, bottom: 6, whiteSpace: 'nowrap' }}>
          <PlayIcon size={13} /> Activer le son
        </button>
      )}

      <button
        className="btn btn-icon"
        onClick={() => setOpen((o) => !o)}
        title="Musique d'ambiance"
        style={{ color: playing && !muted ? 'var(--accent)' : 'var(--text-secondary)' }}
      >
        <MusicIcon size={18} />
      </button>
    </div>
  );
}
