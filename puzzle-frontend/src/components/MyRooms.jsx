import { useState } from 'react';
import { CrownIcon, MoreIcon, TrashIcon, CloseIcon, RefreshIcon, TrophyIcon, UsersIcon } from '../icons';

function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString();
}

function RoomCard({ room, onJoin, onDelete, onForget, disabled }) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const pct = room.total ? Math.round((room.placed / room.total) * 100) : 0;

  return (
    <div className={`room-card ${disabled ? 'disabled' : ''}`}>
      <button type="button" className="room-card-main" onClick={() => !disabled && onJoin(room.roomId)} disabled={disabled}>
        <div className="room-thumb" style={{ backgroundImage: `url(${room.thumbUrl})` }}>
          {room.completed && <span className="room-thumb-badge"><TrophyIcon size={12} /> Terminé</span>}
          {room.online > 0 && <span className="room-thumb-online"><UsersIcon size={11} /> {room.online} en ligne</span>}
        </div>
        <div className="room-info">
          <div className="room-name" title={room.name}>{room.name}</div>
          <div className="room-meta">
            {room.isHost
              ? <span className="badge badge-host"><CrownIcon size={11} /> Hôte</span>
              : <span className="badge">{room.role === 'cohost' ? 'Co-hôte' : 'Invité'}{room.hostPseudo ? ` · ${room.hostPseudo}` : ''}</span>}
            <span>{room.cols} × {room.rows} · {room.total} pièces</span>
          </div>
          <div className="progress"><div style={{ width: `${pct}%` }} /></div>
          <div className="room-meta">
            <span>{pct} %</span>
            <span>{timeAgo(room.lastActivity)}</span>
          </div>
        </div>
      </button>

      <button type="button" className="room-card-menu" onClick={() => { setMenu((m) => !m); setConfirm(false); }} aria-label="Options">
        <MoreIcon size={16} />
      </button>
      {menu && (
        <div className="room-card-popover">
          {!confirm ? (
            room.isHost ? (
              <button className="btn btn-danger btn-sm" onClick={() => setConfirm(true)}><TrashIcon size={14} /> Supprimer la partie</button>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}><CloseIcon size={13} /> Retirer de ma liste</button>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: '0.82rem' }}>
                {room.isHost ? 'Supprimer définitivement pour tout le monde ?' : 'Quitter cette partie ? Il faudra redemander à y entrer.'}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-xs" onClick={() => { setConfirm(false); setMenu(false); }}>Non</button>
                <button className="btn btn-danger btn-xs" onClick={() => { setMenu(false); (room.isHost ? onDelete : onForget)(room.roomId); }}>Oui</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MyRooms({ rooms, loading, error, onJoin, onDelete, onForget, onRefresh, disabled }) {
  return (
    <div className="panel" style={{ width: '100%', maxWidth: 720, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <label className="label" style={{ margin: 0 }}>Mes parties</label>
        <button className="btn btn-ghost btn-xs" onClick={onRefresh} disabled={loading} title="Actualiser">
          {loading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <RefreshIcon size={13} />}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && rooms.length === 0 && (
        <p className="hint-text" style={{ margin: 0 }}>Les parties que tu crées ou rejoins apparaîtront ici : un clic suffira pour y revenir.</p>
      )}
      <div className="room-grid">
        {rooms.map((room) => (
          <RoomCard key={room.roomId} room={room} onJoin={onJoin} onDelete={onDelete} onForget={onForget} disabled={disabled} />
        ))}
      </div>
    </div>
  );
}
