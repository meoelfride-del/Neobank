const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../config/database');
const mfaService = require('../services/mfaService');
const sessionService = require('../services/sessionService');

function signAccessToken(user, sessionId) {
  return jwt.sign({ sub: user.id, role: user.role, type: 'access', sid: sessionId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueRefreshToken(user) {
  const sessionId = uuid();
  const token = jwt.sign({ sub: user.id, jti: sessionId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  const payload = jwt.decode(token);
  await db.prepare('INSERT INTO refresh_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, user.id, hashToken(token), new Date(payload.exp * 1000).toISOString());
  return { token, sessionId };
}

function sanitize(user) {
  const { password_hash, multi_factor_secret, ...safe } = user;
  return safe;
}

async function register(req, res, next) {
  try {
    const { nom, prenom, email, password, phone } = req.body;
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });

    const userId = uuid();
    const passwordHash = await bcrypt.hash(password, 12);
    const mfaSecret = null;
    const createUser = db.transaction(async () => {
      await db.prepare(`INSERT INTO users (id, nom, prenom, email, password_hash, phone, multi_factor_secret)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, nom, prenom, email.toLowerCase(), passwordHash, phone, mfaSecret);
      await db.prepare(`INSERT INTO customer_profiles
        (user_id, birth_date, birth_place, nationality, address_line, city, postal_code, country, occupation, terms_accepted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(userId, req.body.birth_date, req.body.birth_place,
        req.body.nationality, req.body.address_line, req.body.city, req.body.postal_code, req.body.country, req.body.occupation);
      await db.prepare(`INSERT INTO accounts (id, user_id, type, currency, balance, iban, label)
        VALUES (?, ?, 'Courant', 'EUR', 0, NULL, 'Compte Courant')`)
        .run(uuid(), userId);
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      const { token: refreshToken, sessionId } = await issueRefreshToken(user);
      return { user: sanitize(user), accessToken: signAccessToken(user, sessionId), refreshToken };
    });
    const result = await createUser();
    req.app.get('io')?.to('role:admin').emit('user:registered', { userId });
    res.status(201).json(result);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Un compte utilise déjà cet email ou ce téléphone.' });
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password, otp } = req.body;
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Identifiants invalides.' });
    if (user.status_compte === 'suspended') return res.status(403).json({ error: 'Compte suspendu. Contactez le support.' });
    const result = await db.transaction(async () => {
      const locked = await db.prepare('SELECT * FROM users WHERE id=? FOR UPDATE').get(user.id);
      if (locked.status_compte === 'suspended') throw authError(403);
      if (locked.mfa_enabled) {
        if (!otp) return { mfaRequired: true };
        await mfaService.consume(locked, otp);
      }
      const session = await issueRefreshToken(locked);
      return { user: locked, refreshToken: session.token, sessionId: session.sessionId };
    })();
    if (result.mfaRequired) return res.status(206).json({ mfaRequired: true });
    res.json({ user: sanitize(result.user), accessToken: signAccessToken(result.user, result.sessionId), refreshToken: result.refreshToken });
  } catch (err) {
    next(err);
  }
}

async function setupMfa(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.json({ mfaSetup: await mfaService.setup(req.user.id, req.body.password) });
}
async function enableMfa(req, res) {
  await mfaService.enable(req.user.id, req.body.password, req.body.otp);
  res.json({ message: 'Double authentification active.' });
}

async function refresh(req, res, next) {
  try {
    const token = req.body.refreshToken;
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    if (payload.type !== 'refresh' || !payload.jti) return res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
    const rotate = db.transaction(async () => {
      const session = await db.prepare('SELECT * FROM refresh_sessions WHERE id = ? FOR UPDATE').get(payload.jti);
      if (!session || session.user_id !== payload.sub || session.revoked_at || session.token_hash !== hashToken(token)) throw authError(401);
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
      if (!user) throw authError(401);
      if (user.status_compte === 'suspended') throw authError(403);
      const replacement = await issueRefreshToken(user);
      await db.prepare('UPDATE refresh_sessions SET revoked_at = CURRENT_TIMESTAMP, replaced_by = ? WHERE id = ?').run(replacement.sessionId, session.id);
      return { user, replacement };
    });
    const { user, replacement } = await rotate();
    req.app.get('io')?.in(`session:${payload.jti}`).disconnectSockets(true);
    res.json({ accessToken: signAccessToken(user, replacement.sessionId), refreshToken: replacement.token });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ error: 'Compte suspendu. Contactez le support.' });
    if (err.status === 401 || ['JsonWebTokenError', 'TokenExpiredError'].includes(err.name)) return res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const payload = jwt.verify(req.body.refreshToken, process.env.JWT_REFRESH_SECRET, { ignoreExpiration: true });
    if (payload.type === 'refresh' && payload.jti) {
      const ids = await sessionService.revoke(payload.sub, payload.jti);
      for (const id of ids) req.app.get('io')?.in(`session:${id}`).disconnectSockets(true);
    }
    res.status(204).end();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return res.status(204).end();
    next(err);
  }
}

function authError(status) {
  return Object.assign(new Error('Session invalide'), { status });
}

async function me(req, res) {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: sanitize(user) });
}

async function sessions(req, res) {
  res.set('Cache-Control', 'private, no-store');
  const rows = await db.prepare('SELECT id, expires_at FROM refresh_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at > ?').all(req.user.id, new Date().toISOString());
  res.json({ sessions: rows.map(row => ({ ...row, current: row.id === req.sessionId })) });
}
async function revokeSession(req, res) {
  const row = await db.prepare('SELECT user_id FROM refresh_sessions WHERE id=?').get(req.params.sessionId);
  if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: 'Session introuvable.' });
  const ids = await sessionService.revoke(req.user.id, req.params.sessionId);
  for (const id of ids) req.app.get('io')?.in(`session:${id}`).disconnectSockets(true);
  res.status(204).end();
}
module.exports = { register, login, refresh, logout, me, enableMfa, setupMfa, sessions, revokeSession };

