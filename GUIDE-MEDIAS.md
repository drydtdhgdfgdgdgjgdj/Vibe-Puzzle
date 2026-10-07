# Guide : lancer le jeu, musique, fonds animés, qualité

## Lancer le jeu

1. **Arrête l'ancien serveur** (Ctrl+C dans son terminal) avant de lancer le nouveau.
2. À la racine du projet : `npm start` (ou `node server.js`). Le serveur écoute sur le port 3001.
   - Au premier lancement, `database.json` est déplacée dans `data/database.json`.
     L'ancienne reste à côté sous le nom `database.json.ancienne-version`, par sécurité.
   - Les photos envoyées sont rangées dans `data/uploads/`.
3. Dans `puzzle-frontend` : `npm run dev`, puis ouvre http://localhost:5173.
4. Tests du serveur : `npm test` à la racine.
5. Repartir d'une base vide (parties de test) : serveur arrêté, `npm run vider-parties`. Les anciennes parties sont rangées dans `data/archive-<date>/`, rien n'est effacé.
6. Pour **jouer avec un ami depuis ton PC** (ton PC fait serveur) : `npm run jouer`, puis voir **GUIDE-JOUER-DEPUIS-MON-PC.md**.
7. Mise en ligne et mises à jour du site : voir **GUIDE-DEPLOIEMENT.md**.

**OneDrive.** Le projet est dans un dossier OneDrive, qui peut verrouiller un fichier pendant sa synchronisation. La sauvegarde réessaie toute seule et écrit toujours via un fichier temporaire, donc une coupure ne peut plus corrompre la base. Pour être tranquille, tu peux stocker les données hors de OneDrive. Dans PowerShell : `$env:PUZZLE_DATA_DIR="C:\PuzzleData"; npm start`.

## Musique d'ambiance

**Pendant une partie** : le bouton ♪ en bas à droite ouvre le panneau. Tu y trouves :
- en haut, ce qui joue en ce moment, avec le titre du morceau pour les radios qui le donnent (FIP, France Musique, Lofi) ;
- les radios rangées par ambiance ;
- **Autre** : *Mon fichier* (MP3, OGG, M4A, WAV, FLAC, 20 Mo maximum, envoyé au serveur pour que tout le monde l'entende) ou *Un lien* (YouTube, radio ou fichier en ligne).

Quand la musique joue, le bouton ♪ devient de petites barres animées.

**Ajouter une radio ou une piste pour tout le monde** : liste `MUSIC_TRACKS` dans `puzzle-frontend/src/config.js`.

**1. Radio en continu (le plus fiable : pas de pub, volume réglable)**
- Il faut le lien **direct** du flux audio, en `https://`. On le trouve souvent dans le lecteur du site de la radio, ou dans un fichier `.m3u` / `.pls` : ouvre-le avec le Bloc-notes et copie le lien qu'il contient.
- Ajoute par exemple `{ id: 'ma-radio', name: 'Ma radio', genre: 'Jazz', group: 'jazz', src: 'https://…/stream.mp3', cover: ['#614385', '#516395'] }`.
- `group` : `lofi`, `groove`, `jazz` ou `world` (voir `MUSIC_GROUPS`). `cover` : les deux couleurs de la vignette.
- Teste-la d'abord avec **Autre › Un lien** : si elle joue là, elle jouera dans la liste.
- SomaFM ne marche pas : leurs serveurs refusent les lecteurs des navigateurs.

**2. Fichier audio à toi**
- Dépose-le dans `puzzle-frontend/public/musique/`, par exemple `pluie.mp3`.
- Ajoute `{ id: 'pluie', name: 'Pluie douce', genre: 'Pluie', group: 'world', src: '/musique/pluie.mp3', live: false, cover: ['#4b6cb7', '#182848'] }`. `live: false` le fait boucler.
- 128 à 192 kb/s suffisent. Choisis un morceau qui boucle sans coupure audible.

**3. YouTube**
- Ajoute `{ id: 'synthwave', name: 'Synthwave', genre: 'Radio YouTube', group: 'lofi', youtubeId: '4xDzrJKXOOY', cover: [...] }`.
- L'identifiant est la partie après `v=` dans le lien.
- **Limite importante** : beaucoup de vidéos interdisent d'être lues hors de YouTube. C'est le cas de la radio lofi principale de Lofi Girl, d'où l'absence de son avant. Le panneau affiche alors « Cette vidéo refuse d'être lue en dehors de YouTube ». Il peut aussi y avoir des pubs.

**Pour tous :**
- La musique est partagée dans la partie : l'hôte la change, un invité la propose.
- Le **volume est personnel**. Couper le son arrête vraiment le téléchargement, pour toi seulement.
- Si le navigateur bloque la lecture automatique (Safari, iPhone), la musique démarre au premier clic n'importe où. Le bouton « Activer la musique » apparaît en attendant.

## Fonds de table

Les fonds se déclarent dans `config.js`, liste `BACKGROUNDS`.

| Type | Exemple | Remarque |
|---|---|---|
| Couleur / dégradé | `{ type: 'color', value: 'linear-gradient(160deg, #0f0c29, #302b63)' }` | Aucun coût |
| Animé intégré | Aurore, Ciel étoilé, Dégradé vivant, **Pluie** (déjà présents) | Aucun fichier, net en 4K, très léger |
| Image | fichier dans `public/fonds/foret.jpg` + `{ type: 'image', value: '/fonds/foret.jpg' }` | 3840 px de large pour la 4K |
| Vidéo | `npm run medias` (voir ci-dessous) + `video('pluie', 'Pluie')` | Muette, en boucle, avec vignette |

L'hôte peut aussi utiliser **sa propre photo** : Réglages → Room → « Mettre ma photo en fond ». Elle est réduite à 3840 px (4K) maximum et partagée avec tout le monde.

### Pluie : intégrée ou en vidéo ?

Le fond **« Pluie (animé) »** est déjà là, sans aucun fichier : les gouttes sont dessinées par le navigateur, nettes sur n'importe quel écran, et ça ne coûte presque rien. Commence par celui-là.

Une **vidéo** reste plus réaliste (vraies gouttes, reflets, flou). Elle est toujours jouée **sans le son** : le `<video>` du jeu est muet et en boucle, et une vidéo avec du son serait de toute façon refusée au démarrage automatique par les navigateurs. Si ta source a une piste audio, le `-an` des commandes ci-dessous la supprime pour alléger le fichier.

### Et la 4K ?

Oui, c'est possible.
- **Fonds animés intégrés** : ils sont calculés par le navigateur à la résolution de l'écran, donc nets en 4K sans fichier. Ils coûtent très peu, car seuls des déplacements et des fondus sont animés.
- **Vidéo 4K** : elle est décodée par la carte graphique (H.264, H.265 ou AV1) et un PC récent la lit sans peine. Ce qui coûte vraiment, c'est le poids du fichier (envoyé à chaque joueur depuis le serveur) et un peu de mémoire graphique.

Conseils pour une vidéo de fond :
- une boucle de 10 à 30 s, à 30 images/s, sans piste son, entre 8 et 15 Mb/s ;
- en fond, le 1440p est souvent indiscernable de la 4K et deux fois plus léger ;
- vise **moins de 30 Mo**. Le fichier est téléchargé par chaque joueur à l'ouverture, et GitHub refuse les fichiers de plus de 100 Mo ;
- choisis une boucle qui se referme proprement, sinon on voit le raccord ;
- où en trouver gratuitement : Pexels Videos, Pixabay, Coverr (libres d'usage, vérifie la licence).

### Ajouter des images de puzzle ou des vidéos de fond (méthode simple)

1. Dépose les fichiers **tels quels** à la racine du projet, dans :
   - `medias-originaux/puzzles/` pour les **images de puzzle** (.jpg, .png, .webp) ;
   - `medias-originaux/fonds/` pour les **vidéos de fond** (.mp4, .mov, .webm…). Optionnel : une **capture** du même nom en `.png` ou `.jpg` (par exemple `Pluie.mp4` + `Pluie.png`), qui sert d'image de chargement et de vignette. Sans capture, la 1re image de la vidéo est utilisée.

   Le nom du fichier importe peu (espaces et accents compris) : il devient le nom affiché.
2. À la racine du projet : `npm run medias`. Le script crée dans `puzzle-frontend/public/` :
   - `puzzles/<id>.jpg`, réduite à **4096 px** maximum. C'est la même limite que pour les photos envoyées par les joueurs : au-delà, certains téléphones n'arrivent plus à découper l'image. Il crée aussi `puzzles/<id>-mini.jpg`, la vignette du carrousel d'accueil, pour que l'accueil ne télécharge pas toutes les images en grand ;
   - `fonds/<id>.mp4` : 1080p maximum, 30 images/s maximum, **sans son**, qui démarre avant la fin du téléchargement. Une vidéo 4K de 50 Mo descend en général à 4-8 Mo, et au-delà de 25 Mo le script recompresse plus fort. Il crée aussi `fonds/<id>.jpg` (l'image de chargement) et `fonds/<id>-mini.jpg` (la vignette du sélecteur).
3. Il affiche à la fin les lignes à coller dans `puzzle-frontend/src/config.js` :
   - `puzzle('vague-de-kanagawa', 'Vague de Kanagawa'),` dans `PRESET_IMAGES` ;
   - `video('foret-sous-la-pluie', 'Forêt sous la pluie'),` dans `BACKGROUNDS`.

   Le texte entre guillemets est le nom affiché, tu peux le changer. L'ordre des lignes est l'ordre d'affichage.
4. Teste en local, puis `git add -A`, `git commit`, `git push` et la mise à jour du serveur (GUIDE-DEPLOIEMENT.md, partie B).

Les originaux restent dans `medias-originaux/`, qui est exclu de git : ils ne partent ni sur GitHub ni sur le serveur. Si tu relances le script, les fichiers déjà prêts sont sautés.
**Ne dépose pas les originaux directement dans `public/`** : les noms avec espaces sont refusés par le serveur au lancement d'une partie, et les fichiers trop lourds (plus de 100 Mo) bloquent le `git push`.

ffmpeg est fourni par le projet (`ffmpeg-static`, installé avec `npm install`) : rien d'autre à installer.

En qualité « Économie », les fonds animés et les vidéos sont mis en pause. C'est aussi le cas si le système est réglé sur « animations réduites ».

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
