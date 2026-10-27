# Paillasse

Cahier de labo électronique auto-hébergé, inspiré de Benchling, pensé d'abord pour un usage
individuel sur le serveur du labo. Cette version 0.1 couvre le socle, le cahier, le registre de séquences,
les calculs de paillasse et l'analyse de gels ; le registre de constructions et l'inventaire viendront ensuite.

## Ce que fait cette version

- **Entrées de cahier** rangées par projet, avec date d'expérience, éditeur riche (titres, tableaux,
  listes de tâches, indices/exposants, surlignage, liens, code) et **sauvegarde automatique**.
- **Projets privés ou partagés** : à la création d'un projet, on choisit *Privé* (vous seul le voyez) ou
  *Partagé* avec les comptes cochés. Chaque compte invité reçoit une **invitation** (en tête du Journal, et
  « 1 invitation » dans la barre latérale) et ne voit rien du projet tant qu'il ne l'a pas **acceptée** ; il peut
  aussi la refuser. Un membre lit et écrit dans le projet comme son propriétaire ; seul le propriétaire le renomme,
  l'archive, règle le lien public du tableau et gère le partage (bouton « Partager » : inviter d'autres comptes,
  annuler une invitation, réinviter après un refus, retirer un membre). Un membre peut quitter le projet
  (« Membres » › « Quitter le projet »). Tout ce qui est rangé dans un projet suit ses droits : entrées, versions,
  pièces jointes, impression, recherche, journal, tableau d'idées, séquences et jeux de données rattachés, export.
  Ce qui n'appartient à aucun projet reste commun au labo (registre de séquences sans projet, stockage, produits,
  marqueurs, modèles) ; au stockage, un tube relié à une entrée, une séquence ou un projet privés affiche « entrée
  d'un projet privé » au lieu du titre. Un projet privé répond « introuvable » aux autres comptes, comme s'il
  n'existait pas. **Seul l'administrateur voit tout**, depuis la page Maintenance (voir plus bas), en lecture
  seule dans les projets dont il n'est pas membre.
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
  et **ADN / ARN** (agarose : BET, SYBR, GelRed). Un seul écran, calme : à gauche six **modules** repliables
  (un seul ouvert à la fois, chacun résumé en une ligne quand il est replié, coché quand il est fait), au
  centre le gel ou l'aperçu de la figure, à droite le panneau d'analyse. Deux modes, au choix en haut des
  modules (et gardés dans le navigateur) : **Manuel**, par défaut, où chaque étape se lance à la demande
  (« Détecter » les pistes, choisir le marqueur), et **Tout auto**, où les pistes sont détectées et le dernier
  marqueur utilisé appliqué dès l'ouverture (il ne reste souvent qu'à nommer les pistes), puis redétectées
  après un redressement ou un quart de tour. Les réglages rares sont repliés sous leur module
  (« Contraste et palette », « Courbure »…), rien n'a été retiré :
  1. *Image* : TIFF 8 ou 16 bits (LZW, Deflate, PackBits, tuiles, flottants), PNG ou JPEG ; quarts de tour,
     miroirs, redressement fin, rognage ; contraste, gamma et palette qui ne touchent jamais aux mesures ;
     bandes sombres ou claires détectées seules ; densité optique pour un Coomassie en transmission.
     Redresser l'image recale les pistes déjà placées : tournées exactement avec l'image (en tout auto,
     redétectées si on en retrouve autant, noms et rôles gardés) ; le marqueur est réattribué et un seul
     Ctrl+Z annule le tout. Un quart de tour ou un miroir retire les pistes (redétectées en tout auto).
  2. *Pistes* : détection automatique (pistes vides ou à une seule bande comprises) et repérage du marqueur,
     pistes inclinables, largeur commune, zone de migration, correction de courbure (« smile ») par des
     lignes d'égale migration.
  3. *Tailles* : 17 marqueurs du commerce (PageRuler, Precision Plus, NEB, GeneRuler, λ HindIII…) enregistrés
     dans la base et modifiables ; attribution automatique des bandes du marqueur, corrigeable au clic ;
     interpolation, régression linéaire ou polynôme sur log(taille), écart de chaque marqueur affiché.
  4. *Bandes* : sensibilité réglable, fond rolling ball, vallée à vallée ou minimum, bandes ajoutées ou
     retirées à la main.
  5. *Quantification* : tableau de toutes les pistes (bandes regroupées par taille, et nommables : GAPDH,
     BSA…) en aire, % de la piste (pureté), % d'une piste de référence, normalisation par un contrôle de
     charge, ou quantité (µg, ng) par une gamme étalon (pistes de BSA, ou masses des bandes du marqueur) ;
     rapport molaire des bandes d'une piste ; bandes saturées signalées ; tailles attendues calculées depuis
     le registre (masse de la protéine d'un CDS, fragments d'une PCR ou d'une digestion) et comparées aux
     bandes observées.
  6. *Figure* (l'aperçu remplace le gel au centre) : panneaux (gel, profils, étalonnage, gamme) dans l'ordre
     voulu, en colonne, côte à côte ou en grille, tous à la même échelle ; préréglages Cahier, Article,
     Diaporama, Noir et blanc ; police, taille du texte, épaisseur des courbes, couleurs ou niveaux de gris,
     lettres A, B, C. Gel : taille, sans pistes / lignes / cadres, noms des pistes au-dessus ou au-dessous
     (droits, à 45° ou verticaux), échelle à gauche ou à droite, tailles ou noms des bandes (écartées, avec
     un trait de rappel, quand elles sont trop proches), tailles attendues, flèches annotées, cadre.
     Profils : superposés ou empilés, normalisés (maximum ou aire totale), axe en tailles ou en migration,
     légende dedans, à droite ou au-dessus, largeur et hauteur, aires, quadrillage.
  Sur le gel, des repères discrets : axes des pistes en pointillés neutres, seule la piste active en couleur,
  tailles affichées pour le marqueur et la piste active, sans chevauchement ; l'œil du zoom les masque pour
  voir le gel nu. Le zoom et la position sont gardés quand on replie ou élargit un panneau. Les messages
  (pistes trouvées, taille placée…) s'affichent sur une ligne au-dessus du gel au lieu de s'empiler.
  **Télécharger** (en-tête) : la **figure entière** en un seul fichier — titre, panneaux, tableau et notes —
  en PNG haute définition ou en SVG (graphiques vectoriels, texte modifiable dans Inkscape ou Illustrator),
  le gel seul (PNG), les profils (SVG) ou le tableau (CSV, s'ouvre tel quel dans Excel). Tout est produit
  dans le navigateur.
  À droite de l'atelier, un **panneau d'analyse** redimensionnable et repliable : profil de la piste active
  (courbe lissée ou brute, avec ou sans fond, % de chaque bande, bornes d'intégration à régler à la souris),
  comparaison de pistes superposées ou empilées et normalisées, courbe d'étalonnage avec l'écart de chaque
  marqueur, tableau de toutes les bandes. Zoom à la molette, réticule synchronisé avec le gel, export PNG du
  graphique. Annuler / rétablir (Ctrl+Z / Ctrl+Y) partout ; l'analyse en cours sur la page Gels est gardée
  dans le navigateur et se reprend après un rechargement.
- **Figure de gel dans une entrée** : bouton « Figure de gel » de la barre d'outils, « Analyser le gel » sur une
  image déjà jointe, ou « Insérer dans une entrée » depuis la page Gels. L'image d'origine est jointe telle
  quelle, les panneaux de la figure deviennent des images jointes qui en dérivent, et l'analyse complète
  (réglages, pistes, étalonnage) est enregistrée dans l'encart. Le tableau et les notes restent du texte :
  scellés avec la version, imprimés, exportés et trouvés par la recherche. « Modifier » rouvre l'atelier tant
  que l'entrée est un brouillon ; une fois verrouillée, « Reprendre » rouvre l'analyse sur la page Gels. Le
  bouton de téléchargement de l'encart assemble la figure entière (PNG ou SVG) à partir de ses panneaux,
  même dans une entrée verrouillée.
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
  liquide, armoires, dont la porte s'ouvre au survol ; dedans, étagères, racks (ou tours de cuve), **tiroirs** et
  boîtes, créés d'un coup à l'installation (−80 : « 5 étagères × 4 racks × 4 tiroirs × 4 boîtes de 9 × 9 » ;
  −20 : des tiroirs directement dans l'appareil ; chaque niveau est facultatif) puis réorganisés par
  glisser-déposer. Dans un rack, les tiroirs sont dessinés comme des façades empilées (poignée, boîtes en pastilles
  qui se remplissent de couleur avec les tubes, un clic ouvre la boîte) ; ouvrir un rack ou un tiroir montre ses
  tiroirs sortis avec leurs boîtes en grand. Pour un −80 saisi avant les tiroirs, « Ranger les boîtes des racks dans
  des tiroirs… » crée les tiroirs de chaque rack et y répartit ses boîtes dans l'ordre (n boîtes par tiroir) ; les
  tubes restent à leur place, seul leur chemin gagne le tiroir (… › Rack A › Tiroir 2 › Boîte 5 › C3). Une boîte s'affiche en grand, avec son **coin coupé = A1** et des bouchons de couleur (par type
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
- **Maintenance** (comptes administrateurs, menu « Maintenance ») : un administrateur arrive directement sur
  cette page en se connectant. Tout ce qu'il faut pour faire tourner le cahier, sans ligne de commande :
  - *Vue d'ensemble* : état des sauvegardes, de la base, du disque, des comptes et du serveur, avec les alertes
    (aucune sauvegarde, dernière réussie il y a plus de 36 h, disque presque plein, un seul administrateur…) ;
    **mode maintenance** : les autres comptes voient une page d'attente avec votre message, rien ne s'écrit.
  - *Comptes* : créer un compte (mot de passe provisoire affiché une seule fois, la personne choisit le sien à la
    première connexion), réinitialiser un mot de passe, déconnecter de tous ses appareils, rendre administrateur,
    désactiver ou réactiver, **supprimer** : le compte ne peut plus se connecter, son identifiant est libéré et son
    mot de passe effacé ; au choix ses entrées restent signées de son nom (ou « Compte supprimé » : anonymisé), ou
    elles partent avec lui (entrées, séquences, jeux de données, modèles, post-it ; ses tubes restent au stockage).
    Ses projets passent à leur plus ancien membre, ou à l'administrateur s'ils n'en ont pas. Un compte dont plus rien ne porte le nom s'efface
    entièrement. Il reste toujours au moins un administrateur actif. Chacun peut changer son mot de passe (icône
    clé, en bas à gauche).
  - *Sauvegardes* : destinations vers un dossier du serveur (NAS monté, disque externe) ou une autre machine par
    SSH (clé de Paillasse créée et affichée dans la page, à ajouter dans `authorized_keys`), chaque jour à l'heure
    choisie ou à la demande, nombre de dumps gardés ; « Tester » vérifie l'écriture et la place libre (et prévient
    si la destination est sur le même disque que le cahier) ; historique avec journal de chaque sauvegarde.
    Chaque sauvegarde : `pg_dump` relu aussitôt avec `pg_restore`, puis les fichiers joints nouveaux (jamais
    d'effacement côté destination) ; même organisation que `deploy/backup.sh` (`db/`, `blobs/`).
    **Restauration** depuis la liste des sauvegardes d'une destination : mode maintenance obligatoire, « RESTAURER »
    tapé en toutes lettres, copie de sécurité de la base actuelle d'abord, remplacement en une seule transaction
    (en cas d'erreur rien ne change), fichiers absents recopiés, schéma remis à niveau ; les destinations,
    l'historique des sauvegardes et le journal d'administration sont conservés. « Revenir à cette copie » annule
    une restauration.
  - *Données* : **tout le cahier, projets privés compris** (lui seul le voit) : ouvrir une entrée, un projet ou une
    séquence d'un projet dont il n'est pas membre l'affiche **en lecture seule** (bandeau « Lecture seule » ; rien ne
    s'y écrit, le serveur refuse). Colonne « Accès » des projets : propriétaire, membres, invitations en attente ;
    un clic permet de **confier le projet** à un membre qui a accepté (propriétaire parti, par exemple ; l'ancien
    reste membre) ou de retirer quelqu'un. Les invitations restent du ressort du propriétaire : personne n'entre
    dans un projet sans l'avoir accepté. **Export complet** (tous les projets) ; celui de la barre latérale
    (« Exporter mon cahier ») ne contient que les projets de la personne et ce qui est commun au labo.
    **Suppression définitive** d'entrées (filtrées par projet, auteur, état, date ; même verrouillées,
    avec leurs addenda, versions figées et pièces jointes), de projets entiers, de séquences, d'appareils du
    stockage avec leur contenu, de tubes retirés, de jeux de données, produits, marqueurs et modèles (un modèle de
    base est retiré, sinon il reviendrait à la mise à jour suivante). Chaque suppression montre d'abord ce qui part
    et ce qui reste, se confirme en tapant « SUPPRIMER », prend une copie de sécurité de la base (« Revenir à
    cette copie » l'annule) et s'inscrit dans le journal d'administration. Raccourci « Supprimer » (corbeille) sur
    la page d'une entrée et d'un projet, pour les administrateurs. Les fichiers joints restent sur le disque jusqu'à
    « Effacer les fichiers orphelins » (Fichiers) ; les copies de sécurité se suppriment aussi.
  - *Base de données* : version, taille, tables, migrations ; **vérification d'intégrité de tout le cahier**
    (empreintes et chaînes de chaque version figée, entrées et séquences, fichiers relus) ; optimisation
    (`VACUUM ANALYZE`) ; téléchargement d'une copie `.dump` ; **console SQL en lecture seule** (une instruction,
    transaction `READ ONLY`, 10 s, 500 lignes) avec des requêtes toutes prêtes.
  - *Fichiers* : place sur le disque, fichiers connus de la base et présents sur le disque, vérification rapide
    (manquants, orphelins) ou relecture complète (empreinte SHA-256 recalculée : un disque qui s'abîme se voit),
    fichiers temporaires d'envois interrompus, plus gros fichiers.
  - *Serveur et journal* : version, Node.js, mémoire, configuration (`.env`, mot de passe masqué), outils du
    système présents ou à installer, **journal d'administration** (qui a fait quoi, en ajout seul) et journal du
    serveur depuis le démarrage (erreurs en rouge).
- **Journal** chronologique, **recherche plein texte** en français (préfixes : « purif » trouve « purification »).
- **Impression / PDF** de n'importe quelle version, avec ses empreintes en pied de page.
- **Export Markdown** (`.md`), pour Obsidian, un dépôt Git ou n'importe quel éditeur de texte :
  - *une entrée* (bouton « Markdown » à côté d'« Imprimer », et dans la fenêtre d'une version figée) : « Fichier .md »
    (le texte seul, les images restent sur le serveur) ou « .md et ses fichiers » (zip : la note et un dossier
    `fichiers/` avec ses images et pièces jointes, liens relatifs : le dossier s'ouvre tel quel dans Obsidian).
    Une entrée verrouillée s'exporte depuis sa version de verrouillage, une version figée n'emporte que les fichiers
    qui existaient alors ;
  - *un projet* (bouton « Markdown » de la page du projet) : zip avec une note par entrée, les fichiers joints et une
    note d'index (tableau des entrées avec leur état et leur auteur) ;
  - *l'export complet* contient aussi un dossier `markdown/` (une note par entrée, liens vers `files/`).
  Chaque note commence par des propriétés YAML (titre, date, projet, auteur, statut, version, empreinte SHA-256,
  date d'export, `tags: [paillasse]`), puis le contenu en Markdown GFM (titres, listes, cases à cocher, tableaux,
  code, liens, images) ; les encarts deviennent des citations lisibles (calcul avec ses entrées et résultats, figure
  de gel et tableau des bandes, graphique et résultats statistiques, tubes et leur emplacement, séquence citée), la
  liste des pièces jointes avec leur taille et leur SHA-256, et l'état de la version. Souligné, surligné, indice et
  exposant restent en HTML en ligne (`<u>`, `<mark>`, `<sub>`, `<sup>`), compris par Obsidian et GitHub.
  C'est une copie de lecture : un `.md` ne se réimporte pas, et seule la version figée dans Paillasse fait foi.
- **Export** en un clic : zip avec `data.json`, chaque entrée en HTML autonome et tous les fichiers (vos projets et
  ceux où vous êtes membre ; l'administrateur exporte tout depuis Maintenance › Données).
- **Intégrations** (page « Intégrations ») : le cahier s'ouvre à une **IA locale** (Open WebUI, LM Studio,
  AnythingLLM, Claude Desktop…) par un **serveur MCP**, aux automatisations et aux scripts par une **API REST**
  décrite en OpenAPI, à un index de recherche par un **export de documents** et un **flux de changements**, et aux
  outils qui veulent être prévenus par des **webhooks** signés. Chaque outil a son **jeton d'accès** personnel
  (lecture seule, ou lecture et écriture), avec les droits de son compte et jamais ceux d'un administrateur.
  Voir « Intégrations » plus bas.

Côté base de données, les tables `entry_versions` et `attachments` sont en ajout seul et une entrée
verrouillée ne peut plus changer : des triggers PostgreSQL refusent toute modification, même en SQL direct.
Seule exception : la suppression définitive par un administrateur (page Maintenance), faite par le serveur dans
une transaction marquée (`SET LOCAL paillasse.purge = 'on'`), après copie de sécurité, et toujours d'un bloc
(une entrée avec toutes ses versions, jamais une version isolée) : ce qui reste garde des empreintes valides.
Le journal d'administration, lui, ne se modifie ni ne s'efface jamais.

Mise à jour depuis une version sans partage (migration `014_project_sharing.sql`) : chaque projet existant devient
privé à son créateur, et tout compte qui y a déjà écrit une entrée en devient membre (personne ne perd de vue ce
sur quoi il a travaillé). Un projet dont le créateur a été supprimé passe à son plus ancien membre. Pour ouvrir un
projet à d'autres ensuite : bouton « Partager » sur la page du projet.

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

# 4. Premier compte, administrateur (applique aussi les migrations) ; les autres se créent dans la page Maintenance
npm --prefix server run create-user -- louis "Louis" --admin

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

Le plus simple : page **Maintenance › Sauvegardes** (destination, test, horaire, historique, restauration). Il faut
`pg_dump`, `pg_restore` et `psql` sur le serveur (`sudo apt install postgresql-client`), plus `rsync` et `ssh`
pour une destination SSH. Les horaires sont ceux du serveur ; une sauvegarde manquée (serveur éteint) est faite
au redémarrage. Le script ci-dessous reste utile hors de l'application (même organisation, même clé SSH) ;
n'activez pas à la fois le timer systemd et une destination planifiée vers le même endroit.

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

Après une restauration, « Vérifier l'intégrité de tout le cahier » (Maintenance › Base de données) confirme que
base et fichiers concordent.

Plus aucun administrateur ne peut se connecter (mot de passe oublié, compte désactivé) ? Sur le serveur :
`npm --prefix server run create-user -- secours "Compte de secours" --admin` crée ou réactive un compte
administrateur (et remet son mot de passe).
L'export zip (barre latérale) est un complément lisible sans l'application, pas un remplacement des sauvegardes.

## Intégrations : IA locale, automatisations, autres outils

Paillasse n'est pas une boîte fermée : tout ce qu'on y fait à la main, un outil peut le lire et, si on l'y autorise,
l'écrire. Chaque fonction ouverte aux outils est décrite une seule fois (`server/src/integrations/ops/`) et servie à
la fois par l'API REST, sa description OpenAPI, le serveur MCP et `llms.txt` : 44 opérations aujourd'hui (chercher
dans tout le cahier ; lire une entrée en Markdown, ses versions, son intégrité, ses fichiers ; créer une entrée,
la compléter en Markdown, joindre un fichier, figer une version, verrouiller, ajouter un addendum ; séquences en
GenBank ou FASTA, sites de restriction, digestion et PCR virtuelles, analyse d'amorces ; stockage : où est ce tube,
ranger, déplacer, sortir, remettre, jeter ; jeux de données statistiques ; modèles, produits, marqueurs ; activité
récente).

**Jetons d'accès.** Chacun crée les siens dans la page **Intégrations** (un par outil) : nom, droits (*lecture
seule* ou *lecture et écriture*), validité (30 jours à sans limite). Le jeton (`pai_…`) n'est montré qu'une fois ;
Paillasse n'en garde que l'empreinte SHA-256, et affiche sa dernière utilisation. Il s'envoie dans l'en-tête
`Authorization: Bearer pai_…`. Un jeton agit avec les droits de son compte sur les projets (un projet privé reste
introuvable pour les autres), **jamais avec les droits d'administration**, ne gère pas les jetons ni le mot de passe,
et ne passe pas en mode maintenance. Un jeton en lecture seule ne modifie rien ; une entrée ne se verrouille que si
l'appel le confirme explicitement (`confirm: true`). Limite : 300 requêtes d'affilée, puis 20 par seconde (réponse
429 et `Retry-After` au-delà). L'administrateur voit tous les jetons et webhooks du labo, peut en révoquer, et peut
couper d'un clic tout l'accès par jeton ou les seuls webhooks (**Maintenance › Intégrations**) ; tout est noté au
journal d'administration.

**Serveur MCP** (`https://<serveur>/mcp`) : le protocole des IA (Model Context Protocol), en HTTP « streamable »
sans état, avec le jeton en Bearer. L'IA y trouve les outils, des ressources lisibles par adresse
(`paillasse://entries/{id}`, `…/sequences/SEQ-0001`, `…/samples/ECH-0001`, projets, modèles, jeux de données) et des
consignes prêtes à l'emploi (résumer une entrée, bilan d'un projet sur une période, préparer une manip, retrouver un
échantillon, rédiger la conclusion d'une entrée). Pour un petit modèle local, `…/mcp?profile=assistant` ne propose
que les outils choisis pour une IA de labo (voir *Assistant du labo* plus bas) ; `?tools=search,get_entry` une liste
choisie. La page Intégrations donne la configuration
prête à copier pour Open WebUI, LM Studio, AnythingLLM et n8n. Pour les clients qui ne lancent que des programmes
locaux (Claude Desktop, Jan, Cline…), le **pont** `server/scripts/paillasse-mcp.mjs` (aussi téléchargeable depuis la
page, un seul fichier, Node.js 18 ou plus, sans dépendance) relaie l'entrée standard vers `/mcp` :

```json
{ "mcpServers": { "paillasse": { "command": "node", "args": ["/chemin/vers/paillasse-mcp.mjs"],
  "env": { "PAILLASSE_URL": "https://paillasse.labo.fr", "PAILLASSE_TOKEN": "pai_…" } } } }
```

`PAILLASSE_URL=… PAILLASSE_TOKEN=… node paillasse-mcp.mjs --check` vérifie l'adresse et le jeton.

**API REST** (`https://<serveur>/api/v1`) : une route par opération, paramètres en JSON (ou dans l'adresse pour une
lecture), erreurs en français qui disent quoi corriger (un paramètre inconnu donne la liste des paramètres
possibles). `GET /api/v1` liste les opérations ; `/api/v1/openapi.json` (public, sans données) les décrit en
OpenAPI 3.1, à donner à Open WebUI (serveur d'outils OpenAPI), n8n, Postman ou un générateur de client ;
`POST /api/v1/tools/{nom}` appelle n'importe quelle opération par son nom. `/llms.txt` résume tout cela pour une IA
qui doit écrire un script ou un workflow. Les appels depuis une autre origine sont permis (CORS), avec un jeton
seulement : le cookie de session n'y sert jamais.

```bash
curl -H "Authorization: Bearer pai_…" "https://paillasse.labo.fr/api/v1/search?query=DegU"
curl -X POST "https://paillasse.labo.fr/api/v1/entries" -H "Authorization: Bearer pai_…" \
  -H "Content-Type: application/json" \
  -d '{"project_id": "…", "title": "Mesures du jour", "content_markdown": "## Résultats\n\n| A | 0,52 |\n|---|---|"}'
```

Le Markdown reçu est converti en contenu d'éditeur (titres, gras, italique, listes, cases à cocher, tableaux,
citations, code, liens, images jointes) ; une entrée ouverte dans le navigateur se met à jour d'elle-même quand un
outil la complète (et passe en lecture seule s'il la verrouille), tant qu'on n'est pas en train d'y écrire.

**Synchronisation.** Pour qu'une IA locale cherche dans tout le cahier (RAG) : `GET /api/v1/documents` exporte tout
ce que le compte voit, une ligne JSON par objet (entrée en Markdown, séquence, tube, jeu de données, modèle, projet,
avec ses métadonnées et son adresse), `?since=` seulement ce qui a changé depuis une date. L'en-tête
`X-Paillasse-Cursor` donne le curseur à reprendre ensuite dans `GET /api/v1/changes?cursor=…` : les objets modifiés
(ou supprimés) depuis, regroupés par objet. Les événements sont gardés 90 jours ; leurs numéros suivent l'ordre de
validation des transactions, si bien qu'un curseur n'en saute jamais.

**Webhooks.** Paillasse prévient un outil (n8n, Node-RED, un script, le serveur de l'IA…) à chaque événement choisi
(entrée créée, modifiée, figée, verrouillée, déplacée ; fichier joint ; séquence, tube, contenant, jeu de données,
modèle, produit ou marqueur ajouté, modifié, archivé ou supprimé ; filtre par projet possible) : un POST JSON signé au
format [Standard Webhooks](https://www.standardwebhooks.com) (en-têtes `webhook-id`, `webhook-timestamp`,
`webhook-signature`, secret `whsec_…`), avec un en-tête de plus au besoin (clé d'API de l'outil). Les modifications
d'une entrée en cours de saisie sont regroupées (un envoi après 30 s sans changement). Un échec est retenté cinq
fois (30 s, 2 min, 10 min, 1 h, 6 h) ; un webhook qui répond 410, ou qui échoue 20 envois d'affilée, est mis en
pause. Le journal des envois (page Intégrations) montre chaque tentative et permet de renvoyer. Un événement ne
contient qu'un type, un titre, un code et des adresses : l'outil relit le détail avec son jeton, donc avec ses droits.

Derrière nginx : rien de particulier pour `/mcp` (réponses JSON, pas de flux), mais `client_max_body_size 40m;` si
des outils joignent des fichiers par l'API (20 Mo de fichier en base64 font 27 Mo de JSON).

### Assistant du labo : l'IA en chef d'orchestre

Un assistant IA du labo (Open WebUI ou compatible, sur un modèle local) peut se servir de Paillasse **au nom de la
personne qui lui parle**, avec les droits de son compte, sans que chacun ait à créer un jeton. Paillasse devient l'un
de ses serveurs d'outils, à côté des autres (base de connaissance, bibliothèque d'articles, terminal…) : l'assistant
orchestre, il cherche dans le cahier, croise avec ses autres sources, prépare une entrée ou range des tubes, et
Paillasse garde la main sur ce qui s'écrit (droits, aperçu, confirmation, journal).

**Qui parle ?** L'assistant le dit à Paillasse de l'une de ces deux façons, ou des deux. Rien d'autre n'est cru,
en particulier pas les en-têtes non signés `X-OpenWebUI-User-*`.

1. *En-tête signé* : Open WebUI lancé avec `ENABLE_FORWARD_USER_INFO_HEADERS=true` et
   `FORWARD_USER_INFO_HEADER_JWT_SECRET=<secret>` joint à chaque appel d'outil un jeton HS256 (en-tête
   `X-OpenWebUI-User-Jwt` : identifiant, adresse, nom et rôle de la personne, valable 5 minutes), que Paillasse
   vérifie avec le même secret (`ASSISTANT_JWT_SECRET`). C'est le mode conseillé : les en-têtes transmis portent aussi
   l'identifiant du message en cours, qui protège les écritures (plus bas). Si la version d'Open WebUI ne connaît
   pas cette variable : la session.
2. *Session* : le serveur d'outils est déclaré avec l'authentification « Session » ; Open WebUI transmet la session
   de la personne (`Authorization: Bearer …`), que Paillasse fait confirmer par l'assistant
   (`ASSISTANT_IDENTITY_URL`, pour Open WebUI `http://<assistant>/api/v1/auths/`). Paillasse n'envoie cette session
   qu'à cette adresse et n'en garde qu'une empreinte, une minute.

Un compte « en attente » chez l'assistant est refusé ; le mode maintenance et l'interrupteur des intégrations
s'appliquent comme aux jetons.

**Relier son compte, une fois.** Page **Intégrations › Assistant** : « Obtenir un code de liaison » donne un code de
8 caractères (valable 10 minutes, une fois), à dire à l'assistant (« Relie mon compte Paillasse avec le code
7KQ2-M9XD ») ; la page voit la liaison d'elle-même. La liaison associe l'identifiant du compte chez l'assistant (pas
son adresse : rien n'est deviné) au compte Paillasse ; 10 essais au plus en 10 minutes. Chacun choisit ce que
l'assistant peut faire en son nom, *lecture seule* (par défaut) ou *lecture et écriture*, et peut délier à tout
moment ; jamais de droits d'administration. L'administrateur voit les comptes reliés, peut en délier et peut couper
l'accès par l'assistant d'un clic (**Maintenance › Intégrations**) ; liaisons et changements de droits vont au
journal d'administration.

**Ce que voit le modèle.** `https://<serveur>/api/v1/assistant` (description publique : `…/assistant/openapi.json`)
et, en MCP, `…/mcp?profile=assistant` : 26 outils choisis pour un petit modèle (chercher, activité récente, projets,
entrées, protocoles, séquences en lecture, stockage, jeux de données ; créer une entrée, la compléter, ajouter un
addendum ; ranger, déplacer, sortir, remettre ou jeter un tube, l'annoter ; relier son compte). Leurs noms sont préfixés
(`paillasse_search`…) pour ne pas se mêler aux outils des autres serveurs ; chaque description dit en français ce
que fait l'outil, quand l'employer et ce qu'il rend, avec des exemples de paramètres. Réponses courtes : 10 éléments
par défaut, réponse coupée au-delà de 6 000 caractères avec une note `truncated` qui dit comment obtenir la suite,
longue entrée lue en parties (`part`). Les descriptions d'outils pèsent environ 7 000 jetons, que le modèle porte à
chaque message (chiffre exact dans Maintenance › Intégrations) : pour une petite fenêtre de contexte,
`ASSISTANT_TOOLS` réduit la liste (la lecture seule pour commencer, par exemple), tout comme le filtre de fonctions
d'Open WebUI.

**Écritures protégées par le code, pas par une consigne.** Toute écriture de l'assistant se fait en deux temps. Le
premier appel est un essai à sec : l'opération va jusqu'au bout dans une transaction, puis tout est annulé, et la
réponse montre un aperçu et un code de confirmation. L'écriture n'a lieu qu'au second appel, avec ce code, qui ne
vaut que pour cette personne, cette opération et exactement ces paramètres (15 minutes, une fois). Quand Open WebUI
transmet ses en-têtes (`ENABLE_FORWARD_USER_INFO_HEADERS=true`), chaque appel porte l'identifiant du message en cours
(`X-OpenWebUI-Message-Id`) : le code n'est alors accepté que dans un message suivant, donc après une réponse de la
personne, et le modèle ne peut pas enchaîner seul l'aperçu et l'enregistrement. Sans cet en-tête, le code garantit
que ce qui s'écrit est exactement ce qui a été montré, pas qu'une personne a dit oui. Le verrouillage d'une entrée,
irréversible, est refusé à l'assistant par tous les chemins (API complète et MCP compris) ; son profil ne contient
ni suppression, ni pièce jointe, ni création de séquence. Un texte qui contient ce qui
ressemble à une séquence (20 nucléotides ou 30 acides aminés d'affilée, ou des blocs comme dans GenBank) est refusé :
une séquence entre dans le registre par un fichier, NCBI ou UniProt, jamais recopiée par un modèle, et l'assistant
la cite par son code SEQ-…. Ce qui est écrit est signé du nom de la personne (versions, journal, événements). Les
erreurs disent quoi faire (compte pas relié : comment le relier ; lecture seule : où ouvrir l'écriture). Pour les
scripts, toute opération d'écriture de l'API complète accepte aussi `dry_run: true`.

**Consigne.** Sans une branche dans son prompt système, un petit modèle répond de mémoire au lieu d'appeler les
outils : `…/api/v1/assistant/prompt` donne cette branche en français (aussi dans Maintenance › Intégrations, à
copier), à adapter avec l'administrateur de l'assistant.

**Brancher l'assistant.**

1. Dans `server/.env` : `ASSISTANT_NAME`, `ASSISTANT_URL`, puis `ASSISTANT_JWT_SECRET` et/ou
   `ASSISTANT_IDENTITY_URL` (détail dans `.env.example`), et redémarrer. Un secret se génère avec
   `openssl rand -hex 32` et ne se versionne jamais.
2. Chez l'assistant (par son administrateur) : un serveur d'outils de type OpenAPI, adresse
   `http://<Paillasse vu depuis l'assistant>/api/v1/assistant`, chemin `openapi.json`, authentification « Session »
   (ou « Aucune » si seul l'en-tête signé sert), ouvert aux comptes concernés et ajouté au modèle ; plus la branche
   de consigne. Maintenance › Intégrations récapitule ces valeurs.
3. Vérifier : bouton « Vérifier la liaison » (Paillasse joint l'assistant), puis avec un compte **non
   administrateur** chez l'assistant, car un outil sans droit d'accès y disparaît en silence alors qu'il marche pour
   l'administrateur : « qui suis-je pour Paillasse ? », liaison par code, une recherche, puis une écriture (aperçu,
   accord, enregistrement).

Réseau : Paillasse doit être joignable depuis l'assistant, souvent dans un conteneur (sur la même machine, par la
passerelle Docker, en général `http://172.17.0.1:3070`), et doit joindre `ASSISTANT_IDENTITY_URL`. Pour
l'assistant, Paillasse n'appelle que cette adresse (webhooks et sauvegardes ne vont que là où on les envoie) : rien
ne sort du réseau du labo sans qu'on l'ait réglé.

Base de connaissance : pour que l'assistant retrouve aussi le cahier par sa recherche documentaire, un petit service
de synchronisation lit `/api/v1/documents` puis `/api/v1/changes` (réveillé au besoin par un webhook) et dépose par
l'API de la base, jamais en écrivant dans ses fichiers. Son jeton appartient à un compte dédié, membre des seuls
projets à verser : tout ce que ce compte voit devient lisible par quiconque interroge la base.

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
tailles après correction de courbure, pistes presque vides), vérifie l'assemblage de la figure entière
(`compose.js` : dispositions, tableau, notes, texte échappé) et l'écartement des étiquettes, et sur 12 TIFF de référence produits par
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

Corrections de l'atelier lui-même (refonte en modules) : les étiquettes du graphique d'une piste se
chevauchaient d'une hauteur à l'autre (seules celles d'une même hauteur étaient comparées) ; sur la figure,
les tailles des bandes et les flèches se superposaient (« DegU-His6 » sur « 29 kDa ») ; la vue du gel se
réajustait (zoom perdu) à chaque ouverture ou redimensionnement d'un panneau ; les notifications
s'empilaient ; le gel de la figure était rendu à la résolution d'écran (flou à l'impression : il est
maintenant dessiné deux fois plus fin, comme les graphiques) ; redresser l'image après la détection
laissait les pistes calées sur l'image penchée.

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
  migrations/012_admin.sql     administrateurs, comptes désactivés, sessions révocables, journal d'administration,
                               réglages (mode maintenance), destinations et historique des sauvegardes
  migrations/013_admin_purge.sql  suppression administrateur (garde-fous levés par SET LOCAL seulement),
                               journal inviolable, comptes supprimés
  migrations/016_integrations.sql  jetons d'accès, événements (et suppressions notées par la base), webhooks
                               et journal de leurs envois
  migrations/017_assistant.sql  comptes reliés à l'assistant du labo (identité chez lui, droits, code de liaison)
  src/index.js                 point d'entrée Express, sert aussi client/dist
  src/lib/versions.js          versions figées, chaîne d'empreintes, vérification
  src/lib/storage.js           stockage des fichiers par SHA-256
  src/lib/render.js            rendu HTML (impression, export)
  src/lib/markdown.js          rendu Markdown GFM (propriétés YAML, encarts) ; markdownExport.js : .md seul ou zip
  src/lib/calc.js              encart de calcul : vérification, rendu imprimable, texte de recherche
  src/lib/gel.js               encart de figure de gel : vérification, rendu imprimable, texte de recherche
  src/lib/stat.js              encart de graphique statistique : vérification, rendu imprimable, texte de recherche
  src/lib/templates.js         modèles de base : installation au démarrage, mise à jour s'ils sont intacts
  src/lib/inventory.js         stockage : qui contient quoi, positions A1, chemins, validation (copié côté client)
  src/lib/backup.js            sauvegardes (dossier ou SSH), planification, restauration atomique, clé SSH
  src/lib/jobs.js              tâches longues suivies par la page Maintenance ; settings.js, serverLog.js
  src/lib/access.js            qui voit quoi : projets visibles, rôle (propriétaire, membre, admin en lecture seule)
  src/lib/purge.js             suppression définitive : aperçu (ce qui part, ce qui reste), entrées, projets,
                               séquences, stockage, comptes
  src/routes/admin.js          page Maintenance : comptes, sauvegardes, base, fichiers, serveur (administrateurs)
  src/lib/markdownIn.js        Markdown (CommonMark/GFM) → contenu de l'éditeur, pour ce qu'écrivent les outils
  src/integrations/            ouverture aux autres outils : registry.js (registre des opérations) et ops/ (les
                               opérations, par domaine), schema.js (validation des paramètres), rest.js (API v1),
                               openapi.js, mcp.js (serveur MCP), docs.js (llms.txt), tokens.js (jetons, débit),
                               events.js (événements, ordre de validation), webhooks.js (envois signés, relances),
                               documents.js (export pour un index), routes.js (page Intégrations), admin.js,
                               assistant.js (assistant du labo : identité déléguée, liaison, écriture en deux
                               temps, réponses courtes, consigne)
  src/lib/template-library.json  modèles de base (généré par npm --prefix client run templates)
  src/routes/                  auth, projets, entrées, fichiers, modèles, recherche, export, produits, marqueurs,
                               jeux de données statistiques, stockage (inventory)
  scripts/create-user.js       créer un compte ou changer un mot de passe
  scripts/paillasse-mcp.mjs    pont MCP stdio → /mcp, pour les clients MCP qui ne lancent que des programmes locaux
client/
  src/pages/EntryPage.jsx      édition d'une entrée : autosave, versions, verrou
  src/components/NoteEditor.jsx  éditeur TipTap, glisser-déposer et collage de fichiers
  src/lib/calc/                formules des calculs, unités, recettes de milieux (testés : npm test)
  src/components/calc/         formulaires, encart dans l'éditeur (LabCalcNode), produits
  src/pages/CalcPage.jsx       page Calculs
  src/lib/gel/                 analyse de gel : TIFF, image, profils, étalonnage, quantification, figure (testés)
  src/components/gel/          atelier (GelWorkbench, modules/ : un fichier par module), panneau d'analyse, encart (GelFigureNode)
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
  src/components/Sharing.jsx   partage : choix des comptes, dialogue « Partager », invitations reçues
  src/pages/MaintenancePage.jsx  page Maintenance ; src/components/admin/ : un onglet par fichier
  src/pages/IntegrationsPage.jsx  page Intégrations ; src/components/integrations/ : assistant, jetons, outils,
                               webhooks, référence
deploy/                        service systemd, sauvegarde et son timer
```

## Principes à garder pour la suite

- Au quotidien rien ne s'efface : on archive (`archived`). La suppression définitive est réservée aux
  administrateurs (page Maintenance : aperçu, confirmation, copie de sécurité, journal) ; elle retire toujours
  un tout (entrée avec ses versions, projet, compte), pour que le reste du cahier reste vérifiable.
- Le contenu est du JSON ProseMirror ; le texte brut (`plain_text`) est recalculé côté serveur pour la recherche.
- Les empreintes sont calculées sur du JSON canonique (clés triées), car `jsonb` réordonne les clés.
- `created_by` est présent partout pour pouvoir passer au multi-utilisateur sans migration lourde.
- Toute route qui lit ou écrit quelque chose de rangé dans un projet passe par `server/src/lib/access.js`
  (`assertProject`, `assertEntry`… pour un élément, `visibleProjects` pour une liste) : un projet invisible répond 404,
  une écriture sans être membre 403.
- Une nouvelle fonction utile à un outil extérieur s'ajoute au registre (`server/src/integrations/ops/`, logique
  partagée avec la route de l'interface) : elle apparaît d'un coup dans l'API REST, l'OpenAPI, le serveur MCP et
  `llms.txt`. Un geste qui change le cahier note un événement (`emit`, dans sa transaction s'il en a une).
- Une IA n'écrit dans le cahier que sous le contrôle du code, jamais d'une consigne : écriture en deux temps pour
  l'assistant (aperçu par essai à sec, puis code de confirmation lié aux paramètres), aucune séquence recopiée par
  un modèle, jamais de droits d'administration. Un outil ne rejoint la sélection de l'assistant
  (`ASSISTANT_DEFAULT_TOOLS`, `server/src/integrations/assistant.js`) que si sa réponse reste courte et que sa
  description dit, en français, quand l'employer et ce qu'il rend.

## Limites connues de la v0.1

- Registre limité aux séquences : pas encore de fiches de souches ou de protéines.
- Cryo-EM : le criblage et les sessions se notent à la main (pas de lien avec EPU, SerialEM ou cryoSPARC).
- Pas de liens entre entrées autres que les addenda.
- Partage par projet seulement, sans rôles plus fins : un membre lit et écrit tout le projet (pas de membre en
  lecture seule, pas d'entrée privée dans un projet partagé). Le stockage, le registre des séquences sans projet,
  les produits, les marqueurs et les modèles sont communs à tout le labo.
- Pas de notification par courriel : une invitation apparaît à la prochaine ouverture du cahier (ou dans les
  deux minutes).
- La restauration depuis la page remplace toute la base : pas de restauration d'une seule entrée (le journal des
  versions de chaque entrée sert à ça).
- Tableau partagé : si deux personnes modifient le même post-it au même moment, la dernière modification l'emporte.
- Les fichiers ne sont pas prévisualisés hors images (les PDF s'ouvrent dans le navigateur).
- Intégrations : pas d'OAuth (jetons personnels seulement ; les clients MCP qui exigent OAuth passent par le pont
  stdio), pas de flux d'événements poussé par le serveur MCP (l'IA demande, Paillasse répond ; pour être prévenu :
  webhooks), pas de création de contenants du stockage ni de jeux de données modifiés par l'API (ils se créent, ou
  se rangent pour les tubes ; le reste se fait dans l'interface).
- Assistant du labo : éprouvé contre une simulation d'Open WebUI (en-tête signé, session, appels d'outils en
  OpenAPI et en MCP), pas encore contre une installation réelle. Les codes de confirmation et les limites de débit
  sont gardés en mémoire : un redémarrage les oublie (l'assistant redemande un aperçu), et Paillasse doit tourner en
  un seul processus.
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
