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
import { tracePiecePath } from '../pieceGeometry';

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
  drawImageClipped(
    ctx, source,
    (piece.c * o.pw - o.pad) * o.sx, (piece.r * o.ph - o.pad) * o.sy,
    o.cellW * o.sx, o.cellH * o.sy,
    -o.pad, -o.pad, o.cellW, o.cellH,
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

/**
 * Cuit toutes les pièces. Renvoie { textures: Map(id -> Texture), k, pad, ... }.
 * `pieces` : [{ id, c, r, shape }]. Coordonnées "monde" = celles de la partie.
 */
export async function bakeAtlas({ source, cols, rows, worldW, worldH, pieces, quality, seams, maxTextureSize = 4096, onProgress, signal }) {
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.balanced;
  const pw = worldW / cols;
  const ph = worldH / rows;
  const ts = Math.min(pw, ph) * 0.25;
  const pad = ts + Math.max(2, Math.min(pw, ph) * 0.05);
  const cellW = pw + 2 * pad;
  const cellH = ph + 2 * pad;
  const pageSize = Math.min(preset.pageSize, maxTextureSize);
  const sx = source.width / worldW;
  const sy = source.height / worldH;
  const n = pieces.length;

  const layoutFor = (k) => {
    const cw = Math.ceil(cellW * k) + GUTTER;
    const ch = Math.ceil(cellH * k) + GUTTER;
    const perRow = Math.floor(pageSize / cw);
    const perCol = Math.floor(pageSize / ch);
    return { cw, ch, perRow, perPage: perRow * perCol };
  };

  // Plus grande finesse possible dans le budget de pages de la qualité.
  let k = Math.min(preset.kMax, Math.max(1, Math.min(sx, sy)));
  let lay = layoutFor(k);
  while ((lay.perPage < 1 || Math.ceil(n / lay.perPage) > preset.maxPages) && k > 0.1) {
    k *= 0.92;
    lay = layoutFor(k);
  }

  const pageCount = Math.max(1, Math.ceil(n / lay.perPage));
  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    const count = i === pageCount - 1 ? n - i * lay.perPage : lay.perPage;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(pageSize, nextPow2(Math.min(count, lay.perRow) * lay.cw));
    canvas.height = Math.min(pageSize, nextPow2(Math.ceil(count / lay.perRow) * lay.ch));
    pages.push(canvas);
  }
  const ctxs = pages.map((c) => c.getContext('2d'));
  const scratch = document.createElement('canvas');
  scratch.width = lay.cw;
  scratch.height = lay.ch;
  const sctx = scratch.getContext('2d', { willReadFrequently: false });
  const opts = { k, pad, pw, ph, ts, sx, sy, cellW, cellH, seams };
  const w = lay.cw - GUTTER;
  const h = lay.ch - GUTTER;

  const frames = new Map();
  for (let i = 0; i < n; i++) {
    const piece = pieces[i];
    const page = Math.floor(i / lay.perPage);
    const slot = i % lay.perPage;
    const x = (slot % lay.perRow) * lay.cw;
    const y = Math.floor(slot / lay.perRow) * lay.ch;
    bakePiece(sctx, source, piece, opts);
    ctxs[page].drawImage(scratch, 0, 0, w, h, x, y, w, h);
    frames.set(piece.id, { page, x, y });
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
  for (const [id, f] of frames) textures.set(id, new PIXI.Texture(baseTextures[f.page], new PIXI.Rectangle(f.x, f.y, w, h)));

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

const hitCache = new Map();
export function pieceHitArea(shape, metrics, atlas) {
  const key = `${shape.topTab}${shape.rightTab}${shape.bottomTab}${shape.leftTab}|${atlas.k}|${metrics.pw}|${metrics.ph}`;
  let poly = hitCache.get(key);
  if (!poly) {
    const pts = samplePiecePath(shape, metrics.pw, metrics.ph, metrics.ts, 6);
    for (let i = 0; i < pts.length; i++) pts[i] = (pts[i] + atlas.pad) * atlas.k;
    poly = new PIXI.Polygon(pts);
    hitCache.set(key, poly);
  }
  return poly;
}
