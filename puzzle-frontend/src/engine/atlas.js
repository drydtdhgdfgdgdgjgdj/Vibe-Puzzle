// ============================================================
// "Cuisson" des pièces dans un atlas de textures.
//
// Avant : chaque pièce était une sprite + un masque Graphics (stencil),
// soit plusieurs appels GPU par pièce et des bords crénelés.
// Maintenant : chaque pièce est découpée UNE fois (Canvas2D, bords
// anti-aliasés) puis rangée dans quelques grandes pages de texture.
// Toutes les pièces partagent ces pages : PIXI les dessine en quelques
// appels seulement, même à 1000 pièces. Les pages sont en puissance de 2,
// donc mipmappées : pas de scintillement en dézoomant.
// La résolution de cuisson (k texels par unité du monde) dépend de la
// qualité choisie et de la résolution de la photo d'origine.
// ============================================================
import * as PIXI from 'pixi.js';
import { tracePiecePath, pieceReach } from '../pieceGeometry';

export const QUALITY_PRESETS = {
  max: { label: 'Max', resolutionCap: 3, pageSize: 4096, maxPages: 3, kMax: 3, shadows: true, fpsCap: 0, antialias: true },
  balanced: { label: 'Équilibré', resolutionCap: 1.5, pageSize: 4096, maxPages: 2, kMax: 2, shadows: true, fpsCap: 0, antialias: false },
  eco: { label: 'Économie', resolutionCap: 1, pageSize: 2048, maxPages: 1, kMax: 1, shadows: false, fpsCap: 30, antialias: false },
};

// "Auto" : Équilibré, ou Max sur une machine puissante.
export function resolveQuality(pref) {
  if (pref && pref !== 'auto' && QUALITY_PRESETS[pref]) return pref;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  return cores >= 8 && memory >= 8 ? 'max' : 'balanced';
}

const GUTTER = 2;

function yieldToBrowser() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Charge la photo d'origine (décodée hors du fil principal si possible).
export async function loadSourceImage(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Image introuvable (${res.status})`);
  const blob = await res.blob();
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch { /* repli ci-dessous */ }
  }
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

// drawImage dont le rectangle source peut déborder de l'image
// (pièces du bord) : on rogne nous-mêmes pour tous les navigateurs.
function drawImageClipped(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh) {
  const scaleX = dw / sw;
  const scaleY = dh / sh;
  const x0 = Math.max(0, sx);
  const y0 = Math.max(0, sy);
  const x1 = Math.min(src.width, sx + sw);
  const y1 = Math.min(src.height, sy + sh);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.drawImage(src, x0, y0, x1 - x0, y1 - y0, dx + (x0 - sx) * scaleX, dy + (y0 - sy) * scaleY, (x1 - x0) * scaleX, (y1 - y0) * scaleY);
}

// Cadre d'une pièce, en cases : [colonne, ligne, largeur, hauteur].
function boxOf(piece) {
  return piece.box || [piece.c, piece.r, 1, 1];
}

function bakePiece(ctx, source, piece, o) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(o.k, 0, 0, o.k, o.pad * o.k, o.pad * o.k);

  const path = new Path2D();
  tracePiecePath(path, piece.shape, o.pw, o.ph, o.ts);
  path.closePath();

  // Silhouette légèrement dilatée : deux pièces assemblées se recouvrent
  // d'un demi-pixel, ce qui supprime le liseré entre elles.
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';
  ctx.fill(path);
  ctx.lineWidth = 1.3 / o.k;
  ctx.stroke(path);

  ctx.globalCompositeOperation = 'source-in';
  const [bx, by, bw, bh] = boxOf(piece);
  const cellW = bw * o.pw + 2 * o.pad;
  const cellH = bh * o.ph + 2 * o.pad;
  drawImageClipped(
    ctx, source,
    (bx * o.pw - o.pad) * o.sx, (by * o.ph - o.pad) * o.sy,
    cellW * o.sx, cellH * o.sy,
    -o.pad, -o.pad, cellW, cellH,
  );

  if (o.seams) {
    // Léger relief (clair en haut à gauche, sombre en bas à droite) + fin
    // trait de découpe, dessinés uniquement sur la pièce.
    ctx.globalCompositeOperation = 'source-atop';
    const unit = Math.min(o.pw, o.ph);
    const relief = Math.max(1.6 / o.k, unit * 0.035);
    ctx.lineWidth = relief * 2;
    ctx.save();
    ctx.translate(relief * 0.7, relief * 0.7);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.stroke(path);
    ctx.restore();
    ctx.save();
    ctx.translate(-relief * 0.7, -relief * 0.7);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.stroke(path);
    ctx.restore();
    ctx.lineWidth = Math.max(1.2 / o.k, unit * 0.012);
    ctx.strokeStyle = 'rgba(12,12,14,0.55)';
    ctx.stroke(path);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// Rangement des pièces sur les pages, en étagères (les plus hautes
// d'abord, de gauche à droite). `slots` : taille de chaque emplacement.
// null si un emplacement ne tient pas dans une page.
function packShelves(slots, pageSize) {
  const order = slots.map((_, i) => i).sort((a, b) => slots[b].h - slots[a].h);
  const places = new Array(slots.length);
  const used = [{ w: 0, h: 0 }];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const i of order) {
    const s = slots[i];
    if (s.w > pageSize || s.h > pageSize) return null;
    if (x + s.w > pageSize) { y += shelf; x = 0; shelf = 0; }
    if (y + s.h > pageSize) { used.push({ w: 0, h: 0 }); x = 0; y = 0; shelf = 0; }
    const page = used.length - 1;
    places[i] = { page, x, y };
    x += s.w;
    shelf = Math.max(shelf, s.h);
    used[page].w = Math.max(used[page].w, x);
    used[page].h = Math.max(used[page].h, y + s.h);
  }
  return { places, used };
}

/**
 * Cuit toutes les pièces. Renvoie { textures: Map(id -> Texture), k, pad, ... }.
 * `pieces` : [{ id, c, r, box?, shape }] ; cols × rows : la grille de cases.
 * Coordonnées "monde" = celles de la partie.
 */
export async function bakeAtlas({ source, cols, rows, worldW, worldH, pieces, quality, seams, maxTextureSize = 4096, onProgress, signal }) {
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.balanced;
  const pw = worldW / cols;
  const ph = worldH / rows;
  const ts = Math.min(pw, ph) * 0.25;
  // Marge autour de la case : de quoi contenir les languettes (plus
  // grandes pour les pièces magiques) et le relief.
  const reach = pieces.reduce((m, p) => Math.max(m, pieceReach(p.shape)), 0.25);
  const pad = Math.min(pw, ph) * reach + Math.max(2, Math.min(pw, ph) * 0.05);
  const pageSize = Math.min(preset.pageSize, maxTextureSize);
  const sx = source.width / worldW;
  const sy = source.height / worldH;
  const n = pieces.length;

  // Emplacement de chaque pièce (son cadre et la marge autour), à la finesse k.
  const slotsFor = (k) => pieces.map((p) => {
    const [, , bw, bh] = boxOf(p);
    return { w: Math.ceil((bw * pw + 2 * pad) * k) + GUTTER, h: Math.ceil((bh * ph + 2 * pad) * k) + GUTTER };
  });

  // Plus grande finesse possible dans le budget de pages de la qualité.
  let k = Math.min(preset.kMax, Math.max(1, Math.min(sx, sy)));
  let slots = slotsFor(k);
  let packed = packShelves(slots, pageSize);
  while ((!packed || packed.used.length > preset.maxPages) && k > 0.1) {
    k *= 0.92;
    slots = slotsFor(k);
    packed = packShelves(slots, pageSize);
  }

  const pages = packed.used.map((u) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(pageSize, nextPow2(u.w));
    canvas.height = Math.min(pageSize, nextPow2(u.h));
    return canvas;
  });
  const pageCount = pages.length;
  const ctxs = pages.map((c) => c.getContext('2d'));
  const scratch = document.createElement('canvas');
  scratch.width = Math.max(...slots.map((s) => s.w));
  scratch.height = Math.max(...slots.map((s) => s.h));
  const sctx = scratch.getContext('2d', { willReadFrequently: false });
  const opts = { k, pad, pw, ph, ts, sx, sy, seams };

  const frames = new Map();
  for (let i = 0; i < n; i++) {
    const piece = pieces[i];
    const { page, x, y } = packed.places[i];
    const w = slots[i].w - GUTTER;
    const h = slots[i].h - GUTTER;
    bakePiece(sctx, source, piece, opts);
    ctxs[page].drawImage(scratch, 0, 0, w, h, x, y, w, h);
    frames.set(piece.id, { page, x, y, w, h });
    if (i % 24 === 23) {
      onProgress?.((i + 1) / n);
      await yieldToBrowser();
      if (signal?.aborted) throw new DOMException('Annulé', 'AbortError');
    }
  }
  onProgress?.(1);

  const baseTextures = pages.map((canvas) => new PIXI.BaseTexture(canvas, {
    scaleMode: PIXI.SCALE_MODES.LINEAR,
    mipmap: PIXI.MIPMAP_MODES.POW2,
  }));
  const textures = new Map();
  for (const [id, f] of frames) textures.set(id, new PIXI.Texture(baseTextures[f.page], new PIXI.Rectangle(f.x, f.y, f.w, f.h)));

  return {
    textures,
    k,
    pad,
    pages: pageCount,
    pageSize,
    destroy() {
      textures.forEach((t) => t.destroy(false));
      baseTextures.forEach((b) => b.destroy());
    },
  };
}

// Image entière réduite, pour le filigrane dans le cadre.
export function makeGhostTexture(source, maxSize = 2048) {
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return new PIXI.Texture(new PIXI.BaseTexture(canvas, { scaleMode: PIXI.SCALE_MODES.LINEAR }));
}

// ------------------------------------------------------------
// Zone cliquable fidèle à la forme de la pièce (languettes comprises),
// en coordonnées locales de la sprite (pixels de texture).
// ------------------------------------------------------------
export function samplePiecePath(shape, pw, ph, ts, steps = 8) {
  const pts = [];
  let cx = 0;
  let cy = 0;
  const recorder = {
    moveTo(x, y) { pts.push(x, y); cx = x; cy = y; },
    lineTo(x, y) { pts.push(x, y); cx = x; cy = y; },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        pts.push(
          u * u * u * cx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
          u * u * u * cy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
        );
      }
      cx = x;
      cy = y;
    },
  };
  tracePiecePath(recorder, shape, pw, ph, ts);
  return pts;
}

// Polygone de la pièce, testé seulement quand le point est dans son
// rectangle : avec des centaines de pièces aux contours détaillés, le
// survol reste léger.
class PieceHitArea {
  constructor(points) {
    this.polygon = new PIXI.Polygon(points);
    this.x0 = Infinity; this.y0 = Infinity; this.x1 = -Infinity; this.y1 = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
      this.x0 = Math.min(this.x0, points[i]); this.x1 = Math.max(this.x1, points[i]);
      this.y0 = Math.min(this.y0, points[i + 1]); this.y1 = Math.max(this.y1, points[i + 1]);
    }
  }

  contains(x, y) {
    return x >= this.x0 && x <= this.x1 && y >= this.y0 && y <= this.y1 && this.polygon.contains(x, y);
  }
}

// Les pièces classiques partagent quelques formes : cache par forme. Les
// pièces magiques sont toutes différentes : cache par objet (libéré avec lui).
const hitCache = new Map();
const magicHitCache = new WeakMap();
export function pieceHitArea(shape, metrics, atlas) {
  const sizeKey = `${atlas.k}|${atlas.pad}|${metrics.pw}|${metrics.ph}`;
  const magic = shape?.cut === 'magic';
  const key = magic ? sizeKey : `${shape.topTab}${shape.rightTab}${shape.bottomTab}${shape.leftTab}|${sizeKey}`;
  let area = magic ? magicHitCache.get(shape)?.[key] : hitCache.get(key);
  if (!area) {
    const pts = samplePiecePath(shape, metrics.pw, metrics.ph, metrics.ts, 6);
    for (let i = 0; i < pts.length; i++) pts[i] = (pts[i] + atlas.pad) * atlas.k;
    area = new PieceHitArea(pts);
    if (magic) magicHitCache.set(shape, { [key]: area });
    else hitCache.set(key, area);
  }
  return area;
}
