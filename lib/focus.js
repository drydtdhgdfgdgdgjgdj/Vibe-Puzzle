// ============================================================
// Mode Focus : un joueur réserve une zone rectangulaire du puzzle
// (~25/50/100 pièces) et l'assemble dans une mini-room par-dessus la
// grande. Les pièces réservées ont des coordonnées propres au focus
// (fx, fy) : le mini-cadre est à l'origine, la mini-table autour.
// ============================================================
const { LOCKED, FOCUS_LOCK_PREFIX } = require('./constants');
const L = require('./layout');
const G = require('./groups');

function focusLockId(memberId) {
  return `${FOCUS_LOCK_PREFIX}${memberId}`;
}

function focusTargetOf(room, focus, piece) {
  const { pw, ph } = L.pieceMetrics(room);
  return { x: (piece.c - focus.rect.c0) * pw, y: (piece.r - focus.rect.r0) * ph };
}

// Dimensions (colonnes × lignes) d'une zone d'environ `size` pièces,
// à peu près carrée à l'écran.
function focusDims(room, size) {
  const { pw, ph } = L.pieceMetrics(room);
  const fc = Math.max(2, Math.min(room.cols, Math.round(Math.sqrt((size * ph) / pw))));
  const fr = Math.max(2, Math.min(room.rows, Math.round(size / fc)));
  return { fc, fr };
}

// Choisit une zone au hasard (pondérée par le travail restant) où :
//  - aucune pièce n'est réservée par un autre focus, ni tenue en main ;
//  - tout bloc qui touche la zone y est entièrement contenu ;
//  - au moins 40 % des pièces restent à placer.
// Si rien ne convient, on réessaie avec une zone plus petite.
function pickFocusRect(room, size, { blocked = new Set(), rng = Math.random } = {}) {
  const index = G.gridIndex(room);
  const { pw, ph } = L.pieceMetrics(room);

  const boxes = new Map();
  for (const [gid, ids] of G.groupMap(room, (p) => p.groupId !== LOCKED)) {
    if (ids.length < 2) continue;
    const box = { c0: Infinity, r0: Infinity, c1: -Infinity, r1: -Infinity };
    for (const id of ids) {
      const p = room.pieces[id];
      box.c0 = Math.min(box.c0, p.c); box.r0 = Math.min(box.r0, p.r);
      box.c1 = Math.max(box.c1, p.c); box.r1 = Math.max(box.r1, p.r);
    }
    boxes.set(gid, box);
  }

  let { fc, fr } = focusDims(room, size);
  for (let guard = 0; guard < 400; guard++) {
    const candidates = [];
    for (let r0 = 0; r0 + fr <= room.rows; r0++) {
      for (let c0 = 0; c0 + fc <= room.cols; c0++) {
        let work = 0;
        let ok = true;
        const touched = new Set();
        for (let c = c0; ok && c < c0 + fc; c++) {
          for (let r = r0; r < r0 + fr; r++) {
            const id = index.get(`${c},${r}`);
            const p = id && room.pieces[id];
            if (!p || p.focusOwner || blocked.has(id)) { ok = false; break; }
            if (p.groupId === LOCKED) continue;
            work++;
            if (boxes.has(p.groupId)) touched.add(p.groupId);
          }
        }
        if (!ok) continue;
        for (const gid of touched) {
          const b = boxes.get(gid);
          if (b.c0 < c0 || b.r0 < r0 || b.c1 > c0 + fc - 1 || b.r1 > r0 + fr - 1) { ok = false; break; }
        }
        if (ok && work >= Math.max(2, Math.ceil(0.4 * fc * fr))) candidates.push({ c0, r0, work });
      }
    }

    if (candidates.length) {
      const total = candidates.reduce((s, c) => s + c.work, 0);
      let t = rng() * total;
      let chosen = candidates[candidates.length - 1];
      for (const cand of candidates) {
        t -= cand.work;
        if (t <= 0) { chosen = cand; break; }
      }
      return { c0: chosen.c0, r0: chosen.r0, c1: chosen.c0 + fc - 1, r1: chosen.r0 + fr - 1 };
    }

    if (fc <= 2 && fr <= 2) return null;
    if (fr <= 2 || (fc > 2 && fc * pw >= fr * ph)) fc--;
    else fr--;
  }
  return null;
}

// Réserve une zone et dispose ses pièces sur la mini-table du focus.
function startFocus(room, clientId, memberId, size, aspect, { blocked = new Set(), rng = Math.random } = {}) {
  const rect = pickFocusRect(room, size, { blocked, rng });
  if (!rect) return null;

  const m = L.pieceMetrics(room);
  const miniFrame = { x: 0, y: 0, w: (rect.c1 - rect.c0 + 1) * m.pw, h: (rect.r1 - rect.r0 + 1) * m.ph };
  const index = G.gridIndex(room);
  const work = [];
  const context = [];
  for (let c = rect.c0; c <= rect.c1; c++) {
    for (let r = rect.r0; r <= rect.r1; r++) {
      const id = index.get(`${c},${r}`);
      if (room.pieces[id].groupId === LOCKED) context.push(id);
      else work.push(id);
    }
  }

  const { table } = L.computeTable(miniFrame, m.pw, m.ph, work.length, aspect);
  const { margin } = L.layoutParams(m.pw, m.ph);
  const exclusion = L.expandRect(miniFrame, margin);
  const grid = new L.OccupancyGrid(table, Math.max(m.pw, m.ph) * 0.5);
  const focusShell = { rect };

  // Les blocs déjà assemblés gardent leur forme.
  const byGroup = new Map();
  for (const id of work) {
    const gid = room.pieces[id].groupId;
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid).push(id);
  }
  const blocks = [...byGroup.values()].filter((ids) => ids.length >= 2).sort((a, b) => b.length - a.length);
  const singles = [...byGroup.values()].filter((ids) => ids.length === 1).map((ids) => ids[0]);

  for (const ids of blocks) {
    const items = ids.map((id) => ({ id, ...focusTargetOf(room, focusShell, room.pieces[id]) }));
    const r = L.blockRect(items, m);
    const spot = grid.findSpot(r.w, r.h, { avoid: [exclusion], rng }) || L.fallbackSpot(table, r.w, r.h, [exclusion], rng);
    for (const it of items) {
      room.pieces[it.id].fx = it.x + spot.x - r.x;
      room.pieces[it.id].fy = it.y + spot.y - r.y;
    }
    grid.mark({ x: spot.x, y: spot.y, w: r.w, h: r.h });
  }

  // Pièces seules : au hasard sur la mini-table, loin des blocs déjà posés.
  const blockCenters = blocks.flat().map((id) => ({ x: room.pieces[id].fx + m.pw / 2, y: room.pieces[id].fy + m.ph / 2 }));
  const positions = L.bestCandidateScatter({ area: table, exclusion: [exclusion], count: singles.length, pw: m.pw, ph: m.ph, existing: blockCenters, rng });
  singles.forEach((id, i) => {
    room.pieces[id].fx = positions[i].x;
    room.pieces[id].fy = positions[i].y;
  });

  for (const id of work) room.pieces[id].focusOwner = clientId;
  const focus = { ownerMemberId: memberId, rect, pieceIds: work, contextIds: context, table, miniFrame, createdAt: Date.now() };
  room.focuses[clientId] = focus;
  return focus;
}

function isFocusComplete(room, focus) {
  const ids = focus.pieceIds.filter((id) => room.pieces[id]);
  if (!ids.length) return true;
  if (room.settings.lockMode === 'locked') {
    const lid = focusLockId(focus.ownerMemberId);
    return ids.every((id) => room.pieces[id].groupId === lid);
  }
  if (ids.length === 1) return true;
  const g = room.pieces[ids[0]].groupId;
  return ids.every((id) => room.pieces[id].groupId === g);
}

// Termine un focus ('complete', 'quit' ou 'timeout') et reverse ses pièces
// dans la grande room :
//  - mode accroché : ce qui est posé dans le mini-cadre se fixe dans le grand ;
//  - mode libre et zone finie : le bloc se pose à sa vraie place si elle est
//    libre, sinon à la place libre la plus proche ;
//  - le reste retourne sur la table en gardant les blocs formés.
function endFocus(room, clientId, reason, { rng = Math.random } = {}) {
  const focus = room.focuses[clientId];
  if (!focus) return null;
  const m = L.pieceMetrics(room);
  const memberId = focus.ownerMemberId;
  const lid = focusLockId(memberId);
  const ids = focus.pieceIds.filter((id) => room.pieces[id]);
  const mode = room.settings.lockMode;
  const placedIntoFrame = [];
  let freeLockGroup = null;

  for (const id of ids) {
    const p = room.pieces[id];
    if (p.groupId !== lid) continue;
    if (mode === 'locked') {
      const t = L.targetOf(room, p);
      p.x = t.x; p.y = t.y; p.groupId = LOCKED;
      placedIntoFrame.push(id);
    } else {
      freeLockGroup = freeLockGroup || G.newGroupId();
      p.groupId = freeLockGroup;
    }
  }
  const credits = G.creditPieces(room, placedIntoFrame, memberId);

  const rest = ids.filter((id) => room.pieces[id].groupId !== LOCKED);
  const grid = G.occupancyFor(room, m, new Set(ids));
  const avoid = [G.frameExclusion(room, m)];
  const byGroup = new Map();
  for (const id of rest) {
    const gid = room.pieces[id].groupId;
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid).push(id);
  }
  const blocks = [...byGroup.values()].sort((a, b) => b.length - a.length);
  const singles = [];
  for (const block of blocks) {
    if (block.length === 1) { singles.push(room.pieces[block[0]]); continue; }
    const items = block.map((id) => {
      const p = room.pieces[id];
      return { p, x: p.fx ?? p.x, y: p.fy ?? p.y };
    });
    if (mode === 'free' && reason === 'complete' && block.length === rest.length) {
      const targets = block.map((id) => ({ p: room.pieces[id], ...L.targetOf(room, room.pieces[id]) }));
      const rt = L.blockRect(targets, m);
      if (grid.isFree(rt)) {
        for (const t of targets) { t.p.x = t.x; t.p.y = t.y; }
        grid.mark(rt);
      } else {
        G.placeBlock(room, grid, items, m, { near: { x: rt.x + rt.w / 2, y: rt.y + rt.h / 2 }, rng });
      }
      continue;
    }
    G.placeBlock(room, grid, items, m, { avoid, rng });
  }
  // Les blocs reposés comptent désormais comme pièces de la grande room :
  // les pièces seules se dispersent en les évitant.
  for (const id of ids) delete room.pieces[id].focusOwner;
  G.placeSingles(room, grid, singles, m, { avoid, rng });

  for (const id of ids) {
    const p = room.pieces[id];
    delete p.focusOwner;
    delete p.fx;
    delete p.fy;
  }
  delete room.focuses[clientId];
  return { changedIds: ids, credits, placedIntoFrame };
}

module.exports = {
  focusLockId,
  focusTargetOf,
  focusDims,
  pickFocusRect,
  startFocus,
  isFocusComplete,
  endFocus,
};
