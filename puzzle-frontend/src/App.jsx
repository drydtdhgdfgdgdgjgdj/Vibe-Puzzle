import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import PuzzleBoard from './PuzzleBoard';
import BackgroundLayer from './components/BackgroundLayer';
import MusicWidget from './components/MusicWidget';
import MyRooms from './components/MyRooms';
import RequestToasts from './components/RequestToasts';
import {
  PRESET_IMAGES, BACKGROUNDS, CURSOR_COLORS, DISCORD_INVITE_URL, MIN_PIECES, MAX_PIECES, ANIMATED_PREVIEWS, findBackground,
} from './config';
import { getClientId, getStoredProfile, saveStoredProfile, getPrefs, savePrefs } from './identity';
import { socket, apiPost } from './net';
import { safeAreaFor } from './engine/PuzzleEngine';
import { resolveQuality } from './engine/atlas';
import { describeSettingsText } from './settingsLabels';
import { CloseIcon, UploadIcon } from './icons';

const LOBBY_QUICK_COLORS = CURSOR_COLORS.slice(0, 4);
const CLIENT_ID = getClientId();
const STORED_PROFILE = getStoredProfile();

// Taille du "monde" adaptée au nombre de pièces (indépendante de la
// résolution de la photo : la netteté vient de la cuisson des pièces).
function idealGameplaySize(pieces) {
  return Math.min(2400, Math.max(800, Math.round(800 * Math.sqrt(pieces / 30))));
}

function computeGrid(target, ratio) {
  const cols = Math.max(2, Math.round(Math.sqrt(target * ratio)));
  const rows = Math.max(2, Math.round(target / cols));
  return { cols, rows };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible (format non pris en charge ? Essaie en JPG ou PNG)."));
    img.src = src;
  });
}

function toDataUrl(img, maxSide, quality) {
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * s));
  c.height = Math.max(1, Math.round(img.height * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

let toastSeq = 0;

export default function App() {
  const [profile, setProfile] = useState({
    pseudo: STORED_PROFILE.pseudo,
    color: STORED_PROFILE.color || CURSOR_COLORS[0],
    cursorShape: STORED_PROFILE.cursorShape || 'dot',
    cursorImage: STORED_PROFILE.cursorImage || null,
  });
  const [prefs, setPrefs] = useState(getPrefs);

  const [view, setView] = useState('lobby'); // lobby | waiting | denied | replaced | in-room
  const [room, setRoom] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomSettings, setRoomSettings] = useState(null);
  const [players, setPlayers] = useState([]);
  const [members, setMembers] = useState({});
  const [myMemberId, setMyMemberId] = useState(null);
  const [myRole, setMyRole] = useState('guest');
  const [connected, setConnected] = useState(socket.connected);
  const [waitingHostOnline, setWaitingHostOnline] = useState(true);
  const [deniedReason, setDeniedReason] = useState('refused');

  const [joinRequests, setJoinRequests] = useState([]);
  const [settingsRequests, setSettingsRequests] = useState([]);
  const [hintRequests, setHintRequests] = useState([]);
  const [pendingKeys, setPendingKeys] = useState(() => new Map());
  const [toasts, setToasts] = useState([]);

  const [myRooms, setMyRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState('');

  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [selectedImageSrc, setSelectedImageSrc] = useState(PRESET_IMAGES[0].url);
  const [imageRatio, setImageRatio] = useState(1.5);
  const [targetPieces, setTargetPieces] = useState(48);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [lobbyBackgroundId, setLobbyBackgroundId] = useState(BACKGROUNDS[0].id);
  const [lobbyMusicId, setLobbyMusicId] = useState('none');
  const [uploadError, setUploadError] = useState('');
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fileInputRef = useRef(null);
  const carouselRef = useRef(null);
  const [carouselCentered, setCarouselCentered] = useState(true);

  // Valeurs lues par les écouteurs socket (montés une seule fois).
  const viewRef = useRef(view);
  const roomIdRef = useRef(roomId);
  const myMemberIdRef = useRef(myMemberId);
  const profileRef = useRef(profile);
  const membersRef = useRef(members);
  const joiningRef = useRef(null);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { myMemberIdRef.current = myMemberId; }, [myMemberId]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const isCustomImage = selectedImageSrc.startsWith('data:image');
  const isStaff = myRole === 'host' || myRole === 'cohost';

  // ---------- Notifications éphémères ----------
  const pushToast = useCallback(({ text, kind = null, duration = 4200 }) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);
  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  // ---------- Mes parties ----------
  const refreshMyRooms = useCallback(async () => {
    setRoomsLoading(true);
    setRoomsError('');
    try {
      const data = await apiPost('/api/my-rooms', { clientId: CLIENT_ID });
      setMyRooms(data.rooms || []);
    } catch {
      setRoomsError('Impossible de joindre le serveur : vérifie qu’il est bien lancé (node server.js).');
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== 'lobby') return undefined;
    const first = setTimeout(refreshMyRooms, 0);
    const id = setInterval(refreshMyRooms, 30000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [view, refreshMyRooms]);

  // ---------- Ratio de l'image choisie (aperçu de la grille) ----------
  useEffect(() => {
    let cancelled = false;
    loadImage(selectedImageSrc).then((img) => { if (!cancelled) setImageRatio(img.width / img.height); }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedImageSrc]);

  useLayoutEffect(() => {
    const el = carouselRef.current;
    if (!el) return undefined;
    const measure = () => setCarouselCentered(el.scrollWidth <= el.clientWidth + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [view]);

  const resetRoomState = useCallback(() => {
    setRoom(null);
    setRoomId('');
    setRoomName('');
    setRoomSettings(null);
    setPlayers([]);
    setMembers({});
    setMyMemberId(null);
    setMyRole('guest');
    setJoinRequests([]);
    setSettingsRequests([]);
    setHintRequests([]);
    setPendingKeys(new Map());
  }, []);

  const leaveToLobby = useCallback((message) => {
    resetRoomState();
    setView('lobby');
    setIsLoading(false);
    if (message) pushToast({ text: message, duration: 6000 });
  }, [resetRoomState, pushToast]);

  // ---------- Temps réel : écoute globale, montée une seule fois ----------
  useEffect(() => {
    const joinPayload = (rid, extra = {}) => {
      const p = profileRef.current;
      return { roomId: rid, clientId: CLIENT_ID, pseudo: p.pseudo.trim(), color: p.color, cursorShape: p.cursorShape, cursorImage: p.cursorImage, ...extra };
    };

    const onConnect = () => {
      setConnected(true);
      const rid = roomIdRef.current;
      if (!rid) return;
      // Après une coupure : on reprend la partie, ou on renouvelle la demande
      // d'accès (l'ancienne a disparu avec la connexion).
      if (viewRef.current === 'in-room') socket.emit('join_room', joinPayload(rid, { resume: true }));
      else if (viewRef.current === 'waiting') socket.emit('join_room', joinPayload(rid));
    };
    const onDisconnect = () => setConnected(false);

    const applyRoomPayload = (data) => {
      setRoomName(data.name);
      setRoomSettings(data.settings);
      setPlayers(data.players || []);
      setMembers(data.members || {});
      setMyMemberId(data.myMemberId);
      setMyRole(data.myRole || 'guest');
      if (data.myPseudo && data.myPseudo !== profileRef.current.pseudo) {
        setProfile((prev) => ({ ...prev, pseudo: data.myPseudo }));
        saveStoredProfile({ pseudo: data.myPseudo });
      }
    };

    const onLoadPuzzle = (data) => {
      joiningRef.current = null;
      setRoom(data);
      setRoomId(data.roomId);
      roomIdRef.current = data.roomId;
      applyRoomPayload(data);
      setJoinRequests([]);
      setSettingsRequests([]);
      setHintRequests([]);
      setPendingKeys(new Map());
      setView('in-room');
      setJoinError('');
      setIsLoading(false);
    };
    const onResync = (data) => {
      if (data.roomId !== roomIdRef.current) return;
      applyRoomPayload(data);
    };
    const onRoomNotFound = () => {
      if (viewRef.current === 'in-room') { leaveToLobby("Cette partie n'existe plus."); return; }
      setJoinError("Cette partie n'existe pas, ou plus.");
      setRoomId('');
      roomIdRef.current = '';
      setView('lobby');
      setIsLoading(false);
    };
    const onJoinPending = ({ hostOnline }) => { setWaitingHostOnline(hostOnline !== false); setView('waiting'); setIsLoading(false); };
    const onJoinDenied = ({ reason } = {}) => { setDeniedReason(reason || 'refused'); setView('denied'); setIsLoading(false); };
    const onJoinError = ({ reason }) => {
      setJoinError(reason === 'pseudo_taken' ? 'Ce pseudo est déjà utilisé dans cette partie — choisis-en un autre.' : 'Impossible de rejoindre cette partie.');
      setRoomId('');
      roomIdRef.current = '';
      setView('lobby');
      setIsLoading(false);
    };
    const onJoinRequest = (req) => setJoinRequests((prev) => [...prev.filter((r) => r.requestId !== req.requestId), req]);
    const onJoinRequestClosed = ({ requestId }) => setJoinRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    const onSettingsChanged = (settings) => setRoomSettings(settings);
    const onPlayers = (list) => setPlayers(list);
    const onMembers = (m) => {
      setMembers(m);
      const mine = m[myMemberIdRef.current];
      if (mine) setMyRole(mine.role);
    };
    const onKicked = ({ banned, by }) => {
      leaveToLobby(banned ? `${by || "L'hôte"} t'a exclu de la partie et ne souhaite pas que tu reviennes.` : `${by || "L'hôte"} t'a retiré de la partie.`);
    };
    const onReplaced = () => { setView('replaced'); };
    const onRoomDeleted = () => {
      if (viewRef.current === 'in-room' || viewRef.current === 'waiting') leaveToLobby("L'hôte a supprimé cette partie.");
    };
    const onSettingsIncoming = (req) => setSettingsRequests((prev) => [...prev.filter((r) => r.requestId !== req.requestId), req]);
    const onSettingsClosed = ({ requestId }) => setSettingsRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    const onSettingsResult = ({ requestId, status, partial, by }) => {
      const keys = Object.keys(partial || {});
      setPendingKeys((prev) => {
        const next = new Map(prev);
        for (const k of keys) {
          if (status === 'pending') next.set(k, requestId);
          else if (!requestId || next.get(k) === requestId || status === 'host_offline') next.delete(k);
        }
        return next;
      });
      const what = describeSettingsText(partial);
      if (status === 'accepted') pushToast({ text: `${by || "L'hôte"} a accepté : ${what}`, kind: 'success' });
      else if (status === 'refused') pushToast({ text: `${by || "L'hôte"} a refusé : ${what}` });
      else if (status === 'host_offline') pushToast({ text: "L'hôte n'est pas connecté : impossible de proposer ce changement pour l'instant." });
      else if (status === 'pending') pushToast({ text: `Proposé à l'hôte : ${what}`, duration: 2500 });
    };
    const onSettingsChangedBy = ({ pseudo, partial }) => pushToast({ text: `${pseudo} a changé : ${describeSettingsText(partial)}` });
    const onRenamed = ({ name }) => setRoomName(name);
    const onHintIncoming = (req) => setHintRequests((prev) => [
      ...prev.filter((r) => r.requestId !== req.requestId && r.fromMemberId !== req.fromMemberId),
      req,
    ]);
    const onHintClosed = ({ requestId }) => setHintRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    const onProfileError = () => {
      const mine = membersRef.current[myMemberIdRef.current];
      if (mine) setProfile((prev) => ({ ...prev, pseudo: mine.pseudo }));
      pushToast({ text: 'Ce pseudo est déjà pris dans cette partie.' });
    };

    const handlers = {
      connect: onConnect,
      disconnect: onDisconnect,
      load_puzzle: onLoadPuzzle,
      room_resync: onResync,
      room_not_found: onRoomNotFound,
      join_pending: onJoinPending,
      join_denied: onJoinDenied,
      join_error: onJoinError,
      join_request: onJoinRequest,
      join_request_closed: onJoinRequestClosed,
      room_settings_changed: onSettingsChanged,
      players_update: onPlayers,
      members_update: onMembers,
      kicked: onKicked,
      session_replaced: onReplaced,
      room_deleted: onRoomDeleted,
      settings_request_incoming: onSettingsIncoming,
      settings_request_closed: onSettingsClosed,
      settings_request_result: onSettingsResult,
      settings_changed_by: onSettingsChangedBy,
      room_renamed: onRenamed,
      hint_incoming: onHintIncoming,
      hint_request_closed: onHintClosed,
      profile_error: onProfileError,
    };
    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
    return () => {
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
    };
  }, [leaveToLobby, pushToast]);

  // ---------- Actions du lobby ----------
  const requirePseudo = () => {
    if (!profile.pseudo.trim()) { setFormError('Choisis un pseudo avant de continuer.'); return false; }
    setFormError('');
    return true;
  };

  const joinRoomById = (rid) => {
    if (!requirePseudo() || !rid) return;
    setIsLoading(true);
    setJoinError('');
    joiningRef.current = rid;
    setRoomId(rid);
    roomIdRef.current = rid;
    socket.emit('join_room', {
      roomId: rid, clientId: CLIENT_ID, pseudo: profile.pseudo.trim(), color: profile.color,
      cursorShape: profile.cursorShape, cursorImage: profile.cursorImage,
    });
  };

  const handleImageUpload = (event) => {
    setUploadError('');
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setUploadError("Le fichier n'est pas une image valide."); return; }
    const reader = new FileReader();
    reader.onload = (e) => setSelectedImageSrc(e.target.result);
    reader.readAsDataURL(file);
  };

  const grid = computeGrid(targetPieces, imageRatio);
  const presetName = PRESET_IMAGES.find((p) => p.url === selectedImageSrc)?.name || 'Ma photo';

  const startGame = async () => {
    if (!requirePseudo()) return;
    setIsLoading(true);
    setUploadError('');
    try {
      const img = await loadImage(selectedImageSrc);
      const ratio = img.width / img.height;
      const { cols, rows } = computeGrid(targetPieces, ratio);
      const longSide = idealGameplaySize(cols * rows);
      const imgWidth = ratio >= 1 ? longSide : Math.round(longSide * ratio);
      const imgHeight = ratio >= 1 ? Math.round(longSide / ratio) : longSide;
      const safe = safeAreaFor(window.innerWidth, window.innerHeight);
      const data = await apiPost('/api/rooms', {
        originalImage: isCustomImage ? toDataUrl(img, 4096, 0.92) : selectedImageSrc,
        thumb: toDataUrl(img, 360, 0.8),
        cols, rows, imgWidth, imgHeight,
        name: roomNameInput.trim() || `${presetName} · ${cols * rows} pièces`,
        viewport: { w: safe.w, h: safe.h },
        creatorClientId: CLIENT_ID,
        creatorPseudo: profile.pseudo.trim(),
        creatorColor: profile.color,
        creatorCursorShape: profile.cursorShape,
        creatorCursorImage: profile.cursorImage,
        initialSettings: { background: lobbyBackgroundId, music: lobbyMusicId },
      });
      setRoomNameInput('');
      joinRoomById(data.roomId);
    } catch (err) {
      console.error(err);
      setUploadError(err.message || 'Erreur réseau : vérifie que le serveur tourne.');
      setIsLoading(false);
    }
  };

  const deleteRoom = async (rid) => {
    try {
      await apiPost(`/api/rooms/${rid}/delete`, { clientId: CLIENT_ID });
      pushToast({ text: 'Partie supprimée.' });
    } catch (err) {
      pushToast({ text: err.message });
    }
    refreshMyRooms();
  };

  const forgetRoom = async (rid) => {
    try {
      await apiPost(`/api/rooms/${rid}/forget`, { clientId: CLIENT_ID });
    } catch (err) {
      pushToast({ text: err.message });
    }
    refreshMyRooms();
  };

  // ---------- Actions en partie ----------
  const updatePersonal = (partial) => {
    setProfile((prev) => ({ ...prev, ...partial }));
    saveStoredProfile(partial);
    if (view === 'in-room' && roomId) {
      if (partial.pseudo !== undefined) socket.emit('update_profile', { roomId, pseudo: partial.pseudo });
      if (partial.color !== undefined || partial.cursorShape !== undefined || partial.cursorImage !== undefined) {
        socket.emit('cursor_style_update', {
          roomId,
          color: partial.color ?? profile.color,
          cursorShape: partial.cursorShape ?? profile.cursorShape,
          cursorImage: partial.cursorImage !== undefined ? partial.cursorImage : profile.cursorImage,
        });
      }
    }
  };

  const updatePrefs = useCallback((partial) => setPrefs((prev) => ({ ...prev, ...partial })), []);

  // Hôte / co-hôte : changement direct. Invité : demande envoyée à l'hôte
  // (ou changement direct si l'hôte l'autorise).
  const changeSetting = (partial) => {
    if (!roomId) return;
    if (isStaff) socket.emit('update_room_settings', { roomId, settings: partial });
    else socket.emit('settings_request', { roomId, partial });
  };

  const uploadBackground = async (image) => {
    await apiPost(`/api/rooms/${roomId}/background`, { clientId: CLIENT_ID, image });
  };

  const goHome = () => {
    if (roomId) socket.emit('leave_room', { roomId });
    if (view === 'waiting') socket.emit('cancel_join');
    leaveToLobby();
  };

  const respondJoin = (requestId, accepted) => {
    socket.emit('respond_join', { roomId, requestId, accepted });
    setJoinRequests((prev) => prev.filter((r) => r.requestId !== requestId));
  };
  const respondSettings = (requestId, accepted) => {
    socket.emit('settings_request_respond', { roomId, requestId, accepted });
    setSettingsRequests((prev) => prev.filter((r) => r.requestId !== requestId));
  };
  const respondHint = (requestId, accepted) => {
    socket.emit('hint_respond', { roomId, requestId, accepted });
    setHintRequests((prev) => prev.filter((r) => r.requestId !== requestId));
  };

  const pendingKeySet = useMemo(() => new Set(pendingKeys.keys()), [pendingKeys]);
  const ecoMode = resolveQuality(prefs.quality) === 'eco';
  const currentBackground = view === 'in-room' && roomSettings
    ? findBackground(roomSettings.background, roomSettings.customBackgroundUrl)
    : findBackground(lobbyBackgroundId);

  return (
    <>
      <BackgroundLayer background={currentBackground} paused={ecoMode} />

      {view !== 'in-room' && (
        <MusicWidget
          trackId={lobbyMusicId}
          onChangeTrack={setLobbyMusicId}
          volume={prefs.musicVolume}
          muted={prefs.musicMuted}
          onVolume={(v) => updatePrefs({ musicVolume: v })}
          onMute={(m) => updatePrefs({ musicMuted: m })}
        />
      )}

      <RequestToasts
        joinRequests={view === 'in-room' ? joinRequests : []}
        settingsRequests={view === 'in-room' ? settingsRequests : []}
        hintRequests={view === 'in-room' ? hintRequests : []}
        infos={toasts}
        onJoin={respondJoin}
        onSettings={respondSettings}
        onHint={respondHint}
        onDismissInfo={dismissToast}
      />

      {view === 'in-room' && !connected && (
        <div className="connection-banner"><span className="spinner" style={{ width: 14, height: 14 }} /> Connexion perdue — reconnexion en cours…</div>
      )}

      {view === 'lobby' && (
        <LobbyScreen
          profile={profile} updatePersonal={updatePersonal} formError={formError}
          selectedImageSrc={selectedImageSrc} setSelectedImageSrc={setSelectedImageSrc} isCustomImage={isCustomImage}
          targetPieces={targetPieces} setTargetPieces={setTargetPieces} grid={grid}
          roomNameInput={roomNameInput} setRoomNameInput={setRoomNameInput}
          lobbyBackgroundId={lobbyBackgroundId} setLobbyBackgroundId={setLobbyBackgroundId}
          uploadError={uploadError} isLoading={isLoading}
          fileInputRef={fileInputRef} handleImageUpload={handleImageUpload}
          startGame={startGame}
          roomCodeInput={roomCodeInput} setRoomCodeInput={setRoomCodeInput}
          joinRoom={() => joinRoomById(roomCodeInput.trim().toLowerCase())}
          joinError={joinError}
          carouselRef={carouselRef} carouselCentered={carouselCentered}
          myRooms={myRooms} roomsLoading={roomsLoading} roomsError={roomsError}
          onJoinRoom={joinRoomById} onDeleteRoom={deleteRoom} onForgetRoom={forgetRoom} onRefreshRooms={refreshMyRooms}
        />
      )}

      {view === 'waiting' && (
        <CenteredMessage
          icon={<span className="spinner" style={{ width: 22, height: 22 }} />}
          title="Demande envoyée"
          text={waitingHostOnline ? "En attente que l'hôte de la partie t'accepte…" : "L'hôte n'est pas connecté pour l'instant : ta demande l'attendra jusqu'à son retour."}
          onCancel={goHome}
        />
      )}

      {view === 'denied' && (
        <CenteredMessage
          icon={<CloseIcon size={22} />}
          title={deniedReason === 'banned' ? 'Accès bloqué' : 'Demande refusée'}
          text={deniedReason === 'banned' ? "L'hôte t'a exclu de cette partie." : "L'hôte n'a pas accepté ta demande d'accès à cette partie."}
          onCancel={() => leaveToLobby()}
          cancelLabel="Retour à l'accueil"
        />
      )}

      {view === 'replaced' && (
        <CenteredMessage
          icon={<CloseIcon size={22} />}
          title="Partie ouverte ailleurs"
          text="Tu as ouvert cette partie dans un autre onglet ou une autre fenêtre."
          onCancel={() => leaveToLobby()}
          cancelLabel="Retour à l'accueil"
          action={{ label: 'Reprendre ici', onClick: () => { const rid = roomIdRef.current; resetRoomState(); joinRoomById(rid); } }}
        />
      )}

      {view === 'in-room' && room && (
        <PuzzleBoard
          key={room.roomId}
          socket={socket}
          room={room}
          roomSettings={roomSettings}
          roomName={roomName}
          players={players}
          members={members}
          myMemberId={myMemberId}
          myRole={myRole}
          profile={profile}
          prefs={prefs}
          updatePersonal={updatePersonal}
          updatePrefs={updatePrefs}
          onChangeSetting={changeSetting}
          pendingSettingKeys={pendingKeySet}
          onRename={(name) => socket.emit('rename_room', { roomId, name })}
          onUploadBackground={uploadBackground}
          onKick={(memberId, ban) => socket.emit('kick_member', { roomId, memberId, ban })}
          onUnban={(memberId) => socket.emit('unban_member', { roomId, memberId })}
          onSetRole={(memberId, role) => socket.emit('set_role', { roomId, memberId, role })}
          onHome={goHome}
          connected={connected}
          onToast={pushToast}
        />
      )}
    </>
  );
}

function CenteredMessage({ icon, title, text, onCancel, cancelLabel = 'Annuler', action }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="panel" style={{ padding: '36px 32px', textAlign: 'center', maxWidth: 400 }}>
        <div className="round-icon">{icon}</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem' }}>{title}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 24px' }}>{text}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {action && <button className="btn btn-primary" onClick={action.onClick}>{action.label}</button>}
          <button className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}

function LobbySwatch({ bg, active, onClick }) {
  const style = {
    width: 48, height: 32, borderRadius: 8, cursor: 'pointer',
    border: active ? '2px solid var(--accent)' : '2px solid transparent', outline: '1px solid var(--border)',
  };
  if (bg.type === 'image') { style.backgroundImage = `url(${bg.value})`; style.backgroundSize = 'cover'; }
  else if (bg.type === 'video') style.background = '#1c1f26';
  else if (bg.type === 'animated') style.background = ANIMATED_PREVIEWS[bg.value];
  else if (bg.value.includes('gradient')) style.backgroundImage = bg.value;
  else style.backgroundColor = bg.value;
  return <button type="button" title={bg.name} style={style} onClick={onClick} />;
}

function LobbyScreen({
  profile, updatePersonal, formError,
  selectedImageSrc, setSelectedImageSrc, isCustomImage,
  targetPieces, setTargetPieces, grid,
  roomNameInput, setRoomNameInput,
  lobbyBackgroundId, setLobbyBackgroundId,
  uploadError, isLoading, fileInputRef, handleImageUpload, startGame,
  roomCodeInput, setRoomCodeInput, joinRoom, joinError,
  carouselRef, carouselCentered,
  myRooms, roomsLoading, roomsError, onJoinRoom, onDeleteRoom, onForgetRoom, onRefreshRooms,
}) {
  return (
    <div className="lobby">
      <h1 style={{ fontSize: '2.1rem', margin: '0 0 6px', fontWeight: 800, letterSpacing: '-0.01em' }}>Puzzle</h1>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 28px', fontSize: '0.95rem' }}>Choisis ta partie, invite un ami, assemblez-la ensemble.</p>

      <div className="panel" style={{ width: '100%', maxWidth: 720, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="field" style={{ flex: 1, minWidth: 180 }}
            value={profile.pseudo}
            onChange={(e) => updatePersonal({ pseudo: e.target.value })}
            placeholder="Ton pseudo"
            maxLength={20}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {LOBBY_QUICK_COLORS.map((c) => (
              <button type="button" key={c} aria-label={`Couleur ${c}`} className={`swatch ${profile.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => updatePersonal({ color: c })} />
            ))}
          </div>
        </div>
        {formError && <p className="error-text" style={{ marginBottom: 0 }}>{formError}</p>}
      </div>

      <MyRooms
        rooms={myRooms} loading={roomsLoading} error={roomsError}
        onJoin={onJoinRoom} onDelete={onDeleteRoom} onForget={onForgetRoom} onRefresh={onRefreshRooms}
        disabled={isLoading}
      />

      <div className="lobby-columns">
        <div className="panel" style={{ flex: 2, minWidth: 300, padding: 26 }}>
          <label className="label">Nouvelle partie — choisis une image</label>
          <div
            ref={carouselRef}
            className="scrollbar-thin"
            style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10, marginBottom: 18, justifyContent: carouselCentered ? 'center' : 'flex-start' }}
          >
            {PRESET_IMAGES.map((img) => (
              <img
                key={img.id} src={img.url} alt={img.name}
                onClick={() => setSelectedImageSrc(img.url)}
                className={`preset-thumb ${selectedImageSrc === img.url ? 'active' : ''}`}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>OU TA PROPRE PHOTO</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageUpload} />
            <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>
              <UploadIcon size={16} /> Choisir une image
            </button>
            {isCustomImage && <img src={selectedImageSrc} alt="" style={{ maxHeight: 130, borderRadius: 8, marginTop: 6 }} />}
          </div>

          <label className="label">Nom de la partie (facultatif)</label>
          <input className="field" style={{ width: '100%', marginBottom: 18 }} value={roomNameInput} maxLength={60} onChange={(e) => setRoomNameInput(e.target.value)} placeholder="Ex. : Puzzle du dimanche" />

          <label className="label">Fond de la table</label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
            {BACKGROUNDS.map((bg) => (
              <LobbySwatch key={bg.id} bg={bg} active={lobbyBackgroundId === bg.id} onClick={() => setLobbyBackgroundId(bg.id)} />
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 22 }}>
            <label className="label">
              Nombre de pièces — <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{grid.cols} × {grid.rows} = {grid.cols * grid.rows} pièces</span>
            </label>
            <input
              type="range" min={MIN_PIECES} max={MAX_PIECES} step={targetPieces < 100 ? 4 : 10}
              value={targetPieces}
              onChange={(e) => setTargetPieces(Number(e.target.value))}
              style={{ width: '100%', marginBottom: 22 }}
            />
            {uploadError && <p className="error-text" style={{ marginTop: -10 }}>{uploadError}</p>}
            <button className="btn btn-primary" style={{ width: '100%', padding: '13px' }} onClick={startGame} disabled={isLoading}>
              {isLoading ? <span className="spinner" /> : null}
              {isLoading ? 'Un instant…' : 'Créer la partie'}
            </button>
          </div>
        </div>

        <div className="panel" style={{ flex: 1, minWidth: 260, padding: 24, alignSelf: 'flex-start' }}>
          <label className="label">Rejoindre avec un code</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              className="field" style={{ width: '100%' }}
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') joinRoom(); }}
              placeholder="Code de la partie"
            />
            <button className="btn btn-secondary" onClick={joinRoom} disabled={isLoading}>Rejoindre</button>
          </div>
          {joinError && <p className="error-text">{joinError}</p>}
          <p className="hint-text" style={{ marginTop: 10 }}>La première fois, l'hôte devra valider ton arrivée. Ensuite la partie apparaît dans « Mes parties ».</p>
          {DISCORD_INVITE_URL && (
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ marginTop: 14, width: '100%' }}>
              Rejoindre le vocal
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
