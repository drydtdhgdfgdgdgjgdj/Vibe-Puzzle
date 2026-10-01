const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/layout');
const { CENTER } = require('../lib/constants');
const { seededRng } = require('./helpers');

function frameFor(w, h) {
  return { x: CENTER - w / 2, y: CENTER - h / 2, w, h };
}

const configs = [
  { n: 12, cols: 4, rows: 3, w: 800, h: 600, aspect: 16 / 9 },
  { n: 48, cols: 8, rows: 6, w: 1012, h: 759, aspect: 16 / 9 },
  { n: 300, cols: 20, rows: 15, w: 2000, h: 1500, aspect: 4 / 3 },
  { n: 1000, cols: 40, rows: 25, w: 2400, h: 1500, aspect: 1.9 },
  { n: 100, cols: 10, rows: 10, w: 1500, h: 1500, aspect: 0.7 },
];

for (const cfg of configs) {
  test(`dispersion en rectangle : ${cfg.n} pièces, ratio ${cfg.aspect.toFixed(2)}`, () => {
    const frame = frameFor(cfg.w, cfg.h);
    const pw = cfg.w / cfg.cols;
    const ph = cfg.h / cfg.rows;
    const { table, positions } = L.scatterPieces(frame, pw, ph, cfg.n, cfg.aspect, seededRng(cfg.n));
    assert.equal(positions.length, cfg.n);

    // Ratio de la table = ratio de l'écran (borné), centrée sur le cadre.
    assert.ok(Math.abs(table.w / table.h - L.clampAspect(cfg.aspect)) < 1e-6);
    assert.ok(Math.abs(table.x + table.w / 2 - (frame.x + frame.w / 2)) < 1e-6);
    assert.ok(Math.abs(table.y + table.h / 2 - (frame.y + frame.h / 2)) < 1e-6);

    const { margin } = L.layoutParams(pw, ph);
    const exclusion = L.expandRect(frame, margin);
    for (const p of positions) {
      const rect = { x: p.x, y: p.y, w: pw, h: ph };
      assert.ok(rect.x >= table.x - 1e-6 && rect.y >= table.y - 1e-6, 'pièce hors table (haut/gauche)');
      assert.ok(rect.x + rect.w <= table.x + table.w + 1e-6 && rect.y + rect.h <= table.y + table.h + 1e-6, 'pièce hors table (bas/droite)');
      assert.ok(!L.rectsOverlap(rect, exclusion), 'pièce dans la zone du cadre');
    }
    // Vrai désordre : les centres ne sont plus calés au milieu de cases
    // régulières (avec une grille, ~100 % tombaient dans la bande centrale ;
    // au hasard, ~40 %).
    const { cell } = L.layoutParams(pw, ph);
    const offX = table.x + (table.w - Math.floor(table.w / cell) * cell) / 2;
    const offY = table.y + (table.h - Math.floor(table.h / cell) * cell) / 2;
    const centralBand = (v, off) => {
      const u = ((((v - off) % cell) + cell) % cell) / cell;
      return u > 0.3 && u < 0.7;
    };
    const aligned = positions.filter((p) => centralBand(p.x + pw / 2, offX) && centralBand(p.y + ph / 2, offY)).length;
    assert.ok(aligned / positions.length < 0.4, `pièces calées sur une grille (${Math.round((aligned / positions.length) * 100)} %)`);
    // Mais aéré : pas de pièces l'une sur l'autre, bon écart moyen.
    let minNN = Infinity;
    let sumNN = 0;
    for (let i = 0; i < positions.length; i++) {
      let nn = Infinity;
      for (let j = 0; j < positions.length; j++) {
        if (i === j) continue;
        nn = Math.min(nn, Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y));
      }
      minNN = Math.min(minNN, nn);
      sumNN += nn;
    }
    assert.ok(minNN > 0.3 * Math.min(pw, ph), `deux pièces presque superposées (${minNN.toFixed(1)})`);
    assert.ok(sumNN / positions.length > 0.75 * Math.max(pw, ph), `pièces trop serrées (${(sumNN / positions.length).toFixed(1)})`);
  });
}

test('grille d\'occupation : findSpot trouve une place libre et la réserve', () => {
  const grid = new L.OccupancyGrid({ x: 0, y: 0, w: 100, h: 100 }, 10);
  grid.mark({ x: 0, y: 0, w: 100, h: 50 });
  const spot = grid.findSpot(30, 30, { rng: seededRng(1) });
  assert.ok(spot);
  assert.ok(spot.y >= 50);
  assert.ok(grid.isFree({ x: spot.x, y: spot.y, w: 30, h: 30 }));
  grid.mark({ x: spot.x, y: spot.y, w: 30, h: 30 });
  assert.ok(!grid.isFree({ x: spot.x, y: spot.y, w: 30, h: 30 }));
  assert.equal(grid.findSpot(200, 10), null, 'trop grand pour la table');
});

test('findSpot avec `near` choisit la place libre la plus proche', () => {
  const grid = new L.OccupancyGrid({ x: 0, y: 0, w: 200, h: 200 }, 10);
  const spot = grid.findSpot(20, 20, { near: { x: 150, y: 150 } });
  assert.deepEqual(spot, { x: 140, y: 140 });
});
