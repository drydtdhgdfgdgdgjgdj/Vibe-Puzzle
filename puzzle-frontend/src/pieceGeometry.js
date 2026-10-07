// ============================================================
// Géométrie partagée des pièces de puzzle.
//
// Une pièce classique est définie par 4 "tabs" (languette qui dépasse = 1,
// encoche qui rentre = -1, bord droit = 0 sur les bords du plateau).
// Une pièce magique (shape.cut === 'magic', données tirées par
// lib/shapes.js côté serveur) couvre une ou plusieurs cases d'une grille
// fine : son contour libre a des coins décalés, des côtés en arcs de
// cercle et un nombre variable de têtes rondes.
// w, h : la taille d'une case (pour une pièce classique, la pièce entière) ;
// le chemin part du coin haut-gauche du cadre de la pièce.
// Cette fonction trace UNIQUEMENT le chemin (moveTo/lineTo/bezier) ;
// l'appelant décide s'il remplit (masque de découpe) ou trace un
// simple contour (trait de séparation visuel, export image...).
// Elle est utilisée à la fois par PuzzleBoard (rendu PIXI, via un
// petit adaptateur) et par exportImage (rendu Canvas2D classique).
// ============================================================

export function tracePiecePath(ctx, shape, w, h, tabSize) {
  if (shape?.cut === 'magic') {
    traceMagicPath(ctx, shape, w, h);
    return;
  }
  const ts = tabSize !== undefined ? tabSize : Math.min(w, h) * 0.25;

  ctx.moveTo(0, 0);

  if (shape.topTab !== 0) {
    ctx.lineTo(w / 2 - ts / 2, 0);
    ctx.bezierCurveTo(w / 2 - ts / 2, -ts * shape.topTab, w / 2 + ts / 2, -ts * shape.topTab, w / 2 + ts / 2, 0);
  }
  ctx.lineTo(w, 0);

  if (shape.rightTab !== 0) {
    ctx.lineTo(w, h / 2 - ts / 2);
    ctx.bezierCurveTo(w + ts * shape.rightTab, h / 2 - ts / 2, w + ts * shape.rightTab, h / 2 + ts / 2, w, h / 2 + ts / 2);
  }
  ctx.lineTo(w, h);

  if (shape.bottomTab !== 0) {
    ctx.lineTo(w / 2 + ts / 2, h);
    ctx.bezierCurveTo(w / 2 + ts / 2, h + ts * shape.bottomTab, w / 2 - ts / 2, h + ts * shape.bottomTab, w / 2 - ts / 2, h);
  }
  ctx.lineTo(0, h);

  if (shape.leftTab !== 0) {
    ctx.lineTo(0, h / 2 + ts / 2);
    ctx.bezierCurveTo(-ts * shape.leftTab, h / 2 + ts / 2, -ts * shape.leftTab, h / 2 - ts / 2, 0, h / 2 - ts / 2);
  }
  ctx.lineTo(0, 0);
}

// Jusqu'où une pièce peut déborder de son cadre, en fractions du petit côté
// d'une case (doit correspondre à REACH dans lib/shapes.js côté serveur).
export function pieceReach(shape) {
  return shape?.cut === 'magic' ? 0.36 : 0.25;
}

// Adaptateur pour tracer le même chemin dans un PIXI.Graphics
// (son API moveTo/lineTo/bezierCurveTo a la même signature que Canvas2D,
// donc on peut réutiliser tracePiecePath tel quel).
export function tracePiecePathPixi(graphics, shape, w, h, tabSize) {
  tracePiecePath(graphics, shape, w, h, tabSize);
}

// ------------------------------------------------------------
// Pièces magiques.
// Le contour suit les sommets de shape.p (en cases) décalés de shape.v.
// Chaque côté est calculé dans son sens commun aux deux voisines
// (horizontal de gauche à droite, vertical de haut en bas), puis parcouru
// tel quel ou à l'envers : deux pièces voisines tracent exactement la même
// courbe, sans jour entre elles.
// Les arcs de cercle sont approchés par des courbes de Bézier : le chemin
// n'utilise que lineTo et bezierCurveTo, comme les pièces classiques.
// Les données sont en millièmes de « u », le petit côté d'une case.
// ------------------------------------------------------------
const ONE_CELL = [0, 0, 1, 0, 1, 1, 0, 1]; // contour par défaut (première version)

function traceMagicPath(ctx, shape, w, h) {
  const u = Math.min(w, h);
  const p = shape.p || ONE_CELL;
  const v = shape.v || [];
  const e = shape.e || [];
  const count = p.length / 2;
  const corner = (k) => ({
    x: p[2 * k] * w + ((v[2 * k] || 0) / 1000) * u,
    y: p[2 * k + 1] * h + ((v[2 * k + 1] || 0) / 1000) * u,
  });
  const start = corner(0);
  ctx.moveTo(start.x, start.y);
  for (let k = 0; k < count; k++) {
    const next = (k + 1) % count;
    const a = corner(k);
    const b = corner(next);
    if (!e[k]) {
      ctx.lineTo(b.x, b.y);
      continue;
    }
    const horizontal = p[2 * k + 1] === p[2 * next + 1];
    const forward = horizontal ? p[2 * next] > p[2 * k] : p[2 * next + 1] > p[2 * k + 1];
    drawSegments(ctx, forward ? edgeSegments(a, b, e[k], u) : reversedSegments(b, edgeSegments(b, a, e[k], u)));
  }
}

// Segment : [x, y] (droite) ou [c1x, c1y, c2x, c2y, x, y] (Bézier cubique).
function drawSegments(ctx, segs) {
  for (const s of segs) {
    if (s.length === 2) ctx.lineTo(s[0], s[1]);
    else ctx.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);
  }
}

// Les mêmes segments parcourus en sens inverse (`start` : leur point de départ).
function reversedSegments(start, segs) {
  const out = [];
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const prev = i > 0 ? segs[i - 1] : [start.x, start.y];
    const px = prev[prev.length - 2];
    const py = prev[prev.length - 1];
    out.push(s.length === 2 ? [px, py] : [s[2], s[3], s[0], s[1], px, py]);
  }
  return out;
}

// Ligne de base d'un bord, de a vers b : arc de cercle de flèche `bow`
// (comptée du côté positif : à gauche du sens de parcours, à l'écran),
// ou segment droit si la flèche est nulle. s de 0 à 1 : place sur le bord.
function baseline(a, b, bow) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const d = { x: dx / len, y: dy / len };
  if (Math.abs(bow) < len * 1e-6) {
    const point = (s) => ({ x: a.x + dx * s, y: a.y + dy * s });
    return {
      length: len,
      point,
      tangent: () => d,
      trace(s0, s1, out) { const p = point(s1); out.push([p.x, p.y]); },
    };
  }
  const n = { x: d.y, y: -d.x };
  const sg = Math.sign(bow);
  const sag = Math.abs(bow);
  const radius = (len * len / 4 + sag * sag) / (2 * sag);
  const half = Math.asin(Math.min(1, len / (2 * radius)));
  const ox = (a.x + b.x) / 2 - sg * n.x * (radius - sag);
  const oy = (a.y + b.y) / 2 - sg * n.y * (radius - sag);
  const angle = (s) => half * (2 * s - 1);
  const point = (s) => {
    const t = angle(s);
    return {
      x: ox + radius * (Math.sin(t) * d.x + Math.cos(t) * sg * n.x),
      y: oy + radius * (Math.sin(t) * d.y + Math.cos(t) * sg * n.y),
    };
  };
  const tangent = (s) => {
    const t = angle(s);
    return {
      x: Math.cos(t) * d.x - Math.sin(t) * sg * n.x,
      y: Math.cos(t) * d.y - Math.sin(t) * sg * n.y,
    };
  };
  return {
    length: 2 * half * radius,
    point,
    tangent,
    trace(s0, s1, out) {
      const k = (4 / 3) * Math.tan((angle(s1) - angle(s0)) / 4) * radius;
      const p0 = point(s0);
      const t0 = tangent(s0);
      const p1 = point(s1);
      const t1 = tangent(s1);
      out.push([p0.x + t0.x * k, p0.y + t0.y * k, p1.x - t1.x * k, p1.y - t1.y * k, p1.x, p1.y]);
    },
  };
}

// Un bord intérieur [b, puis s, d, r, n, j, w, l par tête] : la ligne de
// base, interrompue par une ou deux têtes.
function edgeSegments(a, b, e, u) {
  if (!e) return [[b.x, b.y]];
  const base = baseline(a, b, (e[0] / 1000) * u);
  const out = [];
  let s0 = 0;
  for (let i = 1; i + 6 < e.length; i += 7) {
    const k = {
      s: e[i] / 1000, d: e[i + 1], r: e[i + 2] / 1000, n: e[i + 3] / 1000,
      j: e[i + 4] / 1000, w: e[i + 5] / 1000, l: e[i + 6] / 1000,
    };
    const half = (k.w * u) / base.length;
    base.trace(s0, k.s - half, out);
    knobSegments(base, k, k.s - half, k.s + half, u, out);
    s0 = k.s + half;
  }
  base.trace(s0, 1, out);
  return out;
}

// Une tête ronde : un cou qui quitte le bord en s1, un cercle presque
// complet (passant par son sommet), puis un cou qui rejoint le bord en s2.
function knobSegments(base, k, s1, s2, u, out) {
  const r = k.r * u;
  const n = k.n * u;
  const j = k.j * u;
  const flare = Math.max(0, k.w - k.n) * u;
  const c = base.point(k.s);
  const t = base.tangent(k.s);
  // Repère de la tête : X le long du bord, Y vers son sommet, inclinés de k.l.
  const ox = t.y * k.d;
  const oy = -t.x * k.d;
  const cl = Math.cos(k.l);
  const sl = Math.sin(k.l);
  const X = { x: t.x * cl + ox * sl, y: t.y * cl + oy * sl };
  const Y = { x: ox * cl - t.x * sl, y: oy * cl - t.y * sl };
  const rise = Math.sqrt(Math.max(0, r * r - n * n));
  const cx = c.x + Y.x * (j + rise);
  const cy = c.y + Y.y * (j + rise);
  const at = (a) => ({
    x: cx + r * (Math.cos(a) * X.x + Math.sin(a) * Y.x),
    y: cy + r * (Math.cos(a) * X.y + Math.sin(a) * Y.y),
  });
  const der = (a) => ({
    x: r * (Math.cos(a) * Y.x - Math.sin(a) * X.x),
    y: r * (Math.cos(a) * Y.y - Math.sin(a) * X.y),
  });
  // Le cercle est parcouru par angle décroissant, de a1 (en bas à gauche)
  // à a2 (en bas à droite) en passant par le sommet (angle pi / 2).
  const a1 = Math.atan2(-rise, -n);
  const a2 = Math.atan2(-rise, n) - 2 * Math.PI;
  const h1 = flare * 0.9 + j * 0.35; // poignée côté bord
  const h2 = j * 0.9 + flare * 0.2; // poignée côté tête

  const p1 = base.point(s1);
  const t1 = base.tangent(s1);
  const j1 = at(a1);
  const g1 = der(a1);
  out.push([p1.x + t1.x * h1, p1.y + t1.y * h1, j1.x + (g1.x / r) * h2, j1.y + (g1.y / r) * h2, j1.x, j1.y]);

  const steps = Math.ceil(Math.abs(a2 - a1) / (Math.PI / 2));
  for (let i = 0; i < steps; i++) {
    const as = a1 + ((a2 - a1) * i) / steps;
    const ae = a1 + ((a2 - a1) * (i + 1)) / steps;
    const kk = (4 / 3) * Math.tan((ae - as) / 4);
    const ps = at(as);
    const pe = at(ae);
    const ds = der(as);
    const de = der(ae);
    out.push([ps.x + ds.x * kk, ps.y + ds.y * kk, pe.x - de.x * kk, pe.y - de.y * kk, pe.x, pe.y]);
  }

  const j2 = at(a2);
  const g2 = der(a2);
  const p2 = base.point(s2);
  const t2 = base.tangent(s2);
  out.push([j2.x - (g2.x / r) * h2, j2.y - (g2.y / r) * h2, p2.x - t2.x * h1, p2.y - t2.y * h1, p2.x, p2.y]);
}
