# Paillasse

Cahier de labo électronique auto-hébergé, inspiré de Benchling, pensé d'abord pour un usage
individuel sur le serveur du labo. Cette version 0.1 couvre le socle et le cahier ; le registre
de constructions, l'inventaire et les outils (séquences, primers, calculs) viendront ensuite.

## Ce que fait cette version

- **Entrées de cahier** rangées par projet, avec date d'expérience, éditeur riche (titres, tableaux,
  listes de tâches, indices/exposants, surlignage, liens, code) et **sauvegarde automatique**.
- **Images et fichiers** : glisser-déposer ou coller une capture directement dans la page, ou joindre
  n'importe quel fichier (gels, spectres, `.mrc`, PDF…). Stockage adressé par SHA-256, sans doublon.
- **Retouche d'image non destructive** (double-clic sur une image) : recadrage, quarts de tour, miroirs,
  redressement fin, luminosité, contraste, inversion, niveaux de gris. L'image retouchée est un nouveau
  fichier ; l'original reste joint à l'entrée et les réglages exacts sont enregistrés avec la retouche.
  Largeur d'affichage réglable (25 à 100 %) depuis la barre qui apparaît sur l'image sélectionnée.
- **Versions figées** (bouton ou Ctrl+S) avec note facultative, consultables et restaurables.
- **Verrouillage** d'une entrée, irréversible, comme une page signée ; les suites passent par un
  **addendum** daté et relié à l'entrée d'origine.
- **Chaîne d'empreintes** : chaque version est scellée par un SHA-256 qui inclut la précédente et les
  empreintes des pièces jointes. Le panneau Intégrité recalcule toute la chaîne et relit les fichiers.
- **Tableau d'idées par projet** (onglet « Tableau ») : post-it punaisés sur du liège, avec texte et
  image, reliés par des fils comme un tableau d'enquêteur. Double-clic pour épingler, glisser pour déplacer,
  tirer sur la punaise pour relier deux idées, coller une capture ou déposer une image pour l'épingler.
  Chaque tableau peut être **partagé par lien** avec un mot de passe commun (modification ou lecture seule) :
  les invités n'ont pas de compte, signent leurs post-it d'un prénom et ne voient que ce tableau.
  Les changements des autres apparaissent en quelques secondes. Le tableau ne fait pas partie du cahier
  scellé : les post-it se modifient et se décrochent librement.
- **Registre de séquences et éditeur** (menu « Séquences ») : import par glisser-déposer de fichiers
  SnapGene `.dna`, GenBank et FASTA, ou collage ; identifiant unique (SEQ-0001…) ; recherche par nom,
  identifiant ou bout de séquence (les deux brins). Interface à la SnapGene, en français : ruban
  (vues carte et séquence, calques affichés, enzymes uniques ou doubles sur la carte, actions sur la
  sélection), panneau à onglets (annotations, amorces, enzymes, infos) où un clic sélectionne l'élément
  dans l'éditeur, barre d'état (taille, GC et Tm de la sélection), mode concentré sans le menu.
  Le moteur d'affichage et d'édition est Open Vector Editor (TeselaGen, MIT) :
  cartes circulaire et linéaire, vue séquence, édition des bases (les annotations se décalent seules),
  annotations, amorces, enzymes de restriction, ORF, traductions, recherche. Sauvegarde automatique,
  versions figées et chaînées par empreinte, consultation en lecture seule et restauration, export
  GenBank (lisible par SnapGene) et FASTA, fichier d'origine conservé. Une entrée du cahier peut
  référencer une séquence : elle pointe vers une version figée précise.
- **PCR virtuelle** (bouton « PCR virtuelle ») : sites d'hybridation des amorces sur les deux brins,
  mésappariements tolérés (mutagenèse dirigée), queues 5′, matrice circulaire et PCR inverse sur tout
  un plasmide. Le produit reprend les bases des amorces, les annotations de la matrice sont reportées
  (celles à cheval sont signalées), et il devient une séquence du registre avec sa recette : matrice
  et version figée, amorces, région, mésappariements. Avertissements pour les sites parasites, les
  produits multiples et les Tm éloignés ; températures d'hybridation conseillées selon le fabricant
  (NEB Q5 et Phusion, Takara PrimeSTAR, Toyobo KOD, Thermo).
- **Digestion virtuelle** (bouton « Digestion » d'une séquence) : 603 enzymes commerciales (REBASE),
  filtre des coupeurs uniques ou doubles, recherche par nom ou site, fragments avec leurs extrémités
  (5′, 3′ ou franches, bases sortantes), gel d'agarose virtuel avec quatre marqueurs au choix.
- **Dessin d'amorces** (bouton « Amorces », sur la région sélectionnée dans l'éditeur) avec primer3 :
  amorces collées aux bornes exactes de la région (clonage) ou paire choisie librement par primer3
  qui l'encadre (vérification, séquençage) ; Tm, GC, épingles et dimères ; ajout direct à la séquence.
  Analyse de n'importe quel oligo.
- **Modèles** de protocoles, créés à la main ou à partir d'une entrée.
- **Journal** chronologique, **recherche plein texte** en français (préfixes : « purif » trouve « purification »).
- **Impression / PDF** de n'importe quelle version, avec ses empreintes en pied de page.
- **Export complet** en un clic : zip avec `data.json`, chaque entrée en HTML autonome et tous les fichiers.

Côté base de données, les tables `entry_versions` et `attachments` sont en ajout seul et une entrée
verrouillée ne peut plus changer : des triggers PostgreSQL refusent toute modification, même en SQL direct.

## Prérequis

- Node.js 22 LTS (au minimum 20.19)
- PostgreSQL 13 ou plus récent (16 recommandé)
- primer3 pour le dessin d'amorces : `sudo apt install primer3` (fournit `primer3_core`)
- `rsync` et `pg_dump` pour les sauvegardes

## Installation sur le serveur

Les commandes supposent une installation dans `/opt/paillasse` avec un utilisateur système `paillasse`.
Adaptez si vous préférez votre propre compte.

```bash
# 1. Base de données
sudo -u postgres psql -c "CREATE ROLE paillasse LOGIN PASSWORD 'un-mot-de-passe-solide';"
sudo -u postgres psql -c "CREATE DATABASE paillasse OWNER paillasse;"

# 2. Code et dépendances
sudo useradd --system --home /opt/paillasse --shell /usr/sbin/nologin paillasse
sudo mkdir -p /opt/paillasse && sudo chown "$USER" /opt/paillasse
cp -r paillasse/* paillasse/.gitignore /opt/paillasse/
cd /opt/paillasse
npm run install:all
npm run build

# 3. Configuration
cp server/.env.example server/.env
openssl rand -hex 32          # à coller dans SESSION_SECRET
nano server/.env              # DATABASE_URL, SESSION_SECRET, DATA_DIR…

# 4. Compte utilisateur (applique aussi les migrations)
npm --prefix server run create-user -- louis "Louis"

# 5. Service systemd
sudo chown -R paillasse:paillasse /opt/paillasse
sudo cp deploy/paillasse.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now paillasse
journalctl -u paillasse -f    # « Paillasse en écoute sur http://0.0.0.0:3070 »
```

L'application est alors accessible sur `http://<serveur>:3070`. Derrière nginx en HTTPS, passer
`SECURE_COOKIES=true`. Les migrations de schéma s'appliquent automatiquement à chaque démarrage.

Mise à jour : remplacer le code, puis `npm run install:all && npm run build && sudo systemctl restart paillasse`.
Les nouvelles migrations de schéma s'appliquent toutes seules au redémarrage.

## Sauvegardes

À faire dès le premier jour, vers une machine **autre que le serveur** (NAS, disque réseau, autre hôte).
Il faut sauvegarder la base **et** le dossier `DATA_DIR` : l'un sans l'autre ne suffit pas.

```bash
# test manuel
BACKUP_DEST=/mnt/nas/paillasse ./deploy/backup.sh
BACKUP_DEST=louis@autre-machine:/srv/backup/paillasse ./deploy/backup.sh

# automatique, chaque nuit à 2 h 30 (éditer BACKUP_DEST dans le .service d'abord)
sudo cp deploy/paillasse-backup.service deploy/paillasse-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now paillasse-backup.timer
```

Restauration :

```bash
sudo -u postgres createdb -O paillasse paillasse
pg_restore --no-owner -d "postgres://paillasse:…@localhost/paillasse" db/paillasse_AAAA-MM-JJ_HHMM.dump
rsync -a blobs/ /opt/paillasse/data/blobs/
```

Après une restauration, le bouton « Vérifier l'intégrité » d'une entrée confirme que base et fichiers concordent.
L'export zip (barre latérale) est un complément lisible sans l'application, pas un remplacement des sauvegardes.

## Développement

```bash
npm run install:all
# terminal 1 : API sur :3070 (redémarre à chaque modification)
npm run dev:server
# terminal 2 : interface sur :5173 avec rechargement à chaud (proxy /api vers :3070)
npm run dev:client
```

## Séquences : fiabilité

Le lecteur SnapGene est propre à Paillasse : les bibliothèques JavaScript existantes perdaient les
amorces et les qualificatifs. Il reprend la logique de Biopython et `npm --prefix server test` vérifie,
sur des fichiers réels (`server/test/fixtures`), qu'il lit exactement la même chose que Biopython,
et que l'export GenBank se relit sans perte. Pour ajouter un fichier de référence : le copier dans
`server/test/fixtures/`, puis `pip install biopython && python3 server/test/make-goldens.py`.

La PCR virtuelle est vérifiée de deux façons. D'une part, le moteur d'hybridation doit retrouver
exactement les sites que SnapGene a lui-même enregistrés dans les fichiers `.dna` (ses paramètres
`minContinuousMatchLen`, `allowMismatch` et `minMeltingTemperature` sont d'ailleurs repris comme
réglages par défaut). D'autre part, les produits sont comparés à ceux de pydna sur toutes les
combinaisons d'amorces des fichiers de référence. S'y ajoutent deux constructions réelles du labo :
une mutagenèse ponctuelle et une délétion de gène par recombinaison homologue. Pour régénérer ces
références : `pip install biopython pydna`, puis `python3 server/test/make-goldens.py` et
`python3 server/test/make-pcr-goldens.py`.

Les coupures des 603 enzymes sont comparées à Bio.Restriction (Biopython) sur les mêmes fichiers :
toutes identiques, sites à cheval sur l'origine et enzymes de type IIS compris. La base d'enzymes se
régénère avec `python3 server/scripts/make-enzymes.py`. Les tests d'amorces vérifient que chaque
amorce proposée correspond bien à la séquence (brin et position), y compris autour de l'origine ;
ils sont ignorés si primer3 n'est pas installé.

Open Vector Editor tourne dans un cadre isolé (`client/public/sequence-editor.html`) car il embarque
sa propre version de React ; `npm install` dans `client/` le copie dans `client/public/vendor/ove`.
Paillasse stocke ses propres données (format `paillasse-seq/1`, voir `server/src/lib/seq/model.js`),
vérifiées par le serveur à chaque enregistrement : l'éditeur peut être remplacé sans migration.

## Structure

```
server/
  migrations/001_initial.sql   schéma, triggers d'ajout seul et de verrouillage
  src/index.js                 point d'entrée Express, sert aussi client/dist
  src/lib/versions.js          versions figées, chaîne d'empreintes, vérification
  src/lib/storage.js           stockage des fichiers par SHA-256
  src/lib/render.js            rendu HTML (impression, export)
  src/routes/                  auth, projets, entrées, fichiers, modèles, recherche, export
  scripts/create-user.js       créer un compte ou changer un mot de passe
client/
  src/pages/EntryPage.jsx      édition d'une entrée : autosave, versions, verrou
  src/components/NoteEditor.jsx  éditeur TipTap, glisser-déposer et collage de fichiers
deploy/                        service systemd, sauvegarde et son timer
```

## Principes à garder pour la suite

- Rien ne s'efface : on archive (`archived`), on ne supprime pas.
- Le contenu est du JSON ProseMirror ; le texte brut (`plain_text`) est recalculé côté serveur pour la recherche.
- Les empreintes sont calculées sur du JSON canonique (clés triées), car `jsonb` réordonne les clés.
- `created_by` est présent partout pour pouvoir passer au multi-utilisateur sans migration lourde.

## Limites connues de la v0.1

- Un seul type de contenu : pas encore de registre (plasmides, souches, protéines) ni d'inventaire.
- Pas de liens entre entrées autres que les addenda.
- Pas de gestion des droits : tout compte connecté voit tout (les invités d'un tableau partagé, eux, ne voient que ce tableau).
- Tableau partagé : si deux personnes modifient le même post-it au même moment, la dernière modification l'emporte.
- Les fichiers ne sont pas prévisualisés hors images (les PDF s'ouvrent dans le navigateur).
- Éditeur de séquences : interface d'OVE en anglais ; pas encore de clonage in silico ni d'alignement
  de lectures Sanger (prévus ensuite). Digestion : sensibilité à la méthylation (dam/dcm) non signalée.
- PCR virtuelle : pas de simulation des structures secondaires de la matrice ni des produits parasites
  dus à une hybridation partielle très en amont.
- Les TIFF sont joints comme fichiers, pas affichés dans la page (seul Safari sait les afficher).
