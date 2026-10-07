// Description lisible d'un changement de réglages de room, pour les
// demandes envoyées à l'hôte ("Alex propose : Fond → Aurore").
import { BACKGROUNDS, MUSIC_TRACKS } from './config';

function backgroundName(id) {
  if (id === 'custom') return 'photo perso';
  return BACKGROUNDS.find((b) => b.id === id)?.name || id;
}

export function describeSettings(partial) {
  const out = [];
  if (!partial) return out;
  if (partial.background !== undefined) out.push(`Fond → ${backgroundName(partial.background)}`);
  if (partial.music === 'custom') out.push(`Musique → ${partial.customMusic?.name || 'musique perso'}`);
  else if (partial.music !== undefined) out.push(`Musique → ${MUSIC_TRACKS.find((t) => t.id === partial.music)?.name || partial.music}`);
  if (partial.showFrame !== undefined) out.push(`Cadre final → ${partial.showFrame ? 'affiché' : 'masqué'}`);
  if (partial.showSeams !== undefined) out.push(`Traits de découpe → ${partial.showSeams ? 'affichés' : 'masqués'}`);
  if (partial.ghostImage !== undefined) out.push(`Image en filigrane → ${partial.ghostImage ? 'affichée' : 'masquée'}`);
  if (partial.lockMode !== undefined) out.push(`Assemblage → ${partial.lockMode === 'locked' ? 'Accroché au cadre' : 'Bloc libre'}`);
  if (partial.guestsCanEdit !== undefined) out.push(`Invités → ${partial.guestsCanEdit ? 'modifient sans demander' : 'doivent demander'}`);
  return out;
}

export function describeSettingsText(partial) {
  return describeSettings(partial).join(', ');
}
