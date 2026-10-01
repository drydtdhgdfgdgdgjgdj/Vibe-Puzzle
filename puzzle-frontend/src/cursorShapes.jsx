// ============================================================
// Formes de curseur disponibles pour personnaliser son pointeur.
// Chaque forme fournit :
//  - un tracé SVG (aperçu dans la modale de réglages)
//  - une fonction qui dessine la même forme dans un PIXI.Graphics
//    (affichage du curseur des autres joueurs sur le plateau)
// ============================================================

function drawDot(g, color) {
  g.beginFill(color);
  g.drawCircle(0, 0, 9);
  g.endFill();
  g.lineStyle(2, 0xffffff, 0.9);
  g.drawCircle(0, 0, 9);
}

function drawArrow(g, color) {
  g.beginFill(color);
  g.moveTo(0, 0);
  g.lineTo(0, 16);
  g.lineTo(4.2, 12.4);
  g.lineTo(7, 18.5);
  g.lineTo(9.6, 17.2);
  g.lineTo(6.8, 11.2);
  g.lineTo(11.5, 11.2);
  g.lineTo(0, 0);
  g.endFill();
  g.lineStyle(1.4, 0xffffff, 0.9);
  g.drawPolygon([0, 0, 0, 16, 4.2, 12.4, 7, 18.5, 9.6, 17.2, 6.8, 11.2, 11.5, 11.2]);
}

function drawStar(g, color) {
  const spikes = 5, outerR = 10, innerR = 4.2;
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.beginFill(color);
  g.lineStyle(1.4, 0xffffff, 0.9);
  g.drawPolygon(pts);
  g.endFill();
}

function drawHeart(g, color) {
  g.beginFill(color);
  g.lineStyle(1.4, 0xffffff, 0.9);
  g.moveTo(0, 4);
  g.bezierCurveTo(-9, -6, -16, 4, 0, 14);
  g.bezierCurveTo(16, 4, 9, -6, 0, 4);
  g.endFill();
}

function drawDiamond(g, color) {
  g.beginFill(color);
  g.lineStyle(1.4, 0xffffff, 0.9);
  g.drawPolygon([0, -10, 8.5, 0, 0, 10, -8.5, 0]);
  g.endFill();
}

function drawPaw(g, color) {
  g.beginFill(color);
  g.lineStyle(1, 0xffffff, 0.9);
  g.drawCircle(0, 3, 6.2);
  g.drawCircle(-6.5, -4, 3);
  g.drawCircle(-2, -8, 3);
  g.drawCircle(2.8, -8, 3);
  g.drawCircle(7, -4.2, 3);
  g.endFill();
}

export const CURSOR_SHAPES = [
  {
    id: 'dot',
    name: 'Point',
    draw: drawDot,
    svg: <circle cx="12" cy="12" r="6.5" />,
  },
  {
    id: 'arrow',
    name: 'Flèche',
    draw: drawArrow,
    svg: <path d="M7 5v14l3.5-3.2L13 21l2.4-1.1-2.6-5.8h5.4Z" />,
  },
  {
    id: 'star',
    name: 'Étoile',
    draw: drawStar,
    svg: <path d="m12 4 2.2 5.6 6 .4-4.6 3.9 1.5 5.9L12 16.6 6.9 19.8l1.5-5.9-4.6-3.9 6-.4Z" />,
  },
  {
    id: 'heart',
    name: 'Cœur',
    draw: drawHeart,
    svg: <path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.2 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
  },
  {
    id: 'diamond',
    name: 'Diamant',
    draw: drawDiamond,
    svg: <path d="M12 3 20 12 12 21 4 12Z" />,
  },
  {
    id: 'paw',
    name: 'Patte',
    draw: drawPaw,
    svg: (
      <>
        <circle cx="12" cy="15.5" r="4.3" />
        <circle cx="5.8" cy="10.2" r="2.1" />
        <circle cx="9.3" cy="5.8" r="2.1" />
        <circle cx="14.7" cy="5.8" r="2.1" />
        <circle cx="18.2" cy="10.2" r="2.1" />
      </>
    ),
  },
];

export function getCursorShape(id) {
  return CURSOR_SHAPES.find((s) => s.id === id) || CURSOR_SHAPES[0];
}
