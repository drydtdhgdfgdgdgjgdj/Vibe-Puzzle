// ============================================================
// Musiques envoyées par les joueurs (MP3, OGG, M4A…) : décodées depuis
// une data URL, reconnues à leurs premiers octets (le type annoncé par le
// navigateur n'est pas fiable) et rangées dans data/uploads, à côté des
// images. Le nom commence par l'identifiant de la partie : les fichiers
// partent avec elle quand elle est supprimée.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

// Extension d'après la signature du fichier, null si ce n'est pas de l'audio connu.
function sniffAudio(buf) {
  if (!buf || buf.length < 12) return null;
  const ascii = (start, end) => buf.toString('latin1', start, end);
  if (ascii(0, 3) === 'ID3') return 'mp3';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 4) === 'fLaC') return 'flac';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (ascii(4, 8) === 'ftyp') return 'm4a';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  // Trame MPEG sans étiquette ID3 : MP3, ou AAC brut (ADTS, "layer" à 0).
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return (buf[1] & 0x06) === 0 ? 'aac' : 'mp3';
  return null;
}

function createAudioStore(uploadsDir) {
  fs.mkdirSync(uploadsDir, { recursive: true });

  // Enregistre une data URL audio ; renvoie son URL publique (/uploads/...).
  function save(dataUrl, baseName) {
    const comma = typeof dataUrl === 'string' && dataUrl.startsWith('data:') ? dataUrl.indexOf(',') : -1;
    if (comma < 0 || !dataUrl.slice(0, comma).endsWith(';base64')) throw new Error('Fichier audio illisible.');
    const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64');
    if (buffer.length > MAX_AUDIO_BYTES) throw new Error('Fichier trop lourd (20 Mo maximum).');
    const ext = sniffAudio(buffer);
    if (!ext) throw new Error('Format non reconnu : envoie un MP3, OGG, M4A, WAV ou FLAC.');
    const file = `${baseName}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, file), buffer);
    return `/uploads/${file}`;
  }

  return { save };
}

module.exports = { createAudioStore, sniffAudio, MAX_AUDIO_BYTES };
