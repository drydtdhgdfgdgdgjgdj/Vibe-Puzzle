import { useRef, useState } from 'react';
import { CloseIcon } from '../icons';

const SIZES = { s: 200, m: 300, l: 440 };

// Image modèle flottante (déplaçable), pour comparer avec le puzzle.
export default function ModelPreview({ src, size = 'm', onSize, onClose }) {
  const [pos, setPos] = useState({ x: 18, y: 96 });
  const drag = useRef(null);
  const width = SIZES[size] || SIZES.m;

  const onPointerDown = (e) => {
    if (e.target.closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const x = Math.max(0, Math.min(window.innerWidth - width, d.x + e.clientX - d.sx));
    const y = Math.max(0, Math.min(window.innerHeight - 60, d.y + e.clientY - d.sy));
    setPos({ x, y });
  };

  return (
    <div className="model-preview" style={{ left: pos.x, top: pos.y, width }}>
      <div
        className="model-preview-header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
      >
        <span>Modèle</span>
        <span style={{ display: 'flex', gap: 4 }}>
          {Object.keys(SIZES).map((k) => (
            <button key={k} className={`btn btn-ghost btn-xs ${size === k ? 'pressed' : ''}`} onClick={() => onSize(k)}>{k.toUpperCase()}</button>
          ))}
          <button className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Fermer"><CloseIcon size={12} /></button>
        </span>
      </div>
      <img src={src} alt="Image modèle du puzzle" draggable={false} />
    </div>
  );
}
