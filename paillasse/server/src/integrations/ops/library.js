// Jeux de données statistiques, modèles d'entrée, produits (calculs) et marqueurs de taille (gels).
import crypto from 'node:crypto';
import { query } from '../../db.js';
import { assertDataset } from '../../lib/access.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { KINDS, KIND_LABELS } from '../../lib/stat.js';
import { docToMarkdown } from '../../lib/markdown.js';
import { templateOutline, templateTools } from '../../lib/templates.js';
import { createDataset, listDatasets, loadDataset } from '../../routes/datasets.js';
import { define } from '../registry.js';
import { int, list, oneOf, params, str, uuid } from '../schema.js';
import { compact, isoTime, webUrl } from './common.js';

// --- Jeux de données (outil Statistiques) ---------------------------------------------------------------------

const KIND_HELP = 'column (groupes à comparer : une colonne par groupe), xy (X et séries Y, réplicats), grouped (deux facteurs, '
  + 'lignes × colonnes, réplicats), contingency (effectifs : groupes en lignes, issues en colonnes), survival (temps en X ; '
  + '1 = événement, 0 = censuré, par groupe)';
const WITH_X = new Set(['xy', 'survival']);
const WITH_REPLICATES = new Set(['xy', 'grouped']);
const WITH_LABELS = new Set(['column', 'grouped', 'contingency']);

/** Cellule saisie (virgule décimale, comme dans l'atelier) → nombre si c'en est un, sinon texte ; vide → null. */
const cellValue = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.').replace('−', '-'));
  return Number.isFinite(n) ? n : s;
};
const cellText = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

/** Tableau lisible d'un jeu de données : colonnes, lignes { label?, x?, values }. */
function datasetTable(d) {
  const reps = WITH_REPLICATES.has(d.kind) ? Math.max(1, Number(d.replicates) || 1) : 1;
  const columns = (d.columns ?? []).map((c) => c.name);
  const rows = (d.rows ?? []).map((r) => compact({
    label: WITH_LABELS.has(d.kind) ? r.label || undefined : undefined,
    x: WITH_X.has(d.kind) ? cellValue(r.x) : undefined,
    values: (d.columns ?? []).map((c) => {
      const cell = (r.v?.[c.id] ?? []).slice(0, reps).map(cellValue);
      return reps > 1 ? cell : cell[0] ?? null;
    }),
  }));
  return { columns, rows, replicates: reps };
}

/** CSV « ; » à virgule décimale, les cellules telles que saisies : le même que l'export de l'outil Statistiques. */
function datasetCsv(d) {
  const reps = WITH_REPLICATES.has(d.kind) ? Math.max(1, Number(d.replicates) || 1) : 1;
  const columns = d.columns ?? [];
  const head = [...(WITH_X.has(d.kind) ? [d.xTitle || 'X'] : WITH_LABELS.has(d.kind) ? [''] : []),
    ...columns.flatMap((c) => Array.from({ length: reps }, (_, j) => (reps > 1 ? `${c.name} (${j + 1})` : c.name)))];
  const lines = (d.rows ?? []).map((r) => [...(WITH_X.has(d.kind) ? [r.x] : WITH_LABELS.has(d.kind) ? [r.label] : []),
    ...columns.flatMap((c) => Array.from({ length: reps }, (_, j) => r.v?.[c.id]?.[j] ?? ''))]);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [head, ...lines].map((l) => l.map(cell).join(';')).join('\r\n');
}

define({
  name: 'list_datasets',
  title: 'Lister les jeux de données',
  group: 'Statistiques',
  scope: 'read',
  http: { method: 'GET', path: '/datasets' },
  description: `Liste les jeux de données de l’outil Statistiques (titre, type, taille, projet). Types : ${KIND_HELP}.`,
  input: params({
    query: str('Mot du titre.', { maxLength: 200 }),
    kind: oneOf(KINDS, 'Type de tableau.'),
    limit: int('Nombre (1 à 300).', { minimum: 1, maximum: 300, default: 50 }),
  }),
  async handler(a, ctx) {
    const rows = await listDatasets(ctx.user, { q: a.query ?? '', kind: a.kind });
    return {
      datasets: rows.slice(0, a.limit).map((d) => compact({
        id: d.id, title: d.title || 'Sans titre', kind: d.kind, kind_label: KIND_LABELS[d.kind], rows: d.row_count, columns: d.column_count,
        project: d.project_name, updated_at: isoTime(d.updated_at), updated_by: d.updated_by_name, url: webUrl(ctx, `/stats/${d.id}`),
      })),
    };
  },
});

define({
  name: 'get_dataset',
  title: 'Lire un jeu de données',
  group: 'Statistiques',
  scope: 'read',
  http: { method: 'GET', path: '/datasets/{dataset_id}' },
  description: 'Lit un jeu de données : colonnes, lignes (étiquette ou X, valeurs ; une liste par cellule s’il y a des réplicats), '
    + 'réglages de l’analyse ; ou le tableau en CSV (« ; »).',
  input: params({
    dataset_id: uuid('Identifiant du jeu de données.'),
    format: oneOf(['table', 'csv'], 'table (par défaut) ou csv.', { default: 'table' }),
  }, ['dataset_id']),
  async handler(a, ctx) {
    await assertDataset(ctx.user, a.dataset_id);
    const d = await loadDataset(a.dataset_id);
    const base = { id: d.id, title: d.title || 'Sans titre', kind: d.kind, kind_label: KIND_LABELS[d.kind], project: d.project_name, url: webUrl(ctx, `/stats/${d.id}`) };
    if (a.format === 'csv') return compact({ ...base, csv: datasetCsv(d.data) });
    return compact({
      ...base,
      x_title: WITH_X.has(d.kind) ? d.data.xTitle : undefined,
      row_title: d.data.rowTitle, column_title: d.data.colTitle,
      ...datasetTable(d.data),
      analysis: d.data.analysis?.type,
      updated_at: isoTime(d.updated_at),
    });
  },
  text: (r) => (r.csv ? `${r.title} (${r.kind_label})\n\n${r.csv}` : null),
});

define({
  name: 'create_dataset',
  title: 'Créer un jeu de données',
  group: 'Statistiques',
  scope: 'write',
  http: { method: 'POST', path: '/datasets' },
  annotations: { destructiveHint: false, idempotentHint: false },
  description: `Crée un jeu de données pour l’outil Statistiques (l’analyse et le graphique se règlent ensuite dans Paillasse). `
    + `Types : ${KIND_HELP}. rows : une ligne par mesure ; chaque ligne est une liste de valeurs (une par colonne) ou un objet `
    + `{ label, x, values } ; avec réplicats, une valeur peut être une liste. Exemple column : columns ["Témoin","Traité"], `
    + `rows [[12.1, 7.9], [13.4, 8.8]].`,
  input: params({
    title: str('Titre.', { minLength: 1, maxLength: 300 }),
    kind: oneOf(KINDS, 'Type de tableau.'),
    columns: list({ type: 'string', minLength: 1, maxLength: 200 }, 'Noms des colonnes (groupes, séries ou issues).', { minItems: 1, maxItems: 200 }),
    rows: { type: 'array', description: 'Lignes : [v1, v2…] ou { label, x, values: [v1, v2…] }.', maxItems: 10000, items: {} },
    x_title: str('Titre de l’axe X (xy, survival).', { maxLength: 200 }),
    replicates: int('Réplicats par cellule (xy, grouped) ; sinon déduit des données.', { minimum: 1, maximum: 50 }),
    project_id: uuid('Projet (sinon : commun au labo).'),
  }, ['title', 'kind', 'columns', 'rows']),
  async handler(a, ctx) {
    const id = () => crypto.randomBytes(6).toString('hex');
    const columns = a.columns.map((name) => ({ id: id(), name }));
    let replicates = 1;
    const rows = a.rows.map((raw, k) => {
      const r = Array.isArray(raw) ? { values: raw } : raw && typeof raw === 'object' ? raw : null;
      if (!r || !Array.isArray(r.values ?? [])) throw new HttpError(400, `Ligne ${k + 1} : liste de valeurs ou objet { label, x, values } attendu.`);
      const values = r.values ?? [];
      if (values.length > columns.length) throw new HttpError(400, `Ligne ${k + 1} : ${values.length} valeurs pour ${columns.length} colonne(s).`);
      return {
        id: id(),
        x: r.x === undefined || r.x === null ? '' : cellText(r.x),
        label: r.label === undefined || r.label === null ? '' : String(r.label).slice(0, 200),
        v: Object.fromEntries(columns.map((c, i) => {
          const cell = Array.isArray(values[i]) ? values[i] : [values[i]];
          if (WITH_REPLICATES.has(a.kind)) replicates = Math.max(replicates, cell.length);
          return [c.id, cell.map(cellText)];
        })),
      };
    });
    if (WITH_X.has(a.kind) && rows.some((r) => r.x === '')) throw new HttpError(400, `Type ${a.kind} : chaque ligne doit avoir une valeur x.`);
    const data = {
      v: 1, kind: a.kind, title: a.title,
      xTitle: a.x_title ?? (a.kind === 'survival' ? 'Temps' : a.kind === 'xy' ? 'X' : ''),
      replicates: WITH_REPLICATES.has(a.kind) ? (a.replicates ?? replicates) : 1,
      columns, rows,
    };
    const datasetId = await createDataset(ctx.user, data, a.project_id ?? null);
    return { id: datasetId, title: a.title, kind: a.kind, columns: columns.length, rows: rows.length, url: webUrl(ctx, `/stats/${datasetId}`) };
  },
});

// --- Modèles d'entrée ------------------------------------------------------------------------------------------

define({
  name: 'list_templates',
  title: 'Lister les modèles d’entrée',
  group: 'Modèles',
  scope: 'read',
  http: { method: 'GET', path: '/templates' },
  description: 'Modèles d’entrée du labo (protocoles prêts à remplir : PCR, miniprep, western blot, purification…) : nom, catégorie, '
    + 'sections, outils inclus. À employer pour préparer une manip ; pour créer une entrée depuis un modèle : create_entry avec template_id.',
  input: params({
    query: str('Mot du nom, de la description ou de la catégorie.', { maxLength: 200 }),
    category: str('Catégorie exacte.', { maxLength: 60 }),
  }),
  async handler(a, ctx) {
    const like = a.query ? `%${a.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const { rows } = await query(
      `SELECT id, name, description, category, slug, content FROM templates
       WHERE NOT archived AND ($1::text IS NULL OR name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
         AND ($2::text IS NULL OR category = $2)
       ORDER BY category, lower(name)`,
      [like, a.category ?? null],
    );
    return {
      templates: rows.map((t) => compact({
        id: t.id, name: t.name, category: t.category, description: t.description, builtin: Boolean(t.slug) || undefined,
        sections: templateOutline(t.content), tools: templateTools(t.content), url: webUrl(ctx, `/templates/${t.id}`),
      })),
    };
  },
});

define({
  name: 'get_template',
  title: 'Lire un modèle d’entrée',
  group: 'Modèles',
  scope: 'read',
  http: { method: 'GET', path: '/templates/{template_id}' },
  description: 'Contenu d’un modèle d’entrée en Markdown (sections, étapes, tableaux à remplir).',
  input: params({ template_id: uuid('Identifiant du modèle.') }, ['template_id']),
  async handler(a, ctx) {
    const { rows: [t] } = await query('SELECT id, name, description, category, content, archived FROM templates WHERE id = $1', [a.template_id]);
    if (!t) throw notFound('Modèle');
    return compact({ id: t.id, name: t.name, category: t.category, description: t.description, archived: t.archived || undefined, markdown: docToMarkdown(t.content), url: webUrl(ctx, `/templates/${t.id}`) });
  },
  text: (r) => `# Modèle : ${r.name}\n\n${r.description ? `${r.description}\n\n` : ''}${r.markdown ?? ''}\n\n(identifiant : ${r.id})`,
});

// --- Produits et marqueurs -----------------------------------------------------------------------------------

define({
  name: 'list_reagents',
  title: 'Produits et réactifs',
  group: 'Calculs',
  scope: 'read',
  http: { method: 'GET', path: '/reagents' },
  description: 'Produits chimiques et réactifs du labo utilisés par les calculs : formule, masse molaire (g/mol), catégorie, '
    + 'concentrations de la solution mère et d’usage, notes.',
  input: params({ query: str('Mot du nom, de la formule ou de la catégorie.', { maxLength: 200 }) }),
  async handler(a) {
    const like = a.query ? `%${a.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const { rows } = await query(
      `SELECT id, name, formula, mw, category, stock_conc, working_conc, notes FROM reagents
       WHERE NOT archived AND ($1::text IS NULL OR name ILIKE $1 OR formula ILIKE $1 OR category ILIKE $1)
       ORDER BY lower(name) LIMIT 500`,
      [like],
    );
    return { reagents: rows.map((r) => compact({ ...r, mw: r.mw === null ? undefined : Number(r.mw) })) };
  },
});

define({
  name: 'list_ladders',
  title: 'Marqueurs de taille',
  group: 'Gels',
  scope: 'read',
  http: { method: 'GET', path: '/ladders' },
  description: 'Marqueurs de taille des gels (protéines en kDa, ADN en pb) : bandes et masses par bande, fournisseur, référence.',
  input: params({ kind: oneOf(['protein', 'dna'], 'protein ou dna.') }),
  async handler(a) {
    const { rows } = await query(
      `SELECT id, name, kind, bands, load, supplier, reference, notes FROM ladders
       WHERE NOT archived AND ($1::text IS NULL OR kind = $1) ORDER BY kind DESC, lower(name)`,
      [a.kind ?? null],
    );
    return { ladders: rows.map((l) => compact({ ...l, unit: l.kind === 'dna' ? 'pb' : 'kDa', load: l.load === null ? undefined : Number(l.load) })) };
  },
});
