import { useId } from 'react';
import { tracePiecePath } from '../pieceGeometry';
import { SparklesIcon } from '../icons';

// Formes de pièces proposées à la création d'une partie (voir lib/shapes.js).
const PIECE_CUTS = [
  { id: 'classic', name: 'Classiques', description: 'Une grille régulière, une languette au milieu de chaque côté.' },
  { id: 'magic', name: 'Magiques', description: 'Toutes différentes : petites, longues, en L, avec plus ou moins de têtes.' },
];

// Petit puzzle d'exemple de 12 pièces par découpe, tiré une fois pour
// toutes par lib/shapes.js (generatePieces(4, 3, découpe, tirage n° 2)).
// cols × rows : la grille de cases.
const SAMPLES = {
  classic: {
    cols: 4,
    rows: 3,
    pieces: [
      { c: 0, r: 0, shape: { topTab: 0, bottomTab: -1, leftTab: 0, rightTab: 1 } },
      { c: 0, r: 1, shape: { topTab: 1, bottomTab: 1, leftTab: 0, rightTab: -1 } },
      { c: 0, r: 2, shape: { topTab: -1, bottomTab: 0, leftTab: 0, rightTab: 1 } },
      { c: 1, r: 0, shape: { topTab: 0, bottomTab: -1, leftTab: -1, rightTab: -1 } },
      { c: 1, r: 1, shape: { topTab: 1, bottomTab: -1, leftTab: 1, rightTab: 1 } },
      { c: 1, r: 2, shape: { topTab: 1, bottomTab: 0, leftTab: -1, rightTab: 1 } },
      { c: 2, r: 0, shape: { topTab: 0, bottomTab: 1, leftTab: 1, rightTab: -1 } },
      { c: 2, r: 1, shape: { topTab: -1, bottomTab: -1, leftTab: -1, rightTab: 1 } },
      { c: 2, r: 2, shape: { topTab: 1, bottomTab: 0, leftTab: -1, rightTab: 1 } },
      { c: 3, r: 0, shape: { topTab: 0, bottomTab: -1, leftTab: 1, rightTab: 0 } },
      { c: 3, r: 1, shape: { topTab: 1, bottomTab: -1, leftTab: -1, rightTab: 0 } },
      { c: 3, r: 2, shape: { topTab: 1, bottomTab: 0, leftTab: -1, rightTab: 0 } },
    ],
  },
  magic: {
    cols: 6,
    rows: 5,
    pieces: [
      { c: 0, r: 0, box: [0, 0, 2, 3], shape: { cut: 'magic', p: [0, 0, 1, 0, 1, 1, 1, 2, 2, 2, 2, 3, 1, 3, 0, 3], v: [0, 0, 78, 0, -30, -23, -29, 96, 41, -60, -49, 42, -7, 137, 0, 93], e: [null, [-8, 540, 1, 154, 97, 38, 153, 151], [-75, 412, -1, 128, 81, 26, 115, 21], [-71, 454, 1, 162, 112, 25, 158, 122], [-81, 454, 1, 159, 108, 21, 165, -34], [-76, 394, 1, 177, 117, 36, 164, 115], [-37], null] } },
      { c: 1, r: 0, box: [1, 0, 3, 1], shape: { cut: 'magic', p: [0, 0, 3, 0, 3, 1, 2, 1, 1, 1, 0, 1], v: [78, 0, -21, 0, 3, -121, 37, -108, 66, 79, -30, -23], e: [null, [34], [-9, 410, 1, 133, 89, 17, 135, 112], [77, 560, -1, 177, 108, 38, 148, -77], [8], [-8, 540, 1, 154, 97, 38, 153, 151]] } },
      { c: 4, r: 0, box: [4, 0, 2, 1], shape: { cut: 'magic', p: [0, 0, 2, 0, 2, 1, 1, 1, 0, 1], v: [-21, 0, 0, 0, 0, 134, -80, 114, 3, -121], e: [null, null, [-81], [-95, 514, 1, 170, 115, 25, 165, 96], [34]] } },
      { c: 1, r: 1, box: [1, 1, 2, 1], shape: { cut: 'magic', p: [0, 0, 1, 0, 2, 0, 2, 1, 1, 1, 0, 1], v: [-30, -23, 66, 79, 37, -108, 22, 125, 41, -60, -29, 96], e: [[8], [77, 560, -1, 177, 108, 38, 148, -77], [63, 582, 1, 135, 87, 28, 128, 10], [-79], [-71, 454, 1, 162, 112, 25, 158, 122], [-75, 412, -1, 128, 81, 26, 115, 21]] } },
      { c: 3, r: 1, box: [3, 1, 3, 2], shape: { cut: 'magic', p: [0, 0, 1, 0, 2, 0, 3, 0, 3, 2, 2, 2, 2, 1, 1, 1, 0, 1], v: [37, -108, 3, -121, -80, 114, 0, 134, 0, 89, -83, -96, 28, 6, 102, -15, 22, 125], e: [[-9, 410, 1, 133, 89, 17, 135, 112], [-95, 514, 1, 170, 115, 25, 165, 96], [-81], null, [51, 469, 1, 155, 104, 24, 143, -123], [-61, 539, 1, 190, 127, 38, 180, 76], [54, 528, -1, 153, 99, 26, 158, -50], [-55, 467, -1, 124, 79, 23, 120, -25], [63, 582, 1, 135, 87, 28, 128, 10]] } },
      { c: 2, r: 2, box: [2, 2, 1, 1], shape: { cut: 'magic', p: [0, 0, 1, 0, 1, 1, 0, 1], v: [41, -60, 22, 125, -132, 22, -49, 42], e: [[-79], [64, 518, -1, 156, 108, 22, 160, 131], [-79, 508, -1, 124, 79, 25, 127, -114], [-81, 454, 1, 159, 108, 21, 165, -34]] } },
      { c: 3, r: 2, box: [3, 2, 2, 1], shape: { cut: 'magic', p: [0, 0, 1, 0, 2, 0, 2, 1, 1, 1, 0, 1], v: [22, 125, 102, -15, 28, 6, -83, -96, -77, 23, -132, 22], e: [[-55, 467, -1, 124, 79, 23, 120, -25], [54, 528, -1, 153, 99, 26, 158, -50], [-61, 539, 1, 190, 127, 38, 180, 76], [-69], [-87, 544, 1, 169, 112, 36, 153, 145], [64, 518, -1, 156, 108, 22, 160, 131]] } },
      { c: 0, r: 3, box: [0, 3, 3, 1], shape: { cut: 'magic', p: [0, 0, 1, 0, 2, 0, 3, 0, 3, 1, 2, 1, 1, 1, 0, 1], v: [0, 93, -7, 137, -49, 42, -132, 22, 5, 61, -110, -87, -67, -116, 0, -93], e: [[-37], [-76, 394, 1, 177, 117, 36, 164, 115], [-79, 508, -1, 124, 79, 25, 127, -114], [33, 555, -1, 166, 110, 27, 156, -141], [33, 422, 1, 156, 107, 28, 155, 46], [-89, 545, -1, 157, 103, 24, 151, -42], [82, 477, -1, 186, 118, 29, 176, 135], null] } },
      { c: 3, r: 3, box: [3, 3, 3, 2], shape: { cut: 'magic', p: [0, 0, 1, 0, 2, 0, 3, 0, 3, 2, 2, 2, 2, 1, 1, 1, 0, 1], v: [-132, 22, -77, 23, -83, -96, 0, 89, 0, 0, -87, 0, -70, 90, -11, 19, 5, 61], e: [[-87, 544, 1, 169, 112, 36, 153, 145], [-69], [51, 469, 1, 155, 104, 24, 143, -123], null, null, [-23, 419, 1, 181, 116, 35, 176, 119], [47, 555, 1, 153, 103, 31, 159, 115], [76, 468, 1, 151, 98, 39, 142, -97], [33, 555, -1, 166, 110, 27, 156, -141]] } },
      { c: 0, r: 4, box: [0, 4, 1, 1], shape: { cut: 'magic', p: [0, 0, 1, 0, 1, 1, 0, 1], v: [0, -93, -67, -116, 58, 0, 0, 0], e: [[82, 477, -1, 186, 118, 29, 176, 135], [-9, 471, -1, 163, 110, 36, 159, -136], null, null] } },
      { c: 1, r: 4, box: [1, 4, 3, 1], shape: { cut: 'magic', p: [0, 0, 1, 0, 2, 0, 3, 0, 3, 1, 0, 1], v: [-67, -116, -110, -87, 5, 61, -11, 19, 6, 0, 58, 0], e: [[-89, 545, -1, 157, 103, 24, 151, -42], [33, 422, 1, 156, 107, 28, 155, 46], [76, 468, 1, 151, 98, 39, 142, -97], [-74, 432, -1, 148, 97, 18, 140, -52], null, [-9, 471, -1, 163, 110, 36, 159, -136]] } },
      { c: 4, r: 4, box: [4, 4, 1, 1], shape: { cut: 'magic', p: [0, 0, 1, 0, 1, 1, 0, 1], v: [-11, 19, -70, 90, -87, 0, 6, 0], e: [[47, 555, 1, 153, 103, 31, 159, 115], [-23, 419, 1, 181, 116, 35, 176, 119], null, [-74, 432, -1, 148, 97, 18, 140, -52]] } },
    ],
  },
};

const WIDTH = 240; // largeur de l'aperçu, en unités SVG
const SPREAD = 0.1; // pièces un peu écartées du centre, pour bien voir leurs formes

// Contour d'une pièce en données de chemin SVG (même tracé que dans le jeu).
function pathData(shape, cell) {
  const f = (n) => Math.round(n * 10) / 10;
  let d = '';
  tracePiecePath({
    moveTo: (x, y) => { d += `M${f(x)} ${f(y)}`; },
    lineTo: (x, y) => { d += `L${f(x)} ${f(y)}`; },
    bezierCurveTo: (a, b, c, e, x, y) => { d += `C${f(a)} ${f(b)} ${f(c)} ${f(e)} ${f(x)} ${f(y)}`; },
  }, shape, cell, cell);
  return `${d}Z`;
}

const PREVIEWS = Object.fromEntries(Object.entries(SAMPLES).map(([cut, sample]) => {
  const cell = WIDTH / sample.cols;
  const h = sample.rows * cell;
  return [cut, {
    w: WIDTH,
    h,
    cell,
    pieces: sample.pieces.map((p) => {
      const [bx, by, bw, bh] = p.box || [p.c, p.r, 1, 1];
      const cx = (bx + bw / 2) * cell - WIDTH / 2;
      const cy = (by + bh / 2) * cell - h / 2;
      return {
        key: `${p.c}-${p.r}`,
        x: bx * cell + cx * SPREAD,
        y: by * cell + cy * SPREAD,
        ix: -bx * cell,
        iy: -by * cell,
        d: pathData(p.shape, cell),
      };
    }),
  }];
}));

// Aperçu : la photo choisie, découpée comme le serait la partie.
function CutPreview({ cut, image }) {
  const uid = useId().replace(/[^\w-]/g, '');
  const pv = PREVIEWS[cut];
  const m = pv.cell * 0.45; // marge : pièces écartées, têtes qui dépassent
  return (
    <svg className="cut-preview" viewBox={`${-m} ${-m} ${pv.w + 2 * m} ${pv.h + 2 * m}`} aria-hidden="true">
      {pv.pieces.map((p) => {
        const id = `${uid}-${cut}-${p.key}`;
        return (
          <g key={id} transform={`translate(${p.x} ${p.y})`}>
            <clipPath id={id}><path d={p.d} /></clipPath>
            <path d={p.d} fill="#2a2e38" />
            {image && (
              <image
                href={image} x={p.ix} y={p.iy} width={pv.w} height={pv.h}
                preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`}
              />
            )}
            <path d={p.d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.2" strokeLinejoin="round" />
          </g>
        );
      })}
    </svg>
  );
}

export default function CutPicker({ value, onChange, image }) {
  return (
    <div className="cut-options" role="radiogroup" aria-label="Forme des pièces">
      {PIECE_CUTS.map((cut) => (
        <button
          type="button" key={cut.id} role="radio" aria-checked={value === cut.id}
          className={`cut-option ${value === cut.id ? 'active' : ''}`}
          onClick={() => onChange(cut.id)}
        >
          <CutPreview cut={cut.id} image={image} />
          <span className="cut-option-name">{cut.id === 'magic' && <SparklesIcon size={14} />}{cut.name}</span>
          <span className="cut-option-desc">{cut.description}</span>
        </button>
      ))}
    </div>
  );
}
