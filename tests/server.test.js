// Scénario de bout en bout avec deux vrais clients Socket.IO.
// Les écoutes sont toujours posées AVANT l'envoi qui les déclenche
// (plusieurs événements peuvent arriver dans la même trame réseau).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPuzzleServer } = require('../server');
const { io: ioClient } = require('../puzzle-frontend/node_modules/socket.io-client');

const quietLog = { log() {}, warn() {}, error: (...a) => console.error(...a) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function once(socket, event, predicate = () => true, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Pas reçu : ${event}`)); }, timeout);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

function recorder(socket) {
  const events = [];
  socket.onAny((event, payload) => events.push({ event, payload }));
  return { count: (name) => events.filter((e) => e.event === name).length, events };
}

async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puzzle-server-'));
  const srv = createPuzzleServer({ dataDir, legacyDbFile: null, log: quietLog });
  const port = await srv.listen(0);
  const url = `http://localhost:${port}`;
  const post = (p, body) => fetch(url + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json());
  return { srv, url, post };
}

test('deux joueurs : accès, prise, aide, réglages, mode, focus, exclusion', async () => {
  const { srv, url, post } = await startServer();
  const hostId = 'client-hote-secret';
  const guestId = 'client-invite-secret';
  const { roomId } = await post('/api/rooms', {
    creatorClientId: hostId, creatorPseudo: 'Hote', cols: 4, rows: 3, imgWidth: 800, imgHeight: 600,
    originalImage: '/oeuil.jpg', viewport: { w: 1600, h: 900 }, name: 'Test',
  });
  assert.ok(roomId);

  const host = ioClient(url, { transports: ['websocket'], forceNew: true });
  const guest = ioClient(url, { transports: ['websocket'], forceNew: true });
  const hostRec = recorder(host);
  const guestRec = recorder(guest);
  try {
    // ---------- Accès ----------
    let p1 = once(host, 'load_puzzle');
    host.emit('join_room', { roomId, clientId: hostId, pseudo: 'Hote' });
    const hostLoad = await p1;
    assert.equal(hostLoad.isCreator, true);
    assert.ok(Math.abs(hostLoad.table.w / hostLoad.table.h - 1600 / 900) < 1e-9);

    p1 = once(guest, 'join_pending');
    let p2 = once(host, 'join_request');
    guest.emit('join_room', { roomId, clientId: guestId, pseudo: 'Invite' });
    const pending = await p1;
    assert.equal(pending.hostOnline, true);
    const jr = await p2;
    p1 = once(guest, 'load_puzzle');
    host.emit('respond_join', { roomId, requestId: jr.requestId, accepted: true });
    const guestLoad = await p1;
    for (const payload of [hostLoad, guestLoad]) {
      const json = JSON.stringify(payload);
      assert.ok(!json.includes(hostId) && !json.includes(guestId), 'aucun clientId ne doit fuiter');
    }

    // ---------- Prise exclusive ----------
    const pieceId = 'piece_0_0';
    p1 = once(host, 'held_changed');
    guest.emit('grab', { roomId, pieceIds: [pieceId] });
    assert.deepEqual((await p1).pieceIds, [pieceId]);
    p1 = once(host, 'grab_denied');
    host.emit('grab', { roomId, pieceIds: [pieceId] });
    await p1;
    // Un lâcher sur une pièce tenue par l'autre est refusé et recalé.
    p1 = once(host, 'pieces_sync', (s) => s.reason === 'rejected');
    host.emit('drop', { roomId, updates: [{ id: pieceId, x: 0, y: 0, groupId: pieceId }] });
    assert.notEqual((await p1).pieces[pieceId].x, 0);
    p1 = once(host, 'group_dragged');
    guest.emit('drag', { roomId, dx: 10, dy: 5 });
    assert.equal((await p1).dx, 10);
    const target = { x: 2500 - 400, y: 2500 - 300 };
    p1 = once(host, 'pieces_moved');
    p2 = once(host, 'credits_changed');
    const p3 = once(host, 'held_changed', (h) => h.held === false);
    guest.emit('drop', { roomId, updates: [{ id: pieceId, x: target.x + 3, y: target.y - 2, groupId: 'LOCKED' }] });
    assert.deepEqual((await p1).updates, [{ id: pieceId, x: target.x, y: target.y, groupId: 'LOCKED' }]);
    assert.equal((await p2).placedBy[pieceId], guestLoad.myMemberId);
    await p3;

    // ---------- Aide : une seule notification par demande ----------
    p1 = once(guest, 'hint_incoming');
    host.emit('hint_request', { roomId, pieceId: 'piece_1_0', level: 1 });
    const inc = await p1;
    p1 = once(host, 'hint_response');
    guest.emit('hint_respond', { roomId, requestId: inc.requestId, accepted: true });
    const resp = await p1;
    assert.equal(resp.accepted, true);
    assert.equal(resp.level, 1);
    p1 = once(guest, 'hint_incoming');
    host.emit('hint_request', { roomId, pieceId: 'piece_1_0', level: 2 });
    const inc2 = await p1;
    assert.equal(inc2.level, 2);
    p1 = once(host, 'hint_response', (r) => r.level === 2);
    guest.emit('hint_respond', { roomId, requestId: inc2.requestId, accepted: true });
    await p1;
    await sleep(100);
    assert.equal(guestRec.count('hint_incoming'), 2);
    // Une nouvelle demande remplace l'ancienne : l'ancien toast est fermé.
    p1 = once(guest, 'hint_incoming');
    host.emit('hint_request', { roomId, pieceId: 'piece_2_0', level: 1 });
    const incA = await p1;
    p1 = once(guest, 'hint_request_closed', (c) => c.requestId === incA.requestId);
    host.emit('hint_request', { roomId, pieceId: 'piece_3_0', level: 1 });
    await p1;
    host.emit('hint_cancel', { roomId });

    // ---------- Demande de bords : accord de l'autre, 3 pièces au plus ----------
    p1 = once(host, 'hint_incoming', (h) => h.kind === 'edges');
    guest.emit('edges_request', { roomId, context: 'main' });
    const edgeAsk = await p1;
    assert.ok(edgeAsk.count >= 1 && edgeAsk.count <= 3);
    p1 = once(guest, 'edges_response');
    host.emit('hint_respond', { roomId, requestId: edgeAsk.requestId, accepted: true });
    const edges = await p1;
    assert.equal(edges.accepted, true);
    assert.ok(edges.pieceIds.length >= 1 && edges.pieceIds.length <= 3);
    for (const id of edges.pieceIds) {
      const [, c, r] = id.split('_').map(Number);
      assert.ok(c === 0 || r === 0 || c === 3 || r === 2, `${id} n'est pas une pièce de bord`);
      assert.notEqual(id, pieceId, 'une pièce déjà fixée n’est jamais proposée');
    }

    // ---------- Demande de réglage par l'invité ----------
    p1 = once(host, 'settings_request_incoming');
    guest.emit('settings_request', { roomId, partial: { background: 'night' } });
    const sreq = await p1;
    assert.equal(sreq.fromPseudo, 'Invite');
    p1 = once(guest, 'settings_request_result', (r) => r.status !== 'pending');
    p2 = once(guest, 'room_settings_changed', (s) => s.background === 'night');
    host.emit('settings_request_respond', { roomId, requestId: sreq.requestId, accepted: true });
    assert.equal((await p1).status, 'accepted');
    await p2;

    // ---------- Passage en bloc libre ----------
    p1 = once(guest, 'pieces_sync', (s) => s.reason === 'mode_change');
    host.emit('update_room_settings', { roomId, settings: { lockMode: 'free' } });
    assert.equal((await p1).pieces[pieceId].groupId, pieceId);

    // ---------- Focus ----------
    p1 = once(host, 'focus_started');
    p2 = once(guest, 'focus_update', (u) => u.active);
    host.emit('focus_start', { roomId, size: 25, aspect: 1.7 });
    const started = await p1;
    assert.ok(started.focus.pieceIds.length >= 2);
    for (const id of started.focus.pieceIds) assert.ok(Number.isFinite(started.pieces[id].fx));
    assert.equal((await p2).memberId, hostLoad.myMemberId);
    p1 = once(host, 'focus_ended');
    p2 = once(guest, 'pieces_sync', (s) => s.reason === 'focus_end');
    host.emit('focus_end', { roomId });
    assert.equal((await p1).reason, 'quit');
    await p2;

    // ---------- Mes parties ----------
    const mine = await post('/api/my-rooms', { clientId: guestId });
    assert.equal(mine.rooms.length, 1);
    assert.equal(mine.rooms[0].isHost, false);

    // ---------- Exclusion + bannissement ----------
    p1 = once(guest, 'kicked');
    host.emit('kick_member', { roomId, memberId: guestLoad.myMemberId, ban: true });
    assert.equal((await p1).banned, true);
    const before = hostRec.count('pieces_moved');
    guest.emit('grab', { roomId, pieceIds: ['piece_1_1'] });
    guest.emit('drop', { roomId, updates: [{ id: 'piece_1_1', x: 0, y: 0, groupId: 'piece_1_1' }] });
    await sleep(150);
    assert.equal(hostRec.count('pieces_moved'), before, 'un joueur exclu ne peut plus rien déplacer');
    p1 = once(guest, 'join_denied');
    guest.emit('join_room', { roomId, clientId: guestId, pseudo: 'Invite' });
    assert.equal((await p1).reason, 'banned');
    const mine2 = await post('/api/my-rooms', { clientId: guestId });
    assert.equal(mine2.rooms.length, 0);

    // ---------- Seul dans la room : aide accordée automatiquement ----------
    p1 = once(host, 'hint_response', (r) => r.pieceId === 'piece_2_1');
    host.emit('hint_request', { roomId, pieceId: 'piece_2_1', level: 1 });
    assert.equal((await p1).auto, true);
    p1 = once(host, 'edges_response');
    host.emit('edges_request', { roomId });
    const soloEdges = await p1;
    assert.equal(soloEdges.auto, true);
    assert.ok(soloEdges.pieceIds.length <= 3);

    // ---------- Suppression ----------
    p1 = once(host, 'room_deleted');
    const del = await post(`/api/rooms/${roomId}/delete`, { clientId: hostId });
    assert.equal(del.ok, true);
    await p1;
    assert.equal(srv.db[roomId], undefined);
  } finally {
    host.close();
    guest.close();
    await srv.close();
  }
});

test('reconnexion et double onglet : room_resync, ancien onglet remplacé', async () => {
  const { srv, url, post } = await startServer();
  const { roomId } = await post('/api/rooms', {
    creatorClientId: 'c-1', creatorPseudo: 'A', cols: 3, rows: 2, imgWidth: 600, imgHeight: 400, originalImage: '/ciel.jpg',
  });
  const a = ioClient(url, { transports: ['websocket'], forceNew: true });
  const b = ioClient(url, { transports: ['websocket'], forceNew: true });
  try {
    let p1 = once(a, 'load_puzzle');
    a.emit('join_room', { roomId, clientId: 'c-1', pseudo: 'A' });
    await p1;
    p1 = once(a, 'session_replaced');
    const p2 = once(b, 'room_resync');
    b.emit('join_room', { roomId, clientId: 'c-1', pseudo: 'A', resume: true });
    await p1;
    assert.equal((await p2).players.length, 1);
  } finally {
    a.close();
    b.close();
    await srv.close();
  }
});

test('déconnexion en plein glissé : les autres reçoivent les positions exactes', async () => {
  const { srv, url, post } = await startServer();
  const { roomId } = await post('/api/rooms', {
    creatorClientId: 'c-h', creatorPseudo: 'H', cols: 3, rows: 2, imgWidth: 600, imgHeight: 400, originalImage: '/ciel.jpg',
  });
  const h = ioClient(url, { transports: ['websocket'], forceNew: true });
  const g = ioClient(url, { transports: ['websocket'], forceNew: true });
  try {
    let p1 = once(h, 'load_puzzle');
    h.emit('join_room', { roomId, clientId: 'c-h', pseudo: 'H' });
    const load = await p1;
    p1 = once(h, 'join_request');
    g.emit('join_room', { roomId, clientId: 'c-g', pseudo: 'G' });
    const jr = await p1;
    p1 = once(g, 'load_puzzle');
    h.emit('respond_join', { roomId, requestId: jr.requestId, accepted: true });
    await p1;
    const id = 'piece_1_1';
    const base = load.pieces[id];
    // Les messages de glissé sont "jetables" (volatile) : on ne compte pas
    // dessus, seules les positions finales comptent.
    g.emit('grab', { roomId, pieceIds: [id] });
    g.emit('drag', { roomId, dx: 33, dy: -21 });
    await sleep(150);
    p1 = once(h, 'held_changed', (e) => e.held === false);
    g.close();
    const released = await p1;
    assert.deepEqual(released.positions, [{ id, x: base.x + 33, y: base.y - 21, groupId: id }]);
  } finally {
    h.close();
    g.close();
    await srv.close();
  }
});

test('libre -> accroché via le serveur : un bloc vole au cadre et la partie peut se finir', async () => {
  const { srv, url, post } = await startServer();
  const { roomId } = await post('/api/rooms', {
    creatorClientId: 'c-h', creatorPseudo: 'H', cols: 2, rows: 2, imgWidth: 400, imgHeight: 400, originalImage: '/ciel.jpg',
    initialSettings: { lockMode: 'free' },
  });
  const h = ioClient(url, { transports: ['websocket'], forceNew: true });
  try {
    let p1 = once(h, 'load_puzzle');
    h.emit('join_room', { roomId, clientId: 'c-h', pseudo: 'H' });
    const load = await p1;
    assert.equal(load.settings.lockMode, 'free');
    // Assemble toutes les pièces en un bloc décalé : partie finie en mode libre.
    const ids = Object.keys(load.pieces);
    const updates = ids.map((id) => {
      const p = load.pieces[id];
      return { id, x: 2300 + p.c * 200 + 900, y: 2300 + p.r * 200, groupId: 'g_tout' };
    });
    p1 = once(h, 'puzzle_completed');
    h.emit('grab', { roomId, pieceIds: ids });
    h.emit('drop', { roomId, updates });
    const done = await p1;
    assert.ok(done.elapsedMs >= 0);
    // Repasser en accroché fait voler le bloc dans le cadre.
    p1 = once(h, 'pieces_sync', (s) => s.reason === 'mode_change');
    h.emit('update_room_settings', { roomId, settings: { lockMode: 'locked' } });
    const sync = await p1;
    for (const id of ids) assert.equal(sync.pieces[id].groupId, 'LOCKED');
  } finally {
    h.close();
    await srv.close();
  }
});
