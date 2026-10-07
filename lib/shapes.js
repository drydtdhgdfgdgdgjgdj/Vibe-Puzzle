// ============================================================
// Découpe des pièces, tirée au hasard à la création de la partie.
//
//  - « classic » : une grille régulière ; chaque pièce est une case, avec
//    une languette au milieu de chaque côté.
//  - « magic »   : pièces magiques, toutes différentes. Une grille fine et
//    invisible est découpée au hasard en pièces de 1 à 5 cases (toutes
//    petites, demi-pièces, longues barres, rectangles, L, T...). Les coins
//    sont décalés, chaque côté est un arc de cercle qui porte (ou non) une
//    tête ronde de taille, de place et d'inclinaison variables : le nombre
//    de têtes et d'encoches change d'une pièce à l'autre.
//
// Pièce classique : { c, r, shape: { topTab, rightTab, bottomTab, leftTab } }
// (1 = languette, -1 = encoche, 0 = bord du cadre).
// Pièce magique : { c, r, box, adj, shape } :
//   c, r    : sa première case (elle donne son nom à la pièce) ;
//   box     : [colonne, ligne, largeur, hauteur] de son cadre, en cases ;
//   adj     : les pièces qui la touchent par un côté ;
//   shape.p : son contour, sommets [colonne, ligne] relatifs au cadre, dans
//             le sens des aiguilles d'une montre (à l'écran) ;
//   shape.v : le décalage [x, y] de chaque sommet ;
//   shape.e : pour chaque côté (du sommet k au suivant) : null sur le bord du
//             cadre, sinon [b, puis s, d, r, n, j, w, l s'il porte une tête],
//             décrit dans le sens commun aux deux pièces voisines (horizontal
//             de gauche à droite, vertical de haut en bas), le côté positif
//             étant le haut (horizontal) ou la droite (vertical) :
//               b : flèche de l'arc de cercle,
//               s : place de la tête sur le côté (0 à 1000), d : son côté (1 / -1),
//               r : rayon, n : demi-largeur du cou, j : hauteur du cou,
//               w : demi-largeur du pied, l : inclinaison (milliradians).
//   Les mesures sont en millièmes de « u », le petit côté d'une case. Sans
//   `p`, le contour est celui d'une seule case (première version des pièces
//   magiques, dont les parties restent jouables).
// Le dessin correspondant est dans puzzle-frontend/src/pieceGeometry.js.
// ============================================================

const CUTS = ['classic', 'magic'];

// Marge prévue autour du cadre de chaque pièce (place sur la table,
// textures), en u : les têtes magiques peuvent dépasser un peu plus.
const REACH = { classic: 0.25, magic: 0.36 };
const LIMIT = REACH.magic - 0.005;

const CELLS_PER_PIECE = 2.5; // taille moyenne d'une pièce magique, en cases
const SIZE_WEIGHTS = [[1, 12], [2, 26], [3, 30], [4, 22], [5, 10]]; // tailles visées (cases, poids)
const BAR_RATE = 0.3; // part des pièces de 3 cases ou plus tirées en barre
const MAX_SIZE = 5; // jusqu'à 6 cases, une pièce ne peut pas entourer un trou
const MAX_SIDE = 4; // côté le plus long du cadre d'une pièce, en cases
const KNOB_RATE = 0.72; // part des côtés qui portent une tête
const JITTER = 0.14; // décalage maximal d'un coin
const BOW = 0.1; // flèche maximale d'un côté en arc de cercle
const GAP = 0.08; // écart minimal entre deux têtes d'une même pièce

function cleanCut(value) {
  return CUTS.includes(value) ? value : 'classic';
}

function reachOf(cut) {
  return REACH[cleanCut(cut)];
}

// Découpe d'une partie de cols × rows pièces (pour les pièces magiques :
// ce nombre de pièces, sur une grille fine plus serrée).
// Renvoie { gridCols, gridRows, pieces: [{ c, r, box?, adj?, shape }] }.
function generatePieces(cols, rows, cut = 'classic', rng = Math.random) {
  if (cleanCut(cut) !== 'magic') return classicPieces(cols, rows, rng);
  const f = Math.sqrt(CELLS_PER_PIECE);
  const gridCols = Math.max(2, Math.round(cols * f));
  const gridRows = Math.max(2, Math.round(rows * f));
  return magicPieces(gridCols, gridRows, cols * rows, rng);
}

// Chaque bord intérieur est une languette d'un côté et une encoche de l'autre.
function classicPieces(cols, rows, rng) {
  const right = [];
  const bottom = [];
  for (let c = 0; c < cols; c++) {
    right[c] = [];
    bottom[c] = [];
    for (let r = 0; r < rows; r++) {
      right[c][r] = rng() > 0.5 ? 1 : -1;
      bottom[c][r] = rng() > 0.5 ? 1 : -1;
    }
  }
  const pieces = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      pieces.push({
        c,
        r,
        shape: {
          topTab: r === 0 ? 0 : -bottom[c][r - 1],
          bottomTab: r === rows - 1 ? 0 : bottom[c][r],
          leftTab: c === 0 ? 0 : -right[c - 1][r],
          rightTab: c === cols - 1 ? 0 : right[c][r],
        },
      });
    }
  }
  return { gridCols: cols, gridRows: rows, pieces };
}

const milli = (x) => Math.round(x * 1000);

function shuffled(list, rng) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ------------------------------------------------------------
// Partage de la grille fine en pièces (groupes de cases d'un seul tenant).
// Renvoie owner (case -> numéro de pièce) et la liste des cases de chaque pièce.
// ------------------------------------------------------------
function partition(gc, gr, count, rng) {
  const n = gc * gr;
  const owner = new Int32Array(n).fill(-1);
  const regions = new Map(); // numéro -> [cases]
  const neighbors = (k) => {
    const i = k % gc;
    const out = [];
    if (i > 0) out.push(k - 1);
    if (i < gc - 1) out.push(k + 1);
    if (k >= gc) out.push(k - gc);
    if (k < n - gc) out.push(k + gc);
    return out;
  };
  const side = (cells) => {
    let i0 = Infinity; let i1 = -Infinity; let j0 = Infinity; let j1 = -Infinity;
    for (const k of cells) {
      const i = k % gc;
      const j = Math.floor(k / gc);
      i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
    }
    return Math.max(i1 - i0, j1 - j0) + 1;
  };
  const totalWeight = SIZE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  const pickSize = () => {
    let t = rng() * totalWeight;
    for (const [size, w] of SIZE_WEIGHTS) {
      t -= w;
      if (t <= 0) return size;
    }
    return 3;
  };

  // 1. Croissance : chaque case libre lance une pièce d'une taille tirée au
  //    sort, en barre (pièces longues) ou en tas (L, T, carrés...).
  let nextId = 0;
  for (const start of shuffled([...Array(n).keys()], rng)) {
    if (owner[start] >= 0) continue;
    const id = nextId++;
    const cells = [start];
    owner[start] = id;
    const target = pickSize();
    if (target >= 3 && rng() < BAR_RATE) {
      const step = rng() < 0.5 ? 1 : gc;
      for (const dir of shuffled([1, -1], rng)) {
        let k = start;
        while (cells.length < Math.min(target, MAX_SIDE)) {
          const nk = k + dir * step;
          const sameRow = step === gc || Math.floor(nk / gc) === Math.floor(k / gc);
          if (nk < 0 || nk >= n || !sameRow || owner[nk] >= 0) break;
          owner[nk] = id;
          cells.push(nk);
          k = nk;
        }
      }
    }
    while (cells.length < target) {
      const frontier = [];
      for (const k of cells) {
        for (const nk of neighbors(k)) {
          if (owner[nk] < 0 && !frontier.includes(nk) && side([...cells, nk]) <= MAX_SIDE) frontier.push(nk);
        }
      }
      if (!frontier.length) break;
      const nk = frontier[Math.floor(rng() * frontier.length)];
      owner[nk] = id;
      cells.push(nk);
    }
    regions.set(id, cells);
  }

  const adjacentIds = (cells, self) => {
    const out = new Set();
    for (const k of cells) for (const nk of neighbors(k)) if (owner[nk] !== self) out.add(owner[nk]);
    return [...out];
  };
  const isConnected = (cells) => {
    if (!cells.length) return false;
    const set = new Set(cells);
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      for (const nk of neighbors(stack.pop())) if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
    }
    return seen.size === cells.length;
  };

  // 2. Trop de pièces : les plus petites rejoignent une voisine.
  while (regions.size > count) {
    const bySize = shuffled([...regions.keys()], rng).sort((a, b) => regions.get(a).length - regions.get(b).length);
    let merged = false;
    for (const a of bySize) {
      const cellsA = regions.get(a);
      const options = shuffled(adjacentIds(cellsA, a), rng).sort((x, y) => regions.get(x).length - regions.get(y).length);
      const b = options.find((x) => {
        const both = [...cellsA, ...regions.get(x)];
        return both.length <= MAX_SIZE && side(both) <= MAX_SIDE;
      });
      if (b === undefined) continue;
      for (const k of cellsA) owner[k] = b;
      regions.get(b).push(...cellsA);
      regions.delete(a);
      merged = true;
      break;
    }
    if (!merged) break;
  }

  // 3. Pas assez : les plus grandes sont coupées en deux.
  while (regions.size < count) {
    const big = shuffled([...regions.keys()], rng)
      .filter((id) => regions.get(id).length >= 2)
      .sort((a, b) => regions.get(b).length - regions.get(a).length)[0];
    if (big === undefined) break;
    const cells = regions.get(big);
    let part = null;
    for (const start of shuffled(cells, rng)) {
      // Début d'un parcours en largeur : toujours d'un seul tenant.
      const set = new Set(cells);
      const seen = [start];
      for (let q = 0; q < seen.length && seen.length < Math.ceil(cells.length / 2); q++) {
        for (const nk of neighbors(seen[q])) {
          if (set.has(nk) && !seen.includes(nk) && seen.length < Math.ceil(cells.length / 2)) seen.push(nk);
        }
      }
      const rest = cells.filter((k) => !seen.includes(k));
      if (rest.length && isConnected(rest)) { part = seen; break; }
    }
    if (!part) part = [cells.find((k) => isConnected(cells.filter((x) => x !== k)))];
    const id = nextId++;
    for (const k of part) owner[k] = id;
    regions.set(id, part);
    regions.set(big, cells.filter((k) => !part.includes(k)));
  }

  // Numéros compacts, dans l'ordre de lecture de la première case.
  const ids = [...regions.keys()].sort((a, b) => Math.min(...regions.get(a)) - Math.min(...regions.get(b)));
  const remap = new Map(ids.map((id, idx) => [id, idx]));
  for (let k = 0; k < n; k++) owner[k] = remap.get(owner[k]);
  return { owner, regions: ids.map((id) => regions.get(id)) };
}

// ------------------------------------------------------------
// Pièces magiques : partage, coins décalés, côtés et têtes, contours.
// ------------------------------------------------------------
function magicPieces(gc, gr, count, rng) {
  const uni = (a, b) => a + (b - a) * rng();
  const { owner, regions } = partition(gc, gr, count, rng);
  const ownerAt = (i, j) => owner[j * gc + i];

  // Coins de la grille : ceux du cadre glissent seulement le long du cadre,
  // ses 4 angles ne bougent pas.
  const vx = [];
  const vy = [];
  for (let i = 0; i <= gc; i++) {
    vx[i] = [];
    vy[i] = [];
    for (let j = 0; j <= gr; j++) {
      vx[i][j] = i === 0 || i === gc ? 0 : milli(uni(-JITTER, JITTER)) / 1000;
      vy[i][j] = j === 0 || j === gr ? 0 : milli(uni(-JITTER, JITTER)) / 1000;
    }
  }

  // Une tête, réduite si elle dépasserait trop de la ligne de la grille (le
  // côté peut déjà être poussé de ce côté) ; si elle devrait trop
  // rapetisser, elle part plutôt de l'autre côté.
  const knob = (s, d, shift) => {
    const r = uni(0.15, 0.19);
    const n = r * uni(0.6, 0.7);
    const j = uni(0.02, 0.04);
    const w = n + uni(0.04, 0.06);
    const l = uni(-0.16, 0.16);
    const height = j + Math.sqrt(r * r - n * n) + r;
    let dir = d;
    let scale = Math.min(1, (LIMIT - dir * shift) / height);
    if (scale < 0.72) {
      dir = -dir;
      scale = Math.min(1, (LIMIT - dir * shift) / height);
    }
    return { s, d: dir, r: r * scale, n: n * scale, j: j * scale, w: w * scale, l };
  };

  // Côté allant d'un coin décalé de `a` à un coin décalé de `b` (décalages
  // comptés du côté positif) : un arc, avec ou sans tête.
  const edge = (a, b) => {
    const bow = uni(-BOW, BOW);
    if (rng() >= KNOB_RATE) return { b: bow, k: [] };
    const s = uni(0.38, 0.62);
    const shift = a + (b - a) * s + bow * (1 - (2 * s - 1) ** 2);
    return { b: bow, k: [knob(s, rng() < 0.5 ? 1 : -1, shift)] };
  };

  // Côtés entre deux pièces différentes : hEdges[i][j] relie les coins
  // (i, j) et (i + 1, j) ; vEdges[i][j] relie (i, j) et (i, j + 1).
  const hEdges = [];
  const vEdges = [];
  const makeH = (i, j) => { hEdges[i][j] = edge(-vy[i][j], -vy[i + 1][j]); };
  const makeV = (i, j) => { vEdges[i][j] = edge(vx[i][j], vx[i][j + 1]); };
  for (let i = 0; i <= gc; i++) { hEdges[i] = []; vEdges[i] = []; }
  for (let i = 0; i < gc; i++) {
    for (let j = 1; j < gr; j++) if (ownerAt(i, j - 1) !== ownerAt(i, j)) makeH(i, j);
  }
  for (let i = 1; i < gc; i++) {
    for (let j = 0; j < gr; j++) if (ownerAt(i - 1, j) !== ownerAt(i, j)) makeV(i, j);
  }

  // Côtés de chaque pièce, dans le sens des aiguilles d'une montre.
  const sidesOf = (cells) => {
    const mine = new Set(cells);
    const list = [];
    for (const k of cells) {
      const i = k % gc;
      const j = Math.floor(k / gc);
      if (j === 0 || !mine.has(k - gc)) list.push({ from: [i, j], to: [i + 1, j], edge: j === 0 ? null : hEdges[i][j], redo: () => makeH(i, j) });
      if (i === gc - 1 || !mine.has(k + 1)) list.push({ from: [i + 1, j], to: [i + 1, j + 1], edge: i === gc - 1 ? null : vEdges[i + 1][j], redo: () => makeV(i + 1, j) });
      if (j === gr - 1 || !mine.has(k + gc)) list.push({ from: [i + 1, j + 1], to: [i, j + 1], edge: j === gr - 1 ? null : hEdges[i][j + 1], redo: () => makeH(i, j + 1) });
      if (i === 0 || !mine.has(k - 1)) list.push({ from: [i, j + 1], to: [i, j], edge: i === 0 ? null : vEdges[i][j], redo: () => makeV(i, j) });
    }
    return list;
  };

  // Deux têtes trop proches sur des côtés différents d'une même pièce
  // (deux encoches dans un même coin, par exemple) laisseraient un passage
  // trop fin : on retire l'un des deux côtés au sort. Calcul approché, en
  // cases carrées de côté 1 (le cas le plus serré).
  const corner = (i, j) => ({ x: i + vx[i][j], y: j + vy[i][j] });
  const headsOf = (sideInfo) => {
    const e = sideInfo.edge;
    if (!e || !e.k.length) return [];
    const [a, b] = [sideInfo.from, sideInfo.to].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const pa = corner(a[0], a[1]);
    const pb = corner(b[0], b[1]);
    const horizontal = a[1] === b[1];
    const nx = horizontal ? 0 : 1;
    const ny = horizontal ? -1 : 0;
    return e.k.map((k) => {
      const lift = k.j + Math.sqrt(k.r * k.r - k.n * k.n);
      const off = e.b * (1 - (2 * k.s - 1) ** 2) + k.d * lift;
      return {
        x: pa.x + (pb.x - pa.x) * k.s + nx * off,
        y: pa.y + (pb.y - pa.y) * k.s + ny * off,
        r: k.r + Math.abs(Math.sin(k.l)) * lift,
      };
    });
  };
  const tooClose = (h1, h2) => h1.some((p) => h2.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r + GAP));
  for (let pass = 0; pass < 30; pass++) {
    let redone = false;
    for (const cells of regions) {
      const sides = sidesOf(cells).filter((s) => s.edge);
      const heads = sides.map(headsOf);
      let clash = null;
      for (let x = 0; x < sides.length && !clash; x++) {
        for (let y = x + 1; y < sides.length && !clash; y++) if (tooClose(heads[x], heads[y])) clash = sides[y];
      }
      if (clash) { clash.redo(); redone = true; }
    }
    if (!redone) break;
  }

  const encode = (e) => {
    const out = [milli(e.b)];
    for (const k of e.k) out.push(milli(k.s), k.d, milli(k.r), milli(k.n), milli(k.j), milli(k.w), milli(k.l));
    return out;
  };

  const nameOf = (cells) => {
    const k = Math.min(...cells);
    return `piece_${k % gc}_${Math.floor(k / gc)}`;
  };
  const pieces = regions.map((cells, id) => {
    let i0 = Infinity; let i1 = -Infinity; let j0 = Infinity; let j1 = -Infinity;
    for (const k of cells) {
      const i = k % gc;
      const j = Math.floor(k / gc);
      i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
    }

    // Contour : on enchaîne les côtés (un seul côté part de chaque sommet,
    // une pièce de 5 cases au plus n'ayant ni trou ni pincement).
    const sides = sidesOf(cells);
    const startAt = new Map(sides.map((s) => [`${s.from[0]},${s.from[1]}`, s]));
    const loop = [];
    let cur = sides.reduce((best, s) => (s.from[1] < best.from[1] || (s.from[1] === best.from[1] && s.from[0] < best.from[0]) ? s : best));
    for (let guard = 0; guard < sides.length; guard++) {
      loop.push(cur);
      cur = startAt.get(`${cur.to[0]},${cur.to[1]}`);
      if (cur === loop[0]) break;
    }
    // Les bouts de cadre qui se suivent en ligne droite ne forment qu'un côté.
    const horizontal = (s) => s.from[1] === s.to[1];
    const straightOn = (s, t) => !s.edge && !t.edge && horizontal(s) === horizontal(t);
    const merged = [];
    for (const s of loop) {
      const prev = merged[merged.length - 1];
      if (prev && straightOn(prev, s)) prev.to = s.to;
      else merged.push({ from: s.from, to: s.to, edge: s.edge });
    }
    if (merged.length > 1 && straightOn(merged[merged.length - 1], merged[0])) {
      merged[0].from = merged.pop().from;
    }

    const adj = new Set();
    for (const k of cells) {
      const i = k % gc;
      const j = Math.floor(k / gc);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= gc || nj >= gr) continue;
        const o = ownerAt(ni, nj);
        if (o !== id) adj.add(o);
      }
    }

    const head = Math.min(...cells);
    return {
      c: head % gc,
      r: Math.floor(head / gc),
      box: [i0, j0, i1 - i0 + 1, j1 - j0 + 1],
      adj: [...adj].map((o) => nameOf(regions[o])),
      shape: {
        cut: 'magic',
        p: merged.flatMap((s) => [s.from[0] - i0, s.from[1] - j0]),
        v: merged.flatMap((s) => [milli(vx[s.from[0]][s.from[1]]), milli(vy[s.from[0]][s.from[1]])]),
        e: merged.map((s) => (s.edge ? encode(s.edge) : null)),
      },
    };
  });
  return { gridCols: gc, gridRows: gr, pieces };
}

module.exports = { CUTS, REACH, CELLS_PER_PIECE, cleanCut, reachOf, generatePieces };
