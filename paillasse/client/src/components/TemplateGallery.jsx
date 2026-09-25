import {
  Calculator, ChartColumn, Columns4, Dna, FileText, FlaskConical, ImagePlus, LayoutTemplate, ListChecks, Microscope,
} from 'lucide-react';
import { TEMPLATE_CATEGORIES } from '../lib/templates/categories.js';

export const LAB_CATEGORY = 'Modèles du labo';

const CATEGORY_ICONS = { Général: FileText, 'Biologie moléculaire': Dna, Protéines: FlaskConical, Cellules: Microscope };
export const categoryIcon = (category) => CATEGORY_ICONS[category] ?? LayoutTemplate;

const TOOLS = [
  ['tasks', ListChecks, 'Étapes à cocher'],
  ['calc', Calculator, 'Calcul prêt (tampon, master mix…)'],
  ['gel', Columns4, 'Figure de gel à remplir'],
  ['stats', ChartColumn, 'Graphique à remplir'],
  ['image', ImagePlus, 'Photo à ajouter'],
  ['sequence', Dna, 'Séquence du registre'],
];

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Recherche sans accents dans le nom, la description, la catégorie et les sections. */
export function filterTemplates(list, q) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((t) => {
    const hay = fold([t.name, t.description, t.category, ...(t.outline ?? [])].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** Groupes dans l'ordre des catégories de base, puis les catégories du labo. */
export function groupTemplates(list) {
  const groups = new Map();
  for (const t of list) {
    const c = t.category || LAB_CATEGORY;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(t);
  }
  const rank = (c) => (TEMPLATE_CATEGORIES.includes(c) ? TEMPLATE_CATEGORIES.indexOf(c) : c === LAB_CATEGORY ? 99 : 50);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'fr'))
    .map(([category, items]) => ({ category, items }));
}

export const templateCategories = (list) => groupTemplates(list).map((g) => g.category);

/** Contenu d'une carte de modèle (bouton de choix ou lien vers l'éditeur). */
export function TemplateCardBody({ t, compact = false }) {
  const Icon = categoryIcon(t.category);
  const tools = TOOLS.filter(([k]) => t.tools?.includes(k));
  return (
    <>
      <span className="tpl-icon" aria-hidden="true"><Icon size={18} /></span>
      <span className="tpl-body">
        <span className="tpl-name">
          {t.name}
          {!t.builtin && <span className="badge tpl-badge">Labo</span>}
          {t.builtin && t.modified && <span className="badge tpl-badge" title="Modèle de base adapté par le labo">Adapté</span>}
        </span>
        {t.description && <span className="tpl-desc">{t.description}</span>}
        {!compact && t.outline?.length > 0 && <span className="tpl-outline">{t.outline.join(' · ')}</span>}
        {tools.length > 0 && (
          <span className="tpl-tools">
            {tools.map(([k, ToolIcon, label]) => <span key={k} title={label} aria-label={label} role="img"><ToolIcon size={13} /></span>)}
          </span>
        )}
      </span>
    </>
  );
}

/** Puces de catégorie (filtre). */
export function CategoryChips({ categories, value, onChange }) {
  return (
    <div className="chip-row" role="group" aria-label="Catégorie">
      <button type="button" className={`chip${!value ? ' is-active' : ''}`} aria-pressed={!value} onClick={() => onChange('')}>Tous</button>
      {categories.map((c) => (
        <button key={c} type="button" className={`chip${value === c ? ' is-active' : ''}`} aria-pressed={value === c} onClick={() => onChange(value === c ? '' : c)}>{c}</button>
      ))}
    </div>
  );
}
