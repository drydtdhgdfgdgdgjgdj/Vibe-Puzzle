// ============================================================
// Géométrie partagée des pièces de puzzle.
//
// Une pièce est définie par 4 "tabs" (languette qui dépasse = 1,
// encoche qui rentre = -1, bord droit = 0 sur les bords du plateau).
// Cette fonction trace UNIQUEMENT le chemin (moveTo/lineTo/bezier) ;
// l'appelant décide s'il remplit (masque de découpe) ou trace un
// simple contour (trait de séparation visuel, export image...).
// Elle est utilisée à la fois par PuzzleBoard (rendu PIXI, via un
// petit adaptateur) et par exportImage (rendu Canvas2D classique).
// ============================================================

export function tracePiecePath(ctx, shape, w, h, tabSize) {
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

// Adaptateur pour tracer le même chemin dans un PIXI.Graphics
// (son API moveTo/lineTo/bezierCurveTo a la même signature que Canvas2D,
// donc on peut réutiliser tracePiecePath tel quel).
export function tracePiecePathPixi(graphics, shape, w, h, tabSize) {
  tracePiecePath(graphics, shape, w, h, tabSize);
}
