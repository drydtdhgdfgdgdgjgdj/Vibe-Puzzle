// ============================================================
// Groupes de pièces : voisinage dans la grille, composantes connexes,
// passage d'un mode d'assemblage à l'autre, rangement de la table,
// crédits et détection de fin de partie.
// ============================================================
const crypto = require('crypto');
const { LOCKED } = require('./constants');
const L = require('./layout');

const NEIGHBOR_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function newGroupId() {
  return `g_${crypto.randomBytes(5).toString('hex')}`;
}

function gridIndex(room) {
  const idx = new Map();
  for (const [id, p] of Object.entries(room.pieces)) idx.set(`${p.c},${p.r}`, id);
  return idx;
}

// Map groupId -> [pieceId] (avec filtre optionnel).
function groupMap(room, filter = () => true) {
  const map = new Map();
  for (const [id, p] of Object.entries(room.pieces)) {
    if (!filter(p, id)) continue;
    let list = map.get(p.groupId);
    if (!list) { list = []; map.set(p.groupId, list); }
    list.push(id);
  }
  return map;
}

function idsOfGroup(room, groupId) {
  return Object.keys(room.pieces).filter((id) => room.pieces[id].groupId === groupId);
}

// Morceaux d'un seul tenant (voisins haut/bas/gauche/droite) dans un ensemble de pièces.
function connectedComponents(room, idSet, index = gridIndex(room)) {
  const seen = new Set();
  const comps = [];
  for (const start of idSet) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop();
      comp.push(id);
      const p = room.pieces[id];
      for (const [dc, dr] of NEIGHBOR_STEPS) {
        const nid = index.get(`${p.c + dc},${p.r + dr}`);
        if (nid && idSet.has(nid) && !seen.has(nid)) { seen.add(nid); stack.push(nid); }
      }
    }
    comps.push(comp);
  }
  return comps;
}

function isEdgePiece(room, p) {
  return p.c === 0 || p.r === 0 || p.c === room.cols - 1 || p.r === room.rows - 1;
}

function creditPieces(room, ids, memberId) {
  const credits = {};
  if (!memberId) return credits;
  for (const id of ids) {
    const p = room.pieces[id];
    if (p && !p.placedBy) { p.placedBy = memberId; credits[id] = memberId; }
  }
  return credits;
}

// ------------------------------------------------------------
// Placement sans chevauchement (pièces seules et blocs entiers)
// ------------------------------------------------------------
function occupancyFor(room, m, skip) {
  const grid = new L.OccupancyGrid(room.table, Math.max(m.pw, m.ph) * 0.5);
  for (const [id, p] of Object.entries(room.pieces)) {
    if (skip.has(id) || p.focusOwner) continue;
    grid.mark(L.pieceRect(p.x, p.y, m));
  }
  return grid;
}

function frameExclusion(room, m) {
  return L.expandRect(L.frameRect(room), L.layoutParams(m.pw, m.ph).margin);
}

// items : [{ p, x, y }] — positions relatives conservées (bloc assemblé).
function placeBlock(room, grid, items, m, { avoid = [], near = null, rng = Math.random } = {}) {
  const rect = L.blockRect(items, m);
  const spot = grid.findSpot(rect.w, rect.h, { avoid, near, rng }) || L.fallbackSpot(room.table, rect.w, rect.h, avoid, rng);
  const dx = spot.x - rect.x;
  const dy = spot.y - rect.y;
  for (const it of items) { it.p.x = it.x + dx; it.p.y = it.y + dy; }
  grid.mark({ x: spot.x, y: spot.y, w: rect.w, h: rect.h });
}

// Pièces seules : redispersées au hasard sur la table, loin des autres
// pièces (et des zones `avoid`), sans alignement en grille.
function placeSingles(room, grid, pieces, m, { avoid = [], rng = Math.random } = {}) {
  if (!pieces.length) return;
  const moving = new Set(pieces);
  const existing = [];
  for (const p of Object.values(room.pieces)) {
    if (moving.has(p) || p.focusOwner) continue;
    existing.push({ x: p.x + m.pw / 2, y: p.y + m.ph / 2 });
  }
  const positions = L.bestCandidateScatter({ area: room.table, exclusion: avoid, count: pieces.length, pw: m.pw, ph: m.ph, existing, rng });
  pieces.forEach((p, i) => {
    p.x = positions[i].x;
    p.y = positions[i].y;
    grid.mark(L.pieceRect(p.x, p.y, m));
  });
}

// ------------------------------------------------------------
// Changements de mode d'assemblage
// ------------------------------------------------------------

// Accroché -> libre : les pièces fixées deviennent des blocs déplaçables,
// un bloc par morceau d'un seul tenant (elles restent où elles sont).
function convertToFree(room) {
  const lockedIds = new Set(Object.keys(room.pieces).filter((id) => room.pieces[id].groupId === LOCKED));
  const changed = [];
  for (const comp of connectedComponents(room, lockedIds)) {
    const gid = comp.length === 1 ? comp[0] : newGroupId();
    for (const id of comp) { room.pieces[id].groupId = gid; changed.push(id); }
  }
  return changed;
}

// Libre -> accroché : chaque bloc d'au moins 2 pièces vole à sa place dans
// le cadre ; une pièce seule déjà (presque) à sa place s'y fixe ; les
// pièces seules qui encombrent le cadre en sont poussées vers la table.
function convertToLocked(room, { rng = Math.random } = {}) {
  const m = L.pieceMetrics(room);
  const snapDist = 0.3 * Math.min(m.pw, m.ph);
  const changed = new Set();
  const groups = groupMap(room, (p) => p.groupId !== LOCKED && !p.focusOwner);

  for (const ids of groups.values()) {
    if (ids.length >= 2) {
      for (const id of ids) {
        const p = room.pieces[id];
        const t = L.targetOf(room, p);
        p.x = t.x; p.y = t.y; p.groupId = LOCKED;
        changed.add(id);
      }
    } else {
      const p = room.pieces[ids[0]];
      const t = L.targetOf(room, p);
      if (Math.hypot(p.x - t.x, p.y - t.y) < snapDist) {
        p.x = t.x; p.y = t.y; p.groupId = LOCKED;
        changed.add(ids[0]);
      }
    }
  }

  const frameZone = L.expandRect(L.frameRect(room), m.ts);
  const toMove = [];
  for (const [id, p] of Object.entries(room.pieces)) {
    if (p.groupId === LOCKED || p.focusOwner) continue;
    if (L.rectsOverlap(L.pieceRect(p.x, p.y, m), frameZone)) toMove.push(id);
  }
  if (toMove.length) {
    const grid = occupancyFor(room, m, new Set(toMove));
    placeSingles(room, grid, toMove.map((id) => room.pieces[id]), m, { avoid: [frameExclusion(room, m)], rng });
    toMove.forEach((id) => changed.add(id));
  }
  return [...changed];
}

// "Ranger la table" : les pièces seules (ni tenues, ni en focus) sont
// redispersées dans des cases libres. Les blocs ne bougent pas.
function tidyTable(room, { exclude = new Set(), rng = Math.random } = {}) {
  const m = L.pieceMetrics(room);
  const groups = groupMap(room, (p) => p.groupId !== LOCKED && !p.focusOwner);
  const singles = [];
  for (const ids of groups.values()) {
    if (ids.length === 1 && !exclude.has(ids[0])) singles.push(ids[0]);
  }
  if (!singles.length) return [];
  const grid = occupancyFor(room, m, new Set(singles));
  placeSingles(room, grid, L.shuffle(singles.map((id) => room.pieces[id]), rng), m, { avoid: [frameExclusion(room, m)], rng });
  return singles;
}

// ------------------------------------------------------------
// Fin de partie
// ------------------------------------------------------------
function isComplete(room) {
  const pieces = Object.values(room.pieces);
  if (!pieces.length) return false;
  if (pieces.some((p) => p.focusOwner)) return false;
  if (room.settings.lockMode === 'locked') return pieces.every((p) => p.groupId === LOCKED);
  const g = pieces[0].groupId;
  return pieces.every((p) => p.groupId === g);
}

module.exports = {
  NEIGHBOR_STEPS,
  newGroupId,
  gridIndex,
  groupMap,
  idsOfGroup,
  connectedComponents,
  isEdgePiece,
  creditPieces,
  occupancyFor,
  frameExclusion,
  placeBlock,
  placeSingles,
  convertToFree,
  convertToLocked,
  tidyTable,
  isComplete,
};
