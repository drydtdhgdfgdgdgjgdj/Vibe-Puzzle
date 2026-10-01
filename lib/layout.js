// ============================================================
// Géométrie de la table : cadre final, grande table rectangulaire
// autour, dispersion aléatoire des pièces et recherche de places
// libres (pour ranger des pièces ou des blocs sans chevauchement).
// ============================================================
const { CENTER } = require('./constants');

function pieceMetrics(room) {
  const pw = room.imgWidth / room.cols;
  const ph = room.imgHeight / room.rows;
  return { pw, ph, ts: Math.min(pw, ph) * 0.25 };
}

function frameRect(room) {
  return { x: CENTER - room.imgWidth / 2, y: CENTER - room.imgHeight / 2, w: room.imgWidth, h: room.imgHeight };
}

function targetOf(room, piece) {
  const frame = frameRect(room);
  const { pw, ph } = pieceMetrics(room);
  return { x: frame.x + piece.c * pw, y: frame.y + piece.r * ph };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function expandRect(r, m) {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}

function clampAspect(aspect) {
  const a = Number(aspect);
  if (!Number.isFinite(a) || a <= 0) return 16 / 9;
  return Math.min(2.6, Math.max(0.6, a));
}

function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Taille d'une case de dispersion et marge laissée autour du cadre.
function layoutParams(pw, ph) {
  const big = Math.max(pw, ph);
  return { cell: big * 1.35, margin: big * 0.8 };
}

// Rectangle occupé visuellement par une pièce (languettes comprises).
function pieceRect(x, y, m) {
  return { x: x - m.ts, y: y - m.ts, w: m.pw + 2 * m.ts, h: m.ph + 2 * m.ts };
}

// Union des rectangles d'un ensemble de positions de pièces.
function blockRect(positions, m) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of positions) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + m.pw); y1 = Math.max(y1, p.y + m.ph);
  }
  return { x: x0 - m.ts, y: y0 - m.ts, w: x1 - x0 + 2 * m.ts, h: y1 - y0 + 2 * m.ts };
}

// Cases d'une grille posée sur la table, sans celles qui touchent la zone exclue.
function tableCells(table, cell, exclusion) {
  const cols = Math.max(1, Math.floor(table.w / cell));
  const rows = Math.max(1, Math.floor(table.h / cell));
  const offX = table.x + (table.w - cols * cell) / 2;
  const offY = table.y + (table.h - rows * cell) / 2;
  const cells = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const rect = { x: offX + i * cell, y: offY + j * cell, w: cell, h: cell };
      if (exclusion && rectsOverlap(rect, exclusion)) continue;
      cells.push(rect);
    }
  }
  return cells;
}

// Grande table rectangulaire (ratio = celui de l'écran du créateur), centrée
// sur le cadre, juste assez grande pour offrir `count` cases libres hors du cadre.
function computeTable(frame, pw, ph, count, aspect) {
  const { cell, margin } = layoutParams(pw, ph);
  const exclusion = expandRect(frame, margin);
  const a = clampAspect(aspect);
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  let w = Math.max(exclusion.w + 2 * cell, (exclusion.h + 2 * cell) * a);
  for (let i = 0; i < 400; i++) {
    const h = w / a;
    const table = { x: cx - w / 2, y: cy - h / 2, w, h };
    const cells = tableCells(table, cell, exclusion);
    if (cells.length >= count) return { table, cells, cell, exclusion };
    w *= 1.05;
  }
  throw new Error('computeTable : impossible de dimensionner la table');
}

// Dispersion "vraiment au hasard, mais aérée" (meilleur candidat, algorithme
// de Mitchell) : pour chaque pièce on tire plusieurs positions au hasard dans
// la zone et on garde celle qui est la plus loin des pièces déjà posées.
// Pas de lignes ni de colonnes comme avec une grille, et pas de gros tas.
// `existing` : centres des pièces déjà présentes, à éviter aussi.
function bestCandidateScatter({ area, exclusion = [], count, pw, ph, existing = [], rng = Math.random, candidates = 8 }) {
  const cellSize = Math.max(pw, ph);
  const buckets = new Map();
  const add = (x, y) => {
    const key = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    let b = buckets.get(key);
    if (!b) { b = []; buckets.set(key, b); }
    b.push(x, y);
  };
  // Distance² au centre déjà posé le plus proche (recherche en anneaux).
  const MAX_RING = 4;
  const nearest = (x, y) => {
    const ci = Math.floor(x / cellSize);
    const cj = Math.floor(y / cellSize);
    let best = Infinity;
    for (let ring = 0; ring <= MAX_RING; ring++) {
      for (let i = ci - ring; i <= ci + ring; i++) {
        for (let j = cj - ring; j <= cj + ring; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue;
          const b = buckets.get(`${i},${j}`);
          if (!b) continue;
          for (let n = 0; n < b.length; n += 2) {
            const d = (b[n] - x) ** 2 + (b[n + 1] - y) ** 2;
            if (d < best) best = d;
          }
        }
      }
      if (best <= (ring * cellSize) ** 2) break;
    }
    return best;
  };
  for (const c of existing) add(c.x, c.y);

  const spanX = Math.max(0, area.w - pw);
  const spanY = Math.max(0, area.h - ph);
  const sample = () => {
    for (let t = 0; t < 40; t++) {
      const x = area.x + rng() * spanX;
      const y = area.y + rng() * spanY;
      const rect = { x, y, w: pw, h: ph };
      if (!exclusion.some((e) => rectsOverlap(rect, e))) return { x, y };
    }
    return null;
  };

  const out = [];
  for (let i = 0; i < count; i++) {
    let best = null;
    let bestD = -1;
    for (let c = 0; c < candidates; c++) {
      const s = sample();
      if (!s) continue;
      const d = nearest(s.x + pw / 2, s.y + ph / 2);
      if (d > bestD) { bestD = d; best = s; }
    }
    if (!best) best = { x: area.x + rng() * spanX, y: area.y + rng() * spanY };
    out.push(best);
    add(best.x + pw / 2, best.y + ph / 2);
  }
  return out;
}

// Dispersion de départ : au hasard sur toute la grande table, hors du cadre.
function scatterPieces(frame, pw, ph, count, aspect, rng = Math.random) {
  const { table, exclusion } = computeTable(frame, pw, ph, count, aspect);
  const positions = bestCandidateScatter({ area: table, exclusion: [exclusion], count, pw, ph, rng });
  return { table, positions };
}

// ------------------------------------------------------------
// Grille d'occupation : sert à trouver une place libre pour une pièce
// ou un bloc entier (rangement, sortie de focus, changement de mode).
// ------------------------------------------------------------
class OccupancyGrid {
  constructor(bounds, size) {
    this.bounds = bounds;
    this.size = Math.max(1, size);
    this.cols = Math.max(1, Math.ceil(bounds.w / this.size));
    this.rows = Math.max(1, Math.ceil(bounds.h / this.size));
    this.cells = new Uint8Array(this.cols * this.rows);
  }

  range(rect) {
    const { x, y } = this.bounds;
    return {
      i0: Math.max(0, Math.floor((rect.x - x) / this.size)),
      i1: Math.min(this.cols - 1, Math.floor((rect.x + rect.w - x - 1e-6) / this.size)),
      j0: Math.max(0, Math.floor((rect.y - y) / this.size)),
      j1: Math.min(this.rows - 1, Math.floor((rect.y + rect.h - y - 1e-6) / this.size)),
    };
  }

  mark(rect) {
    const { i0, i1, j0, j1 } = this.range(rect);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.cells[j * this.cols + i] = 1;
  }

  inside(rect) {
    const b = this.bounds;
    return rect.x >= b.x && rect.y >= b.y && rect.x + rect.w <= b.x + b.w && rect.y + rect.h <= b.y + b.h;
  }

  isFree(rect) {
    if (!this.inside(rect)) return false;
    const { i0, i1, j0, j1 } = this.range(rect);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (this.cells[j * this.cols + i]) return false;
    return true;
  }

  // Coin haut-gauche d'une place libre de taille w×h (hors zones `avoid`),
  // au hasard, ou la plus proche de `near` si fourni. null si aucune.
  findSpot(w, h, { avoid = [], near = null, rng = Math.random } = {}) {
    const candidates = [];
    const b = this.bounds;
    for (let i = 0; i < this.cols; i++) {
      for (let j = 0; j < this.rows; j++) {
        const x = b.x + i * this.size;
        const y = b.y + j * this.size;
        if (x + w > b.x + b.w || y + h > b.y + b.h) continue;
        candidates.push({ x, y });
      }
    }
    if (near) {
      const d = (c) => (c.x + w / 2 - near.x) ** 2 + (c.y + h / 2 - near.y) ** 2;
      candidates.sort((a, c) => d(a) - d(c));
    } else {
      shuffle(candidates, rng);
    }
    for (const c of candidates) {
      const rect = { x: c.x, y: c.y, w, h };
      if (avoid.some((a) => rectsOverlap(rect, a))) continue;
      if (this.isFree(rect)) return c;
    }
    return null;
  }
}

// Position de repli quand la table est pleine : au hasard dans la table,
// en évitant si possible les zones interdites (chevauchement accepté).
function fallbackSpot(table, w, h, avoid, rng = Math.random) {
  for (let i = 0; i < 40; i++) {
    const x = table.x + rng() * Math.max(0, table.w - w);
    const y = table.y + rng() * Math.max(0, table.h - h);
    const rect = { x, y, w, h };
    if (!avoid.some((a) => rectsOverlap(rect, a))) return { x, y };
  }
  return { x: table.x, y: table.y };
}

module.exports = {
  pieceMetrics,
  frameRect,
  targetOf,
  rectsOverlap,
  expandRect,
  clampAspect,
  shuffle,
  layoutParams,
  pieceRect,
  blockRect,
  tableCells,
  computeTable,
  bestCandidateScatter,
  scatterPieces,
  OccupancyGrid,
  fallbackSpot,
};
