import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PuzzleEngine } from './engine/PuzzleEngine';
import SettingsModal from './components/SettingsModal';
import EndScreen from './components/EndScreen';
import MusicWidget from './components/MusicWidget';
import ModelPreview from './components/ModelPreview';
import { FocusBar, FocusLauncher } from './components/FocusHud';
import {
  HomeIcon, SettingsIcon, HelpIcon, TargetIcon, UsersIcon, CrownIcon, ClockIcon, CloseIcon, CheckIcon,
  FocusIcon, ImageIcon, EdgesIcon, BroomIcon, KeyboardIcon, CopyIcon, UserMinusIcon, TrophyIcon, EyeIcon, BugIcon,
} from './icons';

function formatElapsed(totalMs) {
  const s = Math.max(0, Math.floor((totalMs || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}` : `${m}:${r.toString().padStart(2, '0')}`;
}

function formatClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const SHORTCUTS = [
  ['R', 'Recentrer la vue'],
  ['H', "Demander de l'aide / annuler"],
  ['F', 'Lancer un focus'],
  ['Espace (maintenu)', "Coup d'œil sur la grande room pendant un focus"],
  ['M', 'Afficher / masquer le modèle'],
  ['B', 'Demander des pièces de bord'],
  ['Alt + clic', 'Ping visible par tout le monde'],
  ['Échap', 'Annuler / fermer'],
  ['?', 'Cette aide'],
];

function KickDialog({ target, onConfirm, onCancel }) {
  const [ban, setBan] = useState(false);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-card" style={{ maxWidth: 380 }}>
        <div className="modal-body">
          <h2 className="modal-title" style={{ marginBottom: 12 }}>Exclure {target.pseudo} ?</h2>
          <p className="hint-text" style={{ marginBottom: 12 }}>Ses pièces déjà placées lui restent créditées.</p>
          <label className="check-row"><input type="checkbox" checked={ban} onChange={(e) => setBan(e.target.checked)} /> L'empêcher de revenir (bannir)</label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
          <button className="btn btn-danger" onClick={() => onConfirm(ban)}><UserMinusIcon size={15} /> Exclure</button>
        </div>
      </div>
    </div>
  );
}

export default function PuzzleBoard({
  socket, room, roomSettings, roomName, players, members, myMemberId, myRole,
  profile, prefs, updatePersonal, updatePrefs,
  onChangeSetting, pendingSettingKeys,
  onRename, onUploadBackground,
  onKick, onUnban, onSetRole,
  onHome, connected, onToast,
}) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const roomRef = useRef(room);
  const prefsRef = useRef(prefs);
  const profileRef = useRef(profile);
  const playersRef = useRef(players);
  const membersRef = useRef(members);
  const onToastRef = useRef(onToast);

  const [loading, setLoading] = useState({ phase: 'image', progress: 0 });
  const [loadError, setLoadError] = useState('');
  const [counts, setCounts] = useState({});
  const [hint, setHint] = useState({ status: 'idle', level: 0 });
  const [hintAvail, setHintAvail] = useState({ available: true, reason: null });
  const [edges, setEdges] = useState({ status: 'idle', count: 0 });
  const [musicOpen, setMusicOpen] = useState(false);
  const [focus, setFocus] = useState({ active: false });
  const [focusMenu, setFocusMenu] = useState(false);
  const [completed, setCompleted] = useState(room.endTime ? { elapsedMs: room.elapsedMs } : null);
  const [endOpen, setEndOpen] = useState(!!room.endTime);
  const [busy, setBusy] = useState(false);
  const [followId, setFollowId] = useState(null);
  const [settingsTab, setSettingsTab] = useState(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState(null);
  const [lastPlaced, setLastPlaced] = useState(null);
  const [copied, setCopied] = useState(false);
  const [elapsedBase, setElapsedBase] = useState(() => ({ ms: room.elapsedMs || 0, at: Date.now() }));
  const [now, setNow] = useState(() => Date.now());
  const [stats, setStats] = useState(null);
  const debug = useMemo(() => new URLSearchParams(window.location.search).has('debug'), []);

  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { onToastRef.current = onToast; }, [onToast]);

  // ---------- Moteur : créé une seule fois par partie ----------
  const roomId = room.roomId;
  useEffect(() => {
    let placedTimer = null;
    const engine = new PuzzleEngine({
      container: containerRef.current,
      socket,
      room: roomRef.current,
      prefs: prefsRef.current,
      profile: profileRef.current,
      players: playersRef.current,
      members: membersRef.current,
      callbacks: {
        onLoading: setLoading,
        onReady: () => setLoading(null),
        onError: (err) => setLoadError(err?.message || 'Erreur inconnue'),
        onCountsChange: setCounts,
        onHintState: setHint,
        onHintAvailability: setHintAvail,
        onEdgesState: setEdges,
        onFocusState: setFocus,
        onBusy: setBusy,
        onFollowChange: setFollowId,
        onToast: (t) => onToastRef.current?.(t),
        onCompleted: (data) => { setCompleted({ elapsedMs: data.elapsedMs }); setEndOpen(true); },
        onRemotePlacement: ({ memberId }) => {
          const name = membersRef.current?.[memberId]?.pseudo;
          if (!name) return;
          setLastPlaced(name);
          clearTimeout(placedTimer);
          placedTimer = setTimeout(() => setLastPlaced(null), 1800);
        },
      },
    });
    engineRef.current = engine;
    engine.init();
    const onResync = (payload) => setElapsedBase({ ms: payload.elapsedMs || 0, at: Date.now() });
    socket.on('room_resync', onResync);
    return () => {
      clearTimeout(placedTimer);
      socket.off('room_resync', onResync);
      engine.destroy();
      engineRef.current = null;
    };
  }, [socket, roomId]);

  useEffect(() => { engineRef.current?.setSettings(roomSettings); }, [roomSettings]);
  useEffect(() => { engineRef.current?.setPlayers(players); }, [players]);
  useEffect(() => { engineRef.current?.setMembers(members); }, [members]);
  useEffect(() => { engineRef.current?.setProfile(profile); }, [profile]);
  useEffect(() => { engineRef.current?.setPrefs(prefs); }, [prefs]);
  useEffect(() => { engineRef.current?.freezeInput(!connected); }, [connected]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!debug) return undefined;
    const id = setInterval(() => setStats(engineRef.current?.getStats() || null), 500);
    return () => clearInterval(id);
  }, [debug]);

  // ---------- Actions ----------
  const engine = () => engineRef.current;
  const toggleHint = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (hint.status === 'idle') e.startHintPicking();
    else e.cancelHint();
  }, [hint.status]);

  // Pièces de bord : demandées à l'autre joueur (3 au plus), ou masquées.
  const toggleEdges = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (edges.status === 'idle') e.requestEdges();
    else e.cancelEdges();
  }, [edges.status]);

  const startFocus = (size) => {
    setFocusMenu(false);
    engine()?.startFocus(size);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* presse-papier refusé */ }
  };

  const modalOpen = settingsTab !== null || shortcutsOpen || kickTarget !== null || (completed && endOpen);

  // ---------- Raccourcis clavier ----------
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const e2 = engineRef.current;
      if (!e2 || loading) return;
      if (e.key === ' ' && focus.active) { e.preventDefault(); e2.setFocusPeek(true); return; }
      if (e.repeat || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (focusMenu) setFocusMenu(false);
        else if (hint.status === 'picking' || hint.status === 'pending') e2.cancelHint();
        else if (edges.status !== 'idle') e2.cancelEdges();
        return;
      }
      if (modalOpen) return;
      switch (e.key.toLowerCase()) {
        case 'r': e2.fitView(); break;
        case 'h': toggleHint(); break;
        case 'f': if (!focus.active) setFocusMenu((v) => !v); break;
        case 'm': updatePrefs({ showModel: !prefs.showModel }); break;
        case 'b': toggleEdges(); break;
        case '?': setShortcutsOpen((v) => !v); break;
        default: break;
      }
    };
    const onKeyUp = (e) => {
      if (e.key === ' ') engineRef.current?.setFocusPeek(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [edges.status, focus.active, focusMenu, hint.status, loading, modalOpen, prefs.showModel, shortcutsOpen, toggleEdges, toggleHint, updatePrefs]);

  const isStaff = myRole === 'host' || myRole === 'cohost';
  const totalPieces = room.cols * room.rows;
  const placedCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const elapsedMs = completed ? completed.elapsedMs : elapsedBase.ms + (now - elapsedBase.at);
  const followName = followId ? players.find((p) => p.socketId === followId)?.pseudo : null;
  const helpDisabled = hint.status === 'idle' && !hintAvail.available;

  return (
    <>
      <div ref={containerRef} className="board-canvas" />

      {loading && !loadError && (
        <div className="loading-overlay">
          <div className="panel" style={{ padding: '26px 30px', width: 320, textAlign: 'center' }}>
            <span className="spinner" style={{ width: 22, height: 22, display: 'inline-block' }} />
            <p style={{ margin: '14px 0 10px', fontWeight: 600 }}>
              {loading.phase === 'image' ? 'Chargement de la photo…' : `Préparation des pièces… ${Math.round(loading.progress * 100)} %`}
            </p>
            <div className="progress"><div style={{ width: `${loading.phase === 'image' ? 4 : Math.round(loading.progress * 100)}%` }} /></div>
          </div>
        </div>
      )}
      {loadError && (
        <div className="loading-overlay">
          <div className="panel" style={{ padding: '26px 30px', width: 360, textAlign: 'center' }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Impossible de charger la partie</p>
            <p className="hint-text" style={{ marginBottom: 16 }}>{loadError}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => window.location.reload()}>Réessayer</button>
              <button className="btn btn-primary" onClick={onHome}><HomeIcon size={15} /> Accueil</button>
            </div>
          </div>
        </div>
      )}

      {/* HUD gauche */}
      <div className="hud-chip" style={{ position: 'fixed', top: 18, left: 18, zIndex: 50, maxWidth: 'calc(50vw - 40px)' }}>
        <div className="hud-title" title={roomName}>{roomName}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>Code <b style={{ color: 'var(--accent)', userSelect: 'all' }}>{roomId}</b></span>
          <button className="btn btn-ghost btn-xs" onClick={copyCode} title="Copier le code">{copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}</button>
          <span>· {placedCount}/{totalPieces} pièces</span>
        </div>
        <div style={{ display: 'flex', gap: 14, color: 'var(--text-secondary)', marginTop: 2 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} title="Temps de jeu (seulement quand quelqu'un est connecté)">
            <ClockIcon size={13} /> {formatElapsed(elapsedMs)}
          </span>
          <span>{formatClock(now)}</span>
        </div>
      </div>

      {/* HUD joueurs */}
      <div className="hud-chip players-chip">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 8 }}>
          <UsersIcon size={14} /> Joueurs
        </div>
        {players.map((p) => {
          const isMe = p.socketId === socket.id;
          const canKick = isStaff && !isMe && p.role !== 'host' && !(myRole === 'cohost' && p.role === 'cohost');
          return (
            <div
              key={p.socketId}
              className={`player-row ${isMe ? '' : 'clickable'} ${followId === p.socketId ? 'following' : ''}`}
              onClick={() => !isMe && engine()?.goToPlayer(p.socketId)}
              onDoubleClick={() => !isMe && engine()?.followPlayer(p.socketId)}
              title={isMe ? '' : 'Clic : aller à son curseur · Double-clic : le suivre'}
            >
              <span className="dot" style={{ background: p.color }} />
              <span className="player-name">{p.pseudo}{isMe ? ' (toi)' : ''}</span>
              {p.role === 'host' && <span style={{ color: 'var(--warning)', display: 'inline-flex' }} title="Hôte"><CrownIcon size={12} /></span>}
              {p.role === 'cohost' && <span className="badge badge-tiny">co</span>}
              {p.inFocus && <span title="En focus" style={{ display: 'inline-flex', color: 'var(--accent)' }}><FocusIcon size={12} /></span>}
              <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>{counts[p.memberId] || 0}</span>
              {canKick && (
                <button className="kick-btn" title={`Exclure ${p.pseudo}`} onClick={(e) => { e.stopPropagation(); setKickTarget(p); }}>
                  <UserMinusIcon size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <FocusBar state={focus} onPeek={(v) => engine()?.setFocusPeek(v)} onQuit={() => engine()?.quitFocus()} />

      {followName && (
        <div className="hud-chip follow-chip">
          <EyeIcon size={14} /> Tu suis {followName}
          <button className="btn btn-ghost btn-xs" onClick={() => engine()?.stopFollow()}>Arrêter</button>
        </div>
      )}

      {busy && <div className="hud-chip busy-chip"><span className="spinner" style={{ width: 12, height: 12 }} /> Mise à jour des pièces…</div>}

      {/* Barre d'actions */}
      <div className="action-bar">
        {hint.status === 'idle' && (
          <button className="btn btn-secondary" disabled={helpDisabled} title={helpDisabled ? hintAvail.reason : "Demander de l'aide (H)"} onClick={toggleHint}>
            <HelpIcon size={16} /> Demander de l'aide
          </button>
        )}
        {hint.status === 'picking' && <div className="hud-chip">Choisis la case de la pièce qui te manque…</div>}
        {hint.status === 'pending' && <div className="hud-chip" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="spinner" /> En attente de ton coéquipier…</div>}
        {hint.status === 'granted' && hint.level < 3 && (
          <button className="btn btn-secondary" onClick={() => engine()?.requestMoreHint()}><HelpIcon size={16} /> Indice supplémentaire</button>
        )}
        {hint.status !== 'idle' && (
          <button className="btn btn-ghost btn-sm" onClick={() => engine()?.cancelHint()}><CloseIcon size={13} /> {hint.status === 'granted' ? 'Masquer' : 'Annuler'}</button>
        )}

        {!focus.active && (
          <div style={{ position: 'relative' }}>
            <button className="btn btn-secondary" onClick={() => setFocusMenu((v) => !v)} disabled={!!completed} title="Focus sur une zone (F)">
              <FocusIcon size={16} /> Focus
            </button>
            <FocusLauncher open={focusMenu} onClose={() => setFocusMenu(false)} onStart={startFocus} starting={focus.starting} totalPieces={totalPieces} />
          </div>
        )}

        <div className="toolbar">
          <button className="btn btn-icon btn-icon-sm" onClick={() => engine()?.fitView()} title="Recentrer (R)"><TargetIcon size={16} /></button>
          <button className={`btn btn-icon btn-icon-sm ${prefs.showModel ? 'pressed' : ''}`} onClick={() => updatePrefs({ showModel: !prefs.showModel })} title="Image modèle (M)"><ImageIcon size={16} /></button>
          <button className={`btn btn-icon btn-icon-sm ${prefs.edgesOnly ? 'pressed' : ''}`} onClick={() => updatePrefs({ edgesOnly: !prefs.edgesOnly })} title="Bords uniquement (B)"><EdgesIcon size={16} /></button>
          {!focus.active && (
            <button className="btn btn-icon btn-icon-sm" onClick={() => engine()?.tidyTable()} title="Ranger la table : redisperse les pièces seules"><BroomIcon size={16} /></button>
          )}
          <button className="btn btn-icon btn-icon-sm" onClick={() => setShortcutsOpen(true)} title="Raccourcis (?)"><KeyboardIcon size={16} /></button>
          {completed && !endOpen && (
            <button className="btn btn-icon btn-icon-sm" onClick={() => setEndOpen(true)} title="Résultats"><TrophyIcon size={16} /></button>
          )}
        </div>
      </div>

      {/* Actions bas-droite */}
      <MusicWidget
        trackId={roomSettings?.music || 'none'}
        onChangeTrack={(id) => onChangeSetting({ music: id })}
        editable={isStaff || !!roomSettings?.guestsCanEdit}
        requestOnly={!isStaff && !roomSettings?.guestsCanEdit}
        pending={pendingSettingKeys.has('music')}
        volume={prefs.musicVolume}
        muted={prefs.musicMuted}
        onVolume={(v) => updatePrefs({ musicVolume: v })}
        onMute={(m) => updatePrefs({ musicMuted: m })}
      />
      <button className="btn btn-icon" style={{ position: 'fixed', bottom: 78, right: 20, zIndex: 150 }} onClick={() => setSettingsTab('perso')} title="Réglages">
        <SettingsIcon size={18} />
      </button>
      <button className="btn btn-icon" style={{ position: 'fixed', bottom: 136, right: 20, zIndex: 150 }} onClick={onHome} title="Retour à l'accueil">
        <HomeIcon size={18} />
      </button>

      {lastPlaced && (
        <div className="toast toast-success placed-toast">
          <CheckIcon size={15} /> {lastPlaced} a placé une pièce
        </div>
      )}

      {prefs.showModel && (
        <ModelPreview
          src={room.originalImageUrl || room.imageUrl}
          size={prefs.modelSize}
          onSize={(s) => updatePrefs({ modelSize: s })}
          onClose={() => updatePrefs({ showModel: false })}
        />
      )}

      {debug && stats && (
        <div className="hud-chip debug-chip">
          <BugIcon size={13} /> {stats.rendersPerSecond} rendus/s · {stats.pieces} pièces · atlas {stats.pages}×{stats.pageSize}px · k={stats.k} · cuisson {stats.bakeMs} ms · {stats.quality} · résolution {stats.resolution}
        </div>
      )}

      {settingsTab && (
        <SettingsModal
          initialTab={settingsTab}
          isStaff={isStaff}
          isHost={myRole === 'host'}
          myMemberId={myMemberId}
          settings={roomSettings || {}}
          onChangeSetting={onChangeSetting}
          pendingKeys={pendingSettingKeys}
          roomName={roomName}
          onRename={onRename}
          onUploadBackground={onUploadBackground}
          personal={profile}
          onUpdatePersonal={updatePersonal}
          prefs={prefs}
          onUpdatePrefs={updatePrefs}
          members={members}
          players={players}
          onKick={onKick}
          onUnban={onUnban}
          onSetRole={onSetRole}
          onClose={() => setSettingsTab(null)}
        />
      )}

      {shortcutsOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShortcutsOpen(false); }}>
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title">Raccourcis</h2>
              <button className="btn btn-icon btn-icon-sm" onClick={() => setShortcutsOpen(false)} aria-label="Fermer"><CloseIcon size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="shortcut-list">
                {SHORTCUTS.map(([key, label]) => (
                  <div key={key} className="shortcut-row"><kbd>{key}</kbd><span>{label}</span></div>
                ))}
              </div>
              <p className="hint-text" style={{ marginTop: 14 }}>Clic sur un joueur : aller voir son curseur. Double-clic : le suivre.</p>
            </div>
          </div>
        </div>
      )}

      {kickTarget && (
        <KickDialog
          target={kickTarget}
          onCancel={() => setKickTarget(null)}
          onConfirm={(ban) => { onKick(kickTarget.memberId, ban); setKickTarget(null); }}
        />
      )}

      {completed && endOpen && (
        <EndScreen
          room={room}
          counts={counts}
          members={members}
          elapsedMs={completed.elapsedMs}
          onHome={onHome}
          onClose={() => setEndOpen(false)}
        />
      )}
    </>
  );
}
