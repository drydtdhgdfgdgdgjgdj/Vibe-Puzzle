// ============================================================
// Repartir d'une base vide (parties de test, photos envoyées).
//
//   npm run vider-parties
//
// Rien n'est supprimé : database.json, sa copie de secours et les photos
// envoyées sont déplacées dans data/archive-<date>/ (à effacer à la main
// une fois sûr de toi). Le serveur doit être ARRÊTÉ : sinon il garde les
// parties en mémoire et les réécrirait au prochain enregistrement.
// ============================================================
const fs = require('fs');
const net = require('net');
const path = require('path');

const dataDir = process.env.PUZZLE_DATA_DIR || path.join(__dirname, '..', 'data');
const port = Number(process.env.PORT) || 3001;

function serverRunning() {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

(async () => {
  if (await serverRunning()) {
    console.error(`Le serveur tourne encore sur le port ${port} : arrête-le (Ctrl+C dans son terminal) puis relance cette commande.`);
    process.exit(1);
  }
  const items = ['database.json', 'database.bak.json', 'uploads']
    .concat(fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((f) => /^database\.corrupt-\d+\.json$/.test(f)) : [])
    .filter((f) => fs.existsSync(path.join(dataDir, f)));
  if (!items.length) {
    console.log('Rien à vider : la base est déjà vide.');
    return;
  }
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}h${pad(d.getMinutes())}`;
  const archive = path.join(dataDir, `archive-${stamp}`);
  fs.mkdirSync(archive, { recursive: true });
  for (const f of items) fs.renameSync(path.join(dataDir, f), path.join(archive, f));
  console.log(`Parties de test rangées dans ${path.relative(process.cwd(), archive)} (${items.join(', ')}).`);
  console.log('Au prochain lancement, le serveur repart d’une base vide.');
})();
