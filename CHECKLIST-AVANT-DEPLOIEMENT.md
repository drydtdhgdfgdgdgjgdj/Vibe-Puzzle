# Checklist : à tester avant de mettre en ligne

**Comment tester à deux tout seul :** ouvre le jeu dans Chrome, et dans une **fenêtre de navigation privée** (Ctrl+Maj+N) pour le 2ᵉ joueur. Chaque fenêtre a sa propre identité. Mieux encore : utilise ton téléphone sur le même wifi, à l'adresse `http://<IP-de-ton-PC>:5173`. Pour la trouver, tape `ipconfig` dans PowerShell et prends la ligne « Adresse IPv4 ». Il faut aussi lancer Vite avec `npm run dev -- --host`.

Coche au fur et à mesure (`[x]`). Si quelque chose cloche, note-le à côté et envoie-moi la liste.

---

## 1. Automatique (2 minutes)
- [ ] `npm test` à la racine : tout est vert
- [ ] `npm run build` dans `puzzle-frontend` : se termine par « built in … »

## 2. Accueil
- [ ] Pseudo et couleur se retiennent après un rechargement de la page
- [ ] Les 3 images prédéfinies s'affichent ; choisir **ta propre photo** marche (JPG/PNG)
- [ ] Le curseur « nombre de pièces » va de 12 à 1000
- [ ] Le fond choisi s'applique (un fond animé aussi)
- [ ] **Forme des pièces** : les aperçus montrent ta photo découpée ; « Magiques » reste choisi après un rechargement
- [ ] « Mes parties » liste tes parties ; « Supprimer » (hôte) et « Retirer de ma liste » (invité) marchent
- [ ] Musique à l'accueil : choisir une radio → les petites barres apparaissent sur le bouton ♪

## 3. Rejoindre une partie (2 joueurs)
- [ ] Créer une partie, copier le code avec le bouton à côté
- [ ] Bouton **« Lien »** : il copie l'invitation complète ; collée dans un autre navigateur, elle remplit le code toute seule
- [ ] Le 2ᵉ joueur entre le code → l'hôte voit « … demande à rejoindre » → Accepter → le 2ᵉ joueur arrive
- [ ] Refuser une demande : le 2ᵉ joueur est prévenu
- [ ] Une fois accepté, le 2ᵉ joueur peut revenir (« Mes parties ») **sans** nouvelle validation
- [ ] Les deux voient le curseur de l'autre bouger en douceur, avec son pseudo

## 4. Jouer
- [ ] Attraper, déplacer et lâcher une pièce ; l'autre voit la pièce bouger
- [ ] Deux pièces voisines s'emboîtent (son « clac ») ; une pièce à sa place se fixe dans le cadre
- [ ] Les deux joueurs ne peuvent pas tenir la même pièce en même temps
- [ ] Le compteur « x/48 pièces » et les scores par joueur augmentent
- [ ] **Ranger la table** (balai) redisperse les pièces seules, au hasard, sans les empiler
- [ ] Molette = zoom, glisser le fond = se déplacer, **R** = recentrer
- [ ] **Alt + clic** : un ping visible par l'autre
- [ ] Clic sur un joueur (liste en haut à droite) : la vue va à son curseur. Double-clic : tu le suis, « Arrêter » pour sortir
- [ ] Image modèle (**M**) : déplaçable, tailles S / M / L
- [ ] Partie **magique** : des pièces de toutes tailles (toutes petites, longues, en L…) ; deux voisines s'emboîtent, une pièce se fixe à sa place, le focus et l'aide marchent
- [ ] **Mode clair** (bouton œil barré ou **C**) : plus que les pièces à l'écran, la musique continue ; **C**, **Échap** ou le petit œil en haut à droite font revenir l'interface

## 5. Aide, bords, focus
- [ ] **Demander de l'aide** (H) → clic sur la case vide → l'autre reçoit la demande → « Aider » → la pièce est montrée. « Indice supplémentaire » jusqu'à 3 niveaux
- [ ] **Bords** (B) → l'autre reçoit « … demande un coup de main pour les bords » → Montrer : 3 pièces au plus entourées en doré. « Non » : tu es prévenu
- [ ] Seul dans la partie : les bords s'affichent sans demande
- [ ] **Focus** (F) en ~25, ~50 et ~100 : une mini-zone s'ouvre ; **Espace** maintenu = coup d'œil sur la grande room ; finir le focus rapatrie les pièces ; « Quitter » range la zone

## 6. Musique (nouveau)
- [ ] Bouton ♪ : le panneau s'ouvre, les boutons Réglages et Accueil disparaissent, un clic ailleurs referme tout
- [ ] Choisir **chaque radio** une fois : elle démarre en quelques secondes, les barres bougent sur le bouton et sur la vignette
- [ ] Carte « En cours » : pour FIP, France Musique et Lofi, le **titre du morceau** s'affiche (et se met à jour)
- [ ] L'autre joueur entend la même radio. Son volume ne bouge pas quand tu changes le tien
- [ ] Couper le son (pour toi) : ça s'arrête chez toi seulement ; le remettre : ça repart en direct
- [ ] **Autre › Mon fichier** avec un vrai MP3 : il joue chez les deux, en boucle
- [ ] **Autre › Un lien** avec un lien YouTube : le titre de la vidéo s'affiche et ça joue
- [ ] **Autre › Un lien** avec une page web normale : message d'erreur clair au bout de quelques secondes
- [ ] Un invité (sans droits) qui choisit une radio : l'hôte reçoit « … propose : Musique → … » ; Accepter / Refuser marchent
- [ ] Stop (carré) : plus de musique pour personne
- [ ] Effets sonores : le volume se règle dans Réglages › Perso

## 7. Réglages
- [ ] Perso : pseudo (refus d'un pseudo déjà pris), couleur, forme du curseur, **curseur depuis une photo** (recadrer / détourer)
- [ ] Perso : **taille des curseurs** ×0,6 à ×2,5, chez toi seulement (l'autre ne voit pas de changement)
- [ ] Perso : qualité graphique Auto / Max / Équilibré / Économie
- [ ] Room (hôte) : nom de la partie, fond, **ta photo en fond**, cadre, traits de découpe, image en filigrane
- [ ] Room : passer **Accroché ↔ Bloc libre** pendant une partie ne perd aucune pièce
- [ ] Room : un invité qui change un réglage → proposition à l'hôte ; avec « Les invités modifient sans demander », ça s'applique directement
- [ ] Joueurs : nommer / retirer un co-hôte, exclure, bannir puis débannir

## 8. Fin de partie
- [ ] Finir un petit puzzle (12 pièces) : écran de résultats avec le temps et les scores
- [ ] « Télécharger avec les contours » et « Télécharger l'image d'origine » donnent bien un fichier
- [ ] « Voir le puzzle » referme l'écran ; le bouton trophée le rouvre

## 9. Robustesse
- [ ] Recharger la page en pleine partie : tu reviens au même endroit (via « Mes parties »)
- [ ] Couper le wifi 10 secondes puis le remettre : bandeau « reconnexion… », puis tout repart
- [ ] Arrêter le serveur (Ctrl+C) puis le relancer : les parties et leurs pièces sont intactes
- [ ] Ouvrir la même partie dans 2 onglets du même navigateur : l'ancien onglet est remplacé proprement
- [ ] Un gros puzzle (500 à 1000 pièces) reste fluide. Sinon, essaie la qualité « Économie »

## 10. Appareils et navigateurs
- [ ] Chrome et Edge sur PC
- [ ] Firefox
- [ ] **Safari / iPhone** (avec LambdaTest si tu n'en as pas) : surtout la musique (premier toucher = démarrage) et le déplacement des pièces au doigt
- [ ] Android (Chrome)
- [ ] Un petit écran (portable 13") : rien ne se chevauche en bas à droite

---

## Juste après la mise en ligne
- [ ] https://ton-domaine.me s'ouvre avec le **cadenas**, et `http://` redirige vers `https://`
- [ ] Créer une partie depuis le PC, la rejoindre depuis le téléphone **en 4G**
- [ ] Envoyer une photo perso et un MP3 : les deux marchent en ligne
- [ ] Les radios jouent en ligne. Un lien perso en `http://` (sans « s ») peut ne pas marcher sur un site en HTTPS : préfère les liens `https://`
- [ ] Après `ssh puzzle "bash ~/Vibe-Puzzle/deploiement/mettre-a-jour.sh"`, la partie en cours reprend toute seule
- [ ] Le lendemain : une sauvegarde existe dans `~/sauvegardes` sur le serveur
