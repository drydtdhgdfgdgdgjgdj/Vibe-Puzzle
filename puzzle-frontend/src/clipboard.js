// ============================================================
// Copier un texte, y compris quand la page n'est PAS en https.
//
// Sur une adresse non sécurisée (http://192.168.x.x, http://100.x.x.x…),
// `navigator.clipboard` n'existe pas : c'est le cas quand le jeu tourne
// sur le PC d'un joueur. On repasse alors par la vieille méthode.
// ============================================================
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* refusé (onglet en arrière-plan, permission) : on tente l'ancienne méthode */ }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    // Hors écran, mais pas `display:none` : la sélection ne marcherait pas.
    area.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
