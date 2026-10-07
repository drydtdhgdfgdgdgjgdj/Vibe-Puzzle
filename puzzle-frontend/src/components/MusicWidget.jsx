import { useEffect, useRef, useState } from 'react';
import {
  MusicIcon, VolumeIcon, VolumeOffIcon, PlayIcon, CloseIcon, StopIcon, RefreshIcon,
  CoffeeIcon, WavesIcon, PianoIcon, GlobeIcon, LinkIcon, FileAudioIcon,
} from '../icons';
import { MUSIC_GROUPS, MUSIC_TRACKS } from '../config';
import { MAX_MUSIC_FILE_BYTES, fetchNowPlaying, fetchYouTubeTitle, parseMusicLink, resolveTrack } from '../music';
import { useMusicPlayer } from '../musicPlayer';

const GROUP_OF = Object.fromEntries(MUSIC_GROUPS.map((g) => [g.id, g]));

// Icône d'une piste : celle de sa rubrique, ou de sa sorte pour une musique perso.
function TrackIcon({ track, size }) {
  if (track?.custom) {
    if (track.kind === 'youtube') return <PlayIcon size={size} />;
    return track.genre === 'Fichier audio' ? <FileAudioIcon size={size} /> : <LinkIcon size={size} />;
  }
  switch (GROUP_OF[track?.group]?.icon) {
    case 'coffee': return <CoffeeIcon size={size} />;
    case 'waves': return <WavesIcon size={size} />;
    case 'piano': return <PianoIcon size={size} />;
    case 'globe': return <GlobeIcon size={size} />;
    default: return <MusicIcon size={size} />;
  }
}

// Petites barres d'égaliseur animées : "ça joue".
export function EqBars({ className = '' }) {
  return <span className={`eq ${className}`} aria-hidden="true"><i /><i /><i /><i /></span>;
}

function Cover({ track, size, playing, image }) {
  const [c1, c2] = track?.cover || ['#3a3f4b', '#22252c'];
  // Pochette introuvable (ça arrive chez Radio France) : on garde l'icône.
  const [failedImage, setFailedImage] = useState(null);
  return (
    <span className="music-cover" style={{ width: size, height: size, background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
      {image && image !== failedImage
        ? <img src={image} alt="" onError={() => setFailedImage(image)} />
        : <TrackIcon track={track} size={Math.round(size * 0.46)} />}
      {playing && <span className="music-cover-eq"><EqBars /></span>}
    </span>
  );
}

// Titre en cours d'une radio, relu toutes les 20 s tant que le panneau est ouvert.
function useNowPlaying(np, enabled) {
  const [info, setInfo] = useState(null);
  const key = np ? JSON.stringify(np) : '';
  useEffect(() => {
    setInfo(null);
    if (!np || !enabled) return undefined;
    let ctrl = null;
    const load = async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const next = await fetchNowPlaying(np, ctrl.signal);
        if (!ctrl.signal.aborted) setInfo(next);
      } catch { /* titre indisponible : on affiche le genre */ }
    };
    load();
    const id = setInterval(load, 20000);
    return () => { clearInterval(id); ctrl?.abort(); };
    // `np` est décrit entièrement par `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return info;
}

const STATUS_LABEL = {
  loading: 'Connexion…',
  paused: 'Son coupé pour toi',
  blocked: 'En attente d’un clic',
  error: 'Lecture impossible',
};

// "Autre" : un fichier audio à soi ou un lien (YouTube, radio, fichier en ligne).
function OtherSource({ onPick, onUpload }) {
  const [mode, setMode] = useState(null); // null | 'file' | 'link'
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const pickFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_MUSIC_FILE_BYTES) { setError('Fichier trop lourd (20 Mo maximum).'); return; }
    setBusy(true);
    setError('');
    try {
      onPick(await onUpload(file));
      setMode(null);
    } catch (err) {
      setError(err.message || 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  const submitLink = async () => {
    const parsed = parseMusicLink(link);
    if (parsed.error) { setError(parsed.error); return; }
    setError('');
    setBusy(true);
    let music = parsed.music;
    if (music.kind === 'youtube') {
      const title = await fetchYouTubeTitle(music.youtubeId);
      if (title) music = { ...music, name: title };
    }
    setBusy(false);
    onPick(music);
    setLink('');
    setMode(null);
  };

  return (
    <div>
      <div className="music-group-title">Autre</div>
      <div className="music-other-actions">
        <button type="button" className={`music-other-btn ${mode === 'file' ? 'active' : ''}`} disabled={busy}
          onClick={() => { setMode('file'); setError(''); fileRef.current?.click(); }}>
          <FileAudioIcon size={15} /> Mon fichier
        </button>
        <button type="button" className={`music-other-btn ${mode === 'link' ? 'active' : ''}`} disabled={busy}
          onClick={() => { setMode(mode === 'link' ? null : 'link'); setError(''); }}>
          <LinkIcon size={15} /> Un lien
        </button>
      </div>
      <input ref={fileRef} type="file" accept="audio/*,.mp3,.ogg,.m4a,.aac,.wav,.flac,.opus" style={{ display: 'none' }} onChange={pickFile} />
      {mode === 'link' && (
        <div className="music-link-row">
          <input
            className="field" autoFocus value={link} placeholder="Lien YouTube, radio ou .mp3"
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitLink(); }}
            aria-label="Lien de la musique"
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={submitLink} disabled={busy || !link.trim()}>Écouter</button>
        </div>
      )}
      {busy && <p className="hint-text music-note"><span className="spinner" style={{ width: 11, height: 11 }} /> {mode === 'file' ? 'Envoi du fichier…' : 'Vérification du lien…'}</p>}
      {!busy && mode === 'link' && <p className="hint-text music-note">Un lien YouTube, ou le lien direct d’une radio ou d’un fichier audio (il finit souvent par .mp3, /stream ou /live).</p>}
      {!busy && mode === 'file' && !error && <p className="hint-text music-note">MP3, OGG, M4A, WAV ou FLAC, 20 Mo maximum. Joué en boucle.</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// Bouton "note de musique" (bas à droite) et son panneau. Le bouton ne
// bouge jamais ; le panneau grandit vers le haut. `open` / `onOpenChange`
// (facultatifs) : le parent sait si le panneau est ouvert, pour masquer
// les boutons qu'il recouvrirait. `hidden` (mode clair) : bouton et panneau
// masqués, mais le lecteur reste en place et la musique continue.
export default function MusicWidget({
  musicId = 'none', customMusic = null, onSelect, onUpload,
  editable = true, requestOnly = false, pending = false,
  volume, muted, onVolume, onMute,
  open: openProp, onOpenChange, hidden = false,
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v) => { setOpenState(v); onOpenChange?.(v); };
  const rootRef = useRef(null);
  const ytHostRef = useRef(null);

  const track = resolveTrack(musicId, customMusic);
  const player = useMusicPlayer(track, volume, muted, ytHostRef);
  const playing = player.status === 'playing';
  const nowPlaying = useNowPlaying(track?.nowPlaying, open && !!track);
  const canChoose = editable || requestOnly;
  const choose = (partial) => onSelect?.(partial);

  // Un clic ailleurs referme le panneau.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  });

  const kicker = !track ? 'Rien en cours'
    : playing ? (track.live || track.kind === 'youtube' ? 'En direct' : 'En lecture')
      : STATUS_LABEL[player.status] || '';
  const live = playing && !!track && (track.live || track.kind === 'youtube');
  const subtitle = nowPlaying ? `${nowPlaying.title}${nowPlaying.artist ? ` — ${nowPlaying.artist}` : ''}` : track?.genre || 'Choisis une radio ci-dessous';

  return (
    <div ref={rootRef} className="music-widget">
      <div ref={ytHostRef} className="music-yt-host" aria-hidden="true" />

      {open && !hidden && (
        <div className="panel music-panel">
          <div className="music-head">
            <span className="label" style={{ margin: 0 }}>Musique d’ambiance</span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(false)} aria-label="Fermer"><CloseIcon size={12} /></button>
          </div>

          <div className="music-now">
            <Cover track={track} size={54} playing={playing} image={nowPlaying?.cover} />
            <div className="music-now-text">
              <div className={`music-now-kicker ${live ? 'live' : ''}`}>
                {live && <span className="live-dot" />}
                {player.status === 'loading' && track && <span className="spinner" style={{ width: 9, height: 9 }} />}
                {kicker}
              </div>
              <div className="music-now-name" title={track?.name}>{track ? track.name : 'Aucune musique'}</div>
              <div className="music-now-sub" title={subtitle}>{nowPlaying && <MusicIcon size={11} />} {subtitle}</div>
            </div>
            {track && canChoose && (
              <button type="button" className="btn btn-ghost btn-xs" title="Arrêter la musique (pour tout le monde)" aria-label="Arrêter la musique" onClick={() => choose({ music: 'none' })}>
                <StopIcon size={14} />
              </button>
            )}
          </div>

          {track && player.status === 'blocked' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={player.retry}><PlayIcon size={13} /> Lancer la musique</button>
          )}
          {track && player.status === 'error' && (
            <div className="music-alert">
              <span style={{ flex: 1 }}>{player.error}</span>
              <button type="button" className="btn btn-ghost btn-xs" onClick={player.retry}><RefreshIcon size={12} /> Réessayer</button>
            </div>
          )}

          <div className="music-volume">
            <button type="button" className="btn btn-icon btn-icon-sm" onClick={() => onMute(!muted)} title={muted ? 'Remettre le son' : 'Couper le son (pour moi)'}>
              {muted ? <VolumeOffIcon size={15} /> : <VolumeIcon size={15} />}
            </button>
            <input
              type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
              onChange={(e) => { onVolume(Number(e.target.value)); if (muted) onMute(false); }}
              style={{ flex: 1 }}
              aria-label="Volume de la musique"
            />
          </div>

          <div className="music-scroll">
            {MUSIC_GROUPS.map((g) => (
              <div key={g.id}>
                <div className="music-group-title">{g.name}</div>
                <div className="music-grid">
                  {MUSIC_TRACKS.filter((t) => t.group === g.id).map((t) => {
                    const active = musicId === t.id;
                    return (
                      <button
                        type="button" key={t.id} className={`music-tile ${active ? 'active' : ''}`}
                        disabled={!canChoose} onClick={() => !active && choose({ music: t.id })} title={`${t.name} · ${t.genre}`}
                      >
                        <Cover track={t} size={34} playing={active && playing} />
                        <span className="music-tile-text">
                          <span className="music-tile-name">{t.name}</span>
                          <span className="music-tile-genre">{t.genre}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {canChoose && <OtherSource onPick={(m) => choose({ music: 'custom', customMusic: m })} onUpload={onUpload} />}
          </div>

          <p className="hint-text">
            {requestOnly
              ? (pending ? 'Demande envoyée à l’hôte…' : 'Ton choix sera proposé à l’hôte.')
              : 'La musique est la même pour tous ; le volume ne change que pour toi.'}
          </p>
        </div>
      )}

      {!open && track && player.status === 'blocked' && (
        <button type="button" className="btn btn-secondary btn-sm music-unblock" onClick={player.retry}>
          <PlayIcon size={13} /> Activer la musique
        </button>
      )}

      {!hidden && (
        <button
          type="button"
          className={`btn btn-icon music-btn ${playing ? 'is-playing' : ''}`}
          onClick={() => setOpen(!open)}
          aria-label="Musique d'ambiance"
          title={track ? `${track.name}${nowPlaying ? ` · ${nowPlaying.title}` : ''}` : "Musique d'ambiance"}
        >
          {playing ? <EqBars /> : track && muted ? <VolumeOffIcon size={18} /> : <MusicIcon size={18} />}
        </button>
      )}
    </div>
  );
}
