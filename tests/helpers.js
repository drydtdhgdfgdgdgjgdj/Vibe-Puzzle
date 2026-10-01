// Outils communs aux tests : générateur aléatoire reproductible et
// fabrication d'une petite partie en mémoire.
const { CENTER, DEFAULT_SETTINGS, LOCKED } = require('../lib/constants');
const L = require('../lib/layout');

function seededRng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRoom({ cols = 4, rows = 3, imgWidth = 400, imgHeight = 300, lockMode = 'locked', seed = 7 } = {}) {
  const rng = seededRng(seed);
  const frame = { x: CENTER - imgWidth / 2, y: CENTER - imgHeight / 2, w: imgWidth, h: imgHeight };
  const pw = imgWidth / cols;
  const ph = imgHeight / rows;
  const { table, positions } = L.scatterPieces(frame, pw, ph, cols * rows, 16 / 9, rng);
  const pieces = {};
  let i = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const id = `piece_${c}_${r}`;
      pieces[id] = {
        c, r, x: positions[i].x, y: positions[i].y, groupId: id, placedBy: null,
        shape: { topTab: 0, bottomTab: 0, leftTab: 0, rightTab: 0 },
      };
      i++;
    }
  }
  return {
    cols, rows, imgWidth, imgHeight, table, pieces,
    settings: { ...DEFAULT_SETTINGS, lockMode },
    members: {},
    focuses: {},
  };
}

// Place les pièces données à leur cible et les fixe dans le cadre.
function lockPieces(room, ids) {
  for (const id of ids) {
    const p = room.pieces[id];
    const t = L.targetOf(room, p);
    p.x = t.x; p.y = t.y; p.groupId = LOCKED;
  }
}

// Assemble des pièces en un bloc libre, décalé de (dx, dy) par rapport au cadre.
function assemble(room, ids, dx, dy, groupId) {
  for (const id of ids) {
    const p = room.pieces[id];
    const t = L.targetOf(room, p);
    p.x = t.x + dx; p.y = t.y + dy; p.groupId = groupId;
  }
}

module.exports = { seededRng, makeRoom, lockPieces, assemble };
