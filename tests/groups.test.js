const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../lib/groups');
const L = require('../lib/layout');
const { LOCKED } = require('../lib/constants');
const { makeRoom, lockPieces, assemble } = require('./helpers');

test('composantes connexes : voisins haut/bas/gauche/droite uniquement', () => {
  const room = makeRoom({ cols: 4, rows: 3 });
  const ids = new Set(['piece_0_0', 'piece_1_0', 'piece_1_1', 'piece_3_2', 'piece_2_2']);
  const comps = G.connectedComponents(room, ids).map((c) => c.sort());
  comps.sort((a, b) => b.length - a.length);
  assert.deepEqual(comps, [['piece_0_0', 'piece_1_0', 'piece_1_1'], ['piece_2_2', 'piece_3_2']]);
});

test('accroché -> libre : chaque morceau fixé devient un bloc, sans bouger', () => {
  const room = makeRoom({ cols: 4, rows: 3 });
  lockPieces(room, ['piece_0_0', 'piece_1_0', 'piece_0_1', 'piece_3_2']);
  const before = JSON.parse(JSON.stringify(room.pieces));
  const changed = G.convertToFree(room);
  assert.equal(changed.length, 4);
  const block = ['piece_0_0', 'piece_1_0', 'piece_0_1'].map((id) => room.pieces[id].groupId);
  assert.ok(block.every((g) => g === block[0] && g !== LOCKED));
  assert.equal(room.pieces.piece_3_2.groupId, 'piece_3_2', 'une pièce seule reprend son propre groupe');
  for (const id of Object.keys(room.pieces)) {
    assert.equal(room.pieces[id].x, before[id].x);
    assert.equal(room.pieces[id].y, before[id].y);
  }
  assert.ok(Object.values(room.pieces).every((p) => p.groupId !== LOCKED));
});

test('libre -> accroché : les blocs volent au cadre, le cadre est dégagé', () => {
  const room = makeRoom({ cols: 4, rows: 3, lockMode: 'free' });
  // Bloc de 2 pièces assemblé loin du cadre.
  assemble(room, ['piece_0_0', 'piece_1_0'], -900, 300, 'g_pair');
  // Pièce seule presque à sa place.
  const near = room.pieces.piece_3_2;
  const tNear = L.targetOf(room, near);
  near.x = tNear.x + 5; near.y = tNear.y - 4;
  // Pièce seule posée au milieu du cadre, loin de sa propre place.
  const intruder = room.pieces.piece_0_2;
  const frame = L.frameRect(room);
  intruder.x = frame.x + frame.w / 2; intruder.y = frame.y + 10;

  const changed = G.convertToLocked(room);
  for (const id of ['piece_0_0', 'piece_1_0', 'piece_3_2']) {
    const p = room.pieces[id];
    const t = L.targetOf(room, p);
    assert.equal(p.groupId, LOCKED, `${id} doit être fixée`);
    assert.equal(p.x, t.x);
    assert.equal(p.y, t.y);
    assert.ok(changed.includes(id));
  }
  assert.notEqual(intruder.groupId, LOCKED);
  assert.ok(changed.includes('piece_0_2'));
  const m = L.pieceMetrics(room);
  assert.ok(!L.rectsOverlap(L.pieceRect(intruder.x, intruder.y, m), frame), 'la pièce gênante doit quitter le cadre');
  const t = room.table;
  assert.ok(intruder.x >= t.x && intruder.x + m.pw <= t.x + t.w, 'la pièce reste sur la table');
});

test('fin de partie selon le mode', () => {
  const room = makeRoom({ cols: 3, rows: 2 });
  assert.equal(G.isComplete(room), false);
  lockPieces(room, Object.keys(room.pieces));
  assert.equal(G.isComplete(room), true);

  const free = makeRoom({ cols: 3, rows: 2, lockMode: 'free' });
  assemble(free, Object.keys(free.pieces).slice(0, 5), 100, 100, 'g_big');
  assert.equal(G.isComplete(free), false);
  assemble(free, Object.keys(free.pieces), 100, 100, 'g_big');
  assert.equal(G.isComplete(free), true);
});

test('ranger la table : seules les pièces seules bougent', () => {
  const room = makeRoom({ cols: 5, rows: 4 });
  assemble(room, ['piece_0_0', 'piece_1_0'], -700, 0, 'g_keep');
  lockPieces(room, ['piece_4_3']);
  const before = JSON.parse(JSON.stringify(room.pieces));
  const changed = G.tidyTable(room, { exclude: new Set(['piece_2_2']) });
  assert.ok(!changed.includes('piece_0_0') && !changed.includes('piece_1_0'));
  assert.ok(!changed.includes('piece_4_3'));
  assert.ok(!changed.includes('piece_2_2'), 'une pièce tenue en main ne bouge pas');
  assert.equal(room.pieces.piece_0_0.x, before.piece_0_0.x);
  assert.equal(changed.length, 20 - 2 - 1 - 1);
});

test('crédits : seules les pièces non créditées sont attribuées', () => {
  const room = makeRoom({ cols: 2, rows: 2 });
  room.pieces.piece_0_0.placedBy = 'm_aaaaaaaa';
  const credits = G.creditPieces(room, ['piece_0_0', 'piece_1_0'], 'm_bbbbbbbb');
  assert.deepEqual(credits, { piece_1_0: 'm_bbbbbbbb' });
  assert.equal(room.pieces.piece_0_0.placedBy, 'm_aaaaaaaa');
});
