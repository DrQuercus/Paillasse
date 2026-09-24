import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { SESSION_COOKIE, createSessionToken, requireAuth, verifyPassword } from '../auth.js';

const router = Router();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const { rows } = await query('SELECT * FROM users WHERE username = $1', [String(username ?? '')]);
  const user = rows[0];
  if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
    await pause(800); // freine les essais en série
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  }
  const { token, expires } = createSessionToken(user.id);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.secureCookies, expires, path: '/',
  });
  res.json({ id: user.id, username: user.username, display_name: user.display_name });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

export default router;
