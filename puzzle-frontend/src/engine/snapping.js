// ============================================================
// Règles d'accroche (fonctions pures, sans PIXI).
//
// Une pièce "bouge" avec son groupe. Au lâcher :
//  1. en mode accroché, si le groupe est assez près de sa vraie
//     place, il se fixe dans le cadre ;
//  2. sinon, si une pièce du groupe est assez bien alignée avec une
//     voisine (dans la grille du puzzle), le groupe s'y colle ;
//  3. puis tout autre groupe qui se retrouve aligné avec le groupe
//     déplacé est fusionné aussi (multi-fusion) : sans ça, deux
//     morceaux visuellement assemblés pourraient rester séparés et la
//     partie en mode libre ne se terminerait jamais.
// Les seuils sont proportionnels à la taille des pièces.
// ============================================================

export const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function snapThresholds(pw, ph) {
  const u = Math.min(pw, ph);
  return { frame: u * 0.3, neighbor: u * 0.25 };
}

/**
 * @param moving       [{ p, x, y }] pièces du groupe déplacé et leur position proposée
 * @param movingGroupId groupe déplacé
 * @param lockedGroupId groupe "fixé dans le cadre" (null en mode libre)
 * @param neighborOf   (p, dc, dr) => pièce voisine dans la grille, ou null
 * @param isAvailable  (q) => la pièce peut-elle servir d'appui (ni cachée, ni tenue)
 * @param groupAvailable (groupId) => le groupe peut-il être fusionné
 * @returns null | { dx, dy, groupId, locked, merges: [{ groupId, dx, dy }] }
 */
export function computeSnap({ moving, movingGroupId, lockedGroupId, neighborOf, isAvailable, groupAvailable, thresholds }) {
  if (!moving.length) return null;

  if (lockedGroupId) {
    const m0 = moving[0];
    const dx = m0.p.tx - m0.x;
    const dy = m0.p.ty - m0.y;
    if (Math.hypot(dx, dy) < thresholds.frame) return { dx, dy, groupId: lockedGroupId, locked: true, merges: [] };
  }

  let best = null;
  for (const m of moving) {
    for (const [dc, dr] of STEPS) {
      const q = neighborOf(m.p, dc, dr);
      if (!q || q.groupId === movingGroupId || q.groupId === lockedGroupId || !isAvailable(q)) continue;
      if (!groupAvailable(q.groupId)) continue;
      const errX = (q.x - m.x) - (q.tx - m.p.tx);
      const errY = (q.y - m.y) - (q.ty - m.p.ty);
      if (Math.abs(errX) >= thresholds.neighbor || Math.abs(errY) >= thresholds.neighbor) continue;
      const err = Math.hypot(errX, errY);
      if (!best || err < best.err) best = { err, dx: errX, dy: errY, groupId: q.groupId };
    }
  }
  if (!best) return null;

  const merged = new Set([best.groupId]);
  const merges = [];
  const tolerance = thresholds.neighbor * 0.6;
  for (const m of moving) {
    const mx = m.x + best.dx;
    const my = m.y + best.dy;
    for (const [dc, dr] of STEPS) {
      const q = neighborOf(m.p, dc, dr);
      if (!q || q.groupId === movingGroupId || merged.has(q.groupId) || q.groupId === lockedGroupId || !isAvailable(q)) continue;
      if (!groupAvailable(q.groupId)) continue;
      const errX = (q.x - mx) - (q.tx - m.p.tx);
      const errY = (q.y - my) - (q.ty - m.p.ty);
      if (Math.abs(errX) < tolerance && Math.abs(errY) < tolerance) {
        merged.add(q.groupId);
        merges.push({ groupId: q.groupId, dx: -errX, dy: -errY });
      }
    }
  }
  return { dx: best.dx, dy: best.dy, groupId: best.groupId, locked: false, merges };
}

// Décalage à appliquer pour que le groupe reste dans les limites de la table.
export function clampIntoBounds(moving, bounds, metrics) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of moving) {
    x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y);
    x1 = Math.max(x1, m.x + metrics.pw); y1 = Math.max(y1, m.y + metrics.ph);
  }
  let dx = 0;
  let dy = 0;
  if (x1 - x0 <= bounds.w) {
    if (x0 < bounds.x) dx = bounds.x - x0;
    else if (x1 > bounds.x + bounds.w) dx = bounds.x + bounds.w - x1;
  }
  if (y1 - y0 <= bounds.h) {
    if (y0 < bounds.y) dy = bounds.y - y0;
    else if (y1 > bounds.y + bounds.h) dy = bounds.y + bounds.h - y1;
  }
  return { dx, dy };
}

export function expandRect(r, fraction) {
  const mx = r.w * fraction;
  const my = r.h * fraction;
  return { x: r.x - mx, y: r.y - my, w: r.w + 2 * mx, h: r.h + 2 * my };
}
