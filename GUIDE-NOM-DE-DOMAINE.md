# Guide : le nom de domaine, de A à Z

Le nom de domaine, c'est l'adresse que tes joueurs taperont (par exemple `vibepuzzle.me`). Ce guide couvre :
1. choisir un bon nom ;
2. l'obtenir gratuitement avec le Student Pack (Namecheap, `.me` gratuit 1 an) ;
3. sécuriser le compte ;
4. faire pointer le domaine vers ta machine Azure ;
5. avoir une adresse e-mail pro (`contact@ton-domaine.me`) gratuite ;
6. le renouvellement.

Compte environ **20 minutes**, plus l'attente du DNS (5 à 30 minutes en général).

---

## 1. Choisir le nom

**Les règles d'un bon nom :**
- **Court** : 6 à 15 lettres, idéalement 1 ou 2 mots.
- **Facile à dicter** : tu vas le donner à l'oral (« vibe puzzle point me »). Évite les tirets, les chiffres et les orthographes ambiguës (`ph`/`f`, lettres doublées).
- **Sans marque déposée** : pas de « lego », « ravensburger », « discord »… dans le nom.
- **Vérifie qu'il est libre** sur les réseaux (Instagram, TikTok, Discord) si tu veux un jour créer un compte du même nom.

**Quelques idées** (à vérifier sur nc.me) : `vibepuzzle.me`, `puzzlecoop.me`, `jouonspuzzle.me`, `piecesensemble.me`.

**Quelle extension ?**

| Extension | Où | 1ʳᵉ année | Renouvellement (environ) |
|---|---|---|---|
| **`.me`** | Namecheap (pack) | Gratuit | 20 €/an |
| `.app`, `.live`, `.dev`… | Name.com (pack) | Gratuit | 15 à 25 €/an selon l'extension |
| `.tech` | .TECH (pack) | Gratuit | 50 €/an |

Ce guide suit **Namecheap et le `.me`** : une interface simple, un prix de renouvellement correct et une redirection d'e-mail gratuite. **Avant de valider, regarde le prix de renouvellement affiché** : c'est lui que tu paieras à partir de la 2ᵉ année.

---

## 2. Obtenir le domaine gratuit (Namecheap, via le Student Pack)

1. Va sur https://education.github.com/pack et vérifie que ton pack est **actif**.
2. Cherche **Namecheap** dans la liste des offres, puis clique sur le lien de l'offre. Tu arrives sur **https://nc.me**.
3. Clique sur **« Sign in with GitHub »** (ou « Connect with GitHub ») et autorise Namecheap. C'est ce qui prouve que tu es étudiant.
4. Tape le nom voulu dans la barre de recherche. Si le `.me` est libre, il s'affiche à **0,00**. Clique sur **Add to cart** / **Get it**.
5. **Panier** : vérifie que le total est bien **0,00**. Décoche toutes les options payantes proposées (hébergement, e-mail pro payant, SSL, VPN…). Tu n'en as **pas besoin** : Caddy fournit le HTTPS gratuitement sur ta machine.
6. **Crée ton compte Namecheap** (ou connecte-toi s'il existe déjà).
7. **Coordonnées du propriétaire** : mets tes **vraies** informations (nom, adresse, téléphone, e-mail). C'est obligatoire pour tout nom de domaine. Elles ne sont **pas publiques** : Namecheap active gratuitement la protection « Withheld for Privacy ».
8. Valide la commande.

**⚠️ Très important, juste après** : tu vas recevoir un e-mail de vérification de l'adresse du propriétaire (expéditeur Namecheap ou « ICANN »). **Clique sur le lien sous 15 jours**, sinon le domaine est **suspendu** et le site devient inaccessible. Regarde aussi dans les spams.

---

## 3. Sécuriser le compte Namecheap (5 minutes)

Celui qui contrôle ce compte contrôle ton site. Ça vaut le coup :
1. **Double authentification** : en haut à droite, **Profile** → **Security** → **2-Factor Authentication**. Active-la avec une application (Google Authenticator, Microsoft Authenticator, 1Password…).
2. **Mot de passe unique**, rangé dans 1Password (offre du pack).
3. **Verrou du domaine** : **Domain List** → **Manage** à côté du domaine → vérifie que **Domain Lock** est sur **ON** (c'est le cas par défaut). Il empêche un transfert du domaine à ton insu.

---

## 4. Faire pointer le domaine vers ta machine Azure

**Prérequis** : la machine Azure est créée et tu connais son **adresse IP publique** (étape A3 de GUIDE-DEPLOIEMENT.md). Vérifie qu'elle est bien en **Statique**. Une IP dynamique peut changer et casser le site.

### 4.1 Les serveurs DNS
**Domain List** → **Manage** à côté du domaine → onglet **Domain** → partie **Nameservers** : laisse **« Namecheap BasicDNS »**.

### 4.2 Les enregistrements
Onglet **Advanced DNS** → partie **Host Records** :

1. **Supprime** les enregistrements par défaut, avec la corbeille à droite de chaque ligne. En général, il y a :
   - un `CNAME Record` `www` → `parkingpage.namecheap.com.`
   - un `URL Redirect Record` `@` → `http://www.ton-domaine.me/`
   - si tu as choisi « GitHub Pages » lors de la réservation sur nc.me : 4 `A Record` `@` vers `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, et un `CNAME Record` `www` vers `ton-pseudo.github.io.`
2. **Ajoute** ces deux lignes avec **Add new record** :

| Type | Host | Value | TTL |
|---|---|---|---|
| **A Record** | `@` | l'IP publique Azure, par ex. `20.19.123.45` | Automatic |
| **A Record** | `www` | la même IP | Automatic |

`@` signifie « le domaine lui-même » (`ton-domaine.me`), et `www` donne `www.ton-domaine.me`.

3. Clique sur la **coche verte** au bout de chaque ligne pour enregistrer.

À la fin, l'onglet doit contenir **uniquement** ces deux lignes A, plus éventuellement des lignes que tu as ajoutées toi-même, comme l'e-mail de la partie 5.

### 4.3 Vérifier que c'est pris en compte
Ça prend en général **5 à 30 minutes**, rarement plus de quelques heures. Depuis PowerShell :
```
nslookup ton-domaine.me
nslookup www.ton-domaine.me
```
Les deux doivent répondre avec l'IP de ta machine (ligne `Address:` sous « Réponse ne faisant pas autorité »).
Pour voir la propagation dans le monde entier : https://dnschecker.org (tape ton domaine, type `A`).

Si l'ancienne réponse s'affiche encore sur ton PC alors que dnschecker est bon, vide le cache DNS de Windows avec `ipconfig /flushdns`.

### 4.4 Brancher le HTTPS
Une fois que `nslookup` répond la bonne IP, fais l'étape **A10** de GUIDE-DEPLOIEMENT.md (Caddy). Le cadenas arrive tout seul en moins d'une minute.

**N'oublie pas** de remplacer `ton-domaine.me` par ton vrai domaine à **deux endroits** dans le code :
- `deploiement/Caddyfile` (3 fois), directement sur la machine (étape A10) ;
- `puzzle-frontend/.env.production`, sur ton PC, puis `git push` : c'est ce qui affiche le bel aperçu quand tu partages le lien sur Discord ou WhatsApp.

---

## 5. Une adresse e-mail pro, gratuite (recommandé)

Avec `contact@ton-domaine.me` affiché sur le site ou dans ta bio, ça fait tout de suite plus sérieux. Namecheap **redirige** gratuitement ces e-mails vers ton Gmail.

1. **Domain List** → **Manage** → onglet **Advanced DNS**.
2. Descends jusqu'à **Mail Settings** et choisis **Email Forwarding** dans la liste.
3. Retourne sur l'onglet **Domain** → partie **Redirect Email** → **Add forwarder** :
   - Alias : `contact`
   - Forward to : `goncalvesraph41@gmail.com`
   - Coche verte pour enregistrer.
4. Teste en écrivant à `contact@ton-domaine.me` depuis une **autre** adresse (Gmail n'affiche parfois pas un e-mail que tu t'envoies à toi-même). Compte quelques minutes à une heure la première fois.

**Limite** : tu **reçois** les e-mails envoyés à cette adresse, mais tes réponses partent depuis ton Gmail. Pour répondre aussi « depuis » `contact@…`, il faudrait une boîte mail payante (Namecheap Private Email, environ 1 €/mois). Pour un jeu entre amis, la redirection suffit largement.

Ajoute des alias si tu veux (`bonjour@`, `support@`) : la redirection gratuite en accepte plusieurs.

---

## 6. Le renouvellement (dans 11 mois)

- Namecheap t'enverra des rappels environ **30 jours** avant la date de fin. Elle est visible dans **Domain List**.
- **Auto-Renew** : dans **Domain List**, l'interrupteur **Auto-Renew** à côté du domaine.
  - **ON** si tu veux garder le nom : il faudra une carte enregistrée chez Namecheap, et le prix de renouvellement sera prélevé.
  - **OFF** si tu n'es pas sûr. Tu pourras toujours renouveler à la main avant la date de fin.
- **Si tu laisses expirer**, le site devient inaccessible à cette adresse. Le domaine reste récupérable environ 30 jours (avec des frais au-delà), puis il redevient libre pour n'importe qui.
- Pour changer de domaine plus tard (un `.app` chez Name.com, par exemple) : refais la partie 4 avec le nouveau, change le nom dans le Caddyfile et dans `.env.production`, et c'est tout. Les parties ne sont pas touchées.

---

## En cas de problème

| Symptôme | Cause probable | Solution |
|---|---|---|
| `nslookup` ne répond pas la bonne IP après 2 h | Une ancienne ligne (CNAME `www`, URL Redirect) est restée | Advanced DNS : il ne doit rester que les 2 lignes A |
| Le site affiche une page Namecheap « parking » | Même cause | Même solution, puis `ipconfig /flushdns` |
| Le cadenas n'apparaît pas | DNS pas encore à jour, ou port 80/443 fermé dans Azure | Voir l'étape A10 de GUIDE-DEPLOIEMENT.md |
| `www.ton-domaine.me` ne marche pas, mais le domaine sans `www` oui | Ligne A `www` manquante | Ajoute-la (partie 4.2) |
| E-mail « domain suspended » | E-mail de vérification non validé | Namecheap → **Domain List** → bannière « Verify contact information » → renvoyer l'e-mail |
| L'aperçu Discord/WhatsApp montre « ton-domaine.me » | `.env.production` pas modifié | Corrige-le, `git push`, puis mets en ligne (partie B du guide de déploiement) |
