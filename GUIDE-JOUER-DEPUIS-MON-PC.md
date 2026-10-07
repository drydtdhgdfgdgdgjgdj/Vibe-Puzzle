# Guide : faire tourner le jeu sur mon PC et jouer avec un ami

En attendant la validation du GitHub Student Pack, **ton PC peut faire serveur**. Ton ami joue depuis chez lui, dans son navigateur, sans rien installer côté jeu.

Pendant toute la partie, ton PC doit rester **allumé, réveillé et connecté**. Si tu le fermes, la partie s'arrête pour tout le monde (elle est enregistrée : vous la reprendrez plus tard).

---

## 1. Lancer le jeu

Clic droit sur `scripts\demarrer-serveur.ps1` puis **« Exécuter avec PowerShell »**.

Ou, dans un terminal ouvert à la racine du projet :
```powershell
powershell -ExecutionPolicy Bypass -File scripts\demarrer-serveur.ps1
```

Le script compile l'interface, démarre le serveur et affiche les adresses :

```
  Adresses pour jouer :
    Sur ce PC                          http://localhost:3001
    Sur le même wifi (Wi-Fi)           http://10.195.248.60:3001
    Par Tailscale (ami à distance)     http://100.96.160.99:3001
```

**Laisse cette fenêtre ouverte** pendant que vous jouez. `Ctrl+C` pour arrêter.

Ici, tout passe par **une seule adresse** : le serveur sert aussi l'interface. Pas besoin de lancer Vite (`npm run dev`), qui reste réservé au développement.

> ⚠️ **Le plus important :** ouvre toi-même le jeu par **l'adresse que ton ami utilisera** (celle de Tailscale, par exemple), et pas par `localhost`.
> Le bouton **« Lien »** dans la partie construit l'invitation à partir de l'adresse de ta page. Si tu es sur `localhost`, le lien copié sera `http://localhost:3001/...` et ne marchera que chez toi.

## 2. Inviter ton ami

Dans la partie, en haut à gauche, à côté du code :

- **« Lien »** copie l'invitation complète, par exemple `http://100.96.160.99:3001/?partie=h2fthrv`. Envoie-la par Discord ou WhatsApp.
- L'icône à côté copie seulement le **code** (`h2fthrv`), si ton ami préfère le taper à la main.

Quand ton ami ouvre le lien, le code est déjà rempli : il entre son pseudo et clique sur **Rejoindre**. Tu reçois « … demande à rejoindre » et tu acceptes. La fois suivante, le lien le fait entrer directement.

## 3. Quelle adresse choisir ?

### A. Ton ami est à côté de toi, sur le même wifi
Donne-lui l'adresse **« Sur le même wifi »**. C'est le plus simple.

Ça ne marche pas partout : sur le wifi d'une école (le tien est `vivesnet.be`), les appareils sont souvent isolés les uns des autres exprès. Chez toi, en revanche, ça marche en général tout de suite. Le pare-feu Windows autorise déjà Node.js, tu n'as rien à régler.

### B. Ton ami est ailleurs : Tailscale
**Tailscale est déjà installé et connecté sur ton PC** (machine « raf »). C'est un petit réseau privé entre tes appareils et ceux que tu invites : rien n'est exposé publiquement, tout est chiffré, et il faut une invitation nominative pour entrer.

1. Ton ami installe Tailscale (gratuit) : https://tailscale.com/download, puis il crée un compte.
2. Toi, va sur https://login.tailscale.com/admin/machines, clique sur les **…** à droite de la machine **raf**, puis **Share…**.
3. Copie le lien de partage et envoie-le-lui. Il l'ouvre et accepte.
4. Donne-lui ensuite l'adresse **« Par Tailscale »** affichée par le script, ou mieux : ouvre le jeu toi-même sur cette adresse et envoie-lui le lien du bouton **« Lien »**.

Avantages : ça marche de n'importe où, personne d'autre ne peut y accéder, et tu peux retirer l'accès d'un clic.
Inconvénient : ton ami doit installer Tailscale une fois.

### C. Un vrai lien public, sans rien installer chez ton ami
C'est possible aussi (un « tunnel » qui donne une adresse `https://…` publique), mais ça **expose ton PC sur Internet** : n'importe qui ayant le lien peut ouvrir le jeu, envoyer des photos et des MP3 qui atterrissent sur ton disque. Je ne l'ai pas mis en place sans ton accord. Dis-le-moi si tu veux cette option, on la fera ensemble.

## 4. Pendant la partie

- **Empêche ton PC de se mettre en veille** : Paramètres → Système → Alimentation → « Écran et veille » → mets la veille sur **Jamais** pendant que vous jouez.
- Les parties, les photos et les MP3 envoyés sont dans le dossier `data\` du projet.
- Si tu arrêtes le serveur puis le relances, **rien n'est perdu** : vos parties réapparaissent dans « Mes parties ».
- Pour repartir de zéro : serveur arrêté, puis `npm run vider-parties`.

## 5. Si ça ne marche pas

| Ce que tu vois | Ce qu'il faut faire |
|---|---|
| « Le port 3001 est déjà utilisé » | Un serveur tourne déjà dans une autre fenêtre. Ferme-la (`Ctrl+C`), ou relance avec `-Port 3002`. |
| Ton ami a une page blanche ou « site inaccessible » | Il n'arrive pas jusqu'à ton PC : wifi d'école isolé, ou Tailscale pas accepté. Passe par Tailscale (section B). |
| Le lien que tu as envoyé contient `localhost` | Tu as ouvert le jeu par `localhost`. Ouvre-le par l'adresse partageable, puis recopie le lien. |
| « reconnexion en cours… » chez ton ami | Ton PC s'est mis en veille, ou tu as fermé la fenêtre du serveur. |
| Les radios ne jouent pas chez ton ami | Qu'il vérifie que son navigateur n'a pas coupé le son de l'onglet, et qu'il clique une fois dans la page. |

## Et plus tard ?

Dès que le Student Pack est validé, suis **GUIDE-DEPLOIEMENT.md** : le jeu tournera en permanence sur un vrai serveur, avec ton nom de domaine et le cadenas `https`. Ton PC n'aura plus besoin de rester allumé. Rien à refaire côté code : c'est le même projet.
