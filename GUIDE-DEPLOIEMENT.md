# Guide : mettre le puzzle en ligne, puis le mettre à jour

**Le choix retenu (octobre 2026)**
- **Hébergement : Azure for Students.** Une machine Linux et 100 $ de crédit par an, **sans carte bancaire**, donc **aucune facture surprise possible**. C'est renouvelable chaque année tant que tu es étudiant.
- **Nom de domaine : Namecheap, un `.me` gratuit 1 an.** Tout est expliqué dans **GUIDE-NOM-DE-DOMAINE.md**.
- **Caddy** sur la machine : il s'occupe du HTTPS (cadenas) tout seul, ajoute les en-têtes de sécurité et relaie le temps réel.

Le serveur Node sert à la fois l'API, le temps réel **et** l'interface compilée (`puzzle-frontend/dist`). En ligne, il n'y a donc qu'un seul programme à faire tourner.

**Ce qui est déjà prêt dans le code pour un lancement propre :**
- `deploiement/puzzle.service` : démarrage automatique, relance en cas de plantage, protections système (le jeu ne peut pas modifier la machine).
- `deploiement/Caddyfile` : HTTPS, redirection `www` vers le domaine principal, compression, en-têtes de sécurité, journaux d'accès tournants.
- `puzzle-frontend/index.html` : titre et description pour Google, aperçu riche quand on partage le lien (Discord, WhatsApp…), favicon pièce de puzzle.
- `puzzle-frontend/public/robots.txt` : Google indexe la page d'accueil, mais pas l'API ni les photos envoyées par les joueurs.
- `deploiement/mettre-a-jour.sh` : mise à jour du site en une commande.

## Les offres du Student Pack qui servent vraiment à ce projet

**Indispensables**

| Offre | Ce que tu as | Pourquoi |
|---|---|---|
| **Microsoft Azure for Students** | 100 $/an + 25 services gratuits, renouvelable tant que tu es étudiant | Une vraie machine qui tourne en permanence, avec un disque qui garde les parties, les photos et les MP3 envoyés. Le temps réel (WebSocket) y marche sans réglage. |
| **Namecheap** | Un `.me` gratuit 1 an + redirection d'e-mail gratuite | Le nom de domaine et une adresse `contact@ton-domaine.me`. Voir GUIDE-NOM-DE-DOMAINE.md. |

**Très utiles (gratuites, à activer quand tu veux)**

| Offre | Ce que tu as | À quoi ça te sert |
|---|---|---|
| **LambdaTest** | Plan Live, 1 an | Tester le jeu sur de **vrais iPhone, iPad et Android** et sur Safari, depuis ton PC. Safari est le navigateur le plus capricieux pour le son et le WebGL. |
| **Termius** | Pro, tant que tu es étudiant | Client SSH plus agréable que PowerShell. Il garde la connexion « puzzle » et existe sur téléphone : tu peux relancer le serveur depuis ton portable. |
| **Sentry** | 50 000 erreurs, 1 an | Être prévenu quand un bug arrive chez un joueur (interface et serveur). Demande un petit ajout de code, je peux le faire quand tu veux. |
| **Simple Analytics** | 100 000 pages vues/mois, 1 an | Savoir combien de personnes jouent, sans cookies ni bandeau RGPD. Une ligne à ajouter dans la page. |
| **Icons8** | 3 mois, musique comprise | Télécharger des **musiques libres de droits** en MP3 pour les ajouter à la liste du jeu (voir GUIDE-MEDIAS.md). Pense à tout télécharger avant la fin des 3 mois. |
| **1Password** | 1 an | Ranger la clé `puzzle.pem`, l'accès Azure et Namecheap en lieu sûr. |
| **GitHub Pro + Copilot** | Tant que tu es étudiant | Dépôt privé sans limite, et Copilot dans VS Code. |

**Hors pack, gratuit :** **UptimeRobot** vérifie toutes les 5 minutes que le site répond et t'envoie un e-mail s'il tombe (étape A13).

**Pas adaptées à ce projet**
- **Heroku** (13 $/mois pendant 24 mois) : il efface les fichiers à chaque redémarrage, au moins une fois par jour. Les parties, photos et MP3 disparaîtraient.
- **Appwrite**, **LocalStack**, **GitHub Pages**, **Codespaces** : ce ne sont pas des serveurs qui tournent en permanence avec du temps réel. GitHub Pages ne sait servir que des pages fixes.
- **MongoDB Atlas** (50 $) : inutile, le jeu range ses parties dans des fichiers, sur le disque de la machine.
- **Datadog**, **New Relic** : trop lourds pour un jeu entre amis.

---

## Partie A — Mise en ligne (une seule fois, quand tout est validé)

Compte **1 h 30 à 2 h** la première fois, en comptant l'attente du DNS.

### A1. Sur ton PC : préparer le code
0. Fais le tour de **CHECKLIST-AVANT-DEPLOIEMENT.md** (ce qu'il faut tester à la main).
1. Tests : `npm test` à la racine. Tout doit être vert.
2. Vérifier que l'interface compile : `cd puzzle-frontend` puis `npm run build`.
3. Envoyer sur GitHub : `git add -A`, `git commit -m "Version 1"`, `git push`.

**Les parties de test ne partent pas en ligne.** `data/` est exclu de git (voir `.gitignore`), donc le site en ligne démarre avec une base vide.
Pour vider aussi ta base locale : arrête le serveur (Ctrl+C), puis lance `npm run vider-parties`. Rien n'est effacé : tout est rangé dans `data/archive-<date>/`, que tu peux supprimer à la main ensuite.

### A2. Réserver le nom de domaine
Suis les parties 1 à 3 de **GUIDE-NOM-DE-DOMAINE.md** (choix du nom, réservation, sécurité du compte). Tu reviendras à ce guide pour brancher le domaine à l'étape A8, une fois la machine créée.

### A3. Créer la machine (portail Azure)
https://portal.azure.com, puis **Machines virtuelles**, **Créer**, **Machine virtuelle Azure** :
- Abonnement : **Azure for Students**. Groupe de ressources : nouveau, `puzzle`.
- Nom : `puzzle`. **Région : uniquement une région autorisée pour ton abonnement étudiant**, sinon la validation échoue avec `RequestDisallowedByAzure` ou la taille affiche `NotAvailableForSubscription`. Pour connaître la liste : barre de recherche du portail → **Stratégie** → **Affectations** → **Allowed resource deployment regions** → **Afficher l'affectation** → **Paramètres**. Prends une région européenne de cette liste (proche des joueurs, donc peu de latence).
- Options de disponibilité : **Aucune redondance d'infrastructure requise**.
- Image : **Ubuntu Server 24.04 LTS – x64 Gen2**.
- Taille : une taille marquée **« éligible aux services gratuits »** (B1s ou B2ats v2).
- Authentification : **clé publique SSH**. Utilisateur : `azureuser`. Choisis « Générer une nouvelle paire de clés », nom de la clé : `puzzle`.
- Ports entrants : coche **SSH (22), HTTP (80), HTTPS (443)**.
- Onglet **Disques** : laisse **SSD Premium** ou **SSD Standard**, avec la taille par défaut.
- Onglet **Gestion** : vérifie que **« Activer l'arrêt automatique »** est **décoché**. Sinon, la machine s'éteint tous les soirs et le site avec elle.
- **Vérifier + créer**, puis **Créer**. **Télécharge la clé `.pem`** quand on te la propose : elle ne sera plus proposée ensuite.

Une fois la machine créée (environ 2 minutes) :
- Note son **adresse IP publique** (page de la machine, en haut à droite).
- Clique sur cette IP → **Configuration** → **Attribution : Statique** → **Enregistrer**. Une IP statique ne change jamais, même après un redémarrage. Sans ça, le domaine pourrait pointer dans le vide.

### A3 bis. Garder un œil sur le crédit
Azure for Students ne demande pas de carte bancaire : **tu ne peux pas recevoir de facture**. Quand les 100 $ sont épuisés, les services s'arrêtent, donc le site aussi.
Pour être prévenu bien avant :
1. Portail Azure → recherche **« Gestion des coûts »** → **Budgets** → **Ajouter**.
2. Montant : **50 $** par an. Alertes à **50 %** et **90 %**, avec ton e-mail.

Avec une taille gratuite, la dépense attendue est proche de 0 $. Une alerte veut dire que quelque chose de payant a été créé par erreur.

### A4. Se connecter à la machine depuis Windows
1. Range la clé : `C:\Users\rapha\.ssh\puzzle.pem` (crée le dossier `.ssh` s'il n'existe pas).
2. Protège-la, sinon SSH refuse de s'en servir. Dans PowerShell :
   `icacls $HOME\.ssh\puzzle.pem /inheritance:r /grant:r "$($env:USERNAME):R"`
3. Crée (ou complète) le fichier `C:\Users\rapha\.ssh\config` avec `notepad $HOME\.ssh\config` :
   ```
   Host puzzle
     HostName <IP-PUBLIQUE>
     User azureuser
     IdentityFile ~/.ssh/puzzle.pem
   ```
   ⚠️ Le Bloc-notes peut enregistrer le fichier sous le nom `config.txt` : renomme-le en `config`, sans extension.
4. Dans PowerShell : `ssh puzzle`. Réponds `yes` la première fois. Tu dois voir `azureuser@puzzle:~$`.

### A5. Installer le nécessaire (dans la session `ssh puzzle`)
```bash
# Mémoire de secours (la machine n'a que 1 Go de RAM)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Système à jour + mises à jour de sécurité automatiques
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

# Node.js 24 (LTS) et git
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v   # doit afficher v24.x

# Caddy (dépôt officiel, toujours à jour)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
caddy version   # doit afficher v2.x
```
Si `apt-get upgrade` affiche « *** System restart required *** » : `sudo reboot`, attends une minute, puis `ssh puzzle` à nouveau.

### A6. Récupérer le code
```bash
# Clé "lecture seule" pour que la machine puisse lire ton dépôt GitHub
ssh-keygen -t ed25519 -C puzzle-serveur -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```
Copie la ligne affichée. Sur GitHub, va dans le dépôt **Vibe-Puzzle**, puis **Settings**, **Deploy keys**, **Add deploy key**. Titre : `serveur azure`. Colle la ligne et **ne coche pas** « Allow write access ».
```bash
cd ~
git clone git@github.com:drydtdhgdfgdgdgjgdj/Vibe-Puzzle.git
cd Vibe-Puzzle
npm ci --omit=dev
npm run build          # compile l'interface dans puzzle-frontend/dist
mkdir -p ~/puzzle-data # les parties vivront ici, hors du code
```

### A7. Lancer le jeu en permanence
```bash
sudo cp deploiement/puzzle.service /etc/systemd/system/puzzle.service
sudo systemctl daemon-reload
sudo systemctl enable --now puzzle
systemctl status puzzle --no-pager     # doit afficher "active (running)"
curl -s localhost:3001 | head -c 200   # doit renvoyer du HTML
```
Le jeu se relance tout seul en cas de plantage et au redémarrage de la machine.

### A8. Brancher le domaine
Suis la **partie 4** de **GUIDE-NOM-DE-DOMAINE.md** : les deux lignes A vers l'IP publique, puis la vérification avec `nslookup`.
Pendant que le DNS se propage, passe à l'étape A9.

### A9. Mettre ton domaine dans le code (sur ton PC)
1. Ouvre `puzzle-frontend/.env.production` et remplace `https://ton-domaine.me` par ton vrai domaine (sans `/` à la fin).
2. `git add -A`, `git commit -m "Domaine de production"`, `git push`.
3. Sur la machine : `ssh puzzle "bash ~/Vibe-Puzzle/deploiement/mettre-a-jour.sh"`.

C'est ce qui fait apparaître le titre, la description et l'image quand tu colles le lien dans Discord ou WhatsApp.

### A10. HTTPS avec Caddy (sur la machine)
Une fois que `nslookup ton-domaine.me` renvoie bien l'IP de la machine :
```bash
sudo cp ~/Vibe-Puzzle/deploiement/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # remplace ton-domaine.me (3 fois), Ctrl+O, Entrée, Ctrl+X
caddy validate --config /etc/caddy/Caddyfile   # doit finir par "Valid configuration"
sudo systemctl reload caddy
```
Ouvre https://ton-domaine.me : le cadenas doit apparaître dans la minute. https://www.ton-domaine.me doit renvoyer vers l'adresse sans `www`.
Si ce n'est pas le cas, lance `sudo journalctl -u caddy -n 50 --no-pager`. Les causes, de la plus fréquente à la plus rare :
1. Le DNS n'est pas encore à jour (`nslookup` ne renvoie pas la bonne IP). Attends, puis `sudo systemctl reload caddy`.
2. Le port 80 ou 443 est fermé dans Azure : machine → **Réseau** → **Paramètres réseau** → il faut une règle entrante qui autorise **80** et **443**.

### A11. Vérifier en conditions réelles
- Crée une partie sur ton PC, puis rejoins-la depuis ton téléphone **en 4G** (donc hors de ton wifi).
- Teste un envoi de photo perso, la musique et un focus.
- Ferme tout et rouvre : la partie doit apparaître dans « Mes parties ».
- **Aperçu du lien** : colle `https://ton-domaine.me` dans une conversation Discord ou WhatsApp. Le titre, la description et l'image doivent s'afficher. Pour Discord, l'aperçu peut rester en cache quelques heures après une correction.
- **Sécurité** (optionnel, pour la fierté) :
  - https://securityheaders.com → ton domaine → note attendue **A**.
  - https://www.ssllabs.com/ssltest → ton domaine → note attendue **A** ou **A+**.

### A12. Sauvegardes automatiques
Sur la machine, lance `crontab -e` (choisis `nano` si on te demande un éditeur) et ajoute cette ligne. Elle fait une sauvegarde chaque nuit à 4 h et garde les 14 derniers jours :
```
0 4 * * * mkdir -p ~/sauvegardes && tar czf ~/sauvegardes/puzzle-$(date +\%F).tgz -C ~ puzzle-data && find ~/sauvegardes -name 'puzzle-*.tgz' -mtime +14 -delete
```
Ces sauvegardes restent **sur la machine**. Une fois par mois environ, **rapatrie-les sur ton PC** depuis PowerShell (crée le dossier la première fois) :
```
scp "puzzle:~/sauvegardes/*.tgz" "$HOME\Documents\sauvegardes-puzzle\"
```

### A13. Être prévenu si le site tombe (UptimeRobot, gratuit)
1. Crée un compte sur https://uptimerobot.com.
2. **Add New Monitor** → type **HTTP(s)** → URL `https://ton-domaine.me` → intervalle **5 minutes**.
3. Contact d'alerte : ton e-mail. L'application mobile envoie aussi des notifications.

Tu recevras un e-mail si le site ne répond plus, et un autre quand il revient. UptimeRobot surveille aussi l'expiration du certificat HTTPS, même si Caddy le renouvelle tout seul.

---

## Jour J : la checklist de lancement

- [ ] Le site s'ouvre en **HTTPS** avec le cadenas, sur PC et sur téléphone en 4G.
- [ ] `www.ton-domaine.me` renvoie vers `ton-domaine.me`.
- [ ] Une partie complète à 2 joueurs (dont 1 sur téléphone) se passe sans souci.
- [ ] L'aperçu du lien s'affiche dans Discord ou WhatsApp.
- [ ] `systemctl status puzzle` affiche « active (running) » **après un `sudo reboot`** de la machine.
- [ ] La sauvegarde de la nuit est bien là : `ls ~/sauvegardes`.
- [ ] UptimeRobot affiche le site en vert (« Up »).
- [ ] L'alerte de budget Azure est créée.
- [ ] La clé `puzzle.pem` et les accès Azure et Namecheap sont rangés dans 1Password.
- [ ] L'e-mail de vérification Namecheap a été validé (sinon le domaine est suspendu au bout de 15 jours).

---

## Partie B — Mettre à jour le site (à chaque nouvelle version)

1. **Sur ton PC, comme d'habitude** : lance `npm start` à la racine et `npm run dev` dans `puzzle-frontend`, fais tes modifs et teste sur http://localhost:5173.
2. **Vérifier** : `npm test` à la racine, puis `npm run build` dans `puzzle-frontend` (pour s'assurer que ça compile).
3. **Envoyer sur GitHub** :
   ```
   git add -A
   git commit -m "Ce que j'ai changé"
   git push
   ```
4. **Mettre en ligne**, en une commande depuis PowerShell :
   ```
   ssh puzzle "bash ~/Vibe-Puzzle/deploiement/mettre-a-jour.sh"
   ```
   Le script récupère la version poussée, recompile et redémarre. Il affiche « ✓ Site à jour » à la fin.
   Les parties en cours sont conservées : les joueurs voient « reconnexion… » quelques secondes, puis reprennent.
5. **Vérifier** sur https://ton-domaine.me. Fais Ctrl+F5 si l'ancienne version s'affiche encore.

**Si tu modifies `deploiement/puzzle.service` ou `deploiement/Caddyfile`**, le script ne les recopie pas : ce sont des fichiers système. Recopie-les à la main sur la machine :
- service : `sudo cp ~/Vibe-Puzzle/deploiement/puzzle.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl restart puzzle`
- Caddy : refais l'étape A10, en n'oubliant pas de remettre ton domaine.

**Bon à savoir**
- **Nouvelles radios, musiques et fonds** : déclare-les dans `config.js` (et dépose les fichiers dans `puzzle-frontend/public/`), voir GUIDE-MEDIAS.md. Ensuite, mêmes étapes 2 à 5. GitHub refuse les fichiers de plus de 100 Mo : compresse les vidéos.
- **Les MP3 envoyés par les joueurs** pendant une partie vont directement sur le serveur (`puzzle-data/uploads`), pas dans git. Ils partent avec la partie quand elle est supprimée.
- **Voir ce qui se passe sur le serveur** : `ssh puzzle`, puis `journalctl -u puzzle -f` pour suivre le journal en direct (Ctrl+C pour quitter). Les visites sont dans `/var/log/caddy/puzzle.log`.
- **Place sur le disque** : `ssh puzzle "df -h / && du -sh ~/puzzle-data ~/sauvegardes"`.
- **Annuler une mise à jour ratée** : sur ton PC, `git revert HEAD`, puis `git push`, puis l'étape 4.
- **Vider les parties en ligne** (rarement utile) :
  `ssh puzzle "sudo systemctl stop puzzle && cd ~/Vibe-Puzzle && PUZZLE_DATA_DIR=~/puzzle-data npm run vider-parties && sudo systemctl start puzzle"`
- **Restaurer une sauvegarde** :
  `ssh puzzle "sudo systemctl stop puzzle && mv ~/puzzle-data ~/puzzle-data.avant-restauration && tar xzf ~/sauvegardes/puzzle-2026-10-01.tgz -C ~ && sudo systemctl start puzzle"`

## Dans 12 mois
- **Azure** t'envoie un e-mail environ 30 jours avant la fin. Si tu es toujours étudiant, refais l'inscription sur https://azure.microsoft.com/free/students : 100 $ neufs pour un an, et la machine continue sans rien changer.
- **Si tu n'es plus étudiant**, la machine devient payante (environ 8 à 10 €/mois).
  Moins cher : un petit serveur Hetzner (environ 4 €/mois, Ubuntu 24.04). Les étapes A4 à A13 sont identiques (utilisateur `root` ou `ubuntu` à la place de `azureuser`, à changer aussi dans `puzzle.service`). Il suffit de copier `puzzle-data` d'une machine à l'autre avec `scp`.
- **Le domaine** : voir la partie 6 de GUIDE-NOM-DE-DOMAINE.md (environ 20 €/an pour garder un `.me`).
