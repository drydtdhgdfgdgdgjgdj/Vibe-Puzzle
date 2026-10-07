#!/usr/bin/env bash
# ============================================================
# Met le site en ligne à jour avec la dernière version poussée sur GitHub.
# À lancer SUR LE SERVEUR :   bash ~/Vibe-Puzzle/deploiement/mettre-a-jour.sh
# Ou depuis ton PC :          ssh puzzle "bash ~/Vibe-Puzzle/deploiement/mettre-a-jour.sh"
#
# Les parties (dossier puzzle-data) ne sont pas touchées. Pendant le
# redémarrage (quelques secondes), les joueurs voient "reconnexion…" puis
# reprennent là où ils en étaient.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Récupération de la dernière version…"
git pull --ff-only

echo "→ Dépendances du serveur…"
npm ci --omit=dev --no-audit --no-fund

echo "→ Compilation de l'interface…"
npm run build

echo "→ Redémarrage du jeu…"
sudo systemctl restart puzzle
sleep 2
if systemctl is-active --quiet puzzle; then
  echo "✓ Site à jour ($(git log -1 --format='%h %s'))."
else
  echo "✗ Le serveur ne redémarre pas. Dernières lignes du journal :"
  sudo journalctl -u puzzle -n 40 --no-pager
  exit 1
fi
