import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { ENZYMES, SUPPLIERS } from '../lib/seq/enzymes.js';
import { CONDITIONS, LIMITS, analyzeOligos, primer3Available } from '../lib/seq/primer3.js';

const router = Router();

router.get('/status', async (_req, res) => res.json({ primer3: await primer3Available() }));

router.get('/enzymes', (_req, res) => {
  res.set('Cache-Control', 'private, max-age=86400');
  res.json({ suppliers: SUPPLIERS, enzymes: ENZYMES.map(({ name, site, ovhg, ovhgseq, suppliers }) => ({ name, site, ovhg, ovhgseq, suppliers })) });
});

router.post('/oligos/analyze', async (req, res) => {
  const oligos = (req.body?.oligos ?? []).slice(0, 20);
  if (!oligos.length) throw new HttpError(400, 'Aucune amorce à analyser.');
  res.json({ conditions: CONDITIONS, limits: LIMITS, oligos: await analyzeOligos(oligos) });
});

export default router;
