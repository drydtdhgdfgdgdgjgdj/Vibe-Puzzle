// Découpe des pièces : cohérence entre voisines, et géométrie des pièces
// magiques vérifiée avec le vrai code de dessin de l'interface.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const S = require('../lib/shapes');
const L = require('../lib/layout');
const G = require('../lib/groups');
const { seededRng } = require('./helpers');

const loadGeometry = () => import(pathToFileURL(path.join(__dirname, '../puzzle-frontend/src/pieceGeometry.js')).href);

// Contour échantillonné d'une pièce (comme les zones cliquables du jeu).
function outline(geo, shape, w, h, steps = 6) {
  const pts = [];
  let cx = 0;
  let cy = 0;
  geo.tracePiecePath({
    moveTo(x, y) { pts.push([x, y]); cx = x; cy = y; },
    lineTo(x, y) { pts.push([x, y]); cx = x; cy = y; },
    bezierCurveTo(a, b, c, d, x, y) {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        pts.push([
          u * u * u * cx + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * x,
          u * u * u * cy + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * y,
        ]);
      }
      cx = x;
      cy = y;
    },
  }, shape, w, h);
  return pts;
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segmentsCross(p1, p2, p3, p4) {
  return cross(p3, p4, p1) * cross(p3, p4, p2) < 0 && cross(p1, p2, p3) * cross(p1, p2, p4) < 0;
}
function selfCrossings(pts) {
  const n = pts.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) count++;
    }
  }
  return count;
}
function area(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

test('découpe inconnue ou absente : classique', () => {
  assert.equal(S.cleanCut('magic'), 'magic');
  assert.equal(S.cleanCut('classic'), 'classic');
  assert.equal(S.cleanCut(undefined), 'classic');
  assert.equal(S.cleanCut('hexagones'), 'classic');
  assert.equal(S.reachOf('magic'), S.REACH.magic);
  assert.equal(S.reachOf(undefined), 0.25);
});

test('pièces classiques : une par case, languette d’un côté, encoche de l’autre', () => {
  const { gridCols, gridRows, pieces } = S.generatePieces(5, 4, 'classic', seededRng(3));
  assert.equal(gridCols, 5);
  assert.equal(gridRows, 4);
  assert.equal(pieces.length, 20);
  const at = new Map(pieces.map((p) => [`${p.c},${p.r}`, p.shape]));
  for (const p of pieces) {
    const s = p.shape;
    assert.equal(p.box, undefined);
    assert.equal(s.cut, undefined);
    if (p.c === 0) assert.equal(s.leftTab, 0);
    if (p.r === 0) assert.equal(s.topTab, 0);
    if (p.c === 4) assert.equal(s.rightTab, 0);
    else assert.equal(at.get(`${p.c + 1},${p.r}`).leftTab, -s.rightTab);
    if (p.r === 3) assert.equal(s.bottomTab, 0);
    else assert.equal(at.get(`${p.c},${p.r + 1}`).topTab, -s.bottomTab);
  }
});

test('pièces magiques : le nombre voulu, des tailles et des formes variées', () => {
  for (const [cols, rows, seed] of [[8, 6, 1], [12, 8, 2], [4, 3, 3], [20, 14, 4]]) {
    const { gridCols, gridRows, pieces } = S.generatePieces(cols, rows, 'magic', seededRng(seed));
    assert.equal(pieces.length, cols * rows, 'autant de pièces que demandé');
    assert.ok(gridCols > cols && gridRows > rows, 'grille fine plus serrée');
    const ids = new Set(pieces.map((p) => `piece_${p.c}_${p.r}`));
    assert.equal(ids.size, pieces.length, 'noms uniques');
    let cells = 0;
    for (const p of pieces) {
      const [bx, by, bw, bh] = p.box;
      assert.ok(bx >= 0 && by >= 0 && bx + bw <= gridCols && by + bh <= gridRows, 'cadre dans la grille');
      assert.ok(Math.max(bw, bh) <= 4, 'pièce pas trop longue');
      assert.ok(p.c >= bx && p.c < bx + bw && p.r >= by && p.r < by + bh, 'première case dans le cadre');
      assert.ok(p.adj.length >= 1);
      for (const n of p.adj) {
        assert.ok(ids.has(n), 'voisine existante');
        const other = pieces.find((q) => `piece_${q.c}_${q.r}` === n);
        assert.ok(other.adj.includes(`piece_${p.c}_${p.r}`), 'voisinage réciproque');
      }
      assert.equal(p.shape.cut, 'magic');
      assert.equal(p.shape.p.length, p.shape.v.length);
      assert.equal(p.shape.e.length, p.shape.p.length / 2);
      cells += bw * bh;
    }
    assert.ok(cells >= gridCols * gridRows, 'les cadres couvrent toute la grille');
  }
  // Sur un grand puzzle : des toutes petites, des grandes, des longues, et
  // un nombre de têtes qui varie beaucoup.
  const { pieces } = S.generatePieces(20, 14, 'magic', seededRng(9));
  const boxes = pieces.map((p) => p.box);
  assert.ok(boxes.some(([, , w, h]) => w === 1 && h === 1), 'des pièces d’une seule case');
  assert.ok(boxes.some(([, , w, h]) => Math.max(w, h) >= 3 && Math.min(w, h) === 1), 'des pièces longues');
  assert.ok(boxes.some(([, , w, h]) => w >= 2 && h >= 2), 'des grosses pièces');
  const knobs = pieces.map((p) => p.shape.e.filter((e) => e && e.length > 1).length);
  assert.ok(Math.max(...knobs) - Math.min(...knobs) >= 5, 'nombre de têtes très variable');
});

test('pièces magiques : contours simples, dans leur marge, qui pavent le cadre', async () => {
  const geo = await loadGeometry();
  const cases = [
    { cols: 8, rows: 6, cw: 100, ch: 100, seed: 1 },
    { cols: 8, rows: 6, cw: 100, ch: 100, seed: 2 },
    { cols: 9, rows: 6, cw: 120, ch: 90, seed: 3 },
    { cols: 6, rows: 9, cw: 80, ch: 110, seed: 4 },
  ];
  for (const { cols, rows, cw, ch, seed } of cases) {
    const { gridCols, gridRows, pieces } = S.generatePieces(cols, rows, 'magic', seededRng(seed));
    const u = Math.min(cw, ch);
    let total = 0;
    for (const p of pieces) {
      const [, , bw, bh] = p.box;
      const pts = outline(geo, p.shape, cw, ch);
      const [x0, y0] = pts[0];
      const [x1, y1] = pts.pop();
      assert.ok(Math.hypot(x1 - x0, y1 - y0) < 1e-9, 'contour fermé');
      for (const [x, y] of pts) {
        assert.ok(Math.max(-x, x - bw * cw, -y, y - bh * ch) <= S.REACH.magic * u, `pièce ${p.c},${p.r} : déborde de sa marge`);
      }
      assert.equal(selfCrossings(pts), 0, `pièce ${p.c},${p.r} (tirage ${seed}) : contour qui se croise`);
      const a = area(pts);
      assert.ok(a > 0, 'contour dans le bon sens');
      total += a;
    }
    // Côtés partagés tracés à l'identique : les aires s'additionnent exactement.
    const full = gridCols * cw * gridRows * ch;
    assert.ok(Math.abs(total - full) < 1e-6 * full, 'les pièces pavent le cadre');
  }
});

test('première version des pièces magiques (une case) : toujours dessinée', async () => {
  const geo = await loadGeometry();
  const old = { cut: 'magic', v: [0, 0, -68, 0, 13, 71, 0, -34], e: [null, [-25, 434, 1, 120, 79, 30, 122, -128], [-47, 503, -1, 117, 78, 25, 124, 159], null] };
  const pts = outline(geo, old, 100, 100);
  pts.pop();
  assert.equal(selfCrossings(pts), 0);
  assert.ok(Math.abs(area(pts) - 100 * 100) < 2500, 'environ une case');
});

test('pièces classiques : tracé inchangé', async () => {
  const geo = await loadGeometry();
  const calls = [];
  const rec = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args.map((v) => Math.round(v * 100) / 100)]) });
  geo.tracePiecePath(rec, { topTab: 1, rightTab: -1, bottomTab: 0, leftTab: 1 }, 100, 80, 20);
  assert.deepEqual(calls, [
    ['moveTo', 0, 0],
    ['lineTo', 40, 0], ['bezierCurveTo', 40, -20, 60, -20, 60, 0], ['lineTo', 100, 0],
    ['lineTo', 100, 30], ['bezierCurveTo', 80, 30, 80, 50, 100, 50], ['lineTo', 100, 80],
    ['lineTo', 0, 80],
    ['lineTo', 0, 50], ['bezierCurveTo', -20, 50, -20, 30, 0, 30], ['lineTo', 0, 0],
  ]);
  assert.equal(geo.pieceReach({ topTab: 1 }), 0.25);
  assert.equal(geo.pieceReach({ cut: 'magic' }), S.REACH.magic);
});

test('pièces de tailles variables : cible, taille, bord du cadre, voisinage', () => {
  const room = {
    imgWidth: 600, imgHeight: 400, cols: 6, rows: 4, cut: 'magic',
    pieces: {
      piece_0_0: { c: 0, r: 0, box: [0, 0, 2, 1], adj: ['piece_2_0', 'piece_0_1'], groupId: 'piece_0_0' },
      piece_2_0: { c: 2, r: 0, box: [2, 0, 1, 3], adj: ['piece_0_0', 'piece_0_1'], groupId: 'piece_2_0' },
      piece_0_1: { c: 0, r: 1, box: [0, 1, 2, 2], adj: ['piece_0_0', 'piece_2_0'], groupId: 'piece_0_1' },
    },
  };
  const m = L.pieceMetrics(room);
  assert.equal(m.pw, 100);
  assert.equal(m.ts, 100 * S.REACH.magic);
  assert.ok(m.aw > m.pw, 'pièce typique plus grande qu’une case');
  const t = L.targetOf(room, room.pieces.piece_2_0);
  assert.deepEqual(t, { x: L.frameRect(room).x + 200, y: L.frameRect(room).y });
  assert.deepEqual(L.pieceSize(m, room.pieces.piece_0_1), { w: 200, h: 200 });
  assert.deepEqual(L.pieceRect(0, 0, m, room.pieces.piece_2_0), { x: -m.ts, y: -m.ts, w: 100 + 2 * m.ts, h: 300 + 2 * m.ts });
  assert.ok(G.isEdgePiece(room, room.pieces.piece_0_1));
  const comps = G.connectedComponents(room, new Set(['piece_0_0', 'piece_0_1']));
  assert.equal(comps.length, 1, 'voisines par leur liste');
  const classic = { imgWidth: 400, imgHeight: 300, cols: 4, rows: 3, pieces: {} };
  assert.equal(L.pieceMetrics(classic).ts, 25);
  assert.equal(L.pieceMetrics({ ...classic, cut: 'magic' }).ts, 100 * S.REACH.magic);
});

// Partie magique en mémoire, construite comme à la création.
function makeMagicRoom({ cols = 6, rows = 4, seed = 5, lockMode = 'locked' } = {}) {
  const { DEFAULT_SETTINGS, CENTER } = require('../lib/constants');
  const rng = seededRng(seed);
  const { gridCols, gridRows, pieces: cut } = S.generatePieces(cols, rows, 'magic', rng);
  const imgWidth = 900;
  const imgHeight = 600;
  const cellW = imgWidth / gridCols;
  const cellH = imgHeight / gridRows;
  const frame = { x: CENTER - imgWidth / 2, y: CENTER - imgHeight / 2, w: imgWidth, h: imgHeight };
  const typical = Math.sqrt(L.meanBoxCells(cut));
  const sizes = cut.map((p) => ({ w: p.box[2] * cellW, h: p.box[3] * cellH }));
  const { table, positions } = L.scatterPieces(frame, cellW * typical, cellH * typical, cut.length, 16 / 9, rng, sizes);
  const pieces = {};
  cut.forEach((p, i) => {
    const id = `piece_${p.c}_${p.r}`;
    pieces[id] = { c: p.c, r: p.r, box: p.box, adj: p.adj, shape: p.shape, x: positions[i].x, y: positions[i].y, groupId: id, placedBy: null };
  });
  return {
    cut: 'magic', cols: gridCols, rows: gridRows, imgWidth, imgHeight, table, pieces,
    settings: { ...DEFAULT_SETTINGS, lockMode }, members: {}, focuses: {},
  };
}

test('partie magique : rangement, changement de mode, fin de partie', () => {
  const { LOCKED } = require('../lib/constants');
  const room = makeMagicRoom({ lockMode: 'free' });
  const ids = Object.keys(room.pieces);
  const m = L.pieceMetrics(room);

  // Rangement : toutes les pièces seules sont redispersées, leur cadre
  // entièrement sur la table.
  const changed = G.tidyTable(room, { rng: seededRng(1) });
  assert.equal(changed.length, ids.length);
  const t = room.table;
  for (const id of ids) {
    const p = room.pieces[id];
    const s = L.pieceSize(m, p);
    assert.ok(p.x >= t.x - 1e-6 && p.y >= t.y - 1e-6 && p.x + s.w <= t.x + t.w + 1e-6 && p.y + s.h <= t.y + t.h + 1e-6, 'dans la table');
  }

  // Deux voisines assemblées (mode libre) puis passage en mode accroché :
  // le bloc vole à sa place, chaque pièce sur son propre cadre.
  const a = ids[0];
  const b = room.pieces[a].adj[0];
  for (const id of [a, b]) {
    const t = L.targetOf(room, room.pieces[id]);
    room.pieces[id].x = t.x + 400;
    room.pieces[id].y = t.y - 900;
    room.pieces[id].groupId = 'g_bloc';
  }
  G.convertToLocked(room, { rng: seededRng(2) });
  for (const id of [a, b]) {
    const t = L.targetOf(room, room.pieces[id]);
    assert.equal(room.pieces[id].groupId, LOCKED);
    assert.ok(Math.abs(room.pieces[id].x - t.x) < 1e-9 && Math.abs(room.pieces[id].y - t.y) < 1e-9);
  }

  // Retour en mode libre : les pièces fixées d'un seul tenant forment un bloc.
  const freed = G.convertToFree(room);
  assert.deepEqual(new Set(freed), new Set([a, b]));
  assert.equal(room.pieces[a].groupId, room.pieces[b].groupId);

  // Fin de partie : toutes fixées en mode accroché.
  room.settings.lockMode = 'locked';
  for (const id of ids) room.pieces[id].groupId = LOCKED;
  assert.ok(G.isComplete(room));
});
