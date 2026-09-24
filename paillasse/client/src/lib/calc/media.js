// Milieux de culture : recettes pour 1 L, reprises de LabHelper v3.
// Quantité numérique = mise à l'échelle du volume voulu ; texte (« inclus », « variable ») = recopié tel quel.

export const MEDIA_CATEGORIES = ['Bactéries', 'Levures', 'Mycologie', 'Plantes'];

export const MEDIA = [
  // --- Bactéries ---
  {
    name: 'LB (Luria-Bertani)', category: 'Bactéries', ph: '7,0',
    components: [
      { name: 'Tryptone', qty: '10', unit: 'g/L' },
      { name: 'Extrait de levure', qty: '5', unit: 'g/L' },
      { name: 'NaCl', qty: '10', unit: 'g/L' },
    ],
    note: "Milieu riche universel pour la culture de routine d'E. coli et de nombreuses entérobactéries. Base de la plupart des protocoles de clonage, d'expression et de transformation. Le tryptone fournit les peptides (digestion trypsique de caséine), l'extrait de levure apporte vitamines et cofacteurs. Ajuster le pH à 7,0 avec NaOH avant autoclavage (121 °C, 15 min). Pour du LB-agar, ajouter 15 g/L d'agar avant autoclavage. Les antibiotiques sont ajoutés après refroidissement à ~55 °C.",
  },
  {
    name: 'LB Low Salt', category: 'Bactéries', ph: '7,0',
    components: [
      { name: 'Tryptone', qty: '10', unit: 'g/L' },
      { name: 'Extrait de levure', qty: '5', unit: 'g/L' },
      { name: 'NaCl', qty: '5', unit: 'g/L' },
    ],
    note: "Variante du LB à faible teneur en sel (5 g/L au lieu de 10 g/L). Indispensable pour la sélection à la zéocine (Sh ble), car une concentration élevée en sel inactive cet antibiotique. Également recommandé pour la sélection à l'hygromycine B. Le pH doit être ajusté à 7,5 pour une activité optimale de la zéocine. Même protocole de préparation que le LB standard.",
  },
  {
    name: '2xYT', category: 'Bactéries', ph: '7,0',
    components: [
      { name: 'Tryptone', qty: '16', unit: 'g/L' },
      { name: 'Extrait de levure', qty: '10', unit: 'g/L' },
      { name: 'NaCl', qty: '5', unit: 'g/L' },
    ],
    note: "Milieu deux fois plus riche en nutriments que le LB. Meilleure croissance et meilleur rendement en biomasse ; particulièrement recommandé pour la production de phages M13, la préparation de cellules compétentes et l'expression de protéines recombinantes en milieu de phase exponentielle. Le rapport peptone/levure plus élevé fournit davantage d'acides aminés et de facteurs de croissance. Autoclavage standard.",
  },
  {
    name: 'TB (Terrific Broth)', category: 'Bactéries', ph: '7,2',
    components: [
      { name: 'Tryptone', qty: '12', unit: 'g/L' },
      { name: 'Extrait de levure', qty: '24', unit: 'g/L' },
      { name: 'Glycérol', qty: '4', unit: 'mL/L' },
      { name: 'KH2PO4', qty: '2.31', unit: 'g/L' },
      { name: 'K2HPO4', qty: '12.54', unit: 'g/L' },
    ],
    note: "Milieu haute densité pour l'expression de protéines recombinantes à haut rendement. La forte concentration en extrait de levure et le glycérol comme source de carbone supplémentaire permettent d'atteindre des DO600 de 10 à 15. Le tampon phosphate de potassium (17 mM KH2PO4, 72 mM K2HPO4, pH 7,2) stabilise le pH pendant la croissance. Important : préparer les sels de phosphate en solution 10x séparée, autoclaver séparément et mélanger après refroidissement pour éviter la précipitation. La phase de croissance exponentielle est prolongée par rapport au LB.",
  },
  {
    name: 'SOC', category: 'Bactéries', ph: '7,0',
    components: [
      { name: 'Tryptone', qty: '20', unit: 'g/L' },
      { name: 'Extrait de levure', qty: '5', unit: 'g/L' },
      { name: 'NaCl', qty: '0.5', unit: 'g/L' },
      { name: 'KCl', qty: '0.186', unit: 'g/L' },
      { name: 'MgCl2', qty: '0.952', unit: 'g/L' },
      { name: 'MgSO4', qty: '1.204', unit: 'g/L' },
      { name: 'Glucose', qty: '3.603', unit: 'g/L' },
    ],
    note: "Milieu de récupération après transformation bactérienne (choc thermique ou électroporation). Le glucose (20 mM) fournit une source d'énergie immédiate pour la réparation cellulaire et le Mg2+ (10 mM au total) stabilise les membranes. Préparer le milieu de base (SOB) et l'autoclaver, puis ajouter stérilement MgCl2 (1 M) et glucose (1 M ou 20 %) après refroidissement. Incuber les cellules transformées 1 h à 37 °C sous agitation (200 rpm) avant étalement. Déterminant pour obtenir une efficacité de transformation optimale.",
  },
  {
    name: 'SOB', category: 'Bactéries', ph: '7,0',
    components: [
      { name: 'Tryptone', qty: '20', unit: 'g/L' },
      { name: 'Extrait de levure', qty: '5', unit: 'g/L' },
      { name: 'NaCl', qty: '0.5', unit: 'g/L' },
      { name: 'KCl', qty: '0.186', unit: 'g/L' },
      { name: 'MgCl2', qty: '0.952', unit: 'g/L' },
      { name: 'MgSO4', qty: '1.204', unit: 'g/L' },
    ],
    note: "Base du milieu SOC, sans glucose. Utilisé pour la préparation de cellules compétentes (méthode Inoue, protocole Hanahan). La faible teneur en NaCl et la présence de Mg2+ sont essentielles à l'intégrité membranaire. Le Mg est ajouté après autoclavage sous forme de solution stérile 2 M. Également utilisé comme milieu de préculture avant transformation.",
  },
  {
    name: 'M9 minimal', category: 'Bactéries', ph: '7,4',
    components: [
      { name: 'Na2HPO4·7H2O', qty: '12.8', unit: 'g/L' },
      { name: 'KH2PO4', qty: '3', unit: 'g/L' },
      { name: 'NaCl', qty: '0.5', unit: 'g/L' },
      { name: 'NH4Cl', qty: '1', unit: 'g/L' },
      { name: 'MgSO4 (1 M)', qty: '2', unit: 'mL/L' },
      { name: 'CaCl2 (1 M)', qty: '0.1', unit: 'mL/L' },
      { name: 'Glucose (20 %)', qty: '20', unit: 'mL/L' },
    ],
    note: "Milieu minéral défini pour les études métaboliques, le marquage isotopique (15N, 13C) et les expériences de régulation génétique. La source unique d'azote (NH4Cl) et de carbone (glucose) permet un contrôle précis de la croissance. Préparer les sels 5x, autoclaver, puis ajouter stérilement MgSO4 (1 M), CaCl2 (1 M) et la source de carbone (glucose 20 % filtré). Pour le marquage, remplacer NH4Cl par 15NH4Cl et/ou le glucose par du 13C-glucose. Ajouter de la thiamine (1 µg/mL) pour les souches auxotrophes. Temps de génération ~60 min pour E. coli K-12.",
  },
  {
    name: 'BHI (Brain Heart Infusion)', category: 'Bactéries', ph: '7,4',
    components: [{ name: 'BHI en poudre', qty: '37', unit: 'g/L' }],
    note: "Milieu très riche à base d'infusion de cerveau et de cœur de bœuf, additionné de peptone et de glucose. Standard pour la culture des pathogènes exigeants : Listeria monocytogenes, streptocoques (dont S. pneumoniae), staphylocoques, entérocoques, Neisseria, Haemophilus (avec les facteurs X et V). Également utilisé pour les hémocultures et la préparation d'inocula. Autoclavage 121 °C, 15 min. Pour du BHI-agar, ajouter 15 g/L d'agar. Ne pas surchauffer : les sucres peuvent caraméliser.",
  },
  {
    name: 'MH (Mueller-Hinton)', category: 'Bactéries', ph: '7,3',
    components: [{ name: 'MH en poudre', qty: '21', unit: 'g/L' }],
    note: "Milieu de référence internationale pour les tests de sensibilité aux antibiotiques (antibiogramme) selon les normes CLSI et EUCAST. L'amidon qu'il contient absorbe les métabolites toxiques, et sa faible teneur en inhibiteurs des sulfamides et du triméthoprime en fait le milieu idéal pour les CMI. Pour les organismes exigeants, utiliser le MH-F (MH + sang de cheval 5 % + β-NAD 20 mg/L). L'épaisseur de la gélose doit être exactement de 4 mm pour la diffusion en disque. Le pH final doit être vérifié entre 7,2 et 7,4 à 25 °C.",
  },
  {
    name: 'TSB (Tryptic Soy Broth)', category: 'Bactéries', ph: '7,3',
    components: [{ name: 'TSB en poudre', qty: '30', unit: 'g/L' }],
    note: "Milieu polyvalent à base de digestats de caséine et de soja, enrichi en glucose et en NaCl. Permet la croissance d'un large spectre de bactéries aérobies et anaérobies facultatives. Utilisé comme milieu de référence pour les contrôles de stérilité (Pharmacopée), la culture de Staphylococcus aureus et de Pseudomonas aeruginosa, et comme base pour les milieux enrichis (TSB + sang). Pour le TSA (Tryptic Soy Agar), ajouter 15 g/L d'agar. Autoclavage standard 121 °C, 15 min.",
  },
  {
    name: 'NB (Nutrient Broth)', category: 'Bactéries', ph: '6,8',
    components: [
      { name: 'Extrait de viande', qty: '1', unit: 'g/L' },
      { name: 'Extrait de levure', qty: '2', unit: 'g/L' },
      { name: 'Peptone', qty: '5', unit: 'g/L' },
      { name: 'NaCl', qty: '5', unit: 'g/L' },
    ],
    note: "Milieu général relativement pauvre, adapté à l'entretien de souches peu exigeantes et aux études de croissance en conditions limitantes. Composition simple et reproductible. Utilisé dans les protocoles pédagogiques et pour la culture de Bacillus, de certains Pseudomonas et d'entérobactéries. Faible coût. Pour le Nutrient Agar, ajouter 15 g/L d'agar. Déconseillé pour les bactéries exigeantes ou les pathogènes difficiles.",
  },
  {
    name: 'MacConkey', category: 'Bactéries', ph: '7,1',
    components: [{ name: 'MacConkey en poudre', qty: '50', unit: 'g/L' }],
    note: "Milieu sélectif et différentiel. Les sels biliaires et le cristal violet inhibent les bactéries à Gram positif. Le lactose et l'indicateur rouge neutre distinguent les bactéries qui fermentent le lactose (colonies roses ou rouges : E. coli, Klebsiella) de celles qui ne le fermentent pas (colonies incolores ou transparentes : Salmonella, Shigella, Pseudomonas). Essentiel en microbiologie clinique pour l'isolement primaire à partir de selles, d'urines et de prélèvements polymicrobiens. Ne pas autoclaver au-delà de 121 °C, 15 min, pour préserver les propriétés différentielles.",
  },
  {
    name: 'LA (LB agar)', category: 'Bactéries', ph: '7,0',
    components: [
      { name: 'Tryptone', qty: '10', unit: 'g/L' },
      { name: 'Extrait de levure', qty: '5', unit: 'g/L' },
      { name: 'NaCl', qty: '10', unit: 'g/L' },
      { name: 'Agar', qty: '15', unit: 'g/L' },
    ],
    note: "Version solide du LB, base de la quasi-totalité des boîtes de sélection en biologie moléculaire. Dissoudre les composants, ajuster le pH à 7,0 avec NaOH 5 N, autoclaver. Laisser refroidir à ~55 °C au bain-marie avant d'ajouter les antibiotiques, l'IPTG (0,1 à 1 mM) et/ou le X-Gal (40 µg/mL) pour le criblage bleu/blanc. Couler ~25 mL par boîte de 90 mm (épaisseur ~4 mm). Les boîtes se conservent 4 à 6 semaines à 4 °C en sac plastique sans antibiotique, 1 à 2 semaines avec antibiotique.",
  },

  // --- Levures ---
  {
    name: 'YPD (YEPD)', category: 'Levures', ph: '6,5',
    components: [
      { name: 'Extrait de levure', qty: '10', unit: 'g/L' },
      { name: 'Peptone', qty: '20', unit: 'g/L' },
      { name: 'Glucose', qty: '20', unit: 'g/L' },
    ],
    note: "Milieu riche de référence pour Saccharomyces cerevisiae et la plupart des levures de laboratoire. L'extrait de levure fournit les vitamines B et des acides aminés, la peptone une source d'azote complexe, et le glucose à 2 % la source de carbone fermentescible. Croissance optimale à 30 °C. Pour les milieux solides, ajouter 20 g/L d'agar. Important : autoclaver le glucose séparément (ou ajouter du glucose stérile après autoclavage) pour éviter les réactions de Maillard (brunissement), qui peuvent inhiber la croissance. Temps de génération ~90 min en phase exponentielle.",
  },
  {
    name: 'YPD + agar', category: 'Levures', ph: '6,5',
    components: [
      { name: 'Extrait de levure', qty: '10', unit: 'g/L' },
      { name: 'Peptone', qty: '20', unit: 'g/L' },
      { name: 'Glucose', qty: '20', unit: 'g/L' },
      { name: 'Agar', qty: '20', unit: 'g/L' },
    ],
    note: "Version solide du YPD pour les boîtes de Petri. Concentration d'agar légèrement supérieure (20 g/L au lieu de 15 g/L), car le pH plus acide des milieux pour levures demande plus d'agar pour bien gélifier. Même protocole de stérilisation. Laisser refroidir à ~55 °C avant de couler. Pour la sélection à la généticine (G418), ajouter 200 à 400 µg/mL après refroidissement. Les boîtes de YPD se conservent bien 2 à 3 semaines à 4 °C.",
  },
  {
    name: 'YPG (glycérol)', category: 'Levures', ph: '6,5',
    components: [
      { name: 'Extrait de levure', qty: '10', unit: 'g/L' },
      { name: 'Peptone', qty: '20', unit: 'g/L' },
      { name: 'Glycérol', qty: '30', unit: 'mL/L' },
    ],
    note: "Milieu riche où le glycérol (3 %), source de carbone non fermentescible, remplace le glucose. Force la respiration mitochondriale et empêche la fermentation. Utilisé pour vérifier la compétence mitochondriale (les mutants petite rho-/rho0 ne poussent pas), étudier le métabolisme oxydatif et distinguer les mutants respiratoires. Croissance plus lente que sur YPD. Également utilisé avec 2 à 3 % d'éthanol (YPE) pour les mêmes applications. Incuber au moins 2 à 3 jours à 30 °C.",
  },
  {
    name: 'SD (Synthetic Defined)', category: 'Levures', ph: '5,8',
    components: [
      { name: 'YNB sans acides aminés', qty: '6.7', unit: 'g/L' },
      { name: 'Glucose', qty: '20', unit: 'g/L' },
      { name: 'Mélange dropout', qty: 'variable', unit: '' },
    ],
    note: "Milieu synthétique minimal pour la sélection de marqueurs d'auxotrophie chez la levure. Le YNB (Yeast Nitrogen Base) fournit les sels minéraux, les vitamines et le sulfate d'ammonium comme source d'azote. Le mélange dropout contient tous les acides aminés et bases SAUF celui ou ceux utilisés comme marqueurs de sélection (URA3, LEU2, TRP1, HIS3, LYS2, ADE2). Par exemple, le SD-Ura sélectionne les transformants portant le marqueur URA3. Ajuster le pH à 5,8 avec NaOH. Stériliser par filtration si possible (le YNB est thermosensible) ou autoclaver brièvement. Ajouter 20 g/L d'agar pour un milieu solide.",
  },
  {
    name: 'SC (Synthetic Complete)', category: 'Levures', ph: '5,8',
    components: [
      { name: 'YNB sans acides aminés', qty: '6.7', unit: 'g/L' },
      { name: 'Glucose', qty: '20', unit: 'g/L' },
      { name: 'Acides aminés complets', qty: '2', unit: 'g/L' },
    ],
    note: "Version complète du milieu SD, avec tous les acides aminés et les bases nucléiques. Sert de témoin positif de croissance et de milieu défini pour les expériences où la composition exacte du milieu compte (contrairement au YPD). Le mélange complet comprend typiquement adénine, uracile, tryptophane, histidine, leucine, lysine, méthionine et tous les autres acides aminés standard. Utilisé pour la préculture avant passage en milieu sélectif. Même préparation que le SD.",
  },
  {
    name: 'YPD + G418', category: 'Levures', ph: '6,5',
    components: [
      { name: 'Extrait de levure', qty: '10', unit: 'g/L' },
      { name: 'Peptone', qty: '20', unit: 'g/L' },
      { name: 'Glucose', qty: '20', unit: 'g/L' },
      { name: 'G418', qty: '200', unit: 'mg/L' },
    ],
    note: "YPD additionné de généticine (G418) pour sélectionner les levures portant la cassette de résistance KanMX (gène kanR de Tn903). Concentration standard 200 µg/mL, variable de 100 à 400 µg/mL selon la souche et le niveau d'expression. Attention : le G418 est inactivé par l'autoclavage ; toujours l'ajouter après refroidissement à ~55 °C pour le milieu solide, ou après autoclavage pour le liquide. Les cellules doivent être en phase active pour être sensibles : précultiver 4 à 6 h en YPD avant d'étaler. Le G418 perd de son activité au stockage ; les boîtes ne se conservent que 1 à 2 semaines à 4 °C.",
  },

  // --- Mycologie ---
  {
    name: 'SDA (Sabouraud Dextrose Agar)', category: 'Mycologie', ph: '5,6',
    components: [
      { name: 'Peptone', qty: '10', unit: 'g/L' },
      { name: 'Glucose (dextrose)', qty: '40', unit: 'g/L' },
      { name: 'Agar', qty: '15', unit: 'g/L' },
    ],
    note: "Milieu de référence pour l'isolement et la culture des champignons filamenteux et des levures pathogènes. Le pH acide (5,6) et la forte concentration en glucose (4 %) inhibent naturellement la plupart des bactéries. Formule originale de Raymond Sabouraud (1892) pour les dermatophytes. Utilisé pour l'isolement de Candida spp., des dermatophytes (Trichophyton, Microsporum, Epidermophyton) et des champignons dimorphiques. Pour augmenter la sélectivité, ajouter du chloramphénicol (50 µg/mL) et/ou du cycloheximide (actidione, 500 µg/mL). Incubation à 25-30 °C ; surveiller les cultures jusqu'à 4 semaines pour les champignons à croissance lente.",
  },
  {
    name: 'SDB (Sabouraud Dextrose Broth)', category: 'Mycologie', ph: '5,6',
    components: [
      { name: 'Peptone', qty: '10', unit: 'g/L' },
      { name: 'Glucose (dextrose)', qty: '20', unit: 'g/L' },
    ],
    note: "Version liquide du Sabouraud, avec une concentration en glucose réduite à 2 % (standard) pour la culture en suspension de levures et de champignons filamenteux. Utilisé pour la production de biomasse fongique, la préparation d'inocula standardisés pour les tests d'antifongiques et les cultures agitées. La culture en milieu liquide donne des suspensions homogènes de Candida pour les tests de sensibilité aux antifongiques (méthode de microdilution). Incuber à 30 °C sous agitation modérée (150 à 200 rpm) pour les champignons filamenteux.",
  },
  {
    name: 'PDA (Potato Dextrose Agar)', category: 'Mycologie', ph: '5,6',
    components: [
      { name: 'Infusion de pomme de terre', qty: '200', unit: 'g/L' },
      { name: 'Glucose', qty: '20', unit: 'g/L' },
      { name: 'Agar', qty: '15', unit: 'g/L' },
    ],
    note: "Milieu naturel riche qui favorise la sporulation et la pigmentation des champignons filamenteux. L'infusion de pomme de terre fournit l'amidon et des facteurs de croissance qui stimulent la production de conidies et la coloration caractéristique des colonies (essentielle à l'identification morphologique). Utilisé pour l'identification de Fusarium, Aspergillus, Penicillium et des champignons phytopathogènes. Infusion maison : faire bouillir 200 g de pommes de terre épluchées dans 1 L d'eau pendant 30 min, filtrer, puis ajouter le glucose et l'agar. Ou utiliser la poudre commerciale déshydratée (39 g/L). Incubation à 25 °C, 5 à 14 jours.",
  },
  {
    name: 'PDB (Potato Dextrose Broth)', category: 'Mycologie', ph: '5,1',
    components: [{ name: 'PDB en poudre', qty: '24', unit: 'g/L' }],
    note: "Version liquide du PDA pour la culture en suspension de champignons filamenteux. Utilisé pour la production de biomasse mycélienne, l'extraction de métabolites secondaires (mycotoxines, antibiotiques fongiques) et la préparation de filtrats de culture. En culture agitée (150 rpm, 25-28 °C), on obtient des pelotes mycéliennes ou une croissance dispersée selon l'espèce et les conditions. Pour les champignons entomopathogènes (Beauveria, Metarhizium), c'est le milieu standard de production de blastospores et de conidies submergées.",
  },
  {
    name: 'CYA (Czapek Yeast Agar)', category: 'Mycologie', ph: '6,2',
    components: [
      { name: 'Saccharose', qty: '30', unit: 'g/L' },
      { name: 'NaNO3', qty: '3', unit: 'g/L' },
      { name: 'K2HPO4', qty: '1', unit: 'g/L' },
      { name: 'MgSO4·7H2O', qty: '0.5', unit: 'g/L' },
      { name: 'KCl', qty: '0.5', unit: 'g/L' },
      { name: 'FeSO4·7H2O', qty: '0.01', unit: 'g/L' },
      { name: 'Extrait de levure', qty: '5', unit: 'g/L' },
      { name: 'Agar', qty: '15', unit: 'g/L' },
    ],
    note: "Milieu semi-synthétique standard pour l'identification taxonomique des Aspergillus et des Penicillium (méthode de Pitt et Samson). Le saccharose comme unique source de carbone et le nitrate de sodium comme source d'azote minéral donnent des morphologies coloniales et des pigmentations diagnostiques. Les colonies sont examinées après 7 jours à 25 °C et à 37 °C (thermotolérance). Le CYA fait partie du protocole d'identification standardisé sur trois milieux (CYA, MEA, G25N) recommandé par le Westerdijk Fungal Biodiversity Institute (CBS). L'extrait de levure (variante CY20S) améliore la croissance des espèces exigeantes.",
  },
  {
    name: 'MEA (Malt Extract Agar)', category: 'Mycologie', ph: '5,4',
    components: [
      { name: 'Extrait de malt', qty: '20', unit: 'g/L' },
      { name: 'Glucose', qty: '20', unit: 'g/L' },
      { name: 'Peptone', qty: '1', unit: 'g/L' },
      { name: 'Agar', qty: '20', unit: 'g/L' },
    ],
    note: "Milieu qui favorise la sporulation et la production de pigments chez les champignons. L'extrait de malt, riche en maltose et en dextrines, fournit un substrat complexe qui stimule la différenciation (têtes aspergillaires, pénicilles et autres structures reproductrices). Fait partie du jeu de milieux standardisés pour l'identification des moisissures (avec le CYA et le G25N). Les caractères macromorphologiques (diamètre, texture, couleur au recto et au verso, exsudat, pigment diffusible) sont notés après 7 jours à 25 °C. Le pH relativement acide (5,4) favorise les champignons par rapport aux bactéries contaminantes.",
  },
  {
    name: 'RPMI 1640 + MOPS', category: 'Mycologie', ph: '7,0',
    components: [
      { name: 'RPMI 1640 en poudre', qty: '10.4', unit: 'g/L' },
      { name: 'MOPS', qty: '34.53', unit: 'g/L' },
      { name: 'Glucose', qty: '18', unit: 'g/L' },
    ],
    note: "Milieu de référence du CLSI (documents M27 et M38) et de l'EUCAST pour la détermination des CMI des antifongiques contre les levures (Candida, Cryptococcus) et les moisissures (Aspergillus, Fusarium). Le RPMI 1640 est un milieu de culture cellulaire qui apporte acides aminés, vitamines et sels. Le tampon MOPS (0,165 M) maintient le pH à 7,0 pendant la croissance. Attention : ne PAS autoclaver ; toujours stériliser par filtration (0,22 µm), car le milieu contient du glucose et des acides aminés thermolabiles. Supplémenter en glucose jusqu'à 2 % final (la formulation de base n'en contient que 0,2 %). Conservation 1 mois à 4 °C.",
  },

  // --- Plantes ---
  {
    name: 'MS (Murashige et Skoog)', category: 'Plantes', ph: '5,7',
    components: [
      { name: 'Macroéléments MS', qty: '4.33', unit: 'g/L' },
      { name: 'Microéléments MS', qty: 'inclus', unit: '' },
      { name: 'Vitamines MS (thiamine, pyridoxine, acide nicotinique, glycine)', qty: 'inclus', unit: '' },
      { name: 'myo-Inositol', qty: '0.1', unit: 'g/L' },
      { name: 'Saccharose', qty: '30', unit: 'g/L' },
      { name: 'Agar (Phytagel)', qty: '8', unit: 'g/L' },
    ],
    note: "Milieu de référence universel pour la culture in vitro de tissus végétaux, mis au point en 1962 par Murashige et Skoog pour le tabac (Nicotiana tabacum). Contient des concentrations élevées de nitrate (NO3- 39,4 mM) et d'ammonium (NH4+ 20,6 mM) comme sources d'azote, ainsi que 13 microéléments (Fe-EDTA, Mn, Zn, B, Cu, Co, Mo, I). Le saccharose à 3 % sert de source de carbone (les explants ne sont pas autotrophes in vitro). Le pH est déterminant : l'ajuster à 5,7 avec KOH 1 N AVANT autoclavage (il baisse d'environ 0,3 à 0,5 unité après). Utiliser du Phytagel (2,5 g/L) ou de l'agar végétal (6 à 8 g/L) pour la gélification. Ajouter les hormones (auxines, cytokinines) avant autoclavage, sauf l'IAA et le GA3 (thermolabiles, à stériliser par filtration). Milieu de base pour la micropropagation, l'organogenèse, l'embryogenèse somatique et la transformation génétique de la plupart des espèces végétales.",
  },
  {
    name: 'MS + BAP + NAA (multiplication)', category: 'Plantes', ph: '5,7',
    components: [
      { name: 'Sels MS + vitamines', qty: '4.43', unit: 'g/L' },
      { name: 'myo-Inositol', qty: '0.1', unit: 'g/L' },
      { name: 'Saccharose', qty: '30', unit: 'g/L' },
      { name: 'BAP (6-benzylaminopurine)', qty: '1', unit: 'mg/L' },
      { name: 'NAA (acide naphtalèneacétique)', qty: '0.1', unit: 'mg/L' },
      { name: 'Agar', qty: '8', unit: 'g/L' },
    ],
    note: "Milieu MS supplémenté en cytokinines pour la multiplication végétative (micropropagation). Le rapport cytokinines/auxines élevé (BAP 1 mg/L >> NAA 0,1 mg/L) favorise la prolifération des bourgeons axillaires et adventifs. Utilisé pour la multiplication de masse in vitro d'espèces ornementales (orchidées, rosiers), fruitières (bananiers, fraisiers) et forestières. La BAP (ou BA) est la cytokinine la plus utilisée ; alternatives : kinétine, TDZ (thidiazuron) pour les espèces récalcitrantes. La concentration optimale varie selon l'espèce (0,5 à 5 mg/L de BAP). Repiquages toutes les 3 à 4 semaines. Taux de multiplication typique : 3 à 8 par cycle selon l'espèce.",
  },
  {
    name: 'MS + IBA (enracinement)', category: 'Plantes', ph: '5,7',
    components: [
      { name: 'Sels MS demi-force', qty: '2.22', unit: 'g/L' },
      { name: 'myo-Inositol', qty: '0.05', unit: 'g/L' },
      { name: 'Saccharose', qty: '20', unit: 'g/L' },
      { name: 'IBA (acide indole-3-butyrique)', qty: '0.5', unit: 'mg/L' },
      { name: 'Agar', qty: '8', unit: 'g/L' },
    ],
    note: "Milieu d'enracinement à demi-force en sels MS. La réduction de la concentration en sels minéraux et en saccharose (2 % au lieu de 3 %) stimule la rhizogenèse. L'IBA (acide indole-3-butyrique) est l'auxine de choix pour l'enracinement, car elle est plus stable et moins phytotoxique que l'IAA ou le 2,4-D. Concentrations typiques : 0,1 à 2 mg/L selon l'espèce. Certaines espèces s'enracinent mieux sur milieu sans hormones (enracinement spontané) ou en présence de charbon actif (0,5 à 1 g/L), qui adsorbe les inhibiteurs. L'enracinement prend 2 à 4 semaines. Les plantules enracinées sont ensuite acclimatées progressivement ex vitro (mini-serre, substrat stérile).",
  },
  {
    name: 'MS + 2,4-D (callogenèse)', category: 'Plantes', ph: '5,7',
    components: [
      { name: 'Sels MS + vitamines', qty: '4.43', unit: 'g/L' },
      { name: 'myo-Inositol', qty: '0.1', unit: 'g/L' },
      { name: 'Saccharose', qty: '30', unit: 'g/L' },
      { name: '2,4-D (acide 2,4-dichlorophénoxyacétique)', qty: '2', unit: 'mg/L' },
      { name: 'Agar', qty: '8', unit: 'g/L' },
    ],
    note: "Milieu d'induction de cal (tissu indifférencié). Le 2,4-D est une auxine de synthèse puissante qui provoque la dédifférenciation cellulaire et la formation de cal à partir de divers explants (feuilles, tiges, racines, embryons immatures). Concentrations typiques : 0,5 à 5 mg/L. Le cal obtenu peut être entretenu par repiquages réguliers (3 à 4 semaines) et orienté vers l'embryogenèse somatique en retirant le 2,4-D et en le transférant sur un milieu avec BAP. Le 2,4-D sert aussi à l'induction d'embryons somatiques chez les céréales (blé, maïs, riz), les palmiers (palmier à huile, dattier) et les conifères. Attention : à forte concentration, le 2,4-D est un herbicide ; le manipuler avec précaution. Stériliser par filtration ou autoclaver brièvement (il est stable à la chaleur).",
  },
  {
    name: 'B5 (Gamborg)', category: 'Plantes', ph: '5,5',
    components: [
      { name: 'Macroéléments B5', qty: '3.21', unit: 'g/L' },
      { name: 'Microéléments B5', qty: 'inclus', unit: '' },
      { name: 'Vitamines B5 (thiamine 10 mg/L, pyridoxine 1 mg/L, acide nicotinique 1 mg/L)', qty: 'inclus', unit: '' },
      { name: 'myo-Inositol', qty: '0.1', unit: 'g/L' },
      { name: 'Saccharose', qty: '20', unit: 'g/L' },
      { name: 'Agar', qty: '8', unit: 'g/L' },
    ],
    note: "Milieu mis au point par Gamborg et al. (1968) pour la culture de cellules de soja (Glycine max) en suspension. Principales différences avec le MS : beaucoup moins d'ammonium (NH4+ 2 mM contre 20,6 mM dans le MS), dix fois plus de thiamine (10 mg/L) et du KNO3 comme source principale d'azote (25 mM). Il est donc mieux adapté aux légumineuses (soja, pois, luzerne) et aux espèces sensibles à l'ammonium. Le saccharose y est généralement à 2 % (contre 3 % pour le MS). Également recommandé pour la culture de protoplastes et les suspensions cellulaires. Le B5 est souvent modifié avec les vitamines MS, en compromis (sels B5 + vitamines MS).",
  },
  {
    name: 'WPM (Woody Plant Medium)', category: 'Plantes', ph: '5,2',
    components: [
      { name: 'Sels WPM', qty: '2.46', unit: 'g/L' },
      { name: 'Vitamines MS', qty: 'inclus', unit: '' },
      { name: 'myo-Inositol', qty: '0.1', unit: 'g/L' },
      { name: 'Saccharose', qty: '30', unit: 'g/L' },
      { name: 'Agar (Phytagel)', qty: '8', unit: 'g/L' },
    ],
    note: "Milieu mis au point par Lloyd et McCown (1980) spécialement pour la micropropagation des espèces ligneuses (arbres et arbustes). Les concentrations en sels sont globalement plus faibles que dans le MS (environ la moitié), avec moins de nitrate et d'ammonium, ce qui évite la toxicité saline observée chez de nombreuses espèces forestières et fruitières. Recommandé pour le chêne, le bouleau, l'érable, le rhododendron, le bleuet (Vaccinium), le noyer, le châtaignier, l'eucalyptus et de nombreux fruitiers. Le calcium et le soufre sont apportés sous forme de Ca(NO3)2 et de CaSO4 (au lieu du CaCl2 du MS). pH ajusté à 5,2. Hormones typiques pour la multiplication : BAP 0,5 à 2 mg/L, ou TDZ 0,01 à 0,1 mg/L pour les espèces difficiles.",
  },
  {
    name: 'DKW (Driver et Kuniyuki)', category: 'Plantes', ph: '5,5',
    components: [
      { name: 'Sels DKW', qty: '5.23', unit: 'g/L' },
      { name: 'Vitamines DKW', qty: 'inclus', unit: '' },
      { name: 'myo-Inositol', qty: '0.1', unit: 'g/L' },
      { name: 'Saccharose', qty: '30', unit: 'g/L' },
      { name: 'Agar', qty: '8', unit: 'g/L' },
    ],
    note: "Milieu mis au point par Driver et Kuniyuki (1984) pour la culture in vitro du noyer (Juglans). Concentration en calcium très élevée (par rapport au MS et au WPM), sous forme de Ca(NO3)2, qui prévient la nécrose apicale fréquente chez le noyer et les autres Juglandacées. Également riche en soufre (MgSO4 + thiamine). Devenu le milieu de référence pour les Juglandacées (noyer commun, noyer noir, pacanier), il donne aussi de bons résultats sur le cerisier, le prunier et certains Prunus. Souvent utilisé avec BAP (1 à 5 µM) + IBA (0,01 à 0,1 µM) pour la multiplication. La thiamine (2 mg/L) et l'acide nicotinique (1 mg/L) y sont plus concentrés que dans le MS.",
  },
  {
    name: 'N6 (Chu)', category: 'Plantes', ph: '5,8',
    components: [
      { name: 'Macroéléments N6', qty: '3.96', unit: 'g/L' },
      { name: 'Microéléments N6', qty: 'inclus', unit: '' },
      { name: 'Vitamines N6 (thiamine 1 mg/L, pyridoxine 0,5 mg/L, glycine 2 mg/L)', qty: 'inclus', unit: '' },
      { name: 'Saccharose', qty: '50', unit: 'g/L' },
      { name: 'Agar', qty: '8', unit: 'g/L' },
    ],
    note: "Milieu mis au point par Chu et al. (1975) pour la culture d'anthères et la production d'haploïdes chez le riz (Oryza sativa). Particularités : forte concentration en KNO3 (28 mM) mais pas de NH4NO3 (remplacé par (NH4)2SO4 à 3,5 mM), et saccharose à 5 % (plus que dans le MS). Devenu le milieu standard pour l'androgenèse (culture d'anthères et de microspores) chez les céréales (riz, blé, orge), l'induction de cal embryogène chez le riz et le maïs, et la régénération d'haploïdes doublés. Pour l'androgenèse du riz : N6 + 2,4-D 2 mg/L + hydrolysat de caséine 500 mg/L + proline 500 mg/L. Les anthères au stade uninucléé sont cultivées à 25 °C à l'obscurité pendant 3 à 4 semaines pour induire le cal.",
  },
  {
    name: 'LS (Linsmaier et Skoog)', category: 'Plantes', ph: '5,7',
    components: [
      { name: 'Macroéléments MS', qty: '4.33', unit: 'g/L' },
      { name: 'Microéléments MS', qty: 'inclus', unit: '' },
      { name: 'Thiamine-HCl', qty: '0.4', unit: 'mg/L' },
      { name: 'myo-Inositol', qty: '0.1', unit: 'g/L' },
      { name: 'Saccharose', qty: '30', unit: 'g/L' },
      { name: 'Agar', qty: '8', unit: 'g/L' },
    ],
    note: "Version simplifiée du milieu MS mise au point par Linsmaier et Skoog (1965). Mêmes sels minéraux que le MS, mais vitamines réduites à la seule thiamine (0,4 mg/L) et au myo-inositol (100 mg/L) : la pyridoxine, l'acide nicotinique et la glycine se sont révélés non essentiels pour la plupart des cultures. Utilisé comme alternative au MS quand on souhaite simplifier le milieu. Particulièrement recommandé pour les cultures de tabac (Nicotiana) et de carotte (Daucus carota), et pour les études fondamentales de nutrition minérale in vitro. Même préparation que le MS : ajuster le pH à 5,7, autoclaver 15 min à 121 °C.",
  },
  {
    name: 'White', category: 'Plantes', ph: '5,5',
    components: [
      { name: 'Sels de White', qty: '0.74', unit: 'g/L' },
      { name: 'Vitamines de White (thiamine, pyridoxine, acide nicotinique, glycine)', qty: 'inclus', unit: '' },
      { name: 'Saccharose', qty: '20', unit: 'g/L' },
      { name: 'Agar', qty: '8', unit: 'g/L' },
    ],
    note: "L'un des premiers milieux mis au point pour la culture de tissus végétaux (White, 1943), conçu à l'origine pour la culture de racines excisées de tomate. Concentrations minérales très faibles par rapport au MS (environ 6 fois moins de sels au total). Malgré son ancienneté, il reste utilisé pour la culture de racines isolées, la culture d'organes (ovules, embryons) et comme milieu de base pour certaines espèces tropicales sensibles aux fortes concentrations en sels. Contient du glycérophosphate de sodium comme source de phosphore (cas unique parmi les milieux classiques). Également utilisé pour la culture de tissus de gymnospermes (conifères), qui préfèrent les milieux dilués.",
  },
  {
    name: 'MS germination (sans hormones)', category: 'Plantes', ph: '5,7',
    components: [
      { name: 'Sels MS demi-force', qty: '2.22', unit: 'g/L' },
      { name: 'Vitamines MS', qty: 'inclus', unit: '' },
      { name: 'Saccharose', qty: '10', unit: 'g/L' },
      { name: 'Agar', qty: '8', unit: 'g/L' },
    ],
    note: "Milieu MS à demi-force sans hormones de croissance, pour la germination in vitro de graines (après stérilisation de surface) et l'obtention de plantules axéniques servant de source d'explants stériles. Le saccharose est réduit à 1 %, car les graines ont leurs propres réserves. Les graines sont stérilisées en surface (éthanol 70 % 30 s, puis NaOCl 2 à 5 % 10 à 20 min, rinçages à l'eau stérile) puis déposées sur le milieu. Également utilisé pour la germination d'embryons immatures (sauvetage d'embryons) après croisements intergénériques ou interspécifiques, et pour la germination de graines d'orchidées (protocormes). Culture en chambre à 22-25 °C, 16 h de lumière pour 8 h d'obscurité.",
  },
];
