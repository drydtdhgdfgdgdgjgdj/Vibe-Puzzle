// ============================================================
// Mise à niveau des parties enregistrées (format v2) au démarrage :
// champs manquants des anciennes parties, images base64 -> fichiers,
// identifiants publics des membres, crédits rattachés aux membres
// plutôt qu'aux pseudos, et grande table de dispersion.
// ============================================================
const { DEFAULT_SETTINGS } = require('./constants');
const L = require('./layout');
const R = require('./rooms');

// Table englobant toutes les pièces actuelles, centrée sur le cadre
// (pour les parties créées avant la dispersion en rectangle).
function legacyTable(room) {
  const frame = L.frameRect(room);
  const m = L.pieceMetrics(room);
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  let hw = frame.w / 2 + 2 * Math.max(m.pw, m.ph);
  let hh = frame.h / 2 + 2 * Math.max(m.pw, m.ph);
  for (const p of Object.values(room.pieces)) {
    hw = Math.max(hw, Math.abs(p.x - m.ts - cx), Math.abs(p.x + m.pw + m.ts - cx));
    hh = Math.max(hh, Math.abs(p.y - m.ts - cy), Math.abs(p.y + m.ph + m.ts - cy));
  }
  hw += m.pw;
  hh += m.ph;
  return { x: cx - hw, y: cy - hh, w: 2 * hw, h: 2 * hh };
}

function migrateRoom(roomId, room, { images, now = Date.now() }) {
  const before = JSON.stringify(room);

  room.version = 2;
  if (!room.pieces || typeof room.pieces !== 'object') room.pieces = {};
  room.settings = { ...DEFAULT_SETTINGS, ...(room.settings || {}) };
  if (room.settings.lockMode !== 'free') room.settings.lockMode = 'locked';
  room.members = room.members && typeof room.members === 'object' ? room.members : {};
  room.pendingRequests = {}; // sockets d'avant le redémarrage : périmés
  room.focuses = room.focuses && typeof room.focuses === 'object' ? room.focuses : {};
  delete room.hints;
  delete room.pendingHelpFrom;
  room.creatorClientId = room.creatorClientId || null;
  room.startTime = room.startTime || now;
  room.endTime = room.endTime || null;
  if (typeof room.playTimeMs !== 'number') room.playTimeMs = 0;
  if (room.endTime && typeof room.finalPlayTimeMs !== 'number') {
    room.finalPlayTimeMs = Math.max(0, room.endTime - room.startTime);
  }
  room.lastActivity = room.lastActivity || room.endTime || room.startTime;

  const byPseudo = new Map();
  for (const [clientId, m] of Object.entries(room.members)) {
    if (!m.memberId) m.memberId = R.newMemberId();
    m.role = clientId === room.creatorClientId ? 'host' : (m.role === 'cohost' ? 'cohost' : 'guest');
    m.accepted = !!m.accepted;
    m.removed = !!m.removed;
    m.banned = !!m.banned;
    m.pseudo = (m.pseudo || 'Joueur').slice(0, 20);
    m.joinedAt = m.joinedAt || room.startTime;
    byPseudo.set(m.pseudo.trim().toLowerCase(), m.memberId);
  }

  for (const [clientId, focus] of Object.entries(room.focuses)) {
    if (!room.members[clientId] || !Array.isArray(focus?.pieceIds)) delete room.focuses[clientId];
  }

  for (const [id, p] of Object.entries(room.pieces)) {
    if (!p.groupId) p.groupId = id;
    if (!p.shape) p.shape = { topTab: 0, bottomTab: 0, leftTab: 0, rightTab: 0 };
    if (p.placedBy && !R.MEMBER_ID_RE.test(p.placedBy)) {
      const memberId = byPseudo.get(String(p.placedBy).trim().toLowerCase());
      if (memberId) p.placedBy = memberId;
    }
    if (p.focusOwner && !room.focuses[p.focusOwner]) {
      delete p.focusOwner;
      delete p.fx;
      delete p.fy;
    }
  }

  // Images base64 -> fichiers (une seule copie si les deux sont identiques).
  if (images.isDataUrl(room.originalImageUrl)) {
    const same = room.imageUrl === room.originalImageUrl;
    room.originalImageUrl = images.save(room.originalImageUrl, `${roomId}-orig`);
    if (same) room.imageUrl = room.originalImageUrl;
  }
  if (images.isDataUrl(room.imageUrl)) room.imageUrl = images.save(room.imageUrl, `${roomId}-game`);
  if (images.isDataUrl(room.thumbUrl)) room.thumbUrl = images.save(room.thumbUrl, `${roomId}-thumb`);
  room.originalImageUrl = room.originalImageUrl || room.imageUrl;
  room.thumbUrl = room.thumbUrl || room.imageUrl;
  room.name = room.name || `Puzzle de ${room.cols * room.rows} pièces`;

  if (!room.table) room.table = legacyTable(room);
  delete room.scatterRadius;

  return JSON.stringify(room) !== before;
}

// Les parties impossibles à lire sont retirées de la base active mais
// renvoyées dans `broken` pour être mises de côté (jamais perdues).
function migrateDatabase(db, { images, log = console }) {
  let changed = false;
  const broken = {};
  for (const [roomId, room] of Object.entries(db)) {
    try {
      if (migrateRoom(roomId, room, { images })) changed = true;
    } catch (err) {
      log.warn(`Partie ${roomId} mise de côté (format inattendu : ${err.message}).`);
      broken[roomId] = room;
      delete db[roomId];
      changed = true;
    }
  }
  return { changed, broken };
}

module.exports = { migrateDatabase, migrateRoom, legacyTable };
