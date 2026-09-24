// Hôte d'Open Vector Editor, dans un cadre isolé de Paillasse (OVE a son propre React et son CSS global).
// Dialogue avec la page parente par postMessage, même origine uniquement :
//   parent → cadre : { type: 'load', sequenceData, readOnly }   { type: 'request' }
//   cadre → parent : { type: 'ready' }   { type: 'change', sequenceData }   { type: 'freeze' } (Ctrl/Cmd+S)
(function () {
  const PROTOCOL = 2; // à augmenter à chaque changement des messages (la page vérifie qu'on n'utilise pas un ancien fichier en cache)
  const origin = window.location.origin;
  const post = (msg) => window.parent.postMessage(msg, origin);
  const create = window.createVectorEditor || (window.ove && window.ove.createVectorEditor);
  let editor = null;
  let readOnly = false;

  // L'affichage (calques, enzymes, vues) est piloté par le ruban de Paillasse : OVE ne garde que ces outils
  const TOOLS_EDIT = ['undoTool', 'redoTool', 'findTool'];
  const TOOLS_READ = ['findTool'];
  let circular = true;

  const ENZYME_FILTERS = {
    single: [{ value: 'single', label: 'Single cutters', cutsThisManyTimes: 1 }],
    double: [{ value: 'double', label: 'Double cutters', cutsThisManyTimes: 2 }],
    both: [{ value: 'single', label: 'Single cutters', cutsThisManyTimes: 1 }, { value: 'double', label: 'Double cutters', cutsThisManyTimes: 2 }],
  };

  /** Réglages d'affichage de Paillasse → état d'OVE. */
  function viewState(view = {}) {
    const map = { id: circular ? 'circular' : 'rail', name: circular ? 'Carte circulaire' : 'Carte linéaire', active: true };
    const seq = { id: 'sequence', name: 'Séquence', active: true };
    const layouts = { both: [[map], [seq]], map: [[map]], sequence: [[seq]] };
    const enzymes = view.enzymes ?? 'single';
    return {
      panelsShown: layouts[view.layout] ?? layouts.both,
      annotationVisibility: {
        features: view.features ?? true,
        primers: view.primers ?? true,
        cutsites: enzymes !== 'none',
        orfs: Boolean(view.orfs),
        translations: Boolean(view.translations),
        parts: false,
      },
      ...(enzymes !== 'none' ? { restrictionEnzymes: { isEnzymeFilterAnd: false, filteredRestrictionEnzymes: ENZYME_FILTERS[enzymes] } } : {}),
    };
  }

  let container = null;

  function build() {
    // Nouveau conteneur à chaque reconstruction : OVE démonte (et retire) l'ancien à la fermeture
    if (editor) editor.close?.();
    container?.remove();
    document.getElementById('status')?.remove();
    container = document.createElement('div');
    container.style.height = '100%';
    document.getElementById('editor').appendChild(container);
    editor = create(container, {
      shouldAutosave: true,
      showReadOnly: false,
      disableSetReadOnly: true,
      withRotateCircularView: true,
      // Sélection dans l'éditeur → page parente (région proposée aux outils : amorces…)
      onSelectionOrCaretChanged(arg) {
        const layer = (arg && arg.selectionLayer) || {};
        post({ type: 'selection', start: Number.isInteger(layer.start) ? layer.start : -1, end: Number.isInteger(layer.end) ? layer.end : -1 });
      },
      onSave(_event, sequenceData, _state, onSuccess) {
        if (!readOnly) post({ type: 'change', sequenceData: JSON.parse(JSON.stringify(sequenceData)) });
        onSuccess?.();
      },
      PropertiesProps: { propertiesList: ['general', 'features', 'primers', 'translations', 'cutsites', 'orfs'] },
      ToolBarProps: { toolList: readOnly ? TOOLS_READ : TOOLS_EDIT },
      StatusBarProps: { showCircularity: true, showReadOnly: false, showAvailability: false },
    });
    window.__ove = editor; // accès pour le débogage et les tests automatiques
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== origin || e.source !== window.parent) return;
    const msg = e.data || {};
    if (msg.type === 'load') {
      const mode = Boolean(msg.readOnly);
      if (!editor || mode !== readOnly) {
        readOnly = mode;
        build();
      }
      circular = Boolean(msg.sequenceData.circular);
      editor.updateEditor({
        sequenceData: msg.sequenceData,
        readOnly,
        sequenceDataHistory: {},
        ...viewState(msg.view),
      });
    } else if (msg.type === 'view' && editor) {
      editor.updateEditor(viewState(msg.view));
    } else if (msg.type === 'select' && editor) {
      // Sélection demandée par Paillasse (liste d'annotations, d'enzymes…) : la vue séquence défile jusqu'à elle
      editor.updateEditor({ selectionLayer: { start: msg.start, end: msg.end } });
      post({ type: 'selection', start: msg.start, end: msg.end });
    } else if (msg.type === 'getSelection' && editor) {
      const layer = editor.getState().selectionLayer || {};
      post({ type: 'selection', start: Number.isInteger(layer.start) ? layer.start : -1, end: Number.isInteger(layer.end) ? layer.end : -1, requested: true });
    } else if (msg.type === 'request' && editor) {
      post({ type: 'change', sequenceData: JSON.parse(JSON.stringify(editor.getState().sequenceData)), requested: true });
    }
  });

  // Ctrl/Cmd + S dans l'éditeur : figer une version (comme dans le cahier)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      post({ type: 'freeze' });
    }
  }, true);

  if (!create) {
    document.getElementById('status').textContent = "L'éditeur n'a pas pu être chargé (public/vendor/ove manquant : relancer npm install).";
    return;
  }
  post({ type: 'ready', protocol: PROTOCOL });
})();
