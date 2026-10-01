// ============================================================
// Images envoyées par les joueurs (photo du puzzle, miniature, fond
// perso) : décodées depuis une data URL et rangées en fichiers dans
// data/uploads, servis en statique. Plus aucune image en base64 dans
// la base ni dans les messages socket.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = 15 * 1024 * 1024;
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function looksLike(ext, buf) {
  if (ext === 'jpg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === 'png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (ext === 'webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

function createImageStore(uploadsDir) {
  fs.mkdirSync(uploadsDir, { recursive: true });

  function parse(dataUrl) {
    if (!isDataUrl(dataUrl)) return null;
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    const header = dataUrl.slice(5, comma);
    const [mime, encoding] = header.split(';');
    const ext = MIME_EXT[mime];
    if (!ext || encoding !== 'base64') return null;
    const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64');
    if (!buffer.length || buffer.length > MAX_BYTES || !looksLike(ext, buffer)) return null;
    return { ext, buffer };
  }

  // Enregistre une data URL d'image ; renvoie son URL publique (/uploads/...).
  function save(dataUrl, baseName) {
    const parsed = parse(dataUrl);
    if (!parsed) throw new Error('Image invalide ou trop lourde (15 Mo maximum, JPEG/PNG/WebP).');
    const file = `${baseName}-${crypto.randomBytes(3).toString('hex')}.${parsed.ext}`;
    fs.writeFileSync(path.join(uploadsDir, file), parsed.buffer);
    return `/uploads/${file}`;
  }

  function removeUrl(url) {
    if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
    try { fs.unlinkSync(path.join(uploadsDir, path.basename(url))); } catch { /* déjà supprimé */ }
  }

  function removeRoomFiles(roomId) {
    for (const file of fs.readdirSync(uploadsDir)) {
      if (file.startsWith(`${roomId}-`)) {
        try { fs.unlinkSync(path.join(uploadsDir, file)); } catch { /* ignoré */ }
      }
    }
  }

  return { save, removeUrl, removeRoomFiles, isDataUrl };
}

module.exports = { createImageStore, isDataUrl };
