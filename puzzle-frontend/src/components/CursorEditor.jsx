import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloseIcon, CropIcon, LassoIcon, PolygonIcon, ImageIcon, UploadIcon, RefreshIcon } from '../icons';

// ============================================================
// Éditeur de curseur à partir d'une photo :
//  - Photo entière (réduite pour tenir dans le curseur)
//  - Recadrer (carré, rond ou libre) avec poignées
//  - Main levée (lasso lissé)
//  - Polygone (clic par clic, fermeture sur le 1er point / Entrée)
// Résultat : PNG 64×64 transparent, avec contour blanc et ombre en option
// pour rester visible sur n'importe quel fond.
// ============================================================
const VIEW = 420;
const EDIT_MAX = 1024;
const OUT = 64;
const MODES = [
  { id: 'whole', label: 'Photo entière', icon: ImageIcon, help: 'Toute la photo, réduite pour tenir dans le curseur.' },
  { id: 'crop', label: 'Recadrer', icon: CropIcon, help: 'Déplace le cadre et tire ses coins.' },
  { id: 'lasso', label: 'Main levée', icon: LassoIcon, help: 'Maintiens le clic et entoure ce que tu veux garder.' },
  { id: 'polygon', label: 'Polygone', icon: PolygonIcon, help: 'Clique point par point. Reclique sur le 1er point (ou Entrée) pour fermer. Retour arrière annule le dernier point.' },
];

function loadEditable(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error("Ce fichier n'est pas une image.")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, EDIT_MAX / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * s));
        c.height = Math.max(1, Math.round(img.height * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c);
      };
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Lecture impossible'));
    reader.readAsDataURL(file);
  });
}

// Ramer–Douglas–Peucker : allège le tracé à main levée.
function simplify(points, eps) {
  if (points.length < 3) return points;
  const sqSeg = (p, a, b) => {
    let x = a.x;
    let y = a.y;
    let dx = b.x - x;
    let dy = b.y - y;
    if (dx || dy) {
      const t = Math.max(0, Math.min(1, ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)));
      x += dx * t;
      y += dy * t;
    }
    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSeg(points[i], points[first], points[last]);
      if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD > eps * eps) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// Chemin de la sélection, en coordonnées de l'image.
function tracePath(ctx, sel) {
  ctx.beginPath();
  if (sel.kind === 'rect') {
    ctx.rect(sel.x, sel.y, sel.w, sel.h);
  } else if (sel.kind === 'ellipse') {
    ctx.ellipse(sel.x + sel.w / 2, sel.y + sel.h / 2, sel.w / 2, sel.h / 2, 0, 0, Math.PI * 2);
  } else if (sel.kind === 'smooth') {
    const p = sel.points;
    const n = p.length;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const start = mid(p[n - 1], p[0]);
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) {
      const m = mid(p[i], p[(i + 1) % n]);
      ctx.quadraticCurveTo(p[i].x, p[i].y, m.x, m.y);
    }
  } else {
    sel.points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
  }
  ctx.closePath();
}

function bboxOf(sel) {
  if (sel.kind === 'rect' || sel.kind === 'ellipse') return { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of sel.points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

function renderCursorImage(img, sel, { outline, shadow }) {
  const box = bboxOf(sel);
  const margin = outline ? 4 : 1;
  const shadowPad = shadow ? 3 : 0;
  const avail = OUT - 2 * (margin + shadowPad);
  const scale = avail / Math.max(box.w, box.h);
  const offX = (OUT - box.w * scale) / 2;
  const offY = (OUT - box.h * scale) / 2;
  const setup = (ctx) => {
    ctx.setTransform(scale, 0, 0, scale, offX - box.x * scale, offY - box.y * scale);
  };

  const cut = document.createElement('canvas');
  cut.width = cut.height = OUT;
  const cctx = cut.getContext('2d');
  setup(cctx);
  tracePath(cctx, sel);
  cctx.fillStyle = '#fff';
  cctx.fill();
  cctx.globalCompositeOperation = 'source-in';
  cctx.drawImage(img, 0, 0);

  let base = cut;
  if (outline) {
    const sil = document.createElement('canvas');
    sil.width = sil.height = OUT;
    const sctx = sil.getContext('2d');
    setup(sctx);
    tracePath(sctx, sel);
    sctx.fillStyle = '#fff';
    sctx.strokeStyle = '#fff';
    sctx.lineJoin = 'round';
    sctx.lineWidth = (margin * 2) / scale;
    sctx.fill();
    sctx.stroke();
    base = sil;
  }

  const out = document.createElement('canvas');
  out.width = out.height = OUT;
  const octx = out.getContext('2d');
  if (shadow) {
    octx.shadowColor = 'rgba(0,0,0,0.5)';
    octx.shadowBlur = 3;
    octx.shadowOffsetY = 1;
  }
  octx.drawImage(base, 0, 0);
  octx.shadowColor = 'transparent';
  if (base !== cut) octx.drawImage(cut, 0, 0);
  return out.toDataURL('image/png');
}

export default function CursorEditor({ file, onSave, onCancel }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const [img, setImg] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('crop');
  const [cropShape, setCropShape] = useState('circle');
  const [crop, setCrop] = useState(null);
  const [lasso, setLasso] = useState([]);
  const [lassoDone, setLassoDone] = useState(false);
  const [poly, setPoly] = useState([]);
  const [polyClosed, setPolyClosed] = useState(false);
  const [hover, setHover] = useState(null);
  const [outline, setOutline] = useState(true);
  const [shadow, setShadow] = useState(true);
  const gesture = useRef(null);
  const lassoRef = useRef([]);

  const openFile = useCallback((f) => {
    loadEditable(f).then((c) => {
      setError('');
      setImg(c);
      const side = Math.min(c.width, c.height) * 0.7;
      setCrop({ x: (c.width - side) / 2, y: (c.height - side) / 2, w: side, h: side });
      setLasso([]);
      setLassoDone(false);
      setPoly([]);
      setPolyClosed(false);
    }).catch((err) => setError(err.message || 'Impossible de lire cette image.'));
  }, []);

  useEffect(() => { if (file) openFile(file); }, [file, openFile]);

  // Transformation image <-> zone d'édition.
  const view = useMemo(() => {
    if (!img) return null;
    const s = Math.min(VIEW / img.width, VIEW / img.height);
    return { s, ox: (VIEW - img.width * s) / 2, oy: (VIEW - img.height * s) / 2 };
  }, [img]);

  const toImage = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * VIEW;
    const cy = ((e.clientY - rect.top) / rect.height) * VIEW;
    return { x: (cx - view.ox) / view.s, y: (cy - view.oy) / view.s, cx, cy };
  };

  const selection = useMemo(() => {
    if (!img) return null;
    if (mode === 'whole') return { kind: 'rect', x: 0, y: 0, w: img.width, h: img.height };
    if (mode === 'crop' && crop) return { kind: cropShape === 'circle' ? 'ellipse' : 'rect', ...crop };
    if (mode === 'lasso' && lassoDone && lasso.length >= 3) return { kind: 'smooth', points: lasso };
    if (mode === 'polygon' && polyClosed && poly.length >= 3) return { kind: 'poly', points: poly };
    return null;
  }, [img, mode, crop, cropShape, lasso, lassoDone, poly, polyClosed]);

  const preview = useMemo(() => (img && selection ? renderCursorImage(img, selection, { outline, shadow }) : null), [img, selection, outline, shadow]);

  // ---------- Dessin de la zone d'édition ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img || !view) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = VIEW * dpr;
    canvas.height = VIEW * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VIEW, VIEW);
    for (let y = 0; y < VIEW; y += 14) {
      for (let x = 0; x < VIEW; x += 14) {
        ctx.fillStyle = ((x + y) / 14) % 2 ? '#2a2e37' : '#22252c';
        ctx.fillRect(x, y, 14, 14);
      }
    }
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);
    ctx.drawImage(img, 0, 0);

    const lw = 1 / view.s;
    const sel = selection;
    if (sel && mode !== 'whole') {
      ctx.beginPath();
      ctx.rect(-10000, -10000, 30000, 30000);
      ctx.fillStyle = 'rgba(8,9,12,0.62)';
      tracePath(ctx, sel);
      ctx.fill('evenodd');
    }
    if (sel) {
      tracePath(ctx, sel);
      ctx.setLineDash([6 * lw, 4 * lw]);
      ctx.lineWidth = 2 * lw;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (mode === 'crop' && crop) {
      ctx.fillStyle = '#fff';
      for (const [hx, hy] of [[crop.x, crop.y], [crop.x + crop.w, crop.y], [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h]]) {
        ctx.fillRect(hx - 5 * lw, hy - 5 * lw, 10 * lw, 10 * lw);
      }
    }
    if (mode === 'lasso' && !lassoDone && lasso.length > 1) {
      ctx.beginPath();
      lasso.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.lineWidth = 2 * lw;
      ctx.strokeStyle = '#5b8cff';
      ctx.stroke();
    }
    if (mode === 'polygon' && !polyClosed && poly.length) {
      ctx.beginPath();
      poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (hover) ctx.lineTo(hover.x, hover.y);
      ctx.lineWidth = 2 * lw;
      ctx.strokeStyle = '#5b8cff';
      ctx.stroke();
      poly.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, (i === 0 ? 6 : 4) * lw, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#3ecf8e' : '#fff';
        ctx.fill();
      });
    }
    ctx.restore();
  }, [img, view, selection, mode, crop, lasso, lassoDone, poly, polyClosed, hover]);

  // ---------- Interactions ----------
  const clampCrop = (c, square = cropShape !== 'free') => {
    let w = Math.max(8, Math.min(c.w, img.width));
    let h = Math.max(8, Math.min(c.h, img.height));
    if (square) { const s = Math.min(w, h); w = s; h = s; }
    return { w, h, x: Math.max(0, Math.min(img.width - w, c.x)), y: Math.max(0, Math.min(img.height - h, c.y)) };
  };

  const closePolygon = () => {
    if (poly.length >= 3) { setPolyClosed(true); setHover(null); }
  };

  const onPointerDown = (e) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e);
    if (mode === 'crop' && crop) {
      const tol = 10 / view.s;
      const corners = [
        ['nw', crop.x, crop.y], ['ne', crop.x + crop.w, crop.y],
        ['sw', crop.x, crop.y + crop.h], ['se', crop.x + crop.w, crop.y + crop.h],
      ];
      const corner = corners.find(([, hx, hy]) => Math.abs(p.x - hx) < tol && Math.abs(p.y - hy) < tol);
      if (corner) {
        // Le coin opposé reste fixe pendant le redimensionnement.
        const anchor = {
          x: corner[0].includes('w') ? crop.x + crop.w : crop.x,
          y: corner[0].includes('n') ? crop.y + crop.h : crop.y,
        };
        gesture.current = { type: 'resize', anchor };
      } else if (p.x >= crop.x && p.x <= crop.x + crop.w && p.y >= crop.y && p.y <= crop.y + crop.h) {
        gesture.current = { type: 'move', start: p, crop: { ...crop } };
      } else {
        gesture.current = { type: 'resize', anchor: { x: p.x, y: p.y } };
      }
    } else if (mode === 'lasso') {
      gesture.current = { type: 'lasso', last: p };
      lassoRef.current = [{ x: p.x, y: p.y }];
      setLasso(lassoRef.current);
      setLassoDone(false);
    } else if (mode === 'polygon') {
      if (polyClosed) { setPoly([{ x: p.x, y: p.y }]); setPolyClosed(false); return; }
      if (poly.length >= 3) {
        const first = poly[0];
        if (Math.hypot((first.x - p.x) * view.s, (first.y - p.y) * view.s) < 12) { closePolygon(); return; }
      }
      setPoly((prev) => [...prev, { x: p.x, y: p.y }]);
    }
  };

  const onPointerMove = (e) => {
    if (!img) return;
    const p = toImage(e);
    if (mode === 'polygon') setHover({ x: p.x, y: p.y });
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'move') {
      setCrop(clampCrop({ ...g.crop, x: g.crop.x + p.x - g.start.x, y: g.crop.y + p.y - g.start.y }));
    } else if (g.type === 'resize') {
      const { anchor } = g;
      let w = Math.abs(p.x - anchor.x);
      let h = Math.abs(p.y - anchor.y);
      if (cropShape !== 'free') { const s = Math.max(w, h); w = s; h = s; }
      const x = p.x < anchor.x ? anchor.x - w : anchor.x;
      const y = p.y < anchor.y ? anchor.y - h : anchor.y;
      setCrop(clampCrop({ x, y, w, h }));
    } else if (g.type === 'lasso') {
      if (Math.hypot((p.x - g.last.x) * view.s, (p.y - g.last.y) * view.s) >= 3) {
        g.last = p;
        lassoRef.current = [...lassoRef.current, { x: p.x, y: p.y }];
        setLasso(lassoRef.current);
      }
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.type === 'lasso') {
      const simple = simplify(lassoRef.current, 1.5 / view.s);
      lassoRef.current = simple;
      setLasso(simple);
      setLassoDone(simple.length >= 3);
    }
  };

  useEffect(() => {
    if (mode !== 'polygon') return undefined;
    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (poly.length >= 3) { setPolyClosed(true); setHover(null); }
      } else if (e.key === 'Backspace' && !polyClosed) {
        e.preventDefault();
        setPoly((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, poly.length, polyClosed]);

  const reset = () => {
    setLasso([]); setLassoDone(false); setPoly([]); setPolyClosed(false);
    if (img) {
      const side = Math.min(img.width, img.height) * 0.7;
      setCrop({ x: (img.width - side) / 2, y: (img.height - side) / 2, w: side, h: side });
    }
  };

  const changeShape = (shape) => {
    setCropShape(shape);
    if (shape !== 'free' && crop) {
      const s = Math.min(crop.w, crop.h);
      setCrop(clampCrop({ ...crop, w: s, h: s }, true));
    }
  };

  const currentMode = MODES.find((m) => m.id === mode);

  return (
    <div className="modal-backdrop" style={{ zIndex: 600 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-card" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2 className="modal-title">Curseur à partir d'une photo</h2>
          <button className="btn btn-icon btn-icon-sm" onClick={onCancel} aria-label="Fermer"><CloseIcon size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="segmented" style={{ marginBottom: 14 }}>
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>
                  <Icon size={15} /> {m.label}
                </button>
              );
            })}
          </div>
          <div className="cursor-editor">
            <div>
              <canvas
                ref={canvasRef}
                className="cursor-editor-canvas"
                style={{ cursor: mode === 'crop' ? 'move' : 'crosshair' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={() => setHover(null)}
                onDoubleClick={() => mode === 'polygon' && closePolygon()}
              />
              {!img && !error && <p className="hint-text">Chargement de la photo…</p>}
              {error && <p className="error-text">{error}</p>}
              <p className="hint-text" style={{ marginTop: 8 }}>{currentMode.help}</p>
            </div>
            <div className="cursor-editor-side">
              {mode === 'crop' && (
                <div>
                  <label className="label">Forme</label>
                  <div className="segmented segmented-sm">
                    {[['circle', 'Rond'], ['square', 'Carré'], ['free', 'Libre']].map(([id, label]) => (
                      <button key={id} className={cropShape === id ? 'active' : ''} onClick={() => changeShape(id)}>{label}</button>
                    ))}
                  </div>
                </div>
              )}
              <label className="check-row"><input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} /> Contour blanc</label>
              <label className="check-row"><input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} /> Ombre</label>
              <div>
                <label className="label">Aperçu</label>
                <div className="cursor-previews">
                  {[['#0e0f12', 32], ['#e9ebef', 32], ['#0e0f12', 64]].map(([bgc, px], i) => (
                    <div key={i} className="cursor-preview" style={{ background: bgc, width: 76, height: 76 }}>
                      {preview ? <img src={preview} alt="" width={px} height={px} /> : <span className="hint-text">—</span>}
                    </div>
                  ))}
                </div>
                {!selection && <p className="hint-text">{mode === 'lasso' ? 'Entoure une zone pour voir l’aperçu.' : mode === 'polygon' ? 'Ferme le polygone pour voir l’aperçu.' : ''}</p>}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={reset}><RefreshIcon size={14} /> Recommencer</button>
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { openFile(e.target.files[0]); e.target.value = ''; }} />
            <button className="btn btn-secondary" onClick={() => fileRef.current.click()}><UploadIcon size={15} /> Autre photo</button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
            <button className="btn btn-primary" disabled={!preview} onClick={() => onSave(preview)}>Utiliser ce curseur</button>
          </div>
        </div>
      </div>
    </div>
  );
}
