import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const raw = String(req.query.q ?? '').trim().slice(0, 200);
  const terms = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!terms.length) return res.json([]);
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
     ORDER BY rank DESC, e.entry_date DESC
     LIMIT 50`,
    [tsquery, like],
  );
  res.json(rows);
});

export default router;
