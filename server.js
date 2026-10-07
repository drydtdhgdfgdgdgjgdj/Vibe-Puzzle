// ============================================================
// Serveur du puzzle coop.
//  - API HTTP : création de partie, "Mes parties", suppression,
//    fond perso, et service des images envoyées (/uploads).
//  - Temps réel Socket.IO : pièces (prise / glissé / lâcher), curseurs,
//    réglages et demandes de réglages, aide, focus, exclusion...
// Chaque événement vérifie que l'émetteur est bien membre de la room.
// ============================================================
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const { Server } = require('socket.io');

const C = require('./lib/constants');
const L = require('./lib/layout');
const G = require('./lib/groups');
const F = require('./lib/focus');
const R = require('./lib/rooms');
const S = require('./lib/shapes');
const { createStore } = require('./lib/store');
const { createImageStore } = require('./lib/images');
const { createAudioStore } = require('./lib/audio');
const { migrateDatabase } = require('./lib/migrate');

const PRESET_PATH_RE = /^\/[\w\-./]+\.(jpe?g|png|webp|gif|avif)$/i;
const MUSIC_FILE_RE = /^[a-z0-9]+-music-[0-9a-f]+\.(mp3|ogg|m4a|aac|wav|flac|webm)$/i;
const RATE_WINDOW_MS = 60 * 60 * 1000;

// Garde-fous anti-abus (site public). Les valeurs par défaut sont celles du
// site en ligne ; les tests en passent de plus petites via `limits`.
const DEFAULT_LIMITS = {
  roomsPerHour: 40, // créations de partie, par adresse IP
  backgroundsPerHour: 40, // fonds perso envoyés, par adresse IP
  musicPerHour: 20, // musiques envoyées, par adresse IP
  joinRequestsPerHour: 200, // demandes pour rejoindre une partie, par adresse IP
  pendingRequestsPerRoom: 50, // demandes en attente en même temps dans une partie
  minFreeDiskBytes: 1024 ** 3, // sous 1 Go libre, plus aucun nouveau fichier accepté
  orphanMusicMs: 24 * 60 * 60 * 1000, // musique envoyée mais jamais utilisée : supprimée après 24 h
};

function isLoopback(address) {
  return address === '::1' || /^(::ffff:)?127\./.test(address || '');
}

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

function createPuzzleServer({
  dataDir = process.env.PUZZLE_DATA_DIR || path.join(__dirname, 'data'),
  // L'ancienne base (à la racine) n'est reprise que dans la configuration
  // par défaut : un dossier de données personnalisé ne la touche jamais.
  legacyDbFile = process.env.PUZZLE_DATA_DIR ? null : path.join(__dirname, 'database.json'),
  log = console,
  limits = {},
} = {}) {
  const LIMITS = { ...DEFAULT_LIMITS, ...limits };
  const store = createStore({ dataDir, legacyDbFile, log });
  const images = createImageStore(store.uploadsDir);
  const audio = createAudioStore(store.uploadsDir);
  const db = store.load();
  store.bind(() => db);
  const migration = migrateDatabase(db, { images, log });
  if (Object.keys(migration.broken).length) {
    fs.writeFileSync(path.join(dataDir, `parties-mises-de-cote-${Date.now()}.json`), JSON.stringify(migration.broken));
  }
  if (migration.changed) store.markDirty();
  log.log(`Base chargée : ${Object.keys(db).length} partie(s).`);

  const app = express();
  // En production, le serveur est derrière un proxy (Caddy) sur la même
  // machine : on lui fait confiance pour l'adresse IP réelle des joueurs.
  app.set('trust proxy', 'loopback');
  app.use(cors());
  app.use('/uploads', express.static(store.uploadsDir, { maxAge: '30d', immutable: true, fallthrough: false }));

  // Corps des requêtes : jusqu'à 60 Mo seulement là où l'on envoie des
  // fichiers (image, fond, musique) ; quelques Ko suffisent partout ailleurs.
  const uploadJson = express.json({ limit: '60mb' });
  const smallJson = express.json({ limit: '100kb' });

  // Garde-fou anti-abus (site public) : nombre d'actions par adresse IP et par heure.
  const rateLog = new Map();
  function rateLimited(key, max) {
    const now = Date.now();
    const recent = (rateLog.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
    const limited = recent.length >= max;
    if (!limited) recent.push(now);
    rateLog.set(key, recent);
    return limited;
  }

  // Les adresses qui ne reviennent pas sont oubliées : sinon la table grossit sans fin.
  function pruneRateLog(now = Date.now()) {
    for (const [key, times] of rateLog) {
      const recent = times.filter((t) => now - t < RATE_WINDOW_MS);
      if (recent.length) rateLog.set(key, recent);
      else rateLog.delete(key);
    }
  }
  const pruneTimer = setInterval(pruneRateLog, 10 * 60 * 1000);
  pruneTimer.unref?.();

  // Envois de fichiers : comptés AVANT de lire le corps (jusqu'à 60 Mo), pour
  // qu'une adresse qui abuse soit refusée sans que le serveur lise ses envois.
  function perIpLimit(kind, max, error) {
    return (req, res, next) => (rateLimited(`${kind}:${req.ip}`, max) ? res.status(429).json({ error }) : next());
  }

  // Place libre sur le disque des envois (la base y vit aussi) : sous le
  // seuil, les nouveaux fichiers sont refusés plutôt que de remplir le disque.
  const DISK_FULL_ERROR = 'Le serveur manque de place pour de nouveaux fichiers : réessaie plus tard.';
  function diskAlmostFull() {
    try {
      const s = fs.statfsSync(store.uploadsDir);
      return s.bavail * s.bsize < LIMITS.minFreeDiskBytes;
    } catch {
      return false; // mesure impossible sur ce système : on ne bloque rien
    }
  }

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] }, maxHttpBufferSize: 2e6 });

  // ============================================================
  // État temporaire par room (jamais sauvegardé)
  // ============================================================
  const runtimes = new Map();
  function rt(roomId) {
    let r = runtimes.get(roomId);
    if (!r) {
      r = {
        hints: new Map(), // clientId -> { pieceId, level, status, requestId, pendingLevel, timer, context }
        edgeAsks: new Map(), // clientId -> { requestId, timer, context } (demande de pièces de bord)
        held: new Map(), // pieceId -> socketId
        drags: new Map(), // socketId -> { ids, base: Map(id -> {x, y}) }
        settingsRequests: new Map(), // requestId -> { clientId, memberId, pseudo, partial }
        focusTimers: new Map(), // clientId -> timeout
        activeSince: null,
        lastTidy: 0,
        lastPing: new Map(),
      };
      runtimes.set(roomId, r);
    }
    return r;
  }

  function disposeRuntime(roomId) {
    const r = runtimes.get(roomId);
    if (!r) return;
    for (const h of r.hints.values()) if (h.timer) clearTimeout(h.timer);
    for (const a of r.edgeAsks.values()) clearTimeout(a.timer);
    for (const t of r.focusTimers.values()) clearTimeout(t);
    runtimes.delete(roomId);
  }

  // ============================================================
  // Utilitaires sockets / membres
  // ============================================================
  function socketsInRoom(roomId) {
    const set = io.sockets.adapter.rooms.get(roomId);
    if (!set) return [];
    return [...set].map((id) => io.sockets.sockets.get(id)).filter(Boolean);
  }

  function socketsOfClient(roomId, clientId) {
    return socketsInRoom(roomId).filter((s) => s.data?.clientId === clientId);
  }

  function staffSockets(roomId) {
    const room = db[roomId];
    if (!room) return [];
    return socketsInRoom(roomId).filter((s) => {
      const m = room.members[s.data?.clientId];
      return R.isActiveMember(m) && R.isStaffRole(m.role);
    });
  }

  function onlineClientIds(roomId) {
    return new Set(socketsInRoom(roomId).map((s) => s.data?.clientId));
  }

  // Adresse IP réelle d'un joueur en temps réel. Derrière Caddy (même
  // machine), la connexion vient de 127.0.0.1 et l'adresse du joueur est dans
  // X-Forwarded-For : même règle que `trust proxy` pour l'API HTTP.
  function socketIp(socket) {
    const address = socket.handshake?.address || '';
    const forwarded = socket.handshake?.headers?.['x-forwarded-for'];
    if (isLoopback(address) && typeof forwarded === 'string') {
      const hops = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
      for (let i = hops.length - 1; i >= 0; i--) if (!isLoopback(hops[i])) return hops[i];
    }
    return address || 'inconnue';
  }

  // ---------- Demandes pour rejoindre ----------
  // Un onglet n'attend qu'à une seule porte à la fois : sa demande en
  // attente (s'il en a une) est retirée quand il en fait une autre, entre
  // dans une partie, annule ou se déconnecte.
  function dropPendingRequest(socket) {
    const roomId = socket.data?.pendingRoomId;
    const requestId = socket.data?.pendingRequestId;
    const room = roomId && db[roomId];
    if (room && R.ownValue(room.pendingRequests, requestId)) {
      delete room.pendingRequests[requestId];
      for (const s of staffSockets(roomId)) s.emit('join_request_closed', { requestId });
      store.markDirty();
    }
    if (socket.data) {
      socket.data.pendingRoomId = null;
      socket.data.pendingRequestId = null;
    }
  }

  // Demandes dont l'onglet n'attend plus (parti, ou entré ailleurs) : retirées.
  function purgeStaleRequests(roomId) {
    const room = db[roomId];
    for (const [requestId, req] of Object.entries(room.pendingRequests)) {
      const s = io.sockets.sockets.get(req.socketId);
      if (s && s.data?.pendingRoomId === roomId && s.data.pendingRequestId === requestId) continue;
      delete room.pendingRequests[requestId];
      for (const staff of staffSockets(roomId)) staff.emit('join_request_closed', { requestId });
      store.markDirty();
    }
  }

  function getPlayers(roomId) {
    const room = db[roomId];
    if (!room) return [];
    return socketsInRoom(roomId).map((s) => {
      const m = room.members[s.data.clientId] || {};
      return {
        socketId: s.id,
        memberId: m.memberId || null,
        pseudo: m.pseudo || 'Joueur',
        color: m.color || '#5b8cff',
        cursorShape: m.cursorShape || 'dot',
        cursorImage: m.cursorImage || null,
        role: m.role || 'guest',
        isCreator: m.role === 'host',
        inFocus: !!room.focuses?.[s.data.clientId],
      };
    });
  }

  function emitPlayers(roomId) {
    io.to(roomId).emit('players_update', getPlayers(roomId));
  }

  function emitMembers(roomId) {
    const room = db[roomId];
    if (room) io.to(roomId).emit('members_update', R.publicMembers(room, onlineClientIds(roomId)));
  }

  function heldList(roomId) {
    const out = [];
    for (const [socketId, d] of rt(roomId).drags) {
      out.push({ socketId, memberId: io.sockets.sockets.get(socketId)?.data?.memberId || null, pieceIds: d.ids });
    }
    return out;
  }

  // ---------- Temps de jeu actif (seulement quand quelqu'un est là) ----------
  function elapsedMs(roomId, room) {
    if (room.endTime) return room.finalPlayTimeMs ?? 0;
    const r = rt(roomId);
    return (room.playTimeMs || 0) + (r.activeSince ? Date.now() - r.activeSince : 0);
  }

  function markActive(roomId) {
    const r = rt(roomId);
    if (!r.activeSince) r.activeSince = Date.now();
  }

  function markMaybeInactive(roomId) {
    const room = db[roomId];
    const r = rt(roomId);
    if (!room || !r.activeSince || socketsInRoom(roomId).length > 0) return;
    room.playTimeMs = (room.playTimeMs || 0) + (Date.now() - r.activeSince);
    r.activeSince = null;
    store.markDirty();
  }

  function roomPayload(roomId, clientId) {
    const room = db[roomId];
    return R.publicRoom(room, roomId, clientId, {
      players: getPlayers(roomId),
      onlineClientIds: onlineClientIds(roomId),
      elapsedMs: elapsedMs(roomId, room),
      held: heldList(roomId),
    });
  }

  function checkCompletion(roomId) {
    const room = db[roomId];
    if (!room || room.endTime || !G.isComplete(room)) return;
    room.finalPlayTimeMs = elapsedMs(roomId, room);
    room.endTime = Date.now();
    store.markDirty();
    io.to(roomId).emit('puzzle_completed', { elapsedMs: room.finalPlayTimeMs, endTime: room.endTime });
  }

  // ---------- Verrous de prise ----------
  // Les positions finales accompagnent la libération : si le joueur se
  // déconnecte en plein glissé, les autres reposent le bloc au bon endroit.
  function releaseHolds(roomId, socket) {
    const r = rt(roomId);
    const room = db[roomId];
    const released = [];
    for (const [pid, sid] of r.held) {
      if (sid === socket.id) { r.held.delete(pid); released.push(pid); }
    }
    r.drags.delete(socket.id);
    if (released.length) {
      const positions = room
        ? released.filter((id) => room.pieces[id]).map((id) => ({ id, x: room.pieces[id].x, y: room.pieces[id].y, groupId: room.pieces[id].groupId }))
        : [];
      socket.to(roomId).emit('held_changed', { pieceIds: released, held: false, socketId: socket.id, positions });
    }
    return released;
  }

  // Annule toutes les prises en cours (changement de mode) ; renvoie les
  // pièces concernées pour qu'elles soient resynchronisées chez tous.
  function resetHolds(roomId) {
    const r = rt(roomId);
    const ids = [...r.held.keys()];
    r.held.clear();
    r.drags.clear();
    if (ids.length) io.to(roomId).emit('holds_reset');
    return ids;
  }

  // ---------- Aide ----------
  function clearHint(roomId, clientId, { notifyRequester = false, reason = null } = {}) {
    const r = rt(roomId);
    const h = r.hints.get(clientId);
    if (!h) return;
    if (h.timer) clearTimeout(h.timer);
    if (h.status === 'pending') io.to(roomId).emit('hint_request_closed', { requestId: h.requestId });
    r.hints.delete(clientId);
    if (notifyRequester) {
      for (const s of socketsOfClient(roomId, clientId)) s.emit('hint_cancelled', { pieceId: h.pieceId, reason });
    }
  }

  function clearHintsForPieces(roomId, pieceIds, reason) {
    for (const [clientId, h] of [...rt(roomId).hints]) {
      if (pieceIds.has(h.pieceId)) clearHint(roomId, clientId, { notifyRequester: true, reason });
    }
  }

  // ---------- Demande de pièces de bord ----------
  // Pièces de bord encore à trouver : pas fixées, pas déjà assemblées, et
  // dans le bon contexte (grande room, ou le focus du demandeur).
  function edgeCandidates(room, clientId, context) {
    const sizes = new Map();
    for (const p of Object.values(room.pieces)) sizes.set(p.groupId, (sizes.get(p.groupId) || 0) + 1);
    const focusLock = F.focusLockId(room.members[clientId]?.memberId);
    const out = [];
    for (const [id, p] of Object.entries(room.pieces)) {
      if (!G.isEdgePiece(room, p)) continue;
      if (context === 'focus' ? p.focusOwner !== clientId : !!p.focusOwner) continue;
      if (p.groupId === C.LOCKED || p.groupId === focusLock || sizes.get(p.groupId) > 1) continue;
      out.push(id);
    }
    return out;
  }

  function pickEdges(room, clientId, context) {
    return L.shuffle(edgeCandidates(room, clientId, context)).slice(0, 3);
  }

  function clearEdgeAsk(roomId, clientId) {
    const r = rt(roomId);
    const ask = r.edgeAsks.get(clientId);
    if (!ask) return;
    clearTimeout(ask.timer);
    r.edgeAsks.delete(clientId);
    io.to(roomId).emit('hint_request_closed', { requestId: ask.requestId });
  }

  // ---------- Demandes de réglages ----------
  function closeSettingsRequest(roomId, requestId) {
    if (rt(roomId).settingsRequests.delete(requestId)) io.to(roomId).emit('settings_request_closed', { requestId });
  }

  function closeSettingsRequestsOf(roomId, clientId) {
    for (const [requestId, req] of [...rt(roomId).settingsRequests]) {
      if (req.clientId === clientId) closeSettingsRequest(roomId, requestId);
    }
  }

  function resendPendingTo(socket, roomId) {
    const room = db[roomId];
    for (const [requestId, req] of Object.entries(room.pendingRequests)) {
      socket.emit('join_request', { requestId, pseudo: req.pseudo });
    }
    for (const [requestId, req] of rt(roomId).settingsRequests) {
      socket.emit('settings_request_incoming', { requestId, fromPseudo: req.pseudo, fromMemberId: req.memberId, partial: req.partial });
    }
  }

  // ---------- Application des réglages (et conversion de mode) ----------
  function applySettings(roomId, partial, actor) {
    const room = db[roomId];
    const r = rt(roomId);
    const changes = {};
    for (const [k, v] of Object.entries(partial)) if (room.settings[k] !== v) changes[k] = v;
    if (changes.background === 'custom' && !room.settings.customBackgroundUrl) delete changes.background;
    if (changes.music === 'custom' && !changes.customMusic && !room.settings.customMusic) delete changes.music;
    if (changes.customMusic && JSON.stringify(changes.customMusic) === JSON.stringify(room.settings.customMusic)) delete changes.customMusic;
    if (!Object.keys(changes).length) return false;
    // Musique perso remplacée : l'ancien fichier envoyé n'a plus d'usage.
    const oldMusic = room.settings.customMusic;
    if (changes.customMusic && oldMusic?.kind === 'file' && oldMusic.url !== changes.customMusic.url
      && oldMusic.url.startsWith(`/uploads/${roomId}-`)) images.removeUrl(oldMusic.url);

    if (changes.lockMode) {
      for (const clientId of Object.keys(room.focuses)) endFocusAndBroadcast(roomId, clientId, 'mode_change');
      const heldIds = resetHolds(roomId);
      for (const clientId of [...r.hints.keys()]) clearHint(roomId, clientId, { notifyRequester: true, reason: 'mode_change' });
      const converted = changes.lockMode === 'free' ? G.convertToFree(room) : G.convertToLocked(room);
      room.settings.lockMode = changes.lockMode;
      const ids = new Set([...converted, ...heldIds]);
      if (ids.size) {
        io.to(roomId).emit('pieces_sync', { pieces: R.piecesSubset(room, ids), animate: true, reason: 'mode_change', by: actor?.memberId || null });
      }
    }
    Object.assign(room.settings, changes);
    io.to(roomId).emit('room_settings_changed', room.settings);
    store.markDirty();
    if (changes.lockMode) checkCompletion(roomId);
    return true;
  }

  // ---------- Focus ----------
  function endFocusAndBroadcast(roomId, clientId, reason) {
    const room = db[roomId];
    const focus = room?.focuses?.[clientId];
    if (!focus) return;
    const r = rt(roomId);
    const timer = r.focusTimers.get(clientId);
    if (timer) { clearTimeout(timer); r.focusTimers.delete(clientId); }
    const memberId = focus.ownerMemberId;
    const res = F.endFocus(room, clientId, reason === 'complete' ? 'complete' : 'quit');
    const pieces = R.piecesSubset(room, res.changedIds);
    for (const s of socketsInRoom(roomId)) {
      if (s.data.clientId === clientId) s.emit('focus_ended', { reason, pieces });
      else s.emit('pieces_sync', { pieces, animate: true, reason: reason === 'complete' ? 'focus_complete' : 'focus_end', by: memberId });
    }
    io.to(roomId).emit('focus_update', { memberId, active: false });
    if (Object.keys(res.credits).length) io.to(roomId).emit('credits_changed', { placedBy: res.credits });
    emitPlayers(roomId);
    store.markDirty();
    checkCompletion(roomId);
  }

  function scheduleFocusGrace(roomId, clientId) {
    const r = rt(roomId);
    if (r.focusTimers.has(clientId)) return;
    const t = setTimeout(() => {
      r.focusTimers.delete(clientId);
      if (db[roomId] && socketsOfClient(roomId, clientId).length === 0) endFocusAndBroadcast(roomId, clientId, 'timeout');
    }, C.FOCUS_GRACE_MS);
    t.unref?.();
    r.focusTimers.set(clientId, t);
  }

  // ---------- Entrée / sortie d'un socket dans une room ----------
  function detachSocket(socket, reason) {
    const roomId = socket.data?.roomId;
    if (!roomId) return;
    socket.leave(roomId);
    socket.data.roomId = null;
    const room = db[roomId];
    if (!room) return;
    const clientId = socket.data.clientId;
    releaseHolds(roomId, socket);
    rt(roomId).lastPing.delete(socket.id);
    socket.to(roomId).emit('player_left', { socketId: socket.id });
    if (socketsOfClient(roomId, clientId).length === 0) {
      clearHint(roomId, clientId);
      clearEdgeAsk(roomId, clientId);
      closeSettingsRequestsOf(roomId, clientId);
      if (room.focuses?.[clientId]) {
        if (reason === 'disconnect') scheduleFocusGrace(roomId, clientId);
        else endFocusAndBroadcast(roomId, clientId, 'quit');
      }
    }
    emitPlayers(roomId);
    emitMembers(roomId);
    markMaybeInactive(roomId);
  }

  function admit(socket, roomId, clientId, { resume }) {
    const room = db[roomId];
    const member = room.members[clientId];
    dropPendingRequest(socket);
    // Même joueur ouvert dans un autre onglet : l'ancien onglet cède la place.
    for (const s of socketsOfClient(roomId, clientId)) {
      if (s.id !== socket.id) { s.emit('session_replaced'); detachSocket(s, 'replaced'); }
    }
    if (socket.data?.roomId && socket.data.roomId !== roomId) detachSocket(socket, 'leave');
    socket.join(roomId);
    socket.data = { clientId, roomId, memberId: member.memberId };
    markActive(roomId);
    const r = rt(roomId);
    const t = r.focusTimers.get(clientId);
    if (t) { clearTimeout(t); r.focusTimers.delete(clientId); }
    socket.emit(resume ? 'room_resync' : 'load_puzzle', roomPayload(roomId, clientId));
    emitPlayers(roomId);
    emitMembers(roomId);
    if (R.isStaffRole(member.role)) resendPendingTo(socket, roomId);
    room.lastActivity = Date.now();
    store.markDirty();
  }

  // ============================================================
  // API HTTP
  // ============================================================
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  const createLimit = perIpLimit('create', LIMITS.roomsPerHour, 'Trop de parties créées en peu de temps : réessaie dans un moment.');
  app.post(['/api/rooms', '/create-room'], createLimit, uploadJson, (req, res) => {
    try {
      const b = req.body || {};
      const clientId = R.cleanClientId(b.creatorClientId);
      if (!clientId) return res.status(400).json({ error: 'creatorClientId manquant' });
      const cols = clampInt(b.cols, 2, 60);
      const rows = clampInt(b.rows, 2, 60);
      if (cols * rows > C.MAX_PIECES) return res.status(400).json({ error: 'Trop de pièces' });
      const imgWidth = Number(b.imgWidth);
      const imgHeight = Number(b.imgHeight);
      if (!(imgWidth >= 100 && imgWidth <= 20000 && imgHeight >= 100 && imgHeight <= 20000)) {
        return res.status(400).json({ error: 'Dimensions invalides' });
      }

      const roomId = R.newRoomId(db);
      const source = b.originalImage || b.originalImageUrl || b.image || b.imageUrl;
      // Disque presque plein : une image envoyée est refusée ; une image du
      // site marche encore, sans miniature (la grande image en tient lieu).
      const diskFull = diskAlmostFull();
      let originalImageUrl;
      if (images.isDataUrl(source)) {
        if (diskFull) return res.status(503).json({ error: DISK_FULL_ERROR });
        originalImageUrl = images.save(source, `${roomId}-orig`);
      } else if (typeof source === 'string' && PRESET_PATH_RE.test(source) && !source.includes('..')) originalImageUrl = source;
      else return res.status(400).json({ error: 'Image manquante ou invalide' });
      let thumbUrl = originalImageUrl;
      if (!diskFull && images.isDataUrl(b.thumb)) {
        try { thumbUrl = images.save(b.thumb, `${roomId}-thumb`); } catch { /* miniature facultative */ }
      }

      // Découpe : grille régulière (classique), ou pièces magiques de tailles
      // et de formes toutes différentes, sur une grille fine.
      const cut = S.cleanCut(b.cut);
      const { gridCols, gridRows, pieces: cutPieces } = S.generatePieces(cols, rows, cut);
      const frame = { x: C.CENTER - imgWidth / 2, y: C.CENTER - imgHeight / 2, w: imgWidth, h: imgHeight };
      const vp = b.viewport || {};
      const aspect = Number(vp.w) > 0 && Number(vp.h) > 0 ? Number(vp.w) / Number(vp.h) : 16 / 9;
      const cellW = imgWidth / gridCols;
      const cellH = imgHeight / gridRows;
      const typical = Math.sqrt(L.meanBoxCells(cutPieces));
      const sizes = cutPieces.map((p) => ({ w: (p.box ? p.box[2] : 1) * cellW, h: (p.box ? p.box[3] : 1) * cellH }));
      const { table, positions } = L.scatterPieces(frame, cellW * typical, cellH * typical, cutPieces.length, aspect, Math.random, sizes);

      const pieces = {};
      cutPieces.forEach((p, i) => {
        const id = `piece_${p.c}_${p.r}`;
        const pos = positions[i];
        pieces[id] = { c: p.c, r: p.r, x: pos.x, y: pos.y, groupId: id, placedBy: null, shape: p.shape };
        if (p.box) { pieces[id].box = p.box; pieces[id].adj = p.adj; }
      });

      const now = Date.now();
      db[roomId] = {
        version: 2,
        name: R.cleanString(b.name, 60) || `Puzzle de ${cutPieces.length} pièces`,
        imageUrl: originalImageUrl,
        originalImageUrl,
        thumbUrl,
        cols: gridCols, rows: gridRows, imgWidth, imgHeight,
        cut,
        table,
        pieces,
        startTime: now,
        endTime: null,
        playTimeMs: 0,
        lastActivity: now,
        creatorClientId: clientId,
        members: {
          [clientId]: {
            memberId: R.newMemberId(),
            pseudo: R.sanitizePseudo(b.creatorPseudo) || 'Joueur',
            color: R.sanitizeColor(b.creatorColor) || '#5b8cff',
            cursorShape: R.sanitizeCursorShape(b.creatorCursorShape) || 'dot',
            cursorImage: R.sanitizeCursorImage(b.creatorCursorImage) ?? null,
            accepted: true, removed: false, banned: false,
            role: 'host',
            joinedAt: now,
          },
        },
        pendingRequests: {},
        settings: { ...C.DEFAULT_SETTINGS, ...R.sanitizeSettings(b.initialSettings, { allowHostOnly: true }) },
        focuses: {},
      };
      store.markDirty();
      res.json({ roomId });
    } catch (err) {
      log.error('[create-room]', err);
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/my-rooms', smallJson, (req, res) => {
    const clientId = R.cleanClientId(req.body?.clientId);
    if (!clientId) return res.json({ rooms: [] });
    const rooms = [];
    for (const [roomId, room] of Object.entries(db)) {
      const m = room.members[clientId];
      if (!R.isActiveMember(m)) continue;
      rooms.push(R.roomSummary(room, roomId, clientId, socketsInRoom(roomId).length));
    }
    rooms.sort((a, b) => b.lastActivity - a.lastActivity);
    res.json({ rooms });
  });

  app.post('/api/rooms/:id/delete', smallJson, (req, res) => {
    const roomId = R.cleanRoomId(req.params.id);
    const room = db[roomId];
    if (!room) return res.status(404).json({ error: 'Partie introuvable' });
    const clientId = R.cleanClientId(req.body?.clientId);
    if (!clientId || room.creatorClientId !== clientId) return res.status(403).json({ error: "Seul l'hôte peut supprimer la partie." });
    for (const s of socketsInRoom(roomId)) {
      s.emit('room_deleted');
      s.leave(roomId);
      s.data.roomId = null;
    }
    for (const reqData of Object.values(room.pendingRequests)) {
      const s = io.sockets.sockets.get(reqData.socketId);
      if (s?.data?.pendingRoomId === roomId) s.emit('room_deleted');
    }
    disposeRuntime(roomId);
    images.removeRoomFiles(roomId);
    delete db[roomId];
    store.markDirty();
    res.json({ ok: true });
  });

  app.post('/api/rooms/:id/forget', smallJson, (req, res) => {
    const roomId = R.cleanRoomId(req.params.id);
    const room = db[roomId];
    if (!room) return res.status(404).json({ error: 'Partie introuvable' });
    const clientId = R.cleanClientId(req.body?.clientId);
    const member = clientId && room.members[clientId];
    if (!member) return res.status(404).json({ error: 'Tu ne fais pas partie de cette partie.' });
    if (room.creatorClientId === clientId) return res.status(400).json({ error: "L'hôte peut seulement supprimer la partie." });
    member.accepted = false;
    member.removed = true;
    member.role = 'guest';
    for (const s of socketsOfClient(roomId, clientId)) detachSocket(s, 'leave');
    if (room.focuses[clientId]) endFocusAndBroadcast(roomId, clientId, 'quit');
    emitMembers(roomId);
    store.markDirty();
    res.json({ ok: true });
  });

  const backgroundLimit = perIpLimit('bg', LIMITS.backgroundsPerHour, 'Trop d’envois en peu de temps : réessaie dans un moment.');
  app.post('/api/rooms/:id/background', backgroundLimit, uploadJson, (req, res) => {
    const roomId = R.cleanRoomId(req.params.id);
    const room = db[roomId];
    if (!room) return res.status(404).json({ error: 'Partie introuvable' });
    const clientId = R.cleanClientId(req.body?.clientId);
    const member = clientId && room.members[clientId];
    if (!R.isActiveMember(member) || !R.isStaffRole(member.role)) return res.status(403).json({ error: "Seul l'hôte peut changer le fond." });
    if (diskAlmostFull()) return res.status(503).json({ error: DISK_FULL_ERROR });
    try {
      const url = images.save(req.body?.image, `${roomId}-bg`);
      images.removeUrl(room.settings.customBackgroundUrl);
      room.settings.customBackgroundUrl = url;
      room.settings.background = 'custom';
      io.to(roomId).emit('room_settings_changed', room.settings);
      store.markDirty();
      res.json({ url });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Musique perso envoyée par un joueur. Tout membre peut envoyer : pour un
  // invité, le fichier sert ensuite à une proposition que l'hôte accepte ou non.
  const musicLimit = perIpLimit('music', LIMITS.musicPerHour, 'Trop d’envois en peu de temps : réessaie dans un moment.');
  app.post('/api/rooms/:id/music', musicLimit, uploadJson, (req, res) => {
    const roomId = R.cleanRoomId(req.params.id);
    const room = db[roomId];
    if (!room) return res.status(404).json({ error: 'Partie introuvable' });
    const clientId = R.cleanClientId(req.body?.clientId);
    const member = clientId && room.members[clientId];
    if (!R.isActiveMember(member)) return res.status(403).json({ error: 'Rejoins la partie pour envoyer une musique.' });
    if (diskAlmostFull()) return res.status(503).json({ error: DISK_FULL_ERROR });
    try {
      const url = audio.save(req.body?.audio, `${roomId}-music`);
      // `apply` (hôte) : la musique devient tout de suite celle de la partie
      // (musique choisie à l'accueil, envoyée juste après la création).
      if (req.body?.apply && R.isStaffRole(member.role)) {
        const customMusic = R.sanitizeCustomMusic({ kind: 'file', url, name: req.body?.name });
        applySettings(roomId, { music: 'custom', customMusic }, member);
      }
      res.json({ url });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ============================================================
  // Interface compilée (production) : si puzzle-frontend/dist existe, le
  // serveur sert aussi le site. Une seule adresse, un seul port à exposer.
  // ============================================================
  const distDir = process.env.PUZZLE_DIST_DIR || path.join(__dirname, 'puzzle-frontend', 'dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use('/assets', express.static(path.join(distDir, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      // HEAD aussi : les outils de surveillance (UptimeRobot...) l'utilisent.
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/socket.io')) return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
    log.log(`Interface servie depuis ${path.relative(process.cwd(), distDir) || distDir}.`);
  }

  // ============================================================
  // Temps réel
  // ============================================================
  io.on('connection', (socket) => {
    const on = (event, fn) => socket.on(event, (payload) => {
      try {
        fn(payload && typeof payload === 'object' ? payload : {});
      } catch (err) {
        log.error(`[socket ${event}]`, err);
      }
    });

    function getCtx(roomIdRaw) {
      const roomId = R.cleanRoomId(roomIdRaw);
      if (!roomId || socket.data?.roomId !== roomId) return null;
      const room = db[roomId];
      if (!room) return null;
      const clientId = socket.data.clientId;
      const member = room.members[clientId];
      if (!R.isActiveMember(member)) return null;
      return { roomId, room, clientId, member, r: rt(roomId) };
    }

    // ---------- Arrivée dans une partie ----------
    on('join_room', (data) => {
      const roomId = R.cleanRoomId(data.roomId);
      const clientId = R.cleanClientId(data.clientId);
      const room = roomId && db[roomId];
      if (!room || !clientId) { socket.emit('room_not_found'); return; }

      const pseudo = R.sanitizePseudo(data.pseudo) || 'Joueur';
      const color = R.sanitizeColor(data.color);
      const cursorShape = R.sanitizeCursorShape(data.cursorShape);
      const cursorImage = R.sanitizeCursorImage(data.cursorImage);
      let member = room.members[clientId];
      if (member?.banned) { socket.emit('join_denied', { reason: 'banned' }); return; }
      if (!room.creatorClientId) room.creatorClientId = clientId; // ancienne partie sans hôte
      const isCreator = room.creatorClientId === clientId;

      if (isCreator || R.isActiveMember(member)) {
        if (!member) {
          member = { memberId: R.newMemberId(), joinedAt: Date.now() };
          room.members[clientId] = member;
        }
        member.accepted = true;
        member.removed = false;
        member.role = isCreator ? 'host' : (member.role === 'cohost' ? 'cohost' : 'guest');
        if (!R.isPseudoTaken(room, pseudo, clientId)) member.pseudo = pseudo;
        else if (!member.pseudo || R.isPseudoTaken(room, member.pseudo, clientId)) member.pseudo = R.uniquePseudo(room, pseudo, clientId);
        member.color = color || member.color || '#5b8cff';
        member.cursorShape = cursorShape || member.cursorShape || 'dot';
        if (cursorImage !== undefined) member.cursorImage = cursorImage;
        member.cursorImage = member.cursorImage || null;
        admit(socket, roomId, clientId, { resume: !!data.resume });
        return;
      }

      if (R.isPseudoTaken(room, pseudo, clientId)) { socket.emit('join_error', { reason: 'pseudo_taken' }); return; }
      if (rateLimited(`join:${socketIp(socket)}`, LIMITS.joinRequestsPerHour)) {
        socket.emit('join_error', { reason: 'too_many_requests' });
        return;
      }
      dropPendingRequest(socket);
      for (const [requestId, reqData] of Object.entries(room.pendingRequests)) {
        if (reqData.clientId === clientId) {
          delete room.pendingRequests[requestId];
          for (const s of staffSockets(roomId)) s.emit('join_request_closed', { requestId });
        }
      }
      // File d'attente pleine : on retire d'abord les demandes périmées.
      if (Object.keys(room.pendingRequests).length >= LIMITS.pendingRequestsPerRoom) purgeStaleRequests(roomId);
      if (Object.keys(room.pendingRequests).length >= LIMITS.pendingRequestsPerRoom) {
        socket.emit('join_error', { reason: 'too_many_requests' });
        store.markDirty();
        return;
      }
      if (socket.data?.roomId) detachSocket(socket, 'leave');
      const requestId = crypto.randomUUID();
      room.pendingRequests[requestId] = {
        clientId, pseudo, color, cursorShape, cursorImage: cursorImage ?? null, socketId: socket.id, at: Date.now(),
      };
      socket.data = { clientId, roomId: null, pendingRoomId: roomId, pendingRequestId: requestId };
      const staff = staffSockets(roomId);
      socket.emit('join_pending', { requestId, hostOnline: staff.length > 0 });
      for (const s of staff) s.emit('join_request', { requestId, pseudo });
      store.markDirty();
    });

    on('cancel_join', () => dropPendingRequest(socket));

    on('respond_join', ({ roomId, requestId, accepted }) => {
      const ctx = getCtx(roomId);
      if (!ctx || !R.isStaffRole(ctx.member.role)) return;
      const { room } = ctx;
      const reqData = R.ownValue(room.pendingRequests, requestId);
      if (!reqData) { socket.emit('join_request_closed', { requestId }); return; }
      delete room.pendingRequests[requestId];
      for (const s of staffSockets(ctx.roomId)) if (s.id !== socket.id) s.emit('join_request_closed', { requestId });

      const requester = io.sockets.sockets.get(reqData.socketId);
      const stillWaiting = requester && requester.data?.pendingRequestId === requestId;
      if (!accepted) {
        if (stillWaiting) requester.emit('join_denied', { reason: 'refused' });
        store.markDirty();
        return;
      }
      let pseudo = reqData.pseudo;
      if (R.isPseudoTaken(room, pseudo, reqData.clientId)) pseudo = R.uniquePseudo(room, pseudo, reqData.clientId);
      const previous = room.members[reqData.clientId];
      room.members[reqData.clientId] = {
        memberId: previous?.memberId || R.newMemberId(),
        pseudo,
        color: reqData.color || '#5b8cff',
        cursorShape: reqData.cursorShape || 'dot',
        cursorImage: reqData.cursorImage || null,
        accepted: true, removed: false, banned: false,
        role: 'guest',
        joinedAt: Date.now(),
      };
      if (stillWaiting) admit(requester, ctx.roomId, reqData.clientId, { resume: false });
      else emitMembers(ctx.roomId);
      store.markDirty();
    });

    on('leave_room', ({ roomId }) => {
      if (socket.data?.roomId === roomId) detachSocket(socket, 'leave');
    });

    // ---------- Pièces : prise, glissé, lâcher ----------
    on('grab', ({ roomId, pieceIds }) => {
      const ctx = getCtx(roomId);
      if (!ctx || !Array.isArray(pieceIds) || !pieceIds.length || pieceIds.length > C.MAX_PIECES) return;
      const { room, r } = ctx;
      releaseHolds(ctx.roomId, socket);
      let blockedBy = null;
      for (const id of pieceIds) {
        const p = R.ownValue(room.pieces, id);
        if (!p || p.focusOwner || p.groupId === C.LOCKED) { blockedBy = blockedBy || 'invalid'; break; }
        const holder = r.held.get(id);
        if (holder && holder !== socket.id) { blockedBy = holder; break; }
      }
      if (blockedBy) {
        socket.emit('grab_denied', { pieceIds, by: io.sockets.sockets.get(blockedBy)?.data?.memberId || null });
        return;
      }
      const base = new Map();
      for (const id of pieceIds) {
        r.held.set(id, socket.id);
        base.set(id, { x: room.pieces[id].x, y: room.pieces[id].y });
      }
      r.drags.set(socket.id, { ids: pieceIds, base });
      socket.to(ctx.roomId).emit('held_changed', { pieceIds, held: true, socketId: socket.id, memberId: ctx.member.memberId });
    });

    on('drag', ({ roomId, dx, dy }) => {
      const ctx = getCtx(roomId);
      if (!ctx || !R.finite(dx) || !R.finite(dy)) return;
      const d = ctx.r.drags.get(socket.id);
      if (!d) return;
      const cdx = R.clampCoord(dx);
      const cdy = R.clampCoord(dy);
      for (const [id, b] of d.base) {
        const p = ctx.room.pieces[id];
        if (p) { p.x = b.x + cdx; p.y = b.y + cdy; }
      }
      socket.to(ctx.roomId).volatile.emit('group_dragged', { socketId: socket.id, dx: cdx, dy: cdy });
      store.markDirty();
    });

    on('drop', ({ roomId, updates }) => {
      const ctx = getCtx(roomId);
      if (!ctx) return;
      const { room, member, r } = ctx;
      const mode = room.settings.lockMode;
      const accepted = [];
      const rejected = [];
      const newlyLocked = [];
      const touched = new Set();
      for (const u of Array.isArray(updates) ? updates.slice(0, C.MAX_PIECES) : []) {
        const p = u && R.ownValue(room.pieces, u.id);
        if (!p) continue;
        const holder = r.held.get(u.id);
        if (p.focusOwner || p.groupId === C.LOCKED || (holder && holder !== socket.id)) { rejected.push(u.id); continue; }
        if (!R.finite(u.x) || !R.finite(u.y)) continue;
        let gid = R.cleanGroupId(u.groupId) || p.groupId;
        if ((gid === C.LOCKED && mode !== 'locked') || gid.startsWith(C.FOCUS_LOCK_PREFIX)) gid = p.groupId;
        if (gid === C.LOCKED) {
          const t = L.targetOf(room, p);
          p.x = t.x; p.y = t.y;
          newlyLocked.push(u.id);
        } else {
          p.x = R.clampCoord(u.x);
          p.y = R.clampCoord(u.y);
        }
        p.groupId = gid;
        touched.add(gid);
        accepted.push({ id: u.id, x: p.x, y: p.y, groupId: gid });
      }
      if (accepted.length) {
        socket.to(ctx.roomId).emit('pieces_moved', { updates: accepted, final: true, socketId: socket.id, memberId: member.memberId });
      }
      // Pièces refusées (tenues par un autre entre-temps...) : on renvoie leur
      // vraie position à l'auteur du lâcher pour qu'il se recale.
      if (rejected.length) socket.emit('pieces_sync', { pieces: R.piecesSubset(room, rejected, ctx.clientId), animate: true, reason: 'rejected' });
      releaseHolds(ctx.roomId, socket);

      let credits = {};
      if (mode === 'locked') credits = G.creditPieces(room, newlyLocked, member.memberId);
      else {
        for (const gid of touched) {
          const ids = G.idsOfGroup(room, gid);
          if (ids.length >= 2) Object.assign(credits, G.creditPieces(room, ids, member.memberId));
        }
      }
      if (Object.keys(credits).length) io.to(ctx.roomId).emit('credits_changed', { placedBy: credits });
      if (newlyLocked.length) clearHintsForPieces(ctx.roomId, new Set(newlyLocked), 'placed');
      if (accepted.length) {
        room.lastActivity = Date.now();
        store.markDirty();
      }
      checkCompletion(ctx.roomId);
    });

    on('tidy_table', ({ roomId }) => {
      const ctx = getCtx(roomId);
      if (!ctx || Date.now() - ctx.r.lastTidy < 3000) return;
      ctx.r.lastTidy = Date.now();
      const changed = G.tidyTable(ctx.room, { exclude: new Set(ctx.r.held.keys()) });
      if (!changed.length) return;
      io.to(ctx.roomId).emit('pieces_sync', {
        pieces: R.piecesSubset(ctx.room, changed), animate: true, reason: 'tidy', by: ctx.member.memberId, byPseudo: ctx.member.pseudo,
      });
      store.markDirty();
    });

    // ---------- Curseurs et pings ----------
    on('mouse_move', ({ roomId, x, y }) => {
      if (!roomId || socket.data?.roomId !== roomId || !R.finite(x) || !R.finite(y)) return;
      socket.to(roomId).volatile.emit('other_mouse_moved', { userId: socket.id, x, y });
    });

    on('cursor_hidden', ({ roomId }) => {
      if (!roomId || socket.data?.roomId !== roomId) return;
      socket.to(roomId).emit('cursor_hidden', { socketId: socket.id });
    });

    on('map_ping', ({ roomId, x, y }) => {
      const ctx = getCtx(roomId);
      if (!ctx || !R.finite(x) || !R.finite(y)) return;
      const last = ctx.r.lastPing.get(socket.id) || 0;
      if (Date.now() - last < 400) return;
      ctx.r.lastPing.set(socket.id, Date.now());
      socket.to(ctx.roomId).emit('map_ping', { x, y, memberId: ctx.member.memberId, color: ctx.member.color, pseudo: ctx.member.pseudo });
    });

    // ---------- Profil ----------
    on('cursor_style_update', ({ roomId, color, cursorShape, cursorImage }) => {
      const ctx = getCtx(roomId);
      if (!ctx) return;
      const c = R.sanitizeColor(color);
      const s = R.sanitizeCursorShape(cursorShape);
      const img = R.sanitizeCursorImage(cursorImage);
      if (c) ctx.member.color = c;
      if (s) ctx.member.cursorShape = s;
      if (img !== undefined) ctx.member.cursorImage = img;
      store.markDirty();
      emitPlayers(ctx.roomId);
      emitMembers(ctx.roomId);
    });

    on('update_profile', ({ roomId, pseudo }) => {
      const ctx = getCtx(roomId);
      if (!ctx) return;
      const clean = R.sanitizePseudo(pseudo);
      if (!clean) return;
      if (R.isPseudoTaken(ctx.room, clean, ctx.clientId)) { socket.emit('profile_error', { reason: 'pseudo_taken' }); return; }
      ctx.member.pseudo = clean;
      store.markDirty();
      emitPlayers(ctx.roomId);
      emitMembers(ctx.roomId);
    });

    // ---------- Réglages de la room ----------
    on('update_room_settings', ({ roomId, settings }) => {
      const ctx = getCtx(roomId);
      if (!ctx || !R.isStaffRole(ctx.member.role)) return;
      const clean = R.sanitizeSettings(settings, { allowHostOnly: ctx.member.role === 'host' });
      applySettings(ctx.roomId, clean, ctx.member);
    });

    on('settings_request', ({ roomId, partial }) => {
      const ctx = getCtx(roomId);
      if (!ctx) return;
      const clean = R.sanitizeSettings(partial);
      const keys = Object.keys(clean);
      if (!keys.length) return;
      if (R.isStaffRole(ctx.member.role)) { applySettings(ctx.roomId, clean, ctx.member); return; }
      if (ctx.room.settings.guestsCanEdit) {
        if (applySettings(ctx.roomId, clean, ctx.member)) {
          socket.to(ctx.roomId).emit('settings_changed_by', { pseudo: ctx.member.pseudo, partial: clean });
        }
        return;
      }
      const staff = staffSockets(ctx.roomId);
      if (!staff.length) { socket.emit('settings_request_result', { status: 'host_offline', partial: clean }); return; }
      for (const [requestId, req] of [...ctx.r.settingsRequests]) {
        if (req.clientId === ctx.clientId && Object.keys(req.partial).some((k) => keys.includes(k))) closeSettingsRequest(ctx.roomId, requestId);
      }
      const requestId = crypto.randomUUID();
      ctx.r.settingsRequests.set(requestId, { clientId: ctx.clientId, memberId: ctx.member.memberId, pseudo: ctx.member.pseudo, partial: clean });
      for (const s of staff) s.emit('settings_request_incoming', { requestId, fromPseudo: ctx.member.pseudo, fromMemberId: ctx.member.memberId, partial: clean });
      socket.emit('settings_request_result', { requestId, status: 'pending', partial: clean });
    });

    on('settings_request_respond', ({ roomId, requestId, accepted }) => {
      const ctx = getCtx(roomId);
      if (!ctx || !R.isStaffRole(ctx.member.role)) return;
      const req = ctx.r.settingsRequests.get(requestId);
      if (!req) { socket.emit('settings_request_closed', { requestId }); return; }
      closeSettingsRequest(ctx.roomId, requestId);
      if (accepted) applySettings(ctx.roomId, req.partial, ctx.member);
      for (const s of socketsOfClient(ctx.roomId, req.clientId)) {
        s.emit('settings_request_result', { requestId, status: accepted ? 'accepted' : 'refused', partial: req.partial, by: ctx.member.pseudo });
      }
    });

    on('rename_room', ({ roomId, name }) => {
      const ctx = getCtx(roomId);
      if (!ctx || !R.isStaffRole(ctx.member.role)) return;
      const clean = R.cleanString(name, 60);
      if (!clean) return;
      ctx.room.name = clean;
      io.to(ctx.roomId).emit('room_renamed', { name: clean });
      store.markDirty();
    });

    // ---------- Membres : exclusion, bannissement, co-hôte ----------
    on('kick_member', ({ roomId, memberId, ban }) => {
      const ctx = getCtx(roomId);
      if (!ctx || !R.isStaffRole(ctx.member.role)) return;
      const found = R.findMember(ctx.room, memberId);
      if (!found || found.clientId === ctx.clientId) return;
      const target = found.member;
      if (target.role === 'host') return;
      if (ctx.member.role === 'cohost' && target.role !== 'guest') return;
      target.accepted = false;
      target.removed = true;
      target.banned = !!ban;
      target.role = 'guest';
      if (ctx.room.focuses[found.clientId]) endFocusAndBroadcast(ctx.roomId, found.clientId, 'kicked');
      for (const s of socketsOfClient(ctx.roomId, found.clientId)) {
        s.emit('kicked', { banned: !!ban, by: ctx.member.pseudo });
        detachSocket(s, 'kicked');
      }
      clearHint(ctx.roomId, found.clientId);
      clearEdgeAsk(ctx.roomId, found.clientId);
      closeSettingsRequestsOf(ctx.roomId, found.clientId);
      emitMembers(ctx.roomId);
      emitPlayers(ctx.roomId);
      store.markDirty();
    });

    on('unban_member', ({ roomId, memberId }) => {
      const ctx = getCtx(roomId);
      if (!ctx || !R.isStaffRole(ctx.member.role)) return;
      const found = R.findMember(ctx.room, memberId);
      if (!found || !found.member.banned) return;
      found.member.banned = false;
      emitMembers(ctx.roomId);
      store.markDirty();
    });

    on('set_role', ({ roomId, memberId, role }) => {
      const ctx = getCtx(roomId);
      if (!ctx || ctx.member.role !== 'host' || (role !== 'cohost' && role !== 'guest')) return;
      const found = R.findMember(ctx.room, memberId);
      if (!found || found.clientId === ctx.clientId || !R.isActiveMember(found.member)) return;
      found.member.role = role;
      emitMembers(ctx.roomId);
      emitPlayers(ctx.roomId);
      if (role === 'cohost') for (const s of socketsOfClient(ctx.roomId, found.clientId)) resendPendingTo(s, ctx.roomId);
      store.markDirty();
    });

    // ---------- Aide à plusieurs niveaux ----------
    on('hint_request', ({ roomId, pieceId, level, context }) => {
      const ctx = getCtx(roomId);
      if (!ctx) return;
      const { room, r, clientId, member } = ctx;
      const piece = R.ownValue(room.pieces, pieceId);
      const lvl = Math.round(Number(level));
      if (!piece || piece.groupId === C.LOCKED || !(lvl >= 1 && lvl <= 3)) return;
      const inFocus = context === 'focus';
      if (inFocus ? piece.focusOwner !== clientId : !!piece.focusOwner) return;

      const current = r.hints.get(clientId);
      const progression = current && current.pieceId === pieceId && current.status === 'granted' && lvl === current.level + 1;
      if (lvl !== 1 && !progression) return;
      if (current) {
        if (current.timer) clearTimeout(current.timer);
        if (current.status === 'pending') io.to(ctx.roomId).emit('hint_request_closed', { requestId: current.requestId });
      }

      const requestId = crypto.randomUUID();
      const helpers = socketsInRoom(ctx.roomId).filter((s) => s.data?.clientId !== clientId);
      if (!helpers.length) {
        r.hints.set(clientId, { pieceId, level: lvl, status: 'granted', context: inFocus ? 'focus' : 'main' });
        socket.emit('hint_response', { requestId, pieceId, level: lvl, accepted: true, auto: true });
        return;
      }
      const previousLevel = progression ? current.level : 0;
      const timer = setTimeout(() => {
        const h = r.hints.get(clientId);
        if (!h || h.requestId !== requestId || h.status !== 'pending') return;
        io.to(ctx.roomId).emit('hint_request_closed', { requestId });
        if (previousLevel > 0) r.hints.set(clientId, { pieceId, level: previousLevel, status: 'granted', context: h.context });
        else r.hints.delete(clientId);
        for (const s of socketsOfClient(ctx.roomId, clientId)) s.emit('hint_response', { requestId, pieceId, level: lvl, accepted: false, reason: 'timeout' });
      }, C.HINT_TIMEOUT_MS);
      timer.unref?.();
      r.hints.set(clientId, { pieceId, level: previousLevel, pendingLevel: lvl, status: 'pending', requestId, timer, context: inFocus ? 'focus' : 'main' });
      socket.to(ctx.roomId).emit('hint_incoming', { requestId, fromMemberId: member.memberId, fromPseudo: member.pseudo, pieceId, level: lvl });
    });

    on('hint_respond', ({ roomId, requestId, accepted }) => {
      const ctx = getCtx(roomId);
      if (!ctx) return;
      // Réponse à une demande de bords : les pièces sont tirées au moment de
      // l'accord (l'état a pu changer pendant l'attente).
      const edgeEntry = [...ctx.r.edgeAsks].find(([, a]) => a.requestId === requestId);
      if (edgeEntry) {
        const [requesterId, ask] = edgeEntry;
        if (requesterId === ctx.clientId) return;
        clearTimeout(ask.timer);
        ctx.r.edgeAsks.delete(requesterId);
        const pieceIds = accepted ? pickEdges(ctx.room, requesterId, ask.context) : [];
        const requesterSockets = socketsOfClient(ctx.roomId, requesterId);
        for (const s of requesterSockets) {
          s.emit('edges_response', {
            requestId, accepted: !!accepted && pieceIds.length > 0, pieceIds, by: ctx.member.pseudo,
            reason: accepted && !pieceIds.length ? 'none' : undefined,
          });
        }
        for (const s of socketsInRoom(ctx.roomId)) {
          if (!requesterSockets.includes(s)) s.emit('hint_request_closed', { requestId });
        }
        return;
      }
      const entry = [...ctx.r.hints].find(([, h]) => h.requestId === requestId && h.status === 'pending');
      if (!entry) { socket.emit('hint_request_closed', { requestId }); return; }
      const [requesterId, hint] = entry;
      if (requesterId === ctx.clientId) return;
      clearTimeout(hint.timer);
      if (accepted) ctx.r.hints.set(requesterId, { pieceId: hint.pieceId, level: hint.pendingLevel, status: 'granted', context: hint.context });
      else if (hint.level > 0) ctx.r.hints.set(requesterId, { pieceId: hint.pieceId, level: hint.level, status: 'granted', context: hint.context });
      else ctx.r.hints.delete(requesterId);
      const requesterSockets = socketsOfClient(ctx.roomId, requesterId);
      for (const s of requesterSockets) {
        s.emit('hint_response', { requestId, pieceId: hint.pieceId, level: hint.pendingLevel, accepted: !!accepted, by: ctx.member.pseudo });
      }
      for (const s of socketsInRoom(ctx.roomId)) {
        if (!requesterSockets.includes(s)) s.emit('hint_request_closed', { requestId });
      }
    });

    on('hint_cancel', ({ roomId }) => {
      const ctx = getCtx(roomId);
      if (ctx) clearHint(ctx.roomId, ctx.clientId);
    });

    // ---------- Demande de pièces de bord (3 au plus, avec l'accord d'un autre) ----------
    on('edges_request', ({ roomId, context }) => {
      const ctx = getCtx(roomId);
      if (!ctx) return;
      const { room, r, clientId, member } = ctx;
      const where = context === 'focus' && room.focuses[clientId] ? 'focus' : 'main';
      const available = edgeCandidates(room, clientId, where).length;
      if (!available) { socket.emit('edges_response', { accepted: false, reason: 'none' }); return; }
      clearEdgeAsk(ctx.roomId, clientId);
      const requestId = crypto.randomUUID();
      const helpers = socketsInRoom(ctx.roomId).filter((s) => s.data?.clientId !== clientId);
      if (!helpers.length) {
        socket.emit('edges_response', { requestId, accepted: true, auto: true, pieceIds: pickEdges(room, clientId, where) });
        return;
      }
      const timer = setTimeout(() => {
        const ask = r.edgeAsks.get(clientId);
        if (!ask || ask.requestId !== requestId) return;
        r.edgeAsks.delete(clientId);
        io.to(ctx.roomId).emit('hint_request_closed', { requestId });
        for (const s of socketsOfClient(ctx.roomId, clientId)) s.emit('edges_response', { requestId, accepted: false, reason: 'timeout' });
      }, C.HINT_TIMEOUT_MS);
      timer.unref?.();
      r.edgeAsks.set(clientId, { requestId, timer, context: where });
      socket.to(ctx.roomId).emit('hint_incoming', {
        requestId, kind: 'edges', fromMemberId: member.memberId, fromPseudo: member.pseudo, count: Math.min(3, available),
      });
    });

    on('edges_cancel', ({ roomId }) => {
      const ctx = getCtx(roomId);
      if (ctx) clearEdgeAsk(ctx.roomId, ctx.clientId);
    });

    // ---------- Focus ----------
    on('focus_start', ({ roomId, size, aspect }) => {
      const ctx = getCtx(roomId);
      if (!ctx) return;
      const { room, clientId, member, r } = ctx;
      if (room.endTime) { socket.emit('focus_error', { reason: 'completed' }); return; }
      const existing = room.focuses[clientId];
      if (existing) {
        socket.emit('focus_started', { focus: R.publicFocus(room, clientId, existing, true), pieces: R.piecesSubset(room, existing.pieceIds, clientId) });
        return;
      }
      const wanted = C.FOCUS_SIZES.includes(size) ? size : 50;
      const effective = Math.min(wanted, Math.max(4, Math.floor(Object.keys(room.pieces).length * 0.6)));
      const focus = F.startFocus(room, clientId, member.memberId, effective, aspect, { blocked: new Set(r.held.keys()) });
      if (!focus) { socket.emit('focus_error', { reason: 'no_area' }); return; }
      clearHintsForPieces(ctx.roomId, new Set(focus.pieceIds), 'focus');
      socket.emit('focus_started', { focus: R.publicFocus(room, clientId, focus, true), pieces: R.piecesSubset(room, focus.pieceIds, clientId) });
      socket.to(ctx.roomId).emit('focus_update', { ...R.publicFocus(room, clientId, focus, false), active: true });
      emitPlayers(ctx.roomId);
      store.markDirty();
    });

    on('focus_move', ({ roomId, updates }) => {
      const ctx = getCtx(roomId);
      if (!ctx) return;
      const { room, clientId, member } = ctx;
      const focus = room.focuses[clientId];
      if (!focus) return;
      const mode = room.settings.lockMode;
      const lid = F.focusLockId(focus.ownerMemberId);
      const newlyLocked = [];
      const touched = new Set();
      for (const u of Array.isArray(updates) ? updates.slice(0, C.MAX_PIECES) : []) {
        const p = u && R.ownValue(room.pieces, u.id);
        if (!p || p.focusOwner !== clientId || p.groupId === lid) continue;
        if (!R.finite(u.x) || !R.finite(u.y)) continue;
        let gid = R.cleanGroupId(u.groupId) || p.groupId;
        if (gid === C.LOCKED || (gid.startsWith(C.FOCUS_LOCK_PREFIX) && (gid !== lid || mode !== 'locked'))) gid = p.groupId;
        if (gid === lid) {
          const t = F.focusTargetOf(room, focus, p);
          p.fx = t.x; p.fy = t.y;
          newlyLocked.push(u.id);
        } else {
          p.fx = R.clampCoord(u.x);
          p.fy = R.clampCoord(u.y);
        }
        p.groupId = gid;
        touched.add(gid);
      }
      let credits = {};
      if (mode === 'locked') credits = G.creditPieces(room, newlyLocked, member.memberId);
      else {
        for (const gid of touched) {
          const ids = G.idsOfGroup(room, gid);
          if (ids.length >= 2) Object.assign(credits, G.creditPieces(room, ids, member.memberId));
        }
      }
      if (Object.keys(credits).length) io.to(ctx.roomId).emit('credits_changed', { placedBy: credits });
      room.lastActivity = Date.now();
      store.markDirty();
      if (F.isFocusComplete(room, focus)) endFocusAndBroadcast(ctx.roomId, clientId, 'complete');
    });

    on('focus_end', ({ roomId }) => {
      const ctx = getCtx(roomId);
      if (ctx) endFocusAndBroadcast(ctx.roomId, ctx.clientId, 'quit');
    });

    // ---------- Déconnexion ----------
    socket.on('disconnect', () => {
      try {
        dropPendingRequest(socket);
        if (socket.data?.roomId) detachSocket(socket, 'disconnect');
      } catch (err) {
        log.error('[socket disconnect]', err);
      }
    });
  });

  // Focus laissés ouverts avant un redémarrage : rangés si personne ne revient.
  for (const [roomId, room] of Object.entries(db)) {
    for (const clientId of Object.keys(room.focuses || {})) scheduleFocusGrace(roomId, clientId);
  }

  // ============================================================
  // Musiques envoyées puis jamais adoptées (proposition refusée, oubliée,
  // remplacée...) : supprimées après un délai, sauf si une partie ou une
  // demande de réglage en cours s'en sert encore. Les images ne sont pas
  // concernées : elles partent avec leur partie.
  // ============================================================
  function sweepOrphanMusic(now = Date.now()) {
    const used = new Set();
    const keep = (music) => {
      if (typeof music?.url === 'string') used.add(path.basename(music.url.split(/[?#]/)[0]));
    };
    for (const room of Object.values(db)) keep(room?.settings?.customMusic);
    for (const r of runtimes.values()) for (const req of r.settingsRequests.values()) keep(req.partial?.customMusic);
    let files = [];
    try { files = fs.readdirSync(store.uploadsDir); } catch { return 0; }
    let removed = 0;
    for (const file of files) {
      if (!MUSIC_FILE_RE.test(file) || used.has(file)) continue;
      const full = path.join(store.uploadsDir, file);
      try {
        if (now - fs.statSync(full).mtimeMs < LIMITS.orphanMusicMs) continue;
        fs.unlinkSync(full);
        removed++;
      } catch { /* déjà supprimé */ }
    }
    if (removed) log.log(`${removed} musique(s) jamais utilisée(s) supprimée(s).`);
    return removed;
  }
  const firstSweep = setTimeout(sweepOrphanMusic, 5 * 60 * 1000);
  firstSweep.unref?.();
  const sweepTimer = setInterval(sweepOrphanMusic, 60 * 60 * 1000);
  sweepTimer.unref?.();

  function listen(port, host) {
    return new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)));
  }

  async function close() {
    clearInterval(pruneTimer);
    clearTimeout(firstSweep);
    clearInterval(sweepTimer);
    for (const roomId of [...runtimes.keys()]) disposeRuntime(roomId);
    io.close();
    await new Promise((resolve) => server.close(() => resolve()));
    await store.flushNow();
  }

  return { app, server, io, db, store, listen, close, sweepOrphanMusic };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001;
  // HOST=127.0.0.1 en production : seul le proxy (Caddy) parle au serveur.
  const host = process.env.HOST || undefined;
  const puzzle = createPuzzleServer();
  puzzle.listen(port, host).then((p) => console.log(`Serveur lancé sur http://${host || 'localhost'}:${p}`));
  const shutdown = () => {
    puzzle.store.flushSync();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createPuzzleServer };
