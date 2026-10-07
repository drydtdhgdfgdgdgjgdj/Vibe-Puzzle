import { CheckIcon, CloseIcon, EdgesIcon, HelpIcon, ShieldIcon, SettingsIcon } from '../icons';
import { describeSettingsText } from '../settingsLabels';

const HINT_LEVEL_LABEL = { 1: 'la forme de la pièce', 2: 'sa zone sur le plateau', 3: 'son emplacement exact' };

// Pile de notifications en haut de l'écran : demandes à traiter
// (arrivées, réglages, aide) puis messages d'information éphémères.
export default function RequestToasts({ joinRequests, settingsRequests, hintRequests, infos, onJoin, onSettings, onHint, onDismissInfo }) {
  if (!joinRequests.length && !settingsRequests.length && !hintRequests.length && !infos.length) return null;
  return (
    <div className="toast-stack">
      {joinRequests.map((req) => (
        <div key={req.requestId} className="toast">
          <ShieldIcon size={16} />
          <span><b>{req.pseudo}</b> demande à rejoindre la partie</span>
          <button className="btn btn-success btn-sm" onClick={() => onJoin(req.requestId, true)}><CheckIcon size={14} /> Accepter</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onJoin(req.requestId, false)}><CloseIcon size={14} /> Refuser</button>
        </div>
      ))}
      {settingsRequests.map((req) => (
        <div key={req.requestId} className="toast">
          <SettingsIcon size={16} />
          <span><b>{req.fromPseudo}</b> propose : {describeSettingsText(req.partial)}</span>
          <button className="btn btn-success btn-sm" onClick={() => onSettings(req.requestId, true)}><CheckIcon size={14} /> Accepter</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onSettings(req.requestId, false)}><CloseIcon size={14} /> Refuser</button>
        </div>
      ))}
      {hintRequests.map((req) => (
        <div key={req.requestId} className="toast">
          {req.kind === 'edges' ? <EdgesIcon size={16} /> : <HelpIcon size={16} />}
          {req.kind === 'edges'
            ? <span><b>{req.fromPseudo}</b> demande un coup de main pour les bords : lui montrer {req.count > 1 ? `${req.count} pièces de bord` : 'une pièce de bord'} ?</span>
            : <span><b>{req.fromPseudo}</b> demande à voir {HINT_LEVEL_LABEL[req.level] || 'un indice'}</span>}
          <button className="btn btn-success btn-sm" onClick={() => onHint(req.requestId, true)}><CheckIcon size={13} /> {req.kind === 'edges' ? 'Montrer' : 'Aider'}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onHint(req.requestId, false)}><CloseIcon size={13} /> Non</button>
        </div>
      ))}
      {infos.map((info) => (
        <div key={info.id} className={`toast toast-info ${info.kind ? `toast-${info.kind}` : ''}`} onClick={() => onDismissInfo(info.id)}>
          <span>{info.text}</span>
        </div>
      ))}
    </div>
  );
}
