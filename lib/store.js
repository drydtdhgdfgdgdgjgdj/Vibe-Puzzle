// ============================================================
// Persistance disque de toutes les parties.
//
// - Écriture asynchrone et ATOMIQUE (fichier temporaire puis rename) :
//   un plantage en pleine écriture ne peut plus corrompre la base.
// - Plusieurs essais si le fichier est verrouillé (OneDrive, antivirus).
// - Copie de secours database.bak.json toutes les 10 minutes.
// - Une base illisible n'est jamais écrasée : elle est mise de côté
//   (database.corrupt-<date>.json) et on repart de la copie de secours.
// ============================================================
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const SAVE_DELAY_MS = 2000;
const BACKUP_EVERY_MS = 10 * 60 * 1000;
const LOCK_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES']);

function createStore({ dataDir, legacyDbFile = null, log = console }) {
  const dbFile = path.join(dataDir, 'database.json');
  const bakFile = path.join(dataDir, 'database.bak.json');
  const uploadsDir = path.join(dataDir, 'uploads');
  let getData = () => ({});
  let dirty = false;
  let writing = false;
  let timer = null;
  let lastBackup = 0;

  fs.mkdirSync(uploadsDir, { recursive: true });

  function readJson(file) {
    if (!fs.existsSync(file)) return null;
    const txt = fs.readFileSync(file, 'utf8');
    return JSON.parse(txt);
  }

  function load() {
    // Premier lancement après la mise à jour : on reprend l'ancienne base
    // (laissée en place sous un autre nom, par sécurité).
    if (!fs.existsSync(dbFile) && legacyDbFile && fs.existsSync(legacyDbFile)) {
      fs.copyFileSync(legacyDbFile, dbFile);
      try { fs.renameSync(legacyDbFile, `${legacyDbFile}.ancienne-version`); } catch { /* fichier verrouillé : on le laisse */ }
      log.log(`Ancienne base déplacée dans ${path.relative(process.cwd(), dbFile)}.`);
    }
    try {
      const db = readJson(dbFile);
      if (db && typeof db === 'object') return db;
    } catch (err) {
      const corrupt = path.join(dataDir, `database.corrupt-${Date.now()}.json`);
      try { fs.renameSync(dbFile, corrupt); } catch { /* ignoré */ }
      log.warn(`database.json illisible (${err.message}) : mis de côté sous ${path.basename(corrupt)}.`);
      try {
        const bak = readJson(bakFile);
        if (bak && typeof bak === 'object') {
          log.warn('Parties restaurées depuis database.bak.json.');
          return bak;
        }
      } catch { /* copie de secours illisible aussi */ }
    }
    return {};
  }

  async function writeAtomic(file, content) {
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, content);
    for (let attempt = 0; ; attempt++) {
      try {
        await fsp.rename(tmp, file);
        return;
      } catch (err) {
        if (attempt >= 6 || !LOCK_ERRORS.has(err.code)) throw err;
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      }
    }
  }

  async function flush() {
    if (writing || !dirty) return;
    dirty = false;
    writing = true;
    try {
      const content = JSON.stringify(getData());
      await writeAtomic(dbFile, content);
      if (Date.now() - lastBackup > BACKUP_EVERY_MS) {
        lastBackup = Date.now();
        await writeAtomic(bakFile, content);
      }
    } catch (err) {
      log.error(`Sauvegarde impossible pour l'instant (${err.message}), nouvel essai bientôt.`);
      dirty = true;
    } finally {
      writing = false;
      if (dirty) schedule();
    }
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; flush(); }, SAVE_DELAY_MS);
    timer.unref?.();
  }

  return {
    dataDir,
    uploadsDir,
    load,
    bind(fn) { getData = fn; },
    markDirty() { dirty = true; schedule(); },
    async flushNow() {
      if (timer) { clearTimeout(timer); timer = null; }
      dirty = true;
      while (writing) await new Promise((r) => setTimeout(r, 20));
      await flush();
    },
    // À l'arrêt du serveur (Ctrl+C) : écriture synchrone finale.
    flushSync() {
      if (timer) { clearTimeout(timer); timer = null; }
      try {
        const tmp = `${dbFile}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(getData()));
        fs.renameSync(tmp, dbFile);
        dirty = false;
      } catch (err) {
        log.error(`Sauvegarde finale impossible : ${err.message}`);
      }
    },
  };
}

module.exports = { createStore };
