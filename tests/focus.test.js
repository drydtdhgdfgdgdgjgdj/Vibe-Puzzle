const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../lib/focus');
const L = require('../lib/layout');
const { LOCKED } = require('../lib/constants');
const { makeRoom, lockPieces, assemble, seededRng } = require('./helpers');

function idsIn(rect) {
  const ids = [];
  for (let c = rect.c0; c <= rect.c1; c++) for (let r = rect.r0; r <= rect.r1; r++) ids.push(`piece_${c}_${r}`);
  return ids;
}

test('la zone de focus évite les pièces bloquées et ne coupe aucun bloc', () => {
  const room = makeRoom({ cols: 10, rows: 8, imgWidth: 1000, imgHeight: 800 });
  assemble(room, ['piece_4_4', 'piece_5_4', 'piece_6_4'], 600, 0, 'g_row');
  for (let seed = 1; seed < 30; seed++) {
    const rect = F.pickFocusRect(room, 16, { blocked: new Set(['piece_0_0']), rng: seededRng(seed) });
    assert.ok(rect);
    const ids = idsIn(rect);
    assert.ok(!ids.includes('piece_0_0'));
    const touches = ['piece_4_4', 'piece_5_4', 'piece_6_4'].filter((id) => ids.includes(id));
    assert.ok(touches.length === 0 || touches.length === 3, 'un bloc est entièrement dedans ou dehors');
  }
});

test('plus de zone disponible quand tout est fixé', () => {
  const room = makeRoom({ cols: 4, rows: 4 });
  lockPieces(room, Object.keys(room.pieces));
  assert.equal(F.pickFocusRect(room, 9), null);
});

test('démarrer un focus réserve les pièces et les dispose sur la mini-table', () => {
  const room = makeRoom({ cols: 10, rows: 8, imgWidth: 1000, imgHeight: 800 });
  lockPieces(room, ['piece_0_0']);
  const focus = F.startFocus(room, 'client-a', 'm_aaaaaaaa', 25, 16 / 9, { rng: seededRng(3) });
  assert.ok(focus);
  assert.equal(room.focuses['client-a'], focus);
  const m = L.pieceMetrics(room);
  const { margin } = L.layoutParams(m.pw, m.ph);
  const exclusion = L.expandRect(focus.miniFrame, margin);
  for (const id of focus.pieceIds) {
    const p = room.pieces[id];
    assert.equal(p.focusOwner, 'client-a');
    assert.ok(Number.isFinite(p.fx) && Number.isFinite(p.fy));
    assert.ok(!L.rectsOverlap({ x: p.fx, y: p.fy, w: m.pw, h: m.ph }, exclusion), 'pièce posée dans le mini-cadre');
  }
  for (const id of focus.contextIds) assert.equal(room.pieces[id].groupId, LOCKED);
  assert.equal(focus.pieceIds.length + focus.contextIds.length, (focus.rect.c1 - focus.rect.c0 + 1) * (focus.rect.r1 - focus.rect.r0 + 1));
});

test('quitter un focus (mode accroché) : le mini-cadre rejoint le grand cadre', () => {
  const room = makeRoom({ cols: 8, rows: 6, imgWidth: 800, imgHeight: 600 });
  const focus = F.startFocus(room, 'client-a', 'm_aaaaaaaa', 16, 16 / 9, { rng: seededRng(5) });
  const lid = F.focusLockId('m_aaaaaaaa');
  const [first, second, ...others] = focus.pieceIds;
  for (const id of [first, second]) {
    const p = room.pieces[id];
    const t = F.focusTargetOf(room, focus, p);
    p.fx = t.x; p.fy = t.y; p.groupId = lid;
  }
  assert.equal(F.isFocusComplete(room, focus), false);
  const res = F.endFocus(room, 'client-a', 'quit', { rng: seededRng(9) });
  assert.deepEqual(res.placedIntoFrame.sort(), [first, second].sort());
  for (const id of [first, second]) {
    const p = room.pieces[id];
    const t = L.targetOf(room, p);
    assert.equal(p.groupId, LOCKED);
    assert.equal(p.x, t.x);
    assert.equal(p.y, t.y);
    assert.equal(res.credits[id], 'm_aaaaaaaa');
  }
  const frame = L.frameRect(room);
  const m = L.pieceMetrics(room);
  for (const id of others) {
    const p = room.pieces[id];
    assert.equal(p.focusOwner, undefined);
    assert.equal(p.fx, undefined);
    assert.ok(!L.rectsOverlap({ x: p.x, y: p.y, w: m.pw, h: m.ph }, frame), 'les pièces restantes retournent sur la table');
  }
  assert.equal(room.focuses['client-a'], undefined);
});

test('focus terminé en mode libre : le bloc se pose à sa vraie place', () => {
  const room = makeRoom({ cols: 8, rows: 6, imgWidth: 800, imgHeight: 600, lockMode: 'free' });
  const focus = F.startFocus(room, 'client-a', 'm_aaaaaaaa', 16, 16 / 9, { rng: seededRng(11) });
  for (const id of focus.pieceIds) {
    const p = room.pieces[id];
    const t = F.focusTargetOf(room, focus, p);
    p.fx = t.x + 50; p.fy = t.y + 50; p.groupId = 'g_focus';
  }
  assert.equal(F.isFocusComplete(room, focus), true);
  F.endFocus(room, 'client-a', 'complete');
  for (const id of focus.pieceIds) {
    const p = room.pieces[id];
    const t = L.targetOf(room, p);
    assert.equal(p.groupId, 'g_focus');
    assert.ok(Math.abs(p.x - t.x) < 1e-6 && Math.abs(p.y - t.y) < 1e-6);
  }
});
