// Modèles de base, installés dans chaque cahier (table templates, colonne slug).
// Chacun reste modifiable : tant qu'un modèle n'a pas été touché, une nouvelle version de Paillasse
// peut le mettre à jour ; dès qu'il est modifié, c'est celui du labo qui compte.
//
// Après une modification de ce fichier : npm --prefix client run templates
// (régénère server/src/lib/template-library.json, que le serveur installe au démarrage).

import { newComponent, newMixItem } from '../calc/calculators.js';
import {
  b, blank, calc, columnDataset, fiche, h2, ol, p, slot, table, tasks, ul, xyDataset,
} from './build.js';
import { TEMPLATE_CATEGORIES } from './categories.js';


const comp = (id, name, mw, v, u = 'mM') => ({ ...newComponent(id), name, mw, conc: { v, u } });
const fromStock = (id, name, v, u, sv, su) => ({ ...newComponent(id), name, source: 'stock', conc: { v, u }, stock: { v: sv, u: su } });

// --- Général ----------------------------------------------------------------------------------------

const classique = {
  slug: 'entree-classique',
  name: 'Entrée classique',
  category: 'Général',
  description: 'La trame d’une journée de manip : objectif, matériel, méthode, résultats, conclusion et suite.',
  content: [
    h2('Objectif'),
    p(),
    h2('Contexte et hypothèse'),
    p(),
    h2('Matériel et échantillons'),
    table(['Échantillon ou réactif', 'Référence ou lot', 'Quantité', 'Remarque'], blank(3, 4)),
    h2('Méthode'),
    ol('', '', ''),
    h2('Observations et résultats'),
    p(),
    slot('entree-classique-resultat', 'image', 'Photo ou fichier de résultat', 'Image, capture, export d’appareil…'),
    h2('Conclusion'),
    p(),
    h2('Suite à donner'),
    tasks('', ''),
  ],
};

const protocole = {
  slug: 'protocole',
  name: 'Protocole',
  category: 'Général',
  description: 'Un protocole réutilisable : principe, sécurité, réactifs, solutions, étapes à cocher, points critiques.',
  content: [
    fiche([['Source', 'publication, kit, collègue…'], ['Version'], ['Durée totale'], ['Points d’arrêt possibles']]),
    h2('Principe'),
    p(),
    h2('Sécurité'),
    fiche([['Équipement de protection', 'blouse, gants nitrile, lunettes'], ['Produits dangereux'], ['Déchets']]),
    h2('Réactifs et matériel'),
    table(['Réactif ou matériel', 'Fournisseur et référence', 'Lot', 'Quantité'], blank(4, 4)),
    h2('Solutions à préparer'),
    calc('solution', {
      label: 'Tampon',
      vol: { v: '100', u: 'mL' },
      items: [comp('a', 'Tris-HCl', '157,6', '50'), comp('b', 'NaCl', '58,44', '150')],
    }),
    h2('Étapes'),
    tasks('', '', '', ''),
    h2('Points critiques'),
    ul(''),
    h2('Écarts au protocole'),
    p(),
    h2('Résultat attendu'),
    p(),
  ],
};

const reunion = {
  slug: 'reunion',
  name: 'Réunion ou point d’équipe',
  category: 'Général',
  description: 'Compte rendu : participants, ordre du jour, décisions et actions avec responsable et échéance.',
  content: [
    fiche([['Participants'], ['Excusés'], ['Lieu ou visio']]),
    h2('Ordre du jour'),
    ol('', ''),
    h2('Discussion'),
    p(),
    h2('Décisions'),
    ul(''),
    h2('Actions'),
    table(['Action', 'Qui', 'Pour quand', 'Fait'], blank(3, 4)),
    h2('Prochaine réunion'),
    p(),
  ],
};

const solution = {
  slug: 'solution',
  name: 'Préparation d’une solution ou d’un tampon',
  category: 'Général',
  description: 'Recette calculée (pesées, solutions mères), pH, stérilisation, étiquetage et lot.',
  content: [
    fiche([['Solution'], ['Usage'], ['Stockage', '4 °C / température ambiante / −20 °C']]),
    h2('Composition'),
    calc('solution', {
      label: 'Tampon Tris-NaCl-EDTA',
      vol: { v: '500', u: 'mL' },
      items: [
        comp('a', 'Tris-HCl', '157,6', '50'),
        comp('b', 'NaCl', '58,44', '150'),
        fromStock('c', 'EDTA', '1', 'mM', '0,5', 'M'),
      ],
    }),
    h2('Préparation'),
    tasks(
      'Dissoudre les poudres dans environ 80 % du volume d’eau',
      'Ajouter les solutions mères',
      'Ajuster le pH à … avec HCl ou NaOH',
      'Compléter au volume final',
      'Filtrer (0,22 µm) ou autoclaver (20 min à 121 °C)',
      'Étiqueter : nom, concentration, pH, date, initiales',
    ),
    h2('Contrôles'),
    fiche([['pH mesuré (et température)'], ['Aspect']]),
    h2('Lot'),
    fiche([['Numéro de lot ou de flacon'], ['Péremption'], ['Emplacement']]),
  ],
};

// --- Biologie moléculaire ------------------------------------------------------------------------

const pcr = {
  slug: 'pcr',
  name: 'PCR',
  category: 'Biologie moléculaire',
  description: 'Amplification : matrice et amorces, master mix calculé, programme du thermocycleur, gel de contrôle.',
  content: [
    h2('Objectif'),
    p(),
    h2('Matrice et amorces'),
    slot('pcr-matrice', 'sequence', 'Séquence de la matrice', 'Plasmide ou construction du registre'),
    table(['', 'Nom', 'Séquence (5′ → 3′)', 'Tm (°C)'], [['Sens', '', '', ''], ['Antisens', '', '', '']]),
    fiche([['Taille attendue (pb)'], ['Polymérase', 'Q5 High-Fidelity (NEB)']]),
    h2('Master mix'),
    calc('mastermix', {
      label: 'Q5, 25 µL par réaction',
      reactions: '4',
      surplus: '10',
      items: [
        newMixItem('a', 'Tampon Q5 5X', '5'),
        newMixItem('b', 'dNTP 10 mM', '0,5'),
        newMixItem('c', 'Amorce sens 10 µM', '1,25'),
        newMixItem('d', 'Amorce antisens 10 µM', '1,25'),
        newMixItem('e', 'Polymérase Q5', '0,25'),
        newMixItem('f', 'Eau sans nucléase', '15,75'),
        newMixItem('g', 'Matrice (1–10 ng de plasmide)', '1', true),
      ],
    }),
    h2('Tubes'),
    table(['Tube', 'Matrice', 'Amorces', 'Remarque'], [['1', '', '', ''], ['2', '', '', ''], ['3', '', '', ''], ['T−', 'Eau', '', 'Témoin sans matrice']]),
    h2('Programme'),
    table(['Étape', 'Température', 'Durée', 'Cycles'], [
      ['Dénaturation initiale', '98 °C', '30 s', '1'],
      ['Dénaturation', '98 °C', '10 s', '30'],
      ['Hybridation', '… °C (Tm + 3 °C avec Q5)', '20 s', '30'],
      ['Élongation', '72 °C', '20 à 30 s par kb', '30'],
      ['Élongation finale', '72 °C', '2 min', '1'],
      ['Maintien', '4 °C', '∞', ''],
    ]),
    h2('Gel de contrôle'),
    fiche([['Gel', 'agarose 1 % dans du TAE 1X'], ['Dépôt', '5 µL de produit + tampon de charge']]),
    slot('pcr-gel', 'gel', 'Figure du gel de contrôle', 'Tailles des produits comparées au marqueur', { mode: 'dna' }),
    h2('Résultat'),
    p(),
    h2('Suite'),
    tasks('Purifier le produit (colonne ou extraction sur gel)', 'Doser', 'Stocker à −20 °C'),
  ],
};

const clonage = {
  slug: 'clonage',
  name: 'Clonage',
  category: 'Biologie moléculaire',
  description: 'Construction d’un plasmide : digestion, purification, ligation ou assemblage, transformation, criblage.',
  content: [
    fiche([
      ['Construction visée'],
      ['Vecteur'],
      ['Insert', 'PCR, digestion, synthèse…'],
      ['Méthode', 'digestion-ligation / Gibson / In-Fusion / Golden Gate'],
      ['Sélection', 'antibiotique'],
    ]),
    slot('clonage-carte', 'sequence', 'Carte de la construction', 'Séquence du registre (construction attendue)'),
    h2('Digestion'),
    table(['', 'Vecteur', 'Insert'], [
      ['ADN', '1 µg', ''],
      ['Enzyme 1', '1 µL', '1 µL'],
      ['Enzyme 2', '1 µL', '1 µL'],
      ['Tampon 10X', '5 µL', '5 µL'],
      ['Phosphatase (vecteur seulement)', '1 µL', '—'],
      ['Eau', 'qsp 50 µL', 'qsp 50 µL'],
    ]),
    p(b('Incubation : '), '37 °C, 1 h (selon les enzymes) ; inactivation : …'),
    h2('Purification'),
    fiche([['Méthode', 'extraction sur gel / colonne'], ['Vecteur (ng/µL)'], ['Insert (ng/µL)']]),
    slot('clonage-gel-digestion', 'gel', 'Gel de digestion', 'Contrôle des fragments avant purification', { mode: 'dna' }),
    h2('Ligation ou assemblage'),
    slot('clonage-ligation', 'calc', 'Quantité d’insert', 'Rapport molaire insert / vecteur selon les longueurs', {
      kind: 'ligation',
      params: { label: '', ratio: '3', vector: { length: '', mass: { v: '50', u: 'ng' }, sequence: null }, insert: { length: '', sequence: null } },
    }),
    table(['Composant', 'Réaction', 'Témoin vecteur seul'], [
      ['Vecteur', '50 ng', '50 ng'],
      ['Insert', '', '—'],
      ['Tampon ligase T4 10X', '2 µL', '2 µL'],
      ['Ligase T4', '1 µL', '1 µL'],
      ['Eau', 'qsp 20 µL', 'qsp 20 µL'],
    ]),
    p(b('Incubation : '), '1 h à température ambiante ou la nuit à 16 °C.'),
    h2('Transformation'),
    fiche([['Souche compétente'], ['Volume transformé'], ['Colonies (réaction / témoin)']]),
    h2('Criblage'),
    table(['Clone', 'PCR sur colonie ou digestion', 'Résultat', 'Séquençage'], blank(4, 4, true)),
    slot('clonage-gel-criblage', 'gel', 'Gel de criblage', 'PCR sur colonie ou digestion de contrôle', { mode: 'dna' }),
    h2('Conclusion'),
    p(),
    tasks('Envoyer au séquençage', 'Enregistrer la séquence vérifiée dans le registre', 'Stock glycérol à −80 °C'),
  ],
};

const transformation = {
  slug: 'transformation',
  name: 'Transformation bactérienne',
  category: 'Biologie moléculaire',
  description: 'Choc thermique pas à pas, témoins, comptage des colonies et efficacité.',
  content: [
    fiche([
      ['Souche compétente', 'DH5α, TOP10, BL21(DE3)…'],
      ['Lot et efficacité annoncée'],
      ['ADN', 'plasmide ou ligation, quantité'],
      ['Sélection', 'antibiotique et concentration'],
    ]),
    h2('Protocole (choc thermique)'),
    tasks(
      'Décongeler les bactéries compétentes sur glace (10 min)',
      'Ajouter l’ADN (1 à 5 µL, au plus 100 ng) et mélanger en tapotant, sans vortexer',
      '30 min sur glace',
      'Choc thermique : 30 s à 42 °C',
      '2 min sur glace',
      'Ajouter 250 à 950 µL de SOC à température ambiante',
      '1 h à 37 °C sous agitation (250 rpm)',
      'Étaler 50 à 200 µL sur boîte LB + antibiotique préchauffée',
      'La nuit à 37 °C, boîtes retournées',
    ),
    h2('Boîtes'),
    table(['Boîte', 'ADN', 'Attendu', 'Colonies'], [
      ['Témoin positif', 'pUC19 (10 pg)', 'nombreuses', ''],
      ['Témoin négatif', 'sans ADN', 'aucune', ''],
      ['Échantillon', '', '', ''],
      ['Échantillon', '', '', ''],
    ]),
    h2('Résultat'),
    fiche([['Efficacité (transformants par µg)'], ['Remarques']]),
    p('Efficacité = colonies ÷ µg d’ADN étalé (en tenant compte de la fraction étalée).'),
    slot('transformation-photo', 'image', 'Photo des boîtes'),
  ],
};

const miniprep = {
  slug: 'miniprep',
  name: 'Miniprep (ADN plasmidique)',
  category: 'Biologie moléculaire',
  description: 'Cultures, étapes du kit à cocher, dosage et qualité (A260/280, A260/230), vérification.',
  content: [
    fiche([
      ['Kit', 'QIAprep Spin, NucleoSpin Plasmid…'],
      ['Culture', '5 mL de LB + antibiotique, la nuit à 37 °C'],
      ['Élution', '50 µL d’eau ou de tampon EB'],
    ]),
    h2('Cultures'),
    table(['Clone', 'Plasmide attendu', 'Antibiotique', 'Culture (mL)'], blank(4, 4, true)),
    h2('Étapes'),
    tasks(
      'Culotter la culture (≥ 6 000 × g, 3 min)',
      'Resuspendre dans le tampon P1 (avec RNase A)',
      'Lyser (P2) : 5 min au plus, en retournant doucement',
      'Neutraliser (N3) et mélanger aussitôt',
      'Centrifuger 10 min à vitesse maximale',
      'Charger le surnageant sur la colonne',
      'Laver (PE), puis centrifuger 1 min à vide pour sécher',
      'Éluer : attendre 1 min avant de centrifuger',
    ),
    h2('Dosage'),
    table(['Clone', 'ng/µL', 'A260/280', 'A260/230', 'Volume (µL)'], blank(4, 5, true)),
    p('Attendu : A260/280 ≈ 1,8 ; A260/230 entre 2,0 et 2,2.'),
    h2('Vérification'),
    fiche([['Digestion de contrôle'], ['Séquençage', 'n° de commande'], ['Résultat']]),
    slot('miniprep-gel', 'gel', 'Gel de digestion de contrôle', '', { mode: 'dna' }),
    h2('Stockage'),
    fiche([['Emplacement', '−20 °C, boîte, position']]),
  ],
};

const agarose = {
  slug: 'gel-agarose',
  name: 'Gel d’agarose (électrophorèse d’ADN)',
  category: 'Biologie moléculaire',
  description: 'Conditions du gel, plan de dépôt, figure analysée (tailles, quantités) et interprétation.',
  content: [
    fiche([
      ['Agarose', '1 % dans du TAE 1X'],
      ['Colorant', 'GelRed, SYBR Safe…'],
      ['Marqueur', 'GeneRuler 1 kb Plus…'],
      ['Migration', '100 V, 30 à 45 min'],
      ['Imageur'],
    ]),
    h2('Dépôts'),
    table(['Puits', 'Échantillon', 'Volume (µL)', 'Taille attendue (pb)'], [['1', 'Marqueur', '5', ''], ...blank(7, 4).map((r, k) => [String(k + 2), ...r.slice(1)])]),
    h2('Gel'),
    slot('agarose-gel', 'gel', 'Image du gel', 'Tailles des fragments et quantités par bande', { mode: 'dna' }),
    h2('Interprétation'),
    p(),
  ],
};

const qpcr = {
  slug: 'qpcr',
  name: 'RT-qPCR',
  category: 'Biologie moléculaire',
  description: 'Gènes et amorces, mix par puits, programme, contrôles et expression relative (ΔΔCt) en graphique.',
  content: [
    fiche([
      ['Chimie', 'SYBR Green / sonde TaqMan'],
      ['Kit et appareil'],
      ['Plaque', '96 ou 384 puits'],
      ['ADNc', 'quantité d’ARN rétrotranscrit, dilution'],
    ]),
    h2('Gènes'),
    table(['Gène', 'Rôle', 'Amorce sens', 'Amorce antisens', 'Efficacité (%)'], [
      ['', 'Référence', '', '', ''],
      ['', 'Cible', '', '', ''],
      ['', 'Cible', '', '', ''],
    ]),
    h2('Échantillons'),
    table(['Échantillon', 'Condition', 'ARN (ng)', 'Réplicats'], blank(4, 4)),
    h2('Mix par puits'),
    calc('mastermix', {
      label: 'SYBR, 10 µL par puits',
      reactions: '30',
      surplus: '10',
      items: [
        newMixItem('a', 'Mix SYBR Green 2X', '5'),
        newMixItem('b', 'Amorce sens 10 µM', '0,5'),
        newMixItem('c', 'Amorce antisens 10 µM', '0,5'),
        newMixItem('d', 'Eau sans nucléase', '2'),
        newMixItem('e', 'ADNc dilué', '2', true),
      ],
    }),
    h2('Programme'),
    table(['Étape', 'Température', 'Durée', 'Cycles'], [
      ['Activation', '95 °C', '2 min', '1'],
      ['Dénaturation', '95 °C', '5 s', '40'],
      ['Hybridation et élongation', '60 °C', '30 s', '40'],
      ['Courbe de fusion', '65 → 95 °C', 'pas de 0,5 °C', '1'],
    ]),
    h2('Contrôles'),
    tasks(
      'Sans matrice (NTC) pour chaque couple d’amorces',
      'Sans transcriptase inverse (RT−)',
      'Courbe de fusion : un seul pic',
      'Écart entre réplicats techniques inférieur à 0,3 Ct',
    ),
    h2('Analyse'),
    p('ΔCt = Ct cible − Ct référence ; ΔΔCt = ΔCt échantillon − ΔCt témoin ; expression relative = 2', { type: 'text', text: '−ΔΔCt', marks: [{ type: 'superscript' }] }, '.'),
    slot('qpcr-expression', 'stats', 'Expression relative', 'Une valeur de 2^−ΔΔCt par réplicat biologique ; test t ou ANOVA', {
      dataset: columnDataset({
        title: 'Expression relative',
        groups: ['Témoin', 'Traité'],
        rows: 4,
        analysis: { type: 'auto' },
        graph: { type: 'bar', yTitle: 'Expression relative (2^−ΔΔCt)', error: 'sem' },
      }),
    }),
    h2('Conclusion'),
    p(),
  ],
};

// --- Protéines -------------------------------------------------------------------------------------

const expression = {
  slug: 'expression-proteine',
  name: 'Expression de protéine recombinante',
  category: 'Protéines',
  description: 'Préculture, croissance suivie à la DO600, induction, récolte et gel d’expression.',
  content: [
    fiche([
      ['Protéine'],
      ['Plasmide'],
      ['Souche', 'BL21(DE3), Rosetta…'],
      ['Sélection', 'antibiotique et concentration'],
    ]),
    slot('expression-construction', 'sequence', 'Construction', 'Plasmide d’expression du registre'),
    h2('Milieu'),
    calc('medium', { label: 'Culture d’expression', medium: 'LB (Luria-Bertani)', vol: { v: '1', u: 'L' }, agar: false }),
    h2('Culture et induction'),
    tasks(
      'Préculture : une colonie dans 10 mL de LB + antibiotique, la nuit à 37 °C, 200 rpm',
      'Ensemencer au 1/100',
      'Croissance à 37 °C jusqu’à DO600 = 0,6 à 0,8',
      'Prélever 1 mL non induit',
      'Induire : IPTG … mM (0,1 à 1 mM)',
      'Expression : … °C pendant … h (ex. 18 °C la nuit, ou 37 °C 3 à 4 h)',
      'Prélever 1 mL induit (même DO chargée sur le gel)',
      'Récolter : 4 000 × g, 20 min, 4 °C ; peser le culot',
      'Culot à −80 °C ou purification directe',
    ),
    h2('Suivi de la croissance'),
    table(['Heure', 'DO600', 'Remarque'], blank(5, 3)),
    h2('Contrôle d’expression'),
    p('Non induit, induit, fraction soluble et fraction insoluble, à DO égale.'),
    slot('expression-gel', 'gel', 'Gel d’expression', 'SDS-PAGE : bande attendue à la bonne taille ?', { mode: 'protein' }),
    h2('Résultat'),
    fiche([['Masse du culot (g)'], ['Expression', 'soluble / corps d’inclusion'], ['Remarques']]),
  ],
};

const purification = {
  slug: 'purification-his',
  name: 'Purification de protéine (His-tag, Ni-NTA)',
  category: 'Protéines',
  description: 'Tampons calculés, lyse, chromatographie d’affinité, fractions, gel de pureté, rendement et stockage.',
  content: [
    fiche([
      ['Protéine', 'masse (kDa) et ε280 (M⁻¹ cm⁻¹)'],
      ['Culot de départ', 'masse, culture du …'],
      ['Résine', 'Ni-NTA agarose, volume'],
      ['Température', 'tout à 4 °C'],
    ]),
    h2('Tampons'),
    calc('solution', {
      label: 'Tampon de lyse (pH 8,0)',
      vol: { v: '250', u: 'mL' },
      items: [
        comp('a', 'Tris-HCl', '157,6', '50'),
        comp('b', 'NaCl', '58,44', '300'),
        comp('c', 'Imidazole', '68,08', '10'),
        fromStock('d', 'Glycérol', '5', '% (v/v)', '100', '% (v/v)'),
      ],
    }),
    calc('solution', {
      label: 'Tampon de lavage (pH 8,0)',
      vol: { v: '250', u: 'mL' },
      items: [
        comp('a', 'Tris-HCl', '157,6', '50'),
        comp('b', 'NaCl', '58,44', '300'),
        comp('c', 'Imidazole', '68,08', '25'),
        fromStock('d', 'Glycérol', '5', '% (v/v)', '100', '% (v/v)'),
      ],
    }),
    calc('solution', {
      label: 'Tampon d’élution (pH 8,0)',
      vol: { v: '100', u: 'mL' },
      items: [
        comp('a', 'Tris-HCl', '157,6', '50'),
        comp('b', 'NaCl', '58,44', '300'),
        comp('c', 'Imidazole', '68,08', '250'),
        fromStock('d', 'Glycérol', '5', '% (v/v)', '100', '% (v/v)'),
      ],
    }),
    p('Au dernier moment : inhibiteurs de protéases sans EDTA, DNase I, lysozyme (1 mg/mL).'),
    h2('Lyse et clarification'),
    tasks(
      'Resuspendre le culot : 5 mL de tampon de lyse par g',
      'Lyser : sonication sur glace (… % d’amplitude, 10 s / 10 s, … min au total) ou presse',
      'Centrifuger 30 min à 20 000 × g, 4 °C',
      'Garder 20 µL de lysat total et de surnageant pour le gel',
      'Filtrer le surnageant (0,45 µm)',
    ),
    h2('Chromatographie d’affinité'),
    tasks(
      'Équilibrer la résine : 10 volumes de tampon de lyse',
      'Charger le surnageant (1 h en batch à 4 °C, ou sur colonne)',
      'Garder le non-retenu',
      'Laver : 20 volumes de tampon de lavage',
      'Éluer : 5 fois 1 volume de tampon d’élution, fractions séparées',
    ),
    h2('Fractions'),
    table(['Fraction', 'Volume (mL)', 'A280', 'Sur le gel', 'Gardée'], [
      ['Lysat', '', '', '', ''],
      ['Non-retenu', '', '', '', ''],
      ['Lavage', '', '', '', ''],
      ['Élution 1', '', '', '', ''],
      ['Élution 2', '', '', '', ''],
      ['Élution 3', '', '', '', ''],
    ]),
    slot('purification-gel', 'gel', 'SDS-PAGE des fractions', 'Pureté de la protéine dans chaque fraction', { mode: 'protein' }),
    h2('Suite'),
    fiche([
      ['Dialyse ou dessalage', 'vers le tampon …'],
      ['Clivage de l’étiquette', 'TEV, la nuit à 4 °C'],
      ['Exclusion stérique', 'colonne, tampon'],
      ['Concentration finale (mg/mL)'],
      ['Rendement (mg par L de culture)'],
    ]),
    p('Concentration (mg/mL) = A280 ÷ ε × masse molaire (g/mol), pour 1 cm de trajet.'),
    h2('Stockage'),
    fiche([
      ['Aliquots', 'nombre × volume'],
      ['Tampon final'],
      ['Conservation', 'congélation rapide dans l’azote liquide, −80 °C'],
      ['Emplacement'],
    ]),
  ],
};

const sdsPage = {
  slug: 'sds-page',
  name: 'SDS-PAGE',
  category: 'Protéines',
  description: 'Gel, plan de dépôt avec quantités, préparation des échantillons, figure et quantification.',
  content: [
    fiche([
      ['Gel', 'précoulé 4–20 % / fait main 12 %'],
      ['Tampon de migration', 'Tris-glycine-SDS'],
      ['Marqueur', 'PageRuler Plus…'],
      ['Migration', '200 V, 35 à 45 min'],
      ['Coloration', 'Coomassie, stain-free, argent'],
    ]),
    h2('Échantillons'),
    table(['Piste', 'Échantillon', 'Protéines (µg)', 'Volume (µL)', 'Laemmli 4X (µL)'], [['1', 'Marqueur', '', '5', ''], ...blank(9, 5).map((r, k) => [String(k + 2), ...r.slice(1)])]),
    h2('Préparation'),
    tasks(
      'Ajouter le tampon de Laemmli (β-mercaptoéthanol ou DTT)',
      'Chauffer 5 min à 95 °C (ou 10 min à 70 °C)',
      'Centrifuger brièvement',
      'Déposer',
      'Migrer jusqu’à ce que le front atteigne le bas du gel',
      'Colorer, puis décolorer',
    ),
    h2('Gel'),
    slot('sds-gel', 'gel', 'Image du gel', 'Tailles apparentes, pureté, quantités', { mode: 'protein' }),
    h2('Interprétation'),
    p(),
  ],
};

const western = {
  slug: 'western-blot',
  name: 'Western blot',
  category: 'Protéines',
  description: 'Dépôts, transfert, anticorps et dilutions, étapes à cocher, TBST calculé, blot quantifié.',
  content: [
    fiche([
      ['Cible', 'taille attendue (kDa)'],
      ['Contrôle de charge', 'GAPDH, β-actine, tubuline, protéines totales'],
      ['Gel'],
      ['Membrane', 'PVDF (activée au méthanol) / nitrocellulose'],
      ['Transfert', 'semi-sec 25 V, 7 à 10 min / humide 100 V, 1 h à 4 °C'],
    ]),
    h2('Échantillons'),
    table(['Piste', 'Échantillon', 'Protéines (µg)', 'Volume (µL)'], [['1', 'Marqueur', '', '5'], ...blank(9, 4).map((r, k) => [String(k + 2), ...r.slice(1)])]),
    h2('Migration et transfert'),
    tasks('Migration : … V, … min', 'Transfert : …', 'Contrôle du transfert : rouge Ponceau S, photo, rinçage'),
    h2('Anticorps'),
    table(['', 'Anticorps', 'Fournisseur et référence', 'Hôte', 'Dilution', 'Incubation'], [
      ['Primaire', '', '', '', '1:1000', 'la nuit à 4 °C'],
      ['Secondaire', 'anti-… HRP', '', '', '1:5000', '1 h, température ambiante'],
      ['Contrôle de charge', '', '', '', '', ''],
    ]),
    h2('Immunodétection'),
    tasks(
      'Blocage : lait 5 % (ou BSA 5 %) dans le TBST, 1 h à température ambiante',
      'Anticorps primaire dans le tampon de blocage',
      'Lavages : 3 × 10 min de TBST',
      'Anticorps secondaire',
      'Lavages : 3 × 10 min de TBST',
      'Révélation : ECL, exposition de … s à … min',
    ),
    h2('Tampon'),
    calc('solution', {
      label: 'TBST (pH 7,6)',
      vol: { v: '1', u: 'L' },
      items: [
        comp('a', 'Tris base', '121,14', '20'),
        comp('b', 'NaCl', '58,44', '150'),
        fromStock('c', 'Tween 20', '0,1', '% (v/v)', '100', '% (v/v)'),
      ],
    }),
    h2('Révélation'),
    fiche([['Substrat'], ['Imageur'], ['Temps d’exposition']]),
    slot('western-blot', 'gel', 'Blot', 'Bande d’intérêt normalisée par le contrôle de charge', { mode: 'western' }),
    h2('Résultat'),
    p(),
  ],
};

const dosage = {
  slug: 'dosage-proteines',
  name: 'Dosage de protéines (Bradford, BCA)',
  category: 'Protéines',
  description: 'Gamme de BSA, courbe étalon ajustée et concentrations des échantillons lues sur la droite.',
  content: [
    fiche([
      ['Méthode', 'Bradford (595 nm) / BCA (562 nm)'],
      ['Étalon', 'BSA'],
      ['Format', 'microplaque, 200 µL par puits'],
      ['Lecteur'],
    ]),
    h2('Protocole'),
    tasks(
      'Préparer la gamme de BSA dans le même tampon que les échantillons',
      'Diluer les échantillons pour tomber dans la gamme',
      'Déposer 10 µL par puits (Bradford : 5 µL), en triple',
      'Ajouter 200 µL de réactif (BCA : mélange A:B 50:1)',
      'Incuber (BCA : 30 min à 37 °C ; Bradford : 5 min à température ambiante)',
      'Lire l’absorbance',
    ),
    h2('Courbe étalon'),
    slot('dosage-courbe', 'stats', 'Courbe étalon', 'Absorbances de la gamme en Y ; celles des échantillons en « inconnues » : leur concentration est lue sur la droite', {
      dataset: xyDataset({
        title: 'Gamme de BSA',
        xTitle: 'BSA (µg/mL)',
        yTitle: 'Absorbance',
        xs: [0, 125, 250, 500, 750, 1000, 1500, 2000],
        series: ['Absorbance'],
        analysis: { type: 'linear' },
      }),
    }),
    h2('Échantillons'),
    table(['Échantillon', 'Dilution', 'Absorbance moyenne', 'Lu sur la droite (µg/mL)', 'Concentration (µg/mL)'], blank(4, 5)),
    h2('Résultat'),
    p(),
  ],
};

const plateRows = 'ABCDEFGH'.split('').map((r) => [r, ...Array(12).fill('')]);

const elisa = {
  slug: 'elisa',
  name: 'ELISA',
  category: 'Protéines',
  description: 'Plan de plaque, étapes à cocher, courbe étalon à 4 paramètres et concentrations des échantillons.',
  content: [
    fiche([
      ['Format', 'sandwich / direct / compétition'],
      ['Analyte et kit'],
      ['Échantillons', 'nature, dilution'],
      ['Lecture', '450 nm (correction à 570 nm)'],
    ]),
    h2('Plan de plaque'),
    table(['', ...Array.from({ length: 12 }, (_, k) => String(k + 1))], plateRows),
    h2('Étapes'),
    tasks(
      'Coating : anticorps de capture à … µg/mL, la nuit à 4 °C',
      'Lavages : 3 fois PBS-Tween 0,05 %',
      'Blocage : 1 h à température ambiante',
      'Gamme étalon et échantillons : 2 h',
      'Anticorps de détection : 1 h',
      'Streptavidine-HRP : 30 min',
      'TMB : … min à l’obscurité',
      'Arrêt (H2SO4 2 N) et lecture',
    ),
    h2('Courbe étalon'),
    slot('elisa-courbe', 'stats', 'Courbe étalon (4 paramètres)', 'DO de la gamme en Y ; celles des échantillons en « inconnues »', {
      dataset: xyDataset({
        title: 'Gamme étalon',
        xTitle: 'Concentration (pg/mL)',
        yTitle: 'DO 450 nm',
        xs: [15.6, 31.25, 62.5, 125, 250, 500, 1000],
        series: ['DO'],
        replicates: 2,
        analysis: { type: 'nonlinear', model: 'dose4', logX: 'auto' },
        graph: { xLog: true },
      }),
    }),
    h2('Résultats'),
    table(['Échantillon', 'Dilution', 'DO moyenne', 'Concentration (pg/mL)', 'CV (%)'], blank(4, 5)),
  ],
};

// --- Cellules -----------------------------------------------------------------------------------------

const culture = {
  slug: 'culture-cellulaire',
  name: 'Culture cellulaire (passage)',
  category: 'Cellules',
  description: 'Observation, passage pas à pas, comptage et ensemencement, avec le numéro de passage.',
  content: [
    fiche([
      ['Lignée'],
      ['Passage n°'],
      ['Milieu', 'DMEM, 10 % SVF, 1 % pénicilline-streptomycine'],
      ['Contenant', 'flasque T75…'],
      ['Dernier test mycoplasmes'],
    ]),
    h2('Observation'),
    fiche([['Confluence (%)'], ['Morphologie'], ['Contamination', 'aucune visible']]),
    slot('culture-photo', 'image', 'Photo au microscope'),
    h2('Passage'),
    tasks(
      'Préchauffer milieu, PBS et trypsine à 37 °C',
      'Aspirer le milieu, rincer au PBS',
      'Trypsine-EDTA 0,05 % : … mL, … min à 37 °C',
      'Neutraliser avec … mL de milieu complet',
      'Compter',
      'Ensemencer au 1/… ou … cellules par contenant',
      'Noter le nouveau numéro de passage sur les flasques',
    ),
    h2('Comptage'),
    table(['Carré', 'Cellules', 'Viabilité (%)'], blank(4, 3, true)),
    p('Cellules par mL = moyenne par carré × dilution (bleu trypan) × 10', { type: 'text', text: '4', marks: [{ type: 'superscript' }] }, '.'),
    h2('Ensemencement'),
    table(['Contenant', 'Cellules ensemencées', 'Volume', 'Destination'], blank(3, 4)),
  ],
};

const transfection = {
  slug: 'transfection',
  name: 'Transfection',
  category: 'Cellules',
  description: 'Conditions par puits (ADN, réactif), étapes du complexe, efficacité et lecture.',
  content: [
    fiche([
      ['Cellules', 'lignée, passage'],
      ['Format', 'plaque 6 puits…'],
      ['Réactif', 'Lipofectamine 3000, PEI…'],
      ['Ensemencement', 'la veille : … cellules par puits (70 à 90 % de confluence le jour J)'],
    ]),
    h2('Conditions'),
    table(['Puits', 'Plasmide ou siARN', 'ADN (µg)', 'Réactif (µL)', 'Remarque'], [
      ['1', 'Non transfecté', '—', '—', 'Témoin négatif'],
      ['2', 'GFP', '', '', 'Témoin d’efficacité'],
      ['3', '', '', '', ''],
      ['4', '', '', '', ''],
    ]),
    h2('Protocole'),
    tasks(
      'Diluer l’ADN dans … µL d’Opti-MEM',
      'Diluer le réactif dans … µL d’Opti-MEM',
      'Mélanger ; … min à température ambiante',
      'Déposer goutte à goutte sur les cellules',
      'Changer le milieu après … h si nécessaire',
      'Lecture à … h : fluorescence, western, qPCR…',
    ),
    h2('Efficacité'),
    fiche([['Cellules GFP+ (%)'], ['Méthode', 'microscope / cytométrie']]),
    slot('transfection-photo', 'image', 'Photo en fluorescence'),
    h2('Résultat'),
    p(),
  ],
};

const RAW = [
  classique, protocole, reunion, solution,
  pcr, clonage, transformation, miniprep, agarose, qpcr,
  expression, purification, sdsPage, western, dosage, elisa,
  culture, transfection,
];

/** Modèles de base, tels que le serveur les installe. */
export function buildTemplateLibrary() {
  const slugs = new Set();
  return RAW.map((t) => {
    if (slugs.has(t.slug)) throw new Error(`Modèle en double : ${t.slug}`);
    slugs.add(t.slug);
    if (!TEMPLATE_CATEGORIES.includes(t.category)) throw new Error(`Catégorie inconnue : ${t.category}`);
    return { slug: t.slug, name: t.name, category: t.category, description: t.description, content: { type: 'doc', content: [...t.content, p()] } };
  });
}
