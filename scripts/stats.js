// ============================================================
// Fréquentation du site : visiteurs, connexions au jeu et parties créées,
// jour par jour, d'après le journal de Caddy et la base des parties.
//
//   Depuis ton PC :  ssh puzzle "sudo node ~/Vibe-Puzzle/scripts/stats.js"
//   Sur le serveur : sudo node ~/Vibe-Puzzle/scripts/stats.js
//
// Lecture seule : rien n'est modifié. `sudo` sert seulement à lire le
// journal de Caddy, réservé à l'administrateur. Ce journal ne garde que
// les dernières semaines (5 fichiers de 10 Mo, voir deploiement/Caddyfile).
// Nombre de jours affichés : JOURS=30 sudo node ... (14 par défaut).
// ============================================================
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const LOG_DIR = process.env.PUZZLE_LOG_DIR || '/var/log/caddy';
const LOG_PREFIX = 'puzzle';
const DAYS = Math.max(1, Number(process.env.JOURS) || 14);
const PORT = Number(process.env.PORT) || 3001;
const TZ = 'Europe/Paris';
// Robots, aperçus de lien (Discord, WhatsApp...) et outils : pas des visiteurs.
const BOT_RE = /bot|crawl|spider|slurp|preview|monitor|uptime|curl|wget|python|go-http|headless|facebookexternalhit|whatsapp|telegram|skype|discord/i;

const dayKey = new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' });

// ---------- Journal de Caddy ----------
function readLog() {
  let files;
  try {
    files = fs.readdirSync(LOG_DIR).filter((f) => f.startsWith(LOG_PREFIX) && /\.log(\.gz)?$/.test(f));
  } catch (err) {
    return { error: err.code === 'EACCES' ? 'accès refusé : lance la commande avec sudo' : `dossier introuvable (${LOG_DIR})` };
  }
  if (!files.length) return { error: `aucun journal dans ${LOG_DIR}` };
  const lines = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(LOG_DIR, file));
      lines.push(...(file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8').split('\n'));
    } catch (err) {
      if (err.code === 'EACCES') return { error: 'accès refusé : lance la commande avec sudo' };
    }
  }
  return { lines };
}

function timeOf(entry) {
  const ts = entry.ts;
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function analyse(lines) {
  const days = new Map();
  const day = (key, date) => {
    if (!days.has(key)) days.set(key, { label: dayLabel.format(date), visitors: new Set(), pages: 0, sessions: 0, created: 0 });
    return days.get(key);
  };
  let bots = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const req = entry.request;
    const date = req && timeOf(entry);
    if (!date) continue;
    const ua = String((req.headers?.['User-Agent'] || req.headers?.['user-agent'] || [''])[0] || '');
    if (!ua || BOT_RE.test(ua)) { bots++; continue; }
    const ip = req.client_ip || req.remote_ip || '?';
    const uri = String(req.uri || '');
    const p = uri.split('?')[0];
    const ok = Number(entry.status) > 0 && Number(entry.status) < 400;
    const d = day(dayKey.format(date), date);
    if (p.startsWith('/socket.io')) {
      // Début d'une connexion au jeu (la suite porte un identifiant "sid").
      if (ok && !/[?&]sid=/.test(uri)) { d.sessions++; d.visitors.add(ip); }
    } else if (req.method === 'POST' && (p === '/api/rooms' || p === '/create-room')) {
      if (Number(entry.status) === 200) d.created++;
    } else if (req.method === 'GET' && ok && !/^\/(api|uploads|assets)\//.test(p) && !path.extname(p)) {
      d.pages++;
      d.visitors.add(ip);
    }
  }
  return { days, bots };
}

// ---------- Joueurs en ce moment (connexions ouvertes de Caddy vers le jeu) ----------
function openConnections() {
  try {
    const out = execFileSync('ss', ['-Htn', 'state', 'established', `( sport = :${PORT} )`], { encoding: 'utf8' });
    return out.split('\n').filter((l) => l.trim()).length;
  } catch {
    return null;
  }
}

// ---------- Base des parties ----------
function readRooms() {
  const candidates = process.env.PUZZLE_DATA_DIR
    ? [process.env.PUZZLE_DATA_DIR]
    : [path.join(__dirname, '..', '..', 'puzzle-data'), path.join(__dirname, '..', 'data')];
  for (const dir of candidates) {
    try {
      return Object.values(JSON.parse(fs.readFileSync(path.join(dir, 'database.json'), 'utf8')) || {});
    } catch { /* dossier suivant */ }
  }
  return null;
}

// ---------- Affichage ----------
const pad = (v, n) => String(v).padStart(n);

function main() {
  console.log('Vibe Puzzle · fréquentation\n');

  const log = readLog();
  if (log.error) {
    console.log(`Journal de Caddy : ${log.error}.`);
  } else {
    const { days, bots } = analyse(log.lines);
    const keys = [...days.keys()].sort().reverse().slice(0, DAYS);
    if (!keys.length) {
      console.log('Aucune visite dans le journal pour l’instant.');
    } else {
      console.log(`Jour         ${pad('Visiteurs', 10)}${pad('Pages', 8)}${pad('Connexions jeu', 16)}${pad('Parties créées', 16)}`);
      const all = new Set();
      const sum = { pages: 0, sessions: 0, created: 0 };
      for (const k of keys) {
        const d = days.get(k);
        for (const ip of d.visitors) all.add(ip);
        sum.pages += d.pages; sum.sessions += d.sessions; sum.created += d.created;
        console.log(`${d.label.padEnd(13)}${pad(d.visitors.size, 10)}${pad(d.pages, 8)}${pad(d.sessions, 16)}${pad(d.created, 16)}`);
      }
      console.log(`${`Total ${keys.length} j`.padEnd(13)}${pad(all.size, 10)}${pad(sum.pages, 8)}${pad(sum.sessions, 16)}${pad(sum.created, 16)}`);
      console.log('\nVisiteurs = adresses IP différentes (une box ou un téléphone = 1).');
      console.log(`Requêtes de robots et d’aperçus de lien ignorées : ${bots}.`);
    }
  }

  const open = openConnections();
  if (open !== null) console.log(`\nEn ce moment : environ ${open} joueur(s) connecté(s) au jeu.`);

  const rooms = readRooms();
  if (rooms) {
    const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const players = new Set();
    for (const r of rooms) for (const id of Object.keys(r?.members || {})) players.add(id);
    const recent = rooms.filter((r) => (r?.lastActivity || r?.startTime || 0) > week).length;
    const done = rooms.filter((r) => r?.endTime).length;
    console.log(`Parties enregistrées : ${rooms.length} (${recent} jouée(s) ces 7 derniers jours, ${done} terminée(s)).`);
    console.log(`Joueurs différents depuis le début : ${players.size} (un par navigateur).`);
  }
}

main();
