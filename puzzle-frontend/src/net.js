// ============================================================
// Connexion au serveur. En développement, Vite relaie /api, /uploads
// et /socket.io vers le serveur (port 3001, voir vite.config.js) :
// tout passe par la même adresse que la page.
// ============================================================
import { io } from 'socket.io-client';

export const socket = io({ autoConnect: true, reconnectionDelayMax: 4000 });

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) throw new Error(data?.error || `Erreur serveur (${res.status})`);
  return data;
}
