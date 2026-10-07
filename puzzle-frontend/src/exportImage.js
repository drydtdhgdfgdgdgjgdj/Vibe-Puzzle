import { tracePiecePath } from './pieceGeometry';

function triggerDownload(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Télécharge la photo d'origine telle quelle, sans aucune compression
// supplémentaire (c'est le fichier gardé de côté à la création de la partie,
// jamais la version redimensionnée utilisée pour le jeu).
export async function downloadOriginalImage(room, filename = 'puzzle-original.png') {
  const img = await loadImage(room.originalImageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  triggerDownload(canvas.toDataURL('image/png'), filename);
}

// Reconstruit l'image finale à pleine résolution avec un fin trait sombre
// qui suit le vrai contour (languettes comprises) de chaque pièce.
export async function downloadImageWithSeams(room, filename = 'puzzle-assemble.png') {
  const img = await loadImage(room.originalImageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Une case de la grille (une pièce classique, ou une case des pièces magiques).
  const pieceW = canvas.width / room.cols;
  const pieceH = canvas.height / room.rows;
  const tabSize = Math.min(pieceW, pieceH) * 0.25;

  ctx.strokeStyle = 'rgba(15, 15, 15, 0.55)';
  ctx.lineWidth = Math.max(1, Math.min(pieceW, pieceH) * 0.018);
  ctx.lineJoin = 'round';

  Object.values(room.pieces).forEach((piece) => {
    const [bx, by] = piece.box || [piece.c, piece.r];
    ctx.save();
    ctx.translate(bx * pieceW, by * pieceH);
    ctx.beginPath();
    tracePiecePath(ctx, piece.shape, pieceW, pieceH, tabSize);
    ctx.stroke();
    ctx.restore();
  });

  triggerDownload(canvas.toDataURL('image/png'), filename);
}
