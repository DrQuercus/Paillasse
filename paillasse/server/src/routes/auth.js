import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import {
  SESSION_COOKIE, createSessionToken, hashPassword, publicUser, requireAuth, requireSession, verifyPassword,
} from '../auth.js';
import { getSetting, logAdmin } from '../lib/settings.js';

const router = Router();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function setSessionCookie(res, userId) {
  const { token, expires } = createSessionToken(userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.secureCookies, expires, path: '/',
  });
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const { rows } = await query('SELECT * FROM users WHERE username = $1', [String(username ?? '')]);
  const user = rows[0];
  if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
    await pause(800); // freine les essais en série
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  }
  if (user.disabled_at) {
    await pause(800);
    return res.status(403).json({ error: 'Ce compte est désactivé. Voyez l’administrateur du cahier.' });
  }
  const maintenance = getSetting('maintenance');
  if (maintenance.on && !user.is_admin) {
    return res.status(503).json({ error: maintenance.message || 'Maintenance en cours.', maintenance: true });
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  setSessionCookie(res, user.id);
  res.json(publicUser(user));
});

router.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

/** Changer son mot de passe (obligatoire après un mot de passe provisoire). Les autres sessions sont fermées. */
router.post('/password', requireAuth, requireSession, async (req, res) => {
  const { current, next } = req.body ?? {};
  const { rows: [user] } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!verifyPassword(String(current ?? ''), user.password_hash)) {
    await pause(800);
    return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
  }
  const password = String(next ?? '');
  if (password.length < 8) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' });
  if (password === current) return res.status(400).json({ error: 'Choisissez un mot de passe différent de l’actuel.' });
  await query(
    'UPDATE users SET password_hash = $2, must_change_password = false, sessions_valid_after = $3 WHERE id = $1',
    [user.id, hashPassword(password), new Date()],
  );
  await logAdmin(req.user, 'Mot de passe changé', `${user.username} a choisi un nouveau mot de passe`);
  // Cette session-ci reste ouverte (nouveau jeton), les autres sont fermées
  setSessionCookie(res, user.id);
  res.json({ ...req.user, must_change_password: false });
});

export default router;
