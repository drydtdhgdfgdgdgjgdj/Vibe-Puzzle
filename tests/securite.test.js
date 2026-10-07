// Garde-fous de sécurité du serveur : identifiants piégés, demandes pour
// rejoindre, disque, musiques oubliées, taille des requêtes.
// Comme server.test.js : écoutes posées AVANT l'envoi qui les déclenche.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPuzzleServer } = require('../server');
const R = require('../lib/rooms');
const { io: ioClient } = require('../puzzle-frontend/node_modules/socket.io-client');

const quietLog = { log() {}, warn() {}, error: (...a) => console.error(...a) };
const base = { creatorClientId: 'c-h', creatorPseudo: 'H', cols: 2, rows: 2, imgWidth: 400, imgHeight: 400, originalImage: '/ciel.jpg' };
const png = (bytes) => `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(bytes)]).toString('base64')}`;
const mp3 = `data:audio/mpeg;base64,${Buffer.concat([Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1'), Buffer.alloc(64, 0xaa)]).toString('base64')}`;

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

async function startServer(limits = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puzzle-securite-'));
  const srv = createPuzzleServer({ dataDir, legacyDbFile: null, log: quietLog, limits });
  const port = await srv.listen(0);
  const url = `http://localhost:${port}`;
  const postRaw = async (p, body) => {
    const res = await fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch { /* réponse non JSON */ }
    return { status: res.status, body: json };
  };
  const post = async (p, body) => (await postRaw(p, body)).body;
  const uploads = path.join(dataDir, 'uploads');
  const sockets = [];
  const connect = (opts = {}) => {
    const s = ioClient(url, { transports: ['websocket'], forceNew: true, ...opts });
    sockets.push(s);
    return s;
  };
  const stop = async () => {
    for (const s of sockets) s.close();
    await srv.close();
  };
  return { srv, post, postRaw, uploads, connect, stop };
}

async function joinAsHost(socket, roomId) {
  const p = once(socket, 'load_puzzle');
  socket.emit('join_room', { roomId, clientId: 'c-h', pseudo: 'H' });
  return p;
}

test('identifiants : noms réservés refusés, vrais identifiants acceptés', () => {
  assert.equal(R.cleanClientId('__proto__'), '');
  assert.equal(R.cleanClientId('constructor'), '');
  assert.equal(R.cleanRoomId('toString'), '');
  assert.equal(R.cleanRoomId('constructor'), '');
  assert.equal(R.cleanGroupId('__proto__'), '');
  assert.equal(R.cleanClientId('3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f'), '3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f');
  assert.equal(R.cleanRoomId('ab3k9mz'), 'ab3k9mz');
  assert.equal(R.cleanGroupId('F:m_0a1b2c3d'), 'F:m_0a1b2c3d');
  const obj = { a: 1 };
  assert.equal(R.ownValue(obj, 'a'), 1);
  assert.equal(R.ownValue(obj, '__proto__'), undefined);
  assert.equal(R.ownValue(obj, 'constructor'), undefined);
  assert.equal(R.ownValue(obj, ['a']), undefined);
});

test('identifiants piégés (__proto__, constructor...) : refusés, aucun objet du serveur touché', async () => {
  const { srv, post, postRaw, connect, stop } = await startServer();
  try {
    const { roomId } = await post('/api/rooms', base);
    const h = connect();
    await joinAsHost(h, roomId);
    const before = { ...srv.db[roomId].pieces.piece_0_0 };

    let p = once(h, 'grab_denied');
    h.emit('grab', { roomId, pieceIds: ['__proto__'] });
    await p;
    h.emit('drop', {
      roomId,
      updates: [
        { id: '__proto__', x: 5, y: 7, groupId: 'pirate' },
        { id: 'constructor', x: 5, y: 7, groupId: 'pirate' },
        { id: ['piece_0_0'], x: 1, y: 1, groupId: 'piece_0_0' }, // id déguisé en tableau
      ],
    });
    h.emit('hint_request', { roomId, pieceId: '__proto__', level: 1 });
    h.emit('focus_move', { roomId, updates: [{ id: '__proto__', x: 1, y: 1 }] });
    h.emit('respond_join', { roomId, requestId: '__proto__', accepted: true });
    // Témoin : seul dans la partie, une demande d'aide normale est accordée
    // tout de suite ; sa réponse prouve que les messages d'avant sont traités.
    p = once(h, 'hint_response', (r) => r.pieceId === 'piece_1_1');
    h.emit('hint_request', { roomId, pieceId: 'piece_1_1', level: 1 });
    await p;

    assert.equal(({}).groupId, undefined, 'Object.prototype intact');
    assert.equal(({}).x, undefined, 'Object.prototype intact');
    assert.equal(Object.hasOwn(Object, 'x'), false, 'constructor intact');
    assert.deepEqual(srv.db[roomId].pieces.piece_0_0, before, 'un id déguisé ne déplace rien');
    assert.deepEqual(Object.keys(srv.db[roomId].members), ['c-h'], 'aucun membre fantôme');

    const intrus = connect();
    p = once(intrus, 'room_not_found');
    intrus.emit('join_room', { roomId, clientId: '__proto__', pseudo: 'X' });
    await p;
    p = once(intrus, 'room_not_found');
    intrus.emit('join_room', { roomId: 'constructor', clientId: 'c-x', pseudo: 'X' });
    await p;
    assert.equal((await postRaw('/api/rooms/constructor/delete', { clientId: 'c-h' })).status, 404);
    assert.deepEqual((await post('/api/my-rooms', { clientId: '__proto__' })).rooms, []);
  } finally {
    await stop();
  }
});

test('demandes pour rejoindre : une par onglet, file plafonnée, limite par adresse', async () => {
  const { srv, post, connect, stop } = await startServer({ pendingRequestsPerRoom: 2, joinRequestsPerHour: 5 });
  try {
    const { roomId: a } = await post('/api/rooms', base);
    const { roomId: b } = await post('/api/rooms', base);
    const hostA = connect();
    const hostB = connect();
    await joinAsHost(hostA, a);
    await joinAsHost(hostB, b);

    // Un onglet n'attend qu'à une porte : demander B retire sa demande pour A.
    const guest = connect();
    const reqA = once(hostA, 'join_request');
    let p = once(guest, 'join_pending');
    guest.emit('join_room', { roomId: a, clientId: 'c-g1', pseudo: 'G1' });
    await p;
    const { requestId } = await reqA;
    const closedA = once(hostA, 'join_request_closed', (c) => c.requestId === requestId);
    const reqB = once(hostB, 'join_request');
    p = once(guest, 'join_pending');
    guest.emit('join_room', { roomId: b, clientId: 'c-g1', pseudo: 'G1' });
    await p;
    await closedA;
    await reqB;
    assert.equal(Object.keys(srv.db[a].pendingRequests).length, 0);
    assert.equal(Object.keys(srv.db[b].pendingRequests).length, 1);

    // File d'attente plafonnée (2 ici) : la demande de trop est refusée.
    const g2 = connect();
    p = once(g2, 'join_pending');
    g2.emit('join_room', { roomId: b, clientId: 'c-g2', pseudo: 'G2' });
    await p;
    const g3 = connect();
    p = once(g3, 'join_error');
    g3.emit('join_room', { roomId: b, clientId: 'c-g3', pseudo: 'G3' });
    assert.equal((await p).reason, 'too_many_requests');
    assert.equal(Object.keys(srv.db[b].pendingRequests).length, 2);

    // Un onglet qui part libère sa place.
    p = once(hostB, 'join_request_closed');
    g2.close();
    await p;
    assert.equal(Object.keys(srv.db[b].pendingRequests).length, 1);

    // 5 demandes par heure et par adresse ici (4 déjà faites) : la 6e est refusée...
    const g4 = connect();
    p = once(g4, 'join_pending');
    g4.emit('join_room', { roomId: a, clientId: 'c-g4', pseudo: 'G4' });
    await p;
    const g5 = connect();
    p = once(g5, 'join_error');
    g5.emit('join_room', { roomId: a, clientId: 'c-g5', pseudo: 'G5' });
    assert.equal((await p).reason, 'too_many_requests');
    // ... mais un joueur d'une autre adresse (transmise par le proxy) passe.
    const other = connect({ extraHeaders: { 'x-forwarded-for': '203.0.113.7' } });
    p = once(other, 'join_pending');
    other.emit('join_room', { roomId: a, clientId: 'c-g6', pseudo: 'G6' });
    await p;
  } finally {
    await stop();
  }
});

test('disque presque plein : envois refusés proprement, images du site toujours possibles', async () => {
  const { srv, postRaw, uploads, stop } = await startServer({ minFreeDiskBytes: Number.MAX_SAFE_INTEGER });
  try {
    const sent = await postRaw('/api/rooms', { ...base, originalImage: png(2000) });
    assert.equal(sent.status, 503);
    assert.match(sent.body.error, /place/);

    const preset = await postRaw('/api/rooms', { ...base, thumb: png(500) });
    assert.equal(preset.status, 200);
    const { roomId } = preset.body;
    assert.equal(srv.db[roomId].thumbUrl, '/ciel.jpg', 'sans miniature, la grande image en tient lieu');

    assert.equal((await postRaw(`/api/rooms/${roomId}/background`, { clientId: 'c-h', image: png(500) })).status, 503);
    assert.equal((await postRaw(`/api/rooms/${roomId}/music`, { clientId: 'c-h', audio: mp3 })).status, 503);
    assert.deepEqual(fs.readdirSync(uploads), [], 'aucun fichier écrit');
  } finally {
    await stop();
  }
});

test('musiques jamais utilisées : supprimées après 24 h, sauf celles en service', async () => {
  const { srv, post, uploads, connect, stop } = await startServer();
  const fileOf = (url) => path.join(uploads, path.basename(url));
  const age = (url) => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(fileOf(url), old, old);
  };
  try {
    const { roomId } = await post('/api/rooms', base);
    const h = connect();
    await joinAsHost(h, roomId);
    const inUse = (await post(`/api/rooms/${roomId}/music`, { clientId: 'c-h', audio: mp3, name: 'A', apply: true })).url;
    const forgotten = (await post(`/api/rooms/${roomId}/music`, { clientId: 'c-h', audio: mp3 })).url;
    const recent = (await post(`/api/rooms/${roomId}/music`, { clientId: 'c-h', audio: mp3 })).url;
    assert.equal(srv.db[roomId].settings.customMusic.url, inUse);

    // Un invité propose sa musique : gardée tant que la demande est ouverte.
    const g = connect();
    const jr = once(h, 'join_request');
    g.emit('join_room', { roomId, clientId: 'c-g', pseudo: 'G' });
    const loaded = once(g, 'load_puzzle');
    h.emit('respond_join', { roomId, requestId: (await jr).requestId, accepted: true });
    await loaded;
    const proposed = (await post(`/api/rooms/${roomId}/music`, { clientId: 'c-g', audio: mp3 })).url;
    const incoming = once(h, 'settings_request_incoming');
    g.emit('settings_request', { roomId, partial: { music: 'custom', customMusic: { kind: 'file', url: proposed, name: 'D' } } });
    const sreq = await incoming;

    for (const url of [inUse, forgotten, proposed]) age(url);
    assert.equal(srv.sweepOrphanMusic(), 1);
    assert.equal(fs.existsSync(fileOf(forgotten)), false, 'musique oubliée supprimée');
    for (const url of [inUse, recent, proposed]) assert.equal(fs.existsSync(fileOf(url)), true, `${url} gardée`);

    // Proposition refusée : la musique n'a plus d'usage.
    const refused = once(g, 'settings_request_result', (r) => r.status === 'refused');
    h.emit('settings_request_respond', { roomId, requestId: sreq.requestId, accepted: false });
    await refused;
    assert.equal(srv.sweepOrphanMusic(), 1);
    assert.equal(fs.existsSync(fileOf(proposed)), false);
    assert.equal(fs.existsSync(fileOf(inUse)), true);
  } finally {
    await stop();
  }
});

test('taille des requêtes : 100 Ko hors envois de fichiers ; limite par adresse avant lecture', async () => {
  const { postRaw, stop } = await startServer({ roomsPerHour: 2, musicPerHour: 1 });
  try {
    const pad = 'x'.repeat(200 * 1024);
    assert.equal((await postRaw('/api/my-rooms', { clientId: 'c-h', pad })).status, 413);
    assert.equal((await postRaw('/api/rooms/abcdefg/delete', { clientId: 'c-h', pad })).status, 413);

    // Les envois d'images gardent leur grande limite.
    const big = await postRaw('/api/rooms', { ...base, originalImage: png(1024 * 1024) });
    assert.equal(big.status, 200);
    assert.equal((await postRaw('/api/rooms', base)).status, 200);
    const third = await postRaw('/api/rooms', base);
    assert.equal(third.status, 429);
    assert.match(third.body.error, /Trop de parties/);

    // Toute tentative compte, même refusée ensuite (ici : pas membre).
    const { roomId } = big.body;
    assert.equal((await postRaw(`/api/rooms/${roomId}/music`, { clientId: 'inconnu', audio: mp3 })).status, 403);
    assert.equal((await postRaw(`/api/rooms/${roomId}/music`, { clientId: 'c-h', audio: mp3 })).status, 429);
  } finally {
    await stop();
  }
});
