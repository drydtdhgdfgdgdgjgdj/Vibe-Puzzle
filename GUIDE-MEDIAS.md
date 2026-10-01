# Guide : lancer le jeu, musique, fonds animés, qualité

## Lancer le jeu

1. **Arrête l'ancien serveur** (Ctrl+C dans son terminal) avant de lancer le nouveau.
2. À la racine du projet : `npm start` (ou `node server.js`). Le serveur écoute sur le port 3001.
   - Au premier lancement, `database.json` est déplacée dans `data/database.json`.
     L'ancienne reste à côté sous le nom `database.json.ancienne-version`, par sécurité.
   - Les photos envoyées sont rangées dans `data/uploads/`.
3. Dans `puzzle-frontend` : `npm run dev`, puis ouvre http://localhost:5173.
4. Tests du serveur : `npm test` à la racine.

**OneDrive.** Le projet est dans un dossier OneDrive, qui peut verrouiller un fichier pendant sa synchronisation. La sauvegarde réessaie toute seule et écrit toujours via un fichier temporaire, donc une coupure ne peut plus corrompre la base. Pour être tranquille, tu peux stocker les données hors de OneDrive. Dans PowerShell : `$env:PUZZLE_DATA_DIR="C:\PuzzleData"; npm start`.

## Musique d'ambiance

Les pistes se déclarent dans `puzzle-frontend/src/config.js`, liste `MUSIC_TRACKS`.

**1. Fichier audio (le plus fiable : pas de pub, volume réglable)**
- Dépose le fichier dans `puzzle-frontend/public/musique/`, par exemple `pluie.mp3`.
- Ajoute la ligne `{ id: 'pluie', name: 'Pluie douce', src: '/musique/pluie.mp3' }`.
- Formats : MP3, OGG ou M4A. 128 à 192 kb/s suffisent. Le fichier boucle tout seul : choisis un morceau qui boucle sans coupure audible.

**2. YouTube (radios en direct, longues playlists)**
- Ajoute `{ id: 'lofi', name: 'Lofi Girl', youtubeId: 'jfKfPfyJRdk' }`.
- L'identifiant est la partie après `v=` dans `https://www.youtube.com/watch?v=jfKfPfyJRdk`, ou après `youtu.be/`.
- Limites : la vidéo doit autoriser l'intégration, et il peut y avoir des pubs. Si rien ne joue, essaie une autre vidéo.

**Pour tous :**
- Le choix de la piste est partagé dans la partie : l'hôte le change, un invité le propose.
- Le **volume est personnel** : bouton ♪ en bas à droite.
- Si le navigateur bloque la lecture automatique, un bouton « ▶ Activer le son » apparaît.

## Fonds de table

Les fonds se déclarent dans `config.js`, liste `BACKGROUNDS`.

| Type | Exemple | Remarque |
|---|---|---|
| Couleur / dégradé | `{ type: 'color', value: 'linear-gradient(160deg, #0f0c29, #302b63)' }` | Aucun coût |
| Animé intégré | Aurore, Ciel étoilé, Dégradé vivant (déjà présents) | Aucun fichier, net en 4K, très léger |
| Image | fichier dans `public/fonds/foret.jpg` + `{ type: 'image', value: '/fonds/foret.jpg' }` | 3840 px de large pour la 4K |
| Vidéo | fichier dans `public/fonds/pluie.mp4` + `{ type: 'video', value: '/fonds/pluie.mp4', poster: '/fonds/pluie.jpg' }` | Muette, en boucle |

L'hôte peut aussi utiliser **sa propre photo** : Réglages → Room → « Mettre ma photo en fond ». Elle est réduite à 3840 px (4K) maximum et partagée avec tout le monde.

### Et la 4K ?

Oui, c'est possible.
- **Fonds animés intégrés** : ils sont calculés par le navigateur à la résolution de l'écran, donc nets en 4K sans fichier. Ils coûtent très peu, car seuls des déplacements et des fondus sont animés.
- **Vidéo 4K** : elle est décodée par la carte graphique (H.264, H.265 ou AV1) et un PC récent la lit sans peine. Ce qui coûte vraiment, c'est le poids du fichier (envoyé à chaque joueur depuis ton PC) et un peu de mémoire graphique.

Conseils pour une vidéo de fond :
- une boucle de 10 à 30 s, à 30 images/s, sans piste son, entre 8 et 15 Mb/s ;
- en fond, le 1440p est souvent indiscernable de la 4K et deux fois plus léger.

Commandes [ffmpeg](https://ffmpeg.org) utiles :

```bash
# Boucle 4K de 20 s, compatible avec tous les navigateurs
ffmpeg -i source.mp4 -t 20 -vf "scale=3840:-2,fps=30" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart -an public/fonds/pluie-4k.mp4

# Version 1440p, plus légère
ffmpeg -i source.mp4 -t 20 -vf "scale=2560:-2,fps=30" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart -an public/fonds/pluie-1440p.mp4

# Image affichée pendant le chargement (poster)
ffmpeg -i public/fonds/pluie-4k.mp4 -frames:v 1 -q:v 3 public/fonds/pluie.jpg
```

En qualité « Économie », les fonds animés et les vidéos sont mis en pause.

## Qualité graphique

Réglages → Perso → Qualité (préférence personnelle, jamais partagée) :

| Réglage | Pour qui | Ce qui change |
|---|---|---|
| Auto | tout le monde | choisit Max sur un PC puissant, sinon Équilibré |
| Max | écrans 4K, bonnes cartes graphiques | rendu à la résolution de l'écran, pièces les plus fines |
| Équilibré | la plupart des PC | très net, plus léger |
| Économie | petits PC, portables sur batterie | sans ombres, 30 images/s maximum, fond figé |

- **Images de puzzle.** Les pièces sont découpées dans la photo d'origine, gardée jusqu'à 4096 px. Plus la photo est grande, plus le zoom est net. Les trois images d'exemple font seulement 612 px de large : remplace-les par des photos d'au moins 3000 px pour un rendu vraiment net.
- **Au repos, la table ne consomme rien** : l'écran n'est redessiné que si quelque chose bouge.
- `http://localhost:5173/?debug=1` affiche les statistiques de rendu (images/s, atlas, temps de préparation des pièces).
