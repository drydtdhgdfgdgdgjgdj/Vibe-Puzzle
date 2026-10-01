import { useRef, useState } from 'react';
import {
  CloseIcon, UploadIcon, ShieldIcon, LockIcon, UnlockIcon, VideoIcon, CrownIcon, UserMinusIcon,
  VolumeIcon, VolumeOffIcon, ImageIcon,
} from '../icons';
import { CURSOR_SHAPES } from '../cursorShapes';
import { BACKGROUNDS, MUSIC_TRACKS, CURSOR_COLORS, QUALITY_OPTIONS, ANIMATED_PREVIEWS } from '../config';
import CursorEditor from './CursorEditor';

function BackgroundSwatch({ bg, active, pending, onClick }) {
  const style = {
    width: 52, height: 36, borderRadius: 8, cursor: 'pointer', flexShrink: 0, position: 'relative',
    border: active ? '2px solid var(--accent)' : '2px solid transparent', outline: active ? 'none' : '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', overflow: 'hidden',
  };
  if (bg.type === 'image') { style.backgroundImage = `url(${bg.value})`; style.backgroundSize = 'cover'; style.backgroundPosition = 'center'; }
  else if (bg.type === 'video') style.background = '#1c1f26';
  else if (bg.type === 'animated') style.background = ANIMATED_PREVIEWS[bg.value] || '#1c1f26';
  else if (bg.value.includes('gradient')) style.backgroundImage = bg.value;
  else style.backgroundColor = bg.value;

  return (
    <button type="button" onClick={onClick} title={bg.name} style={style} className="swatch-btn">
      {bg.type === 'video' && <VideoIcon size={16} />}
      {pending && <span className="pending-dot" />}
    </button>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`toggle ${checked ? 'on' : ''}`}
    >
      <span />
    </button>
  );
}

function PendingBadge({ show }) {
  return show ? <span className="badge badge-pending">proposé</span> : null;
}

function resizeImageFile(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Lecture impossible'));
    reader.readAsDataURL(file);
  });
}

export default function SettingsModal({
  isStaff, isHost, myMemberId,
  settings, onChangeSetting, pendingKeys,
  roomName, onRename, onUploadBackground,
  personal, onUpdatePersonal,
  prefs, onUpdatePrefs,
  members, players,
  onKick, onUnban, onSetRole,
  onClose, initialTab = 'perso',
}) {
  const [tab, setTab] = useState(initialTab);
  const [pseudoDraft, setPseudoDraft] = useState(personal.pseudo);
  const [pseudoError, setPseudoError] = useState('');
  const [nameDraft, setNameDraft] = useState(roomName || '');
  const [editorFile, setEditorFile] = useState(null);
  const [bgBusy, setBgBusy] = useState(false);
  const [bgError, setBgError] = useState('');
  const [confirmKick, setConfirmKick] = useState(null);
  const [banToo, setBanToo] = useState(false);
  const cursorFileRef = useRef(null);
  const bgFileRef = useRef(null);
  const pending = pendingKeys || new Set();

  const savePseudo = () => {
    const clean = pseudoDraft.trim();
    if (!clean) { setPseudoError('Le pseudo ne peut pas être vide.'); return; }
    setPseudoError('');
    if (clean !== personal.pseudo) onUpdatePersonal({ pseudo: clean });
  };

  const saveName = () => {
    const clean = nameDraft.trim();
    if (clean && clean !== roomName) onRename(clean);
  };

  const pickBackground = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setBgError("Ce fichier n'est pas une image."); return; }
    setBgBusy(true);
    setBgError('');
    try {
      const dataUrl = await resizeImageFile(file, 3840, 0.86);
      await onUploadBackground(dataUrl);
    } catch (err) {
      setBgError(err.message || 'Envoi impossible.');
    } finally {
      setBgBusy(false);
    }
  };

  const memberList = Object.entries(members || {})
    .map(([memberId, m]) => ({ memberId, ...m }))
    .filter((m) => m.active)
    .sort((a, b) => ({ host: 0, cohost: 1, guest: 2 }[a.role] - { host: 0, cohost: 1, guest: 2 }[b.role]) || a.pseudo.localeCompare(b.pseudo));
  const bannedList = Object.entries(members || {}).map(([memberId, m]) => ({ memberId, ...m })).filter((m) => m.banned);
  const onlineIds = new Set((players || []).map((p) => p.memberId));
  const hostName = memberList.find((m) => m.role === 'host')?.pseudo || "l'hôte";
  const backgrounds = settings.customBackgroundUrl
    ? [...BACKGROUNDS, { id: 'custom', name: 'Photo perso', type: 'image', value: settings.customBackgroundUrl }]
    : BACKGROUNDS;
  const myRole = members?.[myMemberId]?.role;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Réglages</h2>
          <button className="btn btn-icon btn-icon-sm" onClick={onClose} aria-label="Fermer"><CloseIcon size={16} /></button>
        </div>

        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'perso' ? 'active' : ''}`} onClick={() => setTab('perso')}>Perso</button>
          <button className={`modal-tab ${tab === 'room' ? 'active' : ''}`} onClick={() => setTab('room')}>Room</button>
          <button className={`modal-tab ${tab === 'players' ? 'active' : ''}`} onClick={() => setTab('players')}>Joueurs</button>
        </div>

        <div className="modal-body">
          {tab === 'perso' && (
            <div className="settings-stack">
              <div>
                <label className="label">Pseudo</label>
                <input
                  className="field" style={{ width: '100%' }}
                  value={pseudoDraft} maxLength={20}
                  onChange={(e) => setPseudoDraft(e.target.value)}
                  onBlur={savePseudo}
                  onKeyDown={(e) => { if (e.key === 'Enter') savePseudo(); }}
                />
                {pseudoError && <p className="error-text">{pseudoError}</p>}
              </div>

              <div>
                <label className="label">Couleur du curseur</label>
                <div className="row-wrap">
                  {CURSOR_COLORS.map((c) => (
                    <button
                      type="button" key={c} aria-label={`Couleur ${c}`}
                      className={`swatch ${personal.color === c ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => onUpdatePersonal({ color: c })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Forme du curseur</label>
                <div className="row-wrap">
                  {CURSOR_SHAPES.map((s) => (
                    <button
                      type="button" key={s.id} title={s.name}
                      className={`shape-option ${personal.cursorShape === s.id ? 'active' : ''}`}
                      onClick={() => onUpdatePersonal({ cursorShape: s.id })}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill={personal.color} stroke="white" strokeWidth="1">{s.svg}</svg>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`shape-option ${personal.cursorShape === 'image' ? 'active' : ''}`}
                    title="Image personnalisée"
                    onClick={() => (personal.cursorImage ? onUpdatePersonal({ cursorShape: 'image' }) : cursorFileRef.current?.click())}
                    style={{ overflow: 'hidden' }}
                  >
                    {personal.cursorImage
                      ? <img src={personal.cursorImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <UploadIcon size={18} />}
                  </button>
                  <input ref={cursorFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { setEditorFile(e.target.files[0] || null); e.target.value = ''; }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => cursorFileRef.current?.click()}>
                    <ImageIcon size={14} /> Curseur depuis une photo…
                  </button>
                </div>
                <p className="hint-text" style={{ marginTop: 8 }}>Photo entière, recadrée ou détourée à la main : elle devient ton curseur, visible par tes amis.</p>
                <div className="setting-row" style={{ marginTop: 12 }}>
                  <span>Voir mon curseur perso moi aussi</span>
                  <Toggle checked={prefs.showOwnCursor !== false} onChange={(v) => onUpdatePrefs({ showOwnCursor: v })} />
                </div>
              </div>

              <div>
                <label className="label">Qualité graphique</label>
                <div className="segmented">
                  {QUALITY_OPTIONS.map((q) => (
                    <button key={q.id} className={prefs.quality === q.id ? 'active' : ''} onClick={() => onUpdatePrefs({ quality: q.id })}>{q.name}</button>
                  ))}
                </div>
                <p className="hint-text" style={{ marginTop: 8 }}>{QUALITY_OPTIONS.find((q) => q.id === prefs.quality)?.hint}</p>
              </div>

              <div>
                <label className="label">Effets sonores</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button className="btn btn-icon btn-icon-sm" onClick={() => onUpdatePrefs({ sfxMuted: !prefs.sfxMuted })} aria-label="Couper les effets">
                    {prefs.sfxMuted ? <VolumeOffIcon size={15} /> : <VolumeIcon size={15} />}
                  </button>
                  <input
                    type="range" min={0} max={1} step={0.05} style={{ flex: 1 }}
                    value={prefs.sfxMuted ? 0 : prefs.sfxVolume}
                    onChange={(e) => onUpdatePrefs({ sfxVolume: Number(e.target.value), sfxMuted: false })}
                    aria-label="Volume des effets sonores"
                  />
                </div>
                <p className="hint-text" style={{ marginTop: 8 }}>Le volume de la musique se règle avec le bouton note de musique.</p>
              </div>
            </div>
          )}

          {tab === 'room' && (
            <div className="settings-stack">
              {!isStaff && (
                <div className="info-banner">
                  <ShieldIcon size={15} />
                  {settings.guestsCanEdit
                    ? "L'hôte autorise les invités à modifier ces réglages directement."
                    : `Tes choix sont envoyés à ${hostName}, qui peut les accepter ou les refuser.`}
                </div>
              )}

              <div>
                <label className="label">Nom de la partie</label>
                {isStaff ? (
                  <input
                    className="field" style={{ width: '100%' }} value={nameDraft} maxLength={60}
                    onChange={(e) => setNameDraft(e.target.value)} onBlur={saveName}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }}
                  />
                ) : <p style={{ margin: 0 }}>{roomName}</p>}
              </div>

              <div>
                <label className="label">Fond de la table <PendingBadge show={pending.has('background')} /></label>
                <div className="row-wrap">
                  {backgrounds.map((bg) => (
                    <BackgroundSwatch
                      key={bg.id} bg={bg}
                      active={settings.background === bg.id}
                      pending={pending.has('background')}
                      onClick={() => onChangeSetting({ background: bg.id })}
                    />
                  ))}
                </div>
                {isStaff && (
                  <div style={{ marginTop: 10 }}>
                    <input ref={bgFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickBackground} />
                    <button className="btn btn-secondary btn-sm" disabled={bgBusy} onClick={() => bgFileRef.current?.click()}>
                      {bgBusy ? <span className="spinner" /> : <UploadIcon size={14} />} Mettre ma photo en fond
                    </button>
                    {bgError && <p className="error-text">{bgError}</p>}
                  </div>
                )}
              </div>

              <div>
                <label className="label">Musique d'ambiance <PendingBadge show={pending.has('music')} /></label>
                <select className="field" style={{ width: '100%' }} value={settings.music} onChange={(e) => onChangeSetting({ music: e.target.value })}>
                  {MUSIC_TRACKS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div className="setting-row">
                <span>Afficher le cadre final <PendingBadge show={pending.has('showFrame')} /></span>
                <Toggle checked={settings.showFrame !== false} onChange={(v) => onChangeSetting({ showFrame: v })} />
              </div>
              <div className="setting-row">
                <span>Afficher les traits de découpe <PendingBadge show={pending.has('showSeams')} /></span>
                <Toggle checked={settings.showSeams !== false} onChange={(v) => onChangeSetting({ showSeams: v })} />
              </div>
              <div className="setting-row">
                <span>Image en filigrane dans le cadre <PendingBadge show={pending.has('ghostImage')} /></span>
                <Toggle checked={!!settings.ghostImage} onChange={(v) => onChangeSetting({ ghostImage: v })} />
              </div>

              <div>
                <label className="label">Assemblage <PendingBadge show={pending.has('lockMode')} /></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`btn ${settings.lockMode === 'locked' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => onChangeSetting({ lockMode: 'locked' })}>
                    <LockIcon size={15} /> Accroché au cadre
                  </button>
                  <button className={`btn ${settings.lockMode === 'free' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => onChangeSetting({ lockMode: 'free' })}>
                    <UnlockIcon size={15} /> Bloc libre
                  </button>
                </div>
                <p className="hint-text" style={{ marginTop: 10 }}>
                  {settings.lockMode === 'locked'
                    ? "Les pièces se fixent à leur place dans le cadre. En repassant en bloc libre, ce qui est fixé redevient des blocs déplaçables."
                    : "Seul le voisinage compte : assemblez où vous voulez sur la table. L'aide propose les voisines des blocs d'au moins 2 pièces. En repassant en mode accroché, chaque bloc vole tout seul à sa place dans le cadre."}
                </p>
              </div>

              {isHost && (
                <div className="setting-row">
                  <span>Les invités peuvent modifier sans demander</span>
                  <Toggle checked={!!settings.guestsCanEdit} onChange={(v) => onChangeSetting({ guestsCanEdit: v })} />
                </div>
              )}
            </div>
          )}

          {tab === 'players' && (
            <div className="settings-stack">
              <div>
                <label className="label">Membres de la partie</label>
                <div className="member-list">
                  {memberList.map((m) => {
                    const isMe = m.memberId === myMemberId;
                    const canKick = isStaff && !isMe && m.role !== 'host' && !(myRole === 'cohost' && m.role === 'cohost');
                    return (
                      <div key={m.memberId} className="member-row">
                        <span className="dot" style={{ background: m.color }} />
                        <span className={`online-dot ${onlineIds.has(m.memberId) ? 'on' : ''}`} title={onlineIds.has(m.memberId) ? 'En ligne' : 'Hors ligne'} />
                        <span className="member-name">{m.pseudo}{isMe ? ' (toi)' : ''}</span>
                        {m.role === 'host' && <span className="badge badge-host"><CrownIcon size={11} /> hôte</span>}
                        {m.role === 'cohost' && <span className="badge">co-hôte</span>}
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                          {isHost && !isMe && m.role !== 'host' && (
                            <button className="btn btn-ghost btn-xs" onClick={() => onSetRole(m.memberId, m.role === 'cohost' ? 'guest' : 'cohost')}>
                              {m.role === 'cohost' ? 'Retirer co-hôte' : 'Nommer co-hôte'}
                            </button>
                          )}
                          {canKick && (
                            <button className="btn btn-danger btn-xs" onClick={() => { setConfirmKick(m); setBanToo(false); }}>
                              <UserMinusIcon size={13} /> Exclure
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {isHost && <p className="hint-text" style={{ marginTop: 10 }}>Un co-hôte peut accepter les arrivées, répondre aux demandes et changer les réglages quand tu n'es pas là.</p>}
              </div>

              {confirmKick && (
                <div className="confirm-box">
                  <p style={{ margin: '0 0 10px' }}>Exclure <b>{confirmKick.pseudo}</b> de la partie ?</p>
                  <label className="check-row"><input type="checkbox" checked={banToo} onChange={(e) => setBanToo(e.target.checked)} /> L'empêcher de revenir (bannir)</label>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmKick(null)}>Annuler</button>
                    <button className="btn btn-danger btn-sm" onClick={() => { onKick(confirmKick.memberId, banToo); setConfirmKick(null); }}>Exclure</button>
                  </div>
                </div>
              )}

              {isStaff && bannedList.length > 0 && (
                <div>
                  <label className="label">Bannis</label>
                  <div className="member-list">
                    {bannedList.map((m) => (
                      <div key={m.memberId} className="member-row">
                        <span className="dot" style={{ background: m.color }} />
                        <span className="member-name">{m.pseudo}</span>
                        <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={() => onUnban(m.memberId)}>Débannir</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>

      {editorFile && (
        <CursorEditor
          file={editorFile}
          onCancel={() => setEditorFile(null)}
          onSave={(dataUrl) => {
            onUpdatePersonal({ cursorImage: dataUrl, cursorShape: 'image' });
            setEditorFile(null);
          }}
        />
      )}
    </div>
  );
}
