// ============================================================
// Prépare les images de puzzle et les fonds vidéo pour le web.
//   npm run medias
//
// Dépose les fichiers d'origine (n'importe quel nom, espaces et accents
// compris : il devient le nom affiché) dans :
//   medias-originaux/puzzles/  images de puzzle (.jpg, .png, .webp)
//   medias-originaux/fonds/    vidéos de fond (.mp4, .mov, .webm...)
//                              + optionnel : une capture du même nom en
//                              .png/.jpg pour l'image de chargement et la vignette
//
// Le script crée dans puzzle-frontend/public/ :
//   puzzles/<id>.jpg (4096 px max)   + puzzles/<id>-mini.jpg (vignette)
//   fonds/<id>.mp4 (1080p, 30 i/s max, SANS son, lecture immédiate)
//   fonds/<id>.jpg (chargement)      + fonds/<id>-mini.jpg (vignette)
// puis affiche les lignes à coller dans puzzle-frontend/src/config.js.
//
// Les fichiers déjà prêts (plus récents que l'original) sont sautés.
// Les originaux restent dans medias-originaux/ (exclu de git).
// ============================================================
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let FFMPEG;
try {
  FFMPEG = require('ffmpeg-static');
} catch {
  FFMPEG = 'ffmpeg';
}

const ROOT = path.join(__dirname, '..');
const ORIG = path.join(ROOT, 'medias-originaux');
const PUBLIC = path.join(ROOT, 'puzzle-frontend', 'public');
const VIDEO_RE = /\.(mp4|mov|webm|mkv|m4v)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
// Même limite que les photos envoyées par les joueurs : au-delà, certains
// téléphones n'arrivent plus à découper l'image.
const PUZZLE_MAX_PX = 4096;
const VIDEO_MAX_MB = 25; // téléchargée par chaque joueur : au-delà, on recompresse plus fort

function slugify(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function ffmpeg(args) {
  execFileSync(FFMPEG, ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
}

function frameRate(file) {
  // ffmpeg -i écrit les infos du fichier sur stderr, avec "xx fps".
  try {
    execFileSync(FFMPEG, ['-hide_banner', '-i', file], { stdio: 'pipe' });
  } catch (err) {
    const m = String(err.stderr).match(/([\d.]+) fps/);
    if (m) return Number(m[1]);
  }
  return 30;
}

const mb = (f) => fs.statSync(f).size / 1e6;
const upToDate = (out, src) => fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(src).mtimeMs;
const listFiles = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)) : []);

function stills(input, outDir, id, { posterPx, miniPx }) {
  if (posterPx) ffmpeg(['-i', input, '-vf', `scale='min(${posterPx},iw)':-2:flags=lanczos`, '-frames:v', '1', '-q:v', '3', path.join(outDir, `${id}.jpg`)]);
  ffmpeg(['-i', input, '-vf', `scale=${miniPx}:-2:flags=lanczos`, '-frames:v', '1', '-q:v', '5', path.join(outDir, `${id}-mini.jpg`)]);
}

// ---------- Images de puzzle ----------
function puzzles() {
  const src = path.join(ORIG, 'puzzles');
  const out = path.join(PUBLIC, 'puzzles');
  const files = listFiles(src, IMAGE_RE);
  if (!files.length) return [];
  fs.mkdirSync(out, { recursive: true });
  const lines = [];
  for (const file of files) {
    const base = file.replace(IMAGE_RE, '');
    const id = slugify(base);
    const input = path.join(src, file);
    const target = path.join(out, `${id}.jpg`);
    lines.push(`  puzzle('${id}', ${JSON.stringify(base)}),`);
    if (upToDate(target, input)) { console.log(`= puzzle ${id} : déjà prêt`); continue; }
    ffmpeg(['-i', input, '-vf', `scale='min(${PUZZLE_MAX_PX},iw)':-2:flags=lanczos`, '-frames:v', '1', '-q:v', '2', target]);
    stills(input, out, id, { miniPx: 320 });
    console.log(`→ puzzle ${id} : ${mb(input).toFixed(1)} Mo → ${mb(target).toFixed(1)} Mo`);
  }
  return lines;
}

// ---------- Fonds vidéo ----------
function encodeVideo(input, target, crf) {
  const vf = ["scale=-2:'min(1080,ih)':flags=lanczos"];
  if (frameRate(input) > 30.5) vf.push('fps=30');
  ffmpeg(['-i', input, '-an', '-vf', vf.join(','),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-maxrate', '6M', '-bufsize', '12M', '-movflags', '+faststart', target]);
}

function fonds() {
  const src = path.join(ORIG, 'fonds');
  const out = path.join(PUBLIC, 'fonds');
  const files = listFiles(src, VIDEO_RE);
  if (!files.length) return [];
  fs.mkdirSync(out, { recursive: true });
  const lines = [];
  for (const file of files) {
    const base = file.replace(VIDEO_RE, '');
    const id = slugify(base);
    const input = path.join(src, file);
    const target = path.join(out, `${id}.mp4`);
    lines.push(`  video('${id}', ${JSON.stringify(base)}),`);
    if (upToDate(target, input)) { console.log(`= fond ${id} : déjà prêt`); continue; }
    process.stdout.write(`→ fond ${id} : compression… `);
    let crf = 23;
    encodeVideo(input, target, crf);
    while (mb(target) > VIDEO_MAX_MB && crf < 32) {
      crf += 3;
      encodeVideo(input, target, crf);
    }
    const capture = ['.png', '.jpg', '.jpeg'].map((ext) => path.join(src, base + ext)).find((f) => fs.existsSync(f));
    stills(capture || input, out, id, { posterPx: 1920, miniPx: 240 });
    console.log(`${mb(input).toFixed(1)} Mo → ${mb(target).toFixed(1)} Mo${capture ? '' : ' (vignette tirée de la 1re image)'}`);
  }
  return lines;
}

for (const dir of ['puzzles', 'fonds']) fs.mkdirSync(path.join(ORIG, dir), { recursive: true });
const puzzleLines = puzzles();
const fondLines = fonds();
if (!puzzleLines.length && !fondLines.length) {
  console.log('Rien à préparer : dépose tes fichiers dans medias-originaux/puzzles/ ou medias-originaux/fonds/.');
  process.exit(0);
}
console.log('\nÀ coller dans puzzle-frontend/src/config.js si ce n\'est pas déjà fait :');
if (puzzleLines.length) console.log(`PRESET_IMAGES :\n${puzzleLines.join('\n')}`);
if (fondLines.length) console.log(`BACKGROUNDS :\n${fondLines.join('\n')}`);
