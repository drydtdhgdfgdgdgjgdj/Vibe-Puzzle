// ============================================================
// Petits utilitaires autour d'une room : membres, nettoyage des
// entrées venant des clients, et payloads envoyés aux navigateurs.
// Aucun clientId (identité secrète d'un joueur) ne sort d'ici : les
// clients ne voient que des memberId publics.
// ============================================================
const crypto = require('crypto');
const { DEFAULT_SETTINGS, LOCKED } = require('./constants');

const MEMBER_ID_RE = /^m_[0-9a-f]{8}$/;

function newMemberId() {
  return `m_${crypto.randomBytes(4).toString('hex')}`;
}

// Codes de partie lisibles à voix haute : pas de l/1 ni o/0.
const ROOM_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function newRoomId(existing) {
  for (;;) {
    let id = '';
    for (let i = 0; i < 7; i++) id += ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)];
    if (!existing[id]) return id;
  }
}

function isStaffRole(role) {
  return role === 'host' || role === 'cohost';
}

function isActiveMember(member) {
  return !!member && member.accepted && !member.removed;
}

function findMember(room, memberId) {
  for (const [clientId, m] of Object.entries(room.members)) {
    if (m.memberId === memberId) return { clientId, member: m };
  }
  return null;
}

// ---------- Nettoyage des entrées ----------
function cleanString(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanRoomId(value) {
  const s = cleanString(value, 20);
  return /^[a-z0-9]+$/i.test(s) ? s : '';
}

function cleanClientId(value) {
  const s = cleanString(value, 100);
  return /^[\w-]+$/.test(s) ? s : '';
}

function sanitizePseudo(value) {
  return cleanString(value, 20).replace(/\s+/g, ' ');
}

function sanitizeColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function sanitizeCursorShape(value) {
  const s = cleanString(value, 20);
  return /^[a-z]+$/.test(s) ? s : null;
}

function sanitizeCursorImage(value) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('data:image/png;base64,') || value.length > 200_000) return undefined;
  return value;
}

function cleanGroupId(value) {
  const s = cleanString(value, 64);
  return /^[\w:-]+$/.test(s) ? s : '';
}

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function clampCoord(n) {
  return Math.max(-100_000, Math.min(100_000, n));
}

function isPseudoTaken(room, pseudo, excludeClientId) {
  const norm = (pseudo || '').trim().toLowerCase();
  return Object.entries(room.members).some(
    ([cid, m]) => cid !== excludeClientId && isActiveMember(m) && (m.pseudo || '').trim().toLowerCase() === norm
  );
}

function uniquePseudo(room, pseudo, excludeClientId) {
  const base = (pseudo || 'Joueur').slice(0, 17);
  for (let i = 2; i < 100; i++) {
    const candidate = `${base} ${i}`;
    if (!isPseudoTaken(room, candidate, excludeClientId)) return candidate;
  }
  return `${base} ${crypto.randomBytes(2).toString('hex')}`.slice(0, 20);
}

// Musique perso : un fichier envoyé sur ce serveur, un lien direct
// (fichier ou radio en flux) ou une vidéo YouTube. null si invalide.
const UPLOADED_AUDIO_RE = /^\/uploads\/[\w-]+\.(mp3|ogg|m4a|aac|wav|flac|webm)$/;
function sanitizeCustomMusic(value) {
  if (!value || typeof value !== 'object') return null;
  const name = cleanString(value.name, 80) || 'Musique perso';
  if (value.kind === 'file') {
    const url = cleanString(value.url, 200);
    return UPLOADED_AUDIO_RE.test(url) ? { kind: 'file', url, name } : null;
  }
  if (value.kind === 'url') {
    const url = cleanString(value.url, 1000);
    return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? { kind: 'url', url, name } : null;
  }
  if (value.kind === 'youtube') {
    const youtubeId = cleanString(value.youtubeId, 11);
    return /^[\w-]{11}$/.test(youtubeId) ? { kind: 'youtube', youtubeId, name } : null;
  }
  return null;
}

// Réglages de room : liste blanche des clés et des valeurs acceptées.
function sanitizeSettings(partial, { allowHostOnly = false } = {}) {
  const out = {};
  if (!partial || typeof partial !== 'object') return out;
  if (typeof partial.background === 'string') {
    const bg = cleanString(partial.background, 40);
    if (/^[\w-]+$/.test(bg)) out.background = bg;
  }
  if (typeof partial.music === 'string') {
    const music = cleanString(partial.music, 40);
    if (/^[\w-]+$/.test(music)) out.music = music;
  }
  if (partial.customMusic !== undefined) {
    const custom = sanitizeCustomMusic(partial.customMusic);
    if (custom) out.customMusic = custom;
  }
  for (const key of ['showFrame', 'showSeams', 'ghostImage']) {
    if (typeof partial[key] === 'boolean') out[key] = partial[key];
  }
  if (partial.lockMode === 'locked' || partial.lockMode === 'free') out.lockMode = partial.lockMode;
  if (allowHostOnly && typeof partial.guestsCanEdit === 'boolean') out.guestsCanEdit = partial.guestsCanEdit;
  return out;
}

// ---------- Payloads publics ----------
function publicMembers(room, onlineClientIds = new Set()) {
  const out = {};
  for (const [clientId, m] of Object.entries(room.members)) {
    if (!m.memberId) continue;
    out[m.memberId] = {
      pseudo: m.pseudo || 'Joueur',
      color: m.color || '#5b8cff',
      role: m.role || 'guest',
      online: onlineClientIds.has(clientId),
      active: isActiveMember(m),
      banned: !!m.banned,
    };
  }
  return out;
}

function publicPiece(room, p, viewerClientId) {
  const out = {
    c: p.c, r: p.r, x: p.x, y: p.y,
    groupId: p.groupId,
    placedBy: p.placedBy || null,
    shape: p.shape,
  };
  if (p.box) { out.box = p.box; out.adj = p.adj; }
  if (p.focusOwner) {
    out.focus = room.members[p.focusOwner]?.memberId || 'unknown';
    if (p.focusOwner === viewerClientId) { out.fx = p.fx; out.fy = p.fy; }
  }
  return out;
}

function piecesSubset(room, ids, viewerClientId) {
  const out = {};
  for (const id of ids) {
    const p = room.pieces[id];
    if (p) out[id] = publicPiece(room, p, viewerClientId);
  }
  return out;
}

function publicFocus(room, clientId, focus, full) {
  const base = {
    memberId: focus.ownerMemberId,
    pseudo: room.members[clientId]?.pseudo || 'Joueur',
    color: room.members[clientId]?.color || '#5b8cff',
    rect: focus.rect,
    pieceIds: focus.pieceIds,
  };
  if (!full) return base;
  return { ...base, contextIds: focus.contextIds, table: focus.table, miniFrame: focus.miniFrame };
}

function publicRoom(room, roomId, viewerClientId, { players, onlineClientIds, elapsedMs, held }) {
  const me = room.members[viewerClientId];
  const pieces = {};
  for (const [id, p] of Object.entries(room.pieces)) pieces[id] = publicPiece(room, p, viewerClientId);
  const focuses = Object.entries(room.focuses || {})
    .filter(([cid]) => cid !== viewerClientId)
    .map(([cid, f]) => publicFocus(room, cid, f, false));
  const myFocus = room.focuses?.[viewerClientId] ? publicFocus(room, viewerClientId, room.focuses[viewerClientId], true) : null;
  return {
    roomId,
    name: room.name,
    imageUrl: room.imageUrl,
    originalImageUrl: room.originalImageUrl || room.imageUrl,
    thumbUrl: room.thumbUrl || room.originalImageUrl || room.imageUrl,
    cols: room.cols,
    rows: room.rows,
    cut: room.cut || 'classic',
    imgWidth: room.imgWidth,
    imgHeight: room.imgHeight,
    table: room.table,
    startTime: room.startTime,
    endTime: room.endTime || null,
    elapsedMs,
    settings: { ...DEFAULT_SETTINGS, ...room.settings },
    pieces,
    members: publicMembers(room, onlineClientIds),
    players,
    myMemberId: me?.memberId || null,
    myRole: me?.role || 'guest',
    myPseudo: me?.pseudo || null,
    isCreator: me?.role === 'host',
    focuses,
    myFocus,
    held,
  };
}

// Résumé d'une partie pour la liste "Mes parties" de l'accueil.
function roomSummary(room, roomId, clientId, onlineCount) {
  const member = room.members[clientId];
  const pieces = Object.values(room.pieces);
  const placed = pieces.filter((p) => p.groupId === LOCKED || p.placedBy).length;
  const host = Object.entries(room.members).find(([cid]) => cid === room.creatorClientId)?.[1];
  return {
    roomId,
    name: room.name,
    thumbUrl: room.thumbUrl || room.originalImageUrl || room.imageUrl,
    cols: room.cols,
    rows: room.rows,
    cut: room.cut || 'classic',
    total: pieces.length,
    placed,
    completed: !!room.endTime,
    role: member?.role || 'guest',
    isHost: member?.role === 'host',
    hostPseudo: host?.pseudo || null,
    lastActivity: room.lastActivity || room.startTime,
    online: onlineCount,
    lockMode: room.settings?.lockMode || 'locked',
  };
}

module.exports = {
  MEMBER_ID_RE,
  newMemberId,
  newRoomId,
  isStaffRole,
  isActiveMember,
  findMember,
  cleanString,
  cleanRoomId,
  cleanClientId,
  sanitizePseudo,
  sanitizeColor,
  sanitizeCursorShape,
  sanitizeCursorImage,
  cleanGroupId,
  finite,
  clampCoord,
  isPseudoTaken,
  uniquePseudo,
  sanitizeSettings,
  sanitizeCustomMusic,
  publicMembers,
  publicPiece,
  piecesSubset,
  publicFocus,
  publicRoom,
  roomSummary,
};
