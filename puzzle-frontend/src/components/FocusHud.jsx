import { useEffect, useRef, useState } from 'react';
import { FocusIcon, EyeIcon, CloseIcon } from '../icons';
import { FOCUS_SIZES } from '../config';

// Bandeau du focus en cours : progression, coup d'œil sur la grande
// room (bouton maintenu ou touche Espace), sortie.
export function FocusBar({ state, onPeek, onQuit }) {
  const [confirm, setConfirm] = useState(false);
  if (!state?.active) return null;
  const pct = state.total ? Math.round((state.placed / state.total) * 100) : 0;
  return (
    <div className="focus-bar">
      <FocusIcon size={16} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
        <span style={{ fontWeight: 700 }}>Focus · {state.placed}/{state.total} pièces</span>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      </div>
      <button
        className={`btn btn-secondary btn-sm ${state.peek ? 'pressed' : ''}`}
        onPointerDown={() => onPeek(true)}
        onPointerUp={() => onPeek(false)}
        onPointerLeave={() => onPeek(false)}
        title="Maintenir pour voir la grande room (ou maintenir Espace)"
      >
        <EyeIcon size={14} /> Coup d'œil
      </button>
      {!confirm ? (
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}><CloseIcon size={13} /> Quitter</button>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ranger la zone ?</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setConfirm(false)}>Non</button>
          <button className="btn btn-danger btn-xs" onClick={() => { setConfirm(false); onQuit(); }}>Oui</button>
        </span>
      )}
    </div>
  );
}

// Petit menu pour lancer un focus.
export function FocusLauncher({ open, onClose, onStart, starting, totalPieces }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className="panel popover" style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: 0, width: 280, padding: 16 }}>
      <div className="label">Focus sur une zone</div>
      <p className="hint-text" style={{ margin: '0 0 12px' }}>
        Une partie du puzzle (un rectangle au hasard) s'ouvre dans une mini-room par-dessus la grande. Une fois finie, elle rejoint la grande room.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        {FOCUS_SIZES.map((size) => (
          <button
            key={size}
            className="btn btn-secondary btn-sm"
            style={{ flex: 1 }}
            disabled={starting || size > totalPieces}
            onClick={() => onStart(size)}
          >
            ~{size}
          </button>
        ))}
      </div>
      {starting && <p className="hint-text" style={{ marginTop: 10 }}><span className="spinner" style={{ width: 12, height: 12, display: 'inline-block', verticalAlign: 'middle' }} /> Préparation de la zone…</p>}
    </div>
  );
}
