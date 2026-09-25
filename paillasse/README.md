# Paillasse

Cahier de labo électronique auto-hébergé, inspiré de Benchling, pensé d'abord pour un usage
individuel sur le serveur du labo. Cette version 0.1 couvre le socle, le cahier, le registre de séquences,
les calculs de paillasse et l'analyse de gels ; le registre de constructions et l'inventaire viendront ensuite.

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
- **Calculs de paillasse** (menu « Calculs », reprise de LabHelper) : pesée et molarité, dilution C₁V₁ = C₂V₂
  (unités molaires, massiques, % et X, avec contrôle des unités incompatibles), tampon ou solution à plusieurs
  composants (poudres et solutions mères, eau à compléter), 37 milieux de culture mis à l'échelle, master mix
  avec marge de pipetage et composants ajoutés tube par tube, ADN (masse ↔ moles, ng/µL ↔ nM), ligation
  (rapport insert / vecteur) et centrifugation (rpm ↔ × g). La longueur d'un ADN peut être reprise d'une
  séquence du registre. Virgule décimale acceptée partout, résultats en français avec l'unité la plus lisible.
- **Encart de calcul dans une entrée** : bouton « Calcul » de la barre d'outils, ou « Insérer dans une entrée »
  depuis la page Calculs. L'encart garde les valeurs saisies et le résultat tel qu'il a été affiché ; il est
  scellé avec la version, imprimé, exporté et trouvé par la recherche. Modifiable tant que l'entrée est un
  brouillon (bouton « Modifier » ou double-clic), en lecture seule une fois verrouillée (« Reprendre » rouvre
  le calcul avec les mêmes valeurs). Utilisable aussi dans les modèles : une recette de tampon qu'on
  ajuste au volume du jour.
- **Produits** (onglet de la page Calculs) : 153 produits avec masse molaire, formule, solution mère et
  concentration d'usage, proposés pendant la saisie (sans tenir compte des accents). On en ajoute, on les
  corrige, on les archive. Corriger une masse molaire ne change pas les calculs déjà enregistrés.
- **Analyse de gels** (menu « Gels », reprise et refonte de SDS-PAGE Analyzer) en trois modes :
  **protéines** (SDS-PAGE : Coomassie, argent, stain-free), **western blot** (chimiluminescence, fluorescence)
  et **ADN / ARN** (agarose : BET, SYBR, GelRed). Deux présentations, au choix dans l'en-tête de l'atelier :
  **Rapide** (tous les réglages sur un écran, pistes détectées et dernier marqueur appliqué dès l'ouverture,
  comme dans l'analyseur d'origine) et **Pas à pas**, guidé en cinq étapes :
  1. *Image* : TIFF 8 ou 16 bits (LZW, Deflate, PackBits, tuiles, flottants), PNG ou JPEG ; quarts de tour,
     miroirs, redressement fin, rognage ; contraste, gamma et palette qui ne touchent jamais aux mesures ;
     bandes sombres ou claires détectées seules ; densité optique pour un Coomassie en transmission.
  2. *Pistes* : détection automatique (pistes vides ou à une seule bande comprises) et repérage du marqueur,
     pistes inclinables, largeur commune, zone de migration, correction de courbure (« smile ») par des
     lignes d'égale migration.
  3. *Tailles* : 17 marqueurs du commerce (PageRuler, Precision Plus, NEB, GeneRuler, λ HindIII…) enregistrés
     dans la base et modifiables ; attribution automatique des bandes du marqueur, corrigeable au clic ;
     interpolation, régression linéaire ou polynôme sur log(taille), écart de chaque marqueur affiché.
  4. *Bandes* : sensibilité réglable, fond rolling ball, vallée à vallée ou minimum, bandes ajoutées ou
     retirées à la main ; tableau de toutes les pistes (bandes regroupées par taille, et nommables : GAPDH,
     BSA…) en aire, % de la piste (pureté), % d'une piste de référence, normalisation par un contrôle de
     charge, ou quantité (µg, ng) par une gamme étalon (pistes de BSA, ou masses des bandes du marqueur) ;
     rapport molaire des bandes d'une piste ; bandes saturées signalées ; tailles attendues calculées depuis
     le registre (masse de la protéine d'un CDS, fragments d'une PCR ou d'une digestion) et comparées aux
     bandes observées.
  5. *Figure* : le configurateur de l'encart. Panneaux (gel, profils, étalonnage, gamme) dans l'ordre voulu,
     en colonne, côte à côte ou en grille, tous à la même échelle ; préréglages Cahier, Article, Diaporama,
     Noir et blanc ; police, taille du texte, épaisseur des courbes, couleurs ou niveaux de gris, lettres
     A, B, C. Gel : taille, sans pistes / lignes / cadres, noms des pistes au-dessus ou au-dessous (droits,
     à 45° ou verticaux), échelle à gauche ou à droite, tailles ou noms des bandes, tailles attendues,
     flèches annotées, cadre. Profils : superposés ou empilés, normalisés (maximum ou aire totale), axe en
     tailles ou en migration, légende dedans, à droite ou au-dessus, largeur et hauteur, aires, quadrillage.
     Téléchargement en PNG, SVG et CSV.
  À droite de l'atelier, un **panneau d'analyse** redimensionnable : profil de la piste active (courbe lissée
  ou brute, avec ou sans fond, % de chaque bande, bornes d'intégration à régler à la souris), comparaison
  de pistes superposées ou empilées et normalisées, courbe d'étalonnage avec l'écart de chaque marqueur,
  tableau de toutes les bandes. Zoom à la molette, réticule synchronisé avec le gel, export PNG du graphique.
  Annuler / rétablir (Ctrl+Z / Ctrl+Y) partout ; l'analyse en cours sur la page Gels est gardée dans le
  navigateur et se reprend après un rechargement.
- **Figure de gel dans une entrée** : bouton « Figure de gel » de la barre d'outils, « Analyser le gel » sur une
  image déjà jointe, ou « Insérer dans une entrée » depuis la page Gels. L'image d'origine est jointe telle
  quelle, les panneaux de la figure deviennent des images jointes qui en dérivent, et l'analyse complète
  (réglages, pistes, étalonnage) est enregistrée dans l'encart. Le tableau et les notes restent du texte :
  scellés avec la version, imprimés, exportés et trouvés par la recherche. « Modifier » rouvre l'atelier tant
  que l'entrée est un brouillon ; une fois verrouillée, « Reprendre » rouvre l'analyse sur la page Gels.
- **Statistiques et graphiques** (menu « Statistiques », à la façon de GraphPad Prism) : cinq types de tableaux,
  saisis au clavier ou collés depuis Excel / LibreOffice (virgule décimale acceptée), avec réplicats :
  - *Colonnes* : statistiques descriptives (moyenne, écart-type, SEM, IC 95 %, médiane, quartiles, CV) et
    normalité (Shapiro-Wilk, D'Agostino-Pearson) ; test t non apparié (Student ou Welch), apparié, à un
    échantillon, Mann-Whitney (exact ou approché), Wilcoxon ; ANOVA à un facteur (ordinaire, Welch, mesures
    répétées avec correction de Geisser-Greenhouse), Kruskal-Wallis, Friedman ; comparaisons multiples de
    Tukey, Dunnett (contre un témoin), Šidák, Bonferroni, LSD de Fisher, Games-Howell, Dunn ; test de
    Brown-Forsythe et de Bartlett sur les variances. En mode « Automatique », l'analyse suit le nombre de
    colonnes remplies.
  - *XY* : régression linéaire (pente, ordonnée, IC, R², test de la pente), corrélation de Pearson et de
    Spearman, ajustement non linéaire (dose-réponse à 3 ou 4 paramètres avec EC50 et son IC, Michaelis-Menten,
    liaison avec pente de Hill, décroissance et association exponentielles, croissance, polynôme), avec
    passage automatique des concentrations en log ; **courbe étalon** : les X d'échantillons inconnus sont
    lus sur la droite ou la courbe ajustée.
  - *Groupé* : ANOVA à deux facteurs (sommes des carrés de type III, plans déséquilibrés compris,
    interaction), comparaisons dans chaque ligne ou chaque colonne (Šidák, Tukey, Bonferroni, Fisher).
  - *Contingence* : χ² (avec correction de Yates en 2 × 2), test exact de Fisher, risque relatif et rapport
    de cotes avec leurs IC.
  - *Survie* : Kaplan-Meier (erreur type de Greenwood), survies médianes, log-rank (Mantel-Cox),
    Gehan-Breslow-Wilcoxon, rapport des risques (hazard ratio).

  La feuille de résultats reprend la présentation de Prism (P « < 0,0001 », résumé en étoiles, IC 95 %,
  avertissements quand une hypothèse n'est pas tenue). Le **générateur de graphiques** se met à jour à chaque
  frappe : nuage de points, barres, boîtes à moustaches, violons, moyennes et barres d'erreur (écart-type,
  SEM, IC 95 %, étendue), barres groupées, points XY avec courbe ajustée et bande de confiance, axes
  logarithmiques, barres empilées, courbes de survie avec censures ; crochets de significativité placés
  sans chevauchement (étoiles ou valeurs de P, seuils classiques ou de Prism) ; titres, axes, couleurs
  par série, taille du texte et des points, préréglages Classique, Article, Diaporama et Niveaux de gris ;
  export PNG et SVG. Les tableaux de la page Statistiques s'enregistrent seuls (annuler / rétablir).
- **Graphique dans une entrée** : bouton « Graphique et statistiques » de la barre d'outils, ou « Insérer dans
  une entrée » depuis la page Statistiques. Le curseur dans un tableau de l'entrée ? Le bouton propose
  « Analyser le tableau où se trouve le curseur » et le graphique vient se placer juste dessous. L'image du
  graphique est jointe à l'entrée, les données sont copiées dans l'encart et les résultats restent du texte :
  scellés, imprimés, exportés et trouvés par la recherche. « Modifier » rouvre l'atelier tant que l'entrée est
  un brouillon ; une fois verrouillée, « Reprendre » copie les données dans un nouveau jeu de la page
  Statistiques.
- **Stockage des échantillons** (menu « Stockage ») : chaque tube a une adresse, comme une rue et un numéro.
  Le labo est dessiné : pièces, congélateurs −80 °C et −20 °C (armoire ou coffre), réfrigérateurs, cuves d'azote
  liquide, armoires, dont la porte s'ouvre au survol ; dedans, étagères, racks (ou tours de cuve) et boîtes,
  créés d'un coup à l'installation (« 5 étagères × 4 racks × 5 boîtes de 9 × 9 ») puis réorganisés par
  glisser-déposer. Une boîte s'affiche en grand, avec son **coin coupé = A1** et des bouchons de couleur (par type
  ou choisie) : un clic sur une case vide range un ou plusieurs tubes (les aliquots vont aux places libres
  suivantes, montrées avant de valider), un tube se glisse vers une autre case (sur un autre tube : échange),
  Ctrl+clic ou Maj+clic en prend plusieurs (sortir, remettre, recolorer, déplacer vers une autre boîte, jeter).
  Chaque tube a sa fiche : code (ECH-0001…), type, concentration, volume, dates de congélation et de péremption,
  décongélations comptées, séquence du registre, entrée d'origine, et tout son historique (rangé, déplacé, sorti,
  remis, jeté : qui et quand). Un tube **sorti** garde sa place, dessinée en pointillé. **« Où est… ? »** trouve un
  tube par son nom, son code ou son plasmide (une douchette qui tape le code puis Entrée marche aussi) : le chemin
  s'allume et le tube clignote dans sa boîte. La page d'accueil du stockage liste **ce qu'il faut surveiller** :
  tubes oubliés hors du froid depuis plus de 2 h, périmés ou bientôt périmés, décongelés 3 fois ou plus, boîtes
  presque pleines, et l'activité récente. On colle le plan d'une boîte depuis Excel (grille ou liste
  « position, nom »), et on imprime son plan pour le couvercle.
- **Cryo-EM : dewar › canister › puck › boîte › grille.** Le préréglage « Dewar cryo-EM (grilles) » crée d'un
  coup les canisters, numérotés 1, 2, 3…, et leurs pucks, numérotés à la suite de ceux du labo (« 6 canisters de
  5 pucks, n° 1 à 30 »). Le dewar se voit **du dessus** (les canisters en couronne, remplissage en anneau), un
  canister **en coupe** (niveau 1 en haut, un puck par niveau ; on glisse un puck vers un autre niveau, sur un
  autre puck ils s'échangent), un puck **du dessus** (ses cases numérotées, 12 par défaut ; une boîte se glisse
  vers une autre case). Quatre types de boîtes à grilles, avec un numéro ou une annotation (« 17 — apoF ») :
  **4 grilles non clippées** (1–4), **4 grilles clippées** (1–4), **4 clippées + 4 non clippées** (C1–C4 et N1–N4)
  et **12 grilles** (1–12). Chaque boîte est dessinée comme celles du commerce, vue de dessus, avec son cran, sa vis
  et ses numéros gravés : la boîte de 12 (type Molecular Dimensions) a 1 à 8 sur le pourtour et 9 à 12 autour de
  la vis ; la boîte hybride (type MiTeGen) a les clippées à gauche, dans des logements ronds à oreilles, et les
  non clippées à droite, dans des losanges ; couleurs d'aluminium anodisé (argent, or, rose, cuivre…). Chaque
  grille est dessinée dans son logement (cuivre ou or selon le support, anneau de clip, halo du criblage). Ranger des grilles, c'est noter leurs
  conditions une fois pour toutes les grilles de la série : échantillon, concentration, additif, support
  (Quantifoil, UltrAuFoil, C-flat… proposés), glow discharge, Vitrobot (blot, force, humidité, température),
  date, session ; les conditions de la série précédente sont reprises, et dans une boîte 4+4 on choisit clippées
  ou non. La fiche d'une grille note le **criblage** d'un clic (bonne glace, glace épaisse, glace fine,
  agrégats, pas de particules, cassée, collectée), la légende de la boîte filtre par criblage, « Au microscope »
  la sort en gardant sa place et chaque changement va dans son historique. Adresse complète :
  « Dewar Krios › Canister 1 › Puck 3 (niveau 1) › Boîte 17 (case 3) › grille C2 », imprimée, exportée
  (`stockage.csv`) et trouvée par « Où est… ? ». Deux modèles d'entrée (catégorie *Cryo-EM*) : **Vitrification de
  grilles** (l'emplacement « Ranger les grilles… » ouvre le choix de la boîte puis les conditions) et
  **Criblage et collecte au microscope** (« Citer les grilles… » note les grilles chargées avec leur adresse).
- **Tubes dans une entrée** : bouton « Tubes » de la barre d'outils, ou emplacement « Tubes à ranger » des modèles
  (purification, miniprep, PCR, expression, clonage). Les tubes rangés depuis une entrée gardent le lien vers elle ;
  l'encart note leur adresse du jour (aliquots regroupés : « ×8, B2 à B9 ») et son lien mène là où le tube est
  aujourd'hui. On peut aussi citer des tubes déjà rangés. Imprimé et trouvé par la recherche.
- **Modèles** (menu « Modèles ») : 20 modèles de base installés d'office, rangés par catégorie :
  *Général* (entrée classique, protocole, réunion, préparation d'un tampon), *Biologie moléculaire* (PCR, clonage,
  transformation, miniprep, gel d'agarose, RT-qPCR), *Protéines* (expression, purification His-tag / Ni-NTA,
  SDS-PAGE, western blot, dosage Bradford / BCA, ELISA), *Cryo-EM* (vitrification de grilles, criblage et
  collecte) et *Cellules* (passage, transfection). Chacun apporte ses
  sections, ses tableaux à compléter (plan de dépôt, anticorps, fractions, plan de plaque…), ses étapes à cocher
  pendant la manip, ses calculs déjà prêts (tampons de purification, TBST, master mix Q5 ou SYBR, milieu LB) et des
  **emplacements à remplir** : un clic ouvre le bon outil, déjà réglé (atelier Gels en mode western ou ADN,
  graphique avec la gamme de BSA ou la gamme ELISA prête à saisir, calcul de ligation, photo, séquence du registre),
  et le résultat prend la place de l'emplacement. Les emplacements laissés vides n'apparaissent ni une fois
  l'entrée verrouillée, ni à l'impression. La nouvelle entrée se choisit dans une galerie (recherche, catégories,
  double-clic pour créer). Les modèles de base se modifient comme les autres (un modèle adapté par le labo n'est
  plus jamais écrasé, « Revenir à la version d'origine » le rétablit), se dupliquent, se retirent et se remettent ;
  on en crée aussi à la main ou à partir d'une entrée, avec ses propres emplacements (bouton « Emplacement à
  remplir » de la barre d'outils du modèle).
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
# tests du serveur et des calculs
npm test
# après une modification des modèles de base (client/src/lib/templates/library.js)
npm --prefix client run templates
```

## Calculs : fiabilité

Les formules sont dans `client/src/lib/calc/` (sans React) et vérifiées par `npm --prefix client test`
sur des valeurs calculées à la main ou données par les fabricants (Eppendorf 5424 : 84 mm à 15 000 rpm
= 21 130 × g). Le serveur ne refait pas les calculs : il affiche le résumé enregistré dans l'entrée
(`server/src/lib/calc.js`), si bien qu'une page verrouillée montre toujours les valeurs du jour.

Corrections par rapport à LabHelper v3 :
- centrifugation : le rayon saisi en mm était utilisé dans la formule prévue pour des cm, d'où des × g
  dix fois trop élevés ;
- base de produits : glycine 75,07 g/mol (et non 75,03), SAM 398,44 (et non 399,44), orthovanadate 183,91 ;
  polymyxine B et G418 décrits comme les sels (sulfate, disulfate) auxquels correspondent leurs masses molaires ;
- les produits ajoutés et l'historique n'étaient jamais enregistrés sur le serveur du labo (LabHelper
  utilisait le stockage des artefacts Claude) : les produits sont maintenant dans PostgreSQL, et l'historique
  est remplacé par les encarts insérés dans le cahier.

## Gels : fiabilité

Le moteur est dans `client/src/lib/gel/` (sans React) et `npm --prefix client test` le vérifie sur des gels
synthétiques dont les quantités sont connues (proportions, normalisation d'un western, gamme de BSA,
tailles après correction de courbure, pistes presque vides), et sur 12 TIFF de référence produits par
Pillow (`client/test/make-tiff-fixtures.py` : 8, 16 et 32 bits, LZW, Deflate, PackBits, tuiles, prédicteur,
palette, MinIsWhite, RGB).

Temps de calcul (image d'imageur de 7,7 Mpx, 16 bits) : chaque piste n'est relue dans l'image que si elle
bouge, les réglages de détection ne relisent rien ; le redressement se prévisualise instantanément et se
calcule au relâchement du curseur ; le décodage TIFF et l'affichage travaillent par blocs. Une image de
cette taille s'ouvre en moins d'une seconde et les curseurs réagissent sans délai.

Les mesures se font toujours sur les intensités brutes de l'image préparée (orientée, redressée, rognée) :
contraste, gamma, palette et inversion ne servent qu'à l'affichage et à la figure. Le serveur ne refait pas
l'analyse : il vérifie que les images de l'encart sont des pièces jointes de l'entrée et affiche le tableau
enregistré (`server/src/lib/gel.js`).

Corrections par rapport à SDS-PAGE Analyzer :
- le contraste et la luminosité étaient appliqués aux données avant la quantification (une bande de 17 %
  mesurée à 5 % avec un contraste de 2) ;
- les TIFF compressés en LZW donnaient une image brouillée sans message d'erreur (taille de code changée
  une étape trop tard), et les TIFF Deflate étaient refusés ;
- avec la correction de courbure, les bandes du marqueur étaient repérées sur l'image brute et les
  échantillons sur l'image corrigée : les tailles n'étaient pas dans le même repère ;
- une seule piste à la fois, pas d'alerte de saturation, rien d'enregistré, exports en captures d'écran ;
  réglages de détection en pixels (ils dépendent maintenant de la hauteur du gel) ; rapport 1 : 1,5 jamais
  simplifié en 2 : 3.

## Statistiques : fiabilité

Le moteur est dans `client/src/lib/stats/` (sans React) et `npm --prefix client test` compare chaque résultat
à scipy et statsmodels (`client/test/fixtures/stats/goldens.json`, régénéré par
`pip install scipy statsmodels pandas && python3 client/test/make-stats-goldens.py`) : lois de Student, F,
χ², normale et leurs quantiles, étendue studentisée (Tukey) et loi de Dunnett calculées par intégration
numérique, Shapiro-Wilk, D'Agostino, tests t, Mann-Whitney et Wilcoxon exacts, ANOVA ordinaire, de Welch et
à mesures répétées (ε de Geisser-Greenhouse), Kruskal-Wallis, Friedman, Tukey et Dunnett avec leurs IC,
régressions linéaire et non linéaires, ANOVA à deux facteurs de type III (équilibrée ou non), contingence
et survie. Les écarts tolérés vont de 1e-12 (lois) à 1e-4 (ajustements itératifs).

Le calcul se fait dans le navigateur, sans envoyer les données ailleurs. Le serveur ne refait pas l'analyse :
il vérifie que l'image de l'encart est une pièce jointe de l'entrée et affiche le résumé enregistré
(`server/src/lib/stat.js`). Les jeux de données de la page Statistiques sont dans la table `datasets`
(migration `008_datasets.sql`) : révision vérifiée à chaque enregistrement (deux onglets ne s'écrasent pas),
archivage au lieu de suppression.

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
  migrations/011_cryoem.sql    cryo-EM : canister, puck, boîte à grilles (format, case, capacité), conditions des grilles
  src/index.js                 point d'entrée Express, sert aussi client/dist
  src/lib/versions.js          versions figées, chaîne d'empreintes, vérification
  src/lib/storage.js           stockage des fichiers par SHA-256
  src/lib/render.js            rendu HTML (impression, export)
  src/lib/calc.js              encart de calcul : vérification, rendu imprimable, texte de recherche
  src/lib/gel.js               encart de figure de gel : vérification, rendu imprimable, texte de recherche
  src/lib/stat.js              encart de graphique statistique : vérification, rendu imprimable, texte de recherche
  src/lib/templates.js         modèles de base : installation au démarrage, mise à jour s'ils sont intacts
  src/lib/inventory.js         stockage : qui contient quoi, positions A1, chemins, validation (copié côté client)
  src/lib/template-library.json  modèles de base (généré par npm --prefix client run templates)
  src/routes/                  auth, projets, entrées, fichiers, modèles, recherche, export, produits, marqueurs,
                               jeux de données statistiques, stockage (inventory)
  scripts/create-user.js       créer un compte ou changer un mot de passe
client/
  src/pages/EntryPage.jsx      édition d'une entrée : autosave, versions, verrou
  src/components/NoteEditor.jsx  éditeur TipTap, glisser-déposer et collage de fichiers
  src/lib/calc/                formules des calculs, unités, recettes de milieux (testés : npm test)
  src/components/calc/         formulaires, encart dans l'éditeur (LabCalcNode), produits
  src/pages/CalcPage.jsx       page Calculs
  src/lib/gel/                 analyse de gel : TIFF, image, profils, étalonnage, quantification, figure (testés)
  src/components/gel/          atelier (GelWorkbench : pas à pas ou rapide), panneau d'analyse, encart (GelFigureNode)
  src/pages/GelPage.jsx        page Gels (analyse libre, marqueurs)
  src/lib/stats/               lois, tests, régressions, ANOVA, contingence, survie, graphiques SVG (testés contre scipy)
  src/components/stats/        atelier (StatWorkbench : tableau, analyse, graphique), encart (StatFigureNode)
  src/pages/StatsPage.jsx      page Statistiques (nouveaux tableaux, jeux de données enregistrés)
  src/lib/templates/           modèles de base (library.js) et constructeurs de documents
  src/components/TemplateSlot.jsx  emplacement à remplir (figure de gel, graphique, calcul, photo, séquence)
  src/pages/TemplatesPage.jsx  galerie des modèles ; TemplateEditPage.jsx : édition
  src/lib/inventory.js         stockage côté interface (inventory-core.js = copie conforme du serveur, testée)
  src/components/storage/      labo dessiné, intérieur des appareils, boîte, fiche du tube, encart « Tubes » ;
                               cryo.jsx : dewar, canister, puck, boîte à grilles, dessin des grilles, criblage
  src/lib/gridbox.js           plan des boîtes à grilles (logements, cran, vis, numéros), testé
  src/pages/StoragePage.jsx    page Stockage
deploy/                        service systemd, sauvegarde et son timer
```

## Principes à garder pour la suite

- Rien ne s'efface : on archive (`archived`), on ne supprime pas.
- Le contenu est du JSON ProseMirror ; le texte brut (`plain_text`) est recalculé côté serveur pour la recherche.
- Les empreintes sont calculées sur du JSON canonique (clés triées), car `jsonb` réordonne les clés.
- `created_by` est présent partout pour pouvoir passer au multi-utilisateur sans migration lourde.

## Limites connues de la v0.1

- Registre limité aux séquences : pas encore de fiches de souches ou de protéines.
- Cryo-EM : le criblage et les sessions se notent à la main (pas de lien avec EPU, SerialEM ou cryoSPARC).
- Pas de liens entre entrées autres que les addenda.
- Pas de gestion des droits : tout compte connecté voit tout (les invités d'un tableau partagé, eux, ne voient que ce tableau).
- Tableau partagé : si deux personnes modifient le même post-it au même moment, la dernière modification l'emporte.
- Les fichiers ne sont pas prévisualisés hors images (les PDF s'ouvrent dans le navigateur).
- Éditeur de séquences : interface d'OVE en anglais ; pas encore de clonage in silico ni d'alignement
  de lectures Sanger (prévus ensuite). Digestion : sensibilité à la méthylation (dam/dcm) non signalée.
- PCR virtuelle : pas de simulation des structures secondaires de la matrice ni des produits parasites
  dus à une hybridation partielle très en amont.
- Les TIFF sont joints comme fichiers, pas affichés dans la page (seul Safari sait les afficher) ;
  l'atelier Gels, lui, les lit et en fait une figure.
- Gels : TIFF compressés en JPEG, BigTIFF et formats propriétaires des imageurs (`.scn`, `.1sc`) non lus
  (exporter en TIFF non compressé ou LZW) ; seule la première page d'un TIFF multi-pages est lue. Pas de
  dot blot ni de gel 2D. Tailles apparentes : un marqueur précoloré migre différemment selon le tampon
  (Tris-glycine, MES, MOPS) : c'est rappelé dans l'onglet Marqueurs, pas corrigé.
