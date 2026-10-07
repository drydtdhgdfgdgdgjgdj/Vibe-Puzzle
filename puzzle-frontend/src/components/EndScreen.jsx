import { useState } from 'react';
import { TrophyIcon, DownloadIcon, HomeIcon, EyeIcon } from '../icons';
import { downloadImageWithSeams, downloadOriginalImage } from '../exportImage';

function formatDuration(totalMs) {
  const s = Math.max(0, Math.round((totalMs || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${m.toString().padStart(2, '0')} min`;
  return `${m} min ${sec.toString().padStart(2, '0')} s`;
}

// Écran de fin : durée de jeu réelle (temps actif), contribution de
// chacun (rattachée aux membres, donc juste même après un changement de
// pseudo), téléchargements, et possibilité de refermer pour admirer.
export default function EndScreen({ room, counts, members, elapsedMs, onHome, onClose }) {
  const [downloading, setDownloading] = useState(null);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = Object.keys(room.pieces).length;

  const handleDownload = async (kind) => {
    setDownloading(kind);
    try {
      if (kind === 'seams') await downloadImageWithSeams(room);
      else await downloadOriginalImage(room);
    } catch (e) {
      console.error(e);
      alert('Le téléchargement a échoué (image introuvable).');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="end-backdrop">
      <div className="panel" style={{ width: '100%', maxWidth: 480, padding: '34px 30px', textAlign: 'center' }}>
        <div className="end-trophy"><TrophyIcon size={30} /></div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 6px' }}>Puzzle terminé</h1>
        <p style={{ color: 'var(--text-secondary)', margin: '0 0 26px', fontSize: '0.92rem' }}>
          Assemblé en {formatDuration(elapsedMs)} de jeu · {total} pièces
        </p>

        <div style={{ textAlign: 'left', marginBottom: 26 }}>
          <div className="label">Contribution de chacun</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map(([memberId, count]) => {
              const m = members?.[memberId];
              const name = m?.pseudo || memberId;
              const color = m?.color || 'var(--accent)';
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={memberId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.88rem' }}>{name}</span>
                  <div style={{ flex: 2, height: 6, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color }} />
                  </div>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', width: 64, textAlign: 'right' }}>{count} pièces</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <button className="btn btn-secondary" onClick={() => handleDownload('seams')} disabled={downloading !== null}>
            {downloading === 'seams' ? <span className="spinner" /> : <DownloadIcon size={16} />} Télécharger avec les contours
          </button>
          <button className="btn btn-secondary" onClick={() => handleDownload('original')} disabled={downloading !== null}>
            {downloading === 'original' ? <span className="spinner" /> : <DownloadIcon size={16} />} Télécharger l'image d'origine
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}><EyeIcon size={16} /> Voir le puzzle</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onHome}><HomeIcon size={16} /> Accueil</button>
        </div>
      </div>
    </div>
  );
}
