// Modèles de base (protocole, western blot, purification…) : installation et mise à jour.
// La bibliothèque est écrite côté client (client/src/lib/templates/library.js) puis figée dans
// template-library.json par `npm --prefix client run templates`.
import fs from 'node:fs';
import { canonicalize, sha256 } from './hash.js';

let library = null;

/** Modèles de base livrés avec cette version : [{ slug, name, category, description, content }]. */
export function templateLibrary() {
  if (!library) library = JSON.parse(fs.readFileSync(new URL('./template-library.json', import.meta.url), 'utf8'));
  return library;
}

export const libraryTemplate = (slug) => templateLibrary().find((t) => t.slug === slug) ?? null;

/** Empreinte de ce qui fait un modèle, indépendante de l'ordre des clés (jsonb les réordonne). */
export const templateHash = (t) => sha256(canonicalize({
  name: t.name, description: t.description ?? '', category: t.category ?? '', content: t.content,
}));

/** Un modèle de base modifié par le labo n'est plus mis à jour par Paillasse. */
export const isModified = (row) => Boolean(row.slug && row.seed_hash && templateHash(row) !== row.seed_hash);

/**
 * Ce qu'il faut faire de chaque modèle de base, au vu des lignes déjà en base (même slug) :
 * « insert » s'il n'a jamais été installé, « update » s'il est installé, intact et qu'une nouvelle
 * version existe. Un modèle modifié ou retiré (archivé) par le labo n'est jamais réinstallé.
 */
export function planLibraryInstall(lib, existing) {
  const bySlug = new Map(existing.filter((r) => r.slug).map((r) => [r.slug, r]));
  const plan = [];
  for (const t of lib) {
    const hash = templateHash(t);
    const row = bySlug.get(t.slug);
    if (!row) plan.push({ action: 'insert', template: t, hash });
    else if (row.seed_hash !== hash && !isModified(row)) plan.push({ action: 'update', id: row.id, template: t, hash });
  }
  return plan;
}

/** Au démarrage : installe les nouveaux modèles de base et met à jour ceux qui n'ont pas été touchés. */
export async function installTemplateLibrary(db, { log = console.log } = {}) {
  const { rows } = await db.query('SELECT id, slug, name, description, category, content, seed_hash FROM templates WHERE slug IS NOT NULL');
  const plan = planLibraryInstall(templateLibrary(), rows);
  for (const step of plan) {
    const t = step.template;
    if (step.action === 'insert') {
      await db.query(
        `INSERT INTO templates (slug, name, description, category, content, seed_hash)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [t.slug, t.name, t.description, t.category, JSON.stringify(t.content), step.hash],
      );
    } else {
      await db.query(
        `UPDATE templates SET name = $2, description = $3, category = $4, content = $5, seed_hash = $6, updated_at = now()
         WHERE id = $1`,
        [step.id, t.name, t.description, t.category, JSON.stringify(t.content), step.hash],
      );
    }
  }
  const inserted = plan.filter((s) => s.action === 'insert').length;
  const updated = plan.length - inserted;
  if (plan.length) log(`Modèles de base : ${inserted} installé${inserted > 1 ? 's' : ''}, ${updated} mis à jour`);
  return { inserted, updated };
}

/** Titres de section d'un modèle (aperçu dans la galerie). */
export function templateOutline(content, max = 8) {
  const out = [];
  for (const node of content?.content ?? []) {
    if (node.type === 'heading' && node.attrs?.level <= 2) {
      const text = (node.content ?? []).map((n) => n.text ?? '').join('').trim();
      if (text) out.push(text);
    }
    if (out.length >= max) break;
  }
  return out;
}

/** Outils pré-remplis d'un modèle (encarts et emplacements), pour la galerie. */
export function templateTools(content) {
  const tools = new Set();
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'labCalc') tools.add('calc');
    else if (node.type === 'templateSlot' && node.attrs?.tool) tools.add(node.attrs.tool);
    else if (node.type === 'taskList') tools.add('tasks');
    else if (node.type === 'table') tools.add('table');
    (node.content ?? []).forEach(walk);
  };
  walk(content);
  return [...tools];
}
