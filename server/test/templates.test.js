// Modèles de base : bibliothèque livrée, installation et mise à jour sans écraser le travail du labo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDoc, docToPlainText } from '../src/lib/doc.js';
import { calcSummary } from '../src/lib/calc.js';
import { renderDoc } from '../src/lib/render.js';
import {
  isModified, planLibraryInstall, templateHash, templateLibrary, templateOutline, templateTools,
} from '../src/lib/templates.js';

const lib = templateLibrary();

const walk = (node, fn) => {
  fn(node);
  (node.content ?? []).forEach((n) => walk(n, fn));
};

test('bibliothèque : modèles attendus, slugs uniques, documents valides', () => {
  const slugs = lib.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of ['entree-classique', 'protocole', 'western-blot', 'purification-his', 'pcr', 'sds-page']) assert.ok(slugs.includes(s), s);
  for (const t of lib) {
    assert.ok(t.name && t.description && t.category, t.slug);
    assert.ok(isDoc(t.content), t.slug);
    assert.ok(docToPlainText(t.content).length > 20, t.slug);
    assert.ok(templateOutline(t.content).length >= 1, t.slug);
  }
});

test('bibliothèque : encarts de calcul lisibles, emplacements bien formés, tableaux rectangulaires', () => {
  const tools = new Set(['gel', 'stats', 'calc', 'image', 'sequence', 'samples']);
  for (const t of lib) {
    walk(t.content, (n) => {
      if (n.type === 'labCalc') {
        const s = calcSummary(n.attrs.summary);
        assert.ok(s.title && s.results.length, `${t.slug} : calcul sans résultat`);
      }
      if (n.type === 'templateSlot') {
        assert.ok(tools.has(n.attrs.tool), `${t.slug} : outil ${n.attrs.tool}`);
        assert.ok(n.attrs.id && n.attrs.label, `${t.slug} : emplacement sans id ou libellé`);
      }
      if (n.type === 'table') {
        const widths = n.content.map((r) => r.content.length);
        assert.ok(widths.every((w) => w === widths[0]), `${t.slug} : tableau irrégulier`);
      }
      if (n.type === 'text') assert.ok(n.text.length > 0, `${t.slug} : texte vide`);
    });
  }
  const ids = lib.flatMap((t) => { const out = []; walk(t.content, (n) => n.type === 'templateSlot' && out.push(n.attrs.id)); return out; });
  assert.equal(new Set(ids).size, ids.length);
});

test('rendu imprimable : les emplacements vides disparaissent, les calculs restent', () => {
  const western = lib.find((t) => t.slug === 'western-blot');
  const html = renderDoc(western.content);
  assert.match(html, /TBST/);
  assert.match(html, /<ul class="tasks">/);
  assert.doesNotMatch(html, /Blot : quantification|templateSlot/);
  assert.match(docToPlainText(western.content), /Anticorps/);
});

test('empreinte indépendante de l’ordre des clés (jsonb)', () => {
  const t = lib[0];
  const shuffled = JSON.parse(JSON.stringify({ content: t.content, category: t.category, description: t.description, name: t.name }));
  assert.equal(templateHash(shuffled), templateHash(t));
});

test('installation : tout au premier démarrage, rien ensuite', () => {
  const first = planLibraryInstall(lib, []);
  assert.equal(first.length, lib.length);
  assert.ok(first.every((s) => s.action === 'insert'));
  const installed = lib.map((t, k) => ({ id: `id${k}`, ...t, seed_hash: templateHash(t) }));
  assert.deepEqual(planLibraryInstall(lib, installed), []);
});

test('mise à jour : seulement les modèles intacts ; jamais un modèle modifié ou retiré', () => {
  const old = { ...lib[0], description: 'Ancienne description' };
  const intact = { id: 'a', ...old, seed_hash: templateHash(old) };
  const modified = { id: 'b', ...lib[1], name: 'Protocole du labo', seed_hash: templateHash({ ...lib[1], description: 'avant' }) };
  const archived = { id: 'c', ...lib[2], archived: true, seed_hash: templateHash(lib[2]) };
  const plan = planLibraryInstall(lib.slice(0, 3), [intact, modified, archived]);
  assert.deepEqual(plan.map((s) => [s.action, s.id]), [['update', 'a']]);
  assert.equal(isModified(intact), false);
  assert.equal(isModified(modified), true);
});

test('galerie : outils présents dans un modèle', () => {
  const pcr = lib.find((t) => t.slug === 'pcr');
  const tools = templateTools(pcr.content);
  for (const k of ['calc', 'gel', 'sequence', 'tasks', 'table']) assert.ok(tools.includes(k), k);
});
