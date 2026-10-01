const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { migrateDatabase } = require('../lib/migrate');
const { createImageStore } = require('../lib/images');
const L = require('../lib/layout');

// Petite image PNG valide (1×1 pixel) pour simuler une ancienne partie
// dont la photo était stockée en base64 dans la base.
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'puzzle-migrate-'));
}

function sourceDatabase() {
  const candidates = [
    path.join(__dirname, '..', 'database.json'),
    path.join(__dirname, '..', 'database.json.ancienne-version'),
    path.join(__dirname, '..', 'data', 'database.json'),
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  return file ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

test('migration v2 de la base réelle : aucune partie perdue, champs complets', () => {
  const db = sourceDatabase();
  const ids = Object.keys(db);
  const images = createImageStore(path.join(tmpDir(), 'uploads'));
  const { broken } = migrateDatabase(db, { images, log: { warn() {}, log() {} } });
  assert.deepEqual(Object.keys(broken), []);
  assert.deepEqual(Object.keys(db).sort(), ids.sort());
  for (const [roomId, room] of Object.entries(db)) {
    assert.equal(room.version, 2, roomId);
    assert.ok(room.settings && room.settings.lockMode, roomId);
    assert.ok(room.members && typeof room.members === 'object', roomId);
    assert.ok(room.table && room.table.w > 0 && room.table.h > 0, roomId);
    assert.ok(room.name, roomId);
    assert.equal(room.hints, undefined);
    assert.equal(room.scatterRadius, undefined);
    for (const m of Object.values(room.members)) assert.match(m.memberId, /^m_[0-9a-f]{8}$/);
    // La table englobe le cadre.
    const f = L.frameRect(room);
    assert.ok(room.table.x <= f.x && room.table.y <= f.y);
    assert.ok(room.table.x + room.table.w >= f.x + f.w && room.table.y + room.table.h >= f.y + f.h);
  }
});

test('migration : image base64 -> fichier, crédit pseudo -> membre', () => {
  const dir = tmpDir();
  const images = createImageStore(path.join(dir, 'uploads'));
  const db = {
    abc1234: {
      imageUrl: PNG_1PX,
      originalImageUrl: PNG_1PX,
      cols: 2, rows: 2, imgWidth: 400, imgHeight: 400,
      pieces: {
        piece_0_0: { c: 0, r: 0, x: 0, y: 0, groupId: 'piece_0_0', placedBy: 'Alice' },
        piece_1_0: { c: 1, r: 0, x: 10, y: 0, groupId: 'piece_1_0', placedBy: 'Inconnu' },
        piece_0_1: { c: 0, r: 1, x: 0, y: 10, groupId: 'piece_0_1' },
        piece_1_1: { c: 1, r: 1, x: 10, y: 10, groupId: 'piece_1_1' },
      },
      creatorClientId: 'client-alice',
      members: { 'client-alice': { pseudo: 'Alice', accepted: true } },
      hints: { x: 1 },
    },
  };
  migrateDatabase(db, { images, log: { warn() {}, log() {} } });
  const room = db.abc1234;
  assert.match(room.originalImageUrl, /^\/uploads\/abc1234-orig-[0-9a-f]{6}\.png$/);
  assert.equal(room.imageUrl, room.originalImageUrl);
  assert.ok(fs.existsSync(path.join(dir, 'uploads', path.basename(room.originalImageUrl))));
  const alice = room.members['client-alice'];
  assert.equal(alice.role, 'host');
  assert.equal(room.pieces.piece_0_0.placedBy, alice.memberId);
  assert.equal(room.pieces.piece_1_0.placedBy, 'Inconnu', 'un pseudo inconnu reste tel quel');
});
