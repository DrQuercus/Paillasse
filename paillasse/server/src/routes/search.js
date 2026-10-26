import { Router } from 'express';
import { query } from '../db.js';
import { visibleProjects } from '../lib/access.js';

const router = Router();

/** Recherche plein texte dans les entrées des projets visibles (préfixes, extraits surlignés ⟦…⟧). */
export async function searchEntries(user, rawQuery, limit = 50) {
  const raw = String(rawQuery ?? '').trim().slice(0, 200);
  const terms = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!terms.length) return [];
  // Recherche par préfixe : « purif » trouve « purification »
  const tsquery = terms.slice(0, 12).map((t) => `${t}:*`).join(' & ');
  const like = `%${raw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { rows } = await query(
    `WITH q AS (SELECT to_tsquery('french', $1) AS tsq)
     SELECT e.id, e.title, e.entry_date, e.status, e.project_id,
            p.name AS project_name, p.color AS project_color,
            ts_rank(e.search, q.tsq) + CASE WHEN e.title ILIKE $2 THEN 1 ELSE 0 END AS rank,
            ts_headline('french', e.plain_text, q.tsq,
              'StartSel=⟦, StopSel=⟧, MaxFragments=2, MaxWords=28, MinWords=10, FragmentDelimiter=" … "') AS snippet
     FROM entries e JOIN projects p ON p.id = e.project_id, q
     WHERE NOT e.archived AND (e.search @@ q.tsq OR e.title ILIKE $2 OR e.plain_text ILIKE $2)
       AND e.project_id IN ${visibleProjects('$3')}
     ORDER BY rank DESC, e.entry_date DESC
     LIMIT $4`,
    [tsquery, like, user.id, Math.min(50, Math.max(1, Number(limit) || 50))],
  );
  return rows;
}

router.get('/', async (req, res) => res.json(await searchEntries(req.user, req.query.q)));

export default router;
