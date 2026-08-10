const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { authenticator } = require('otplib');
const db = require('../config/database');
const { generateIban } = require('../services/cryptoService');

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, type: 'access' }, process.env.JWT_SECRET, {
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
    const mfaSecret = authenticator.generateSecret();
    const createUser = db.transaction(async () => {
      await db.prepare(`INSERT INTO users (id, nom, prenom, email, password_hash, phone, multi_factor_secret)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, nom, prenom, email.toLowerCase(), passwordHash, phone, mfaSecret);
      await db.prepare(`INSERT INTO accounts (id, user_id, type, currency, balance, iban, label)
        VALUES (?, ?, 'Courant', 'EUR', 0, ?, 'Compte Courant')`)
        .run(uuid(), userId, generateIban());
      return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    });
    const user = await createUser();
    const { token: refreshToken } = await issueRefreshToken(user);
    res.status(201).json({
      user: sanitize(user),
      accessToken: signAccessToken(user),
      refreshToken,
      mfaSetup: { otpAuthUrl: authenticator.keyuri(email, process.env.OTP_ISSUER || 'NeoBank', mfaSecret), secret: mfaSecret },
    });
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
    if (user.mfa_enabled) {
      if (!user.multi_factor_secret) return res.status(409).json({ error: 'MFA mal configurée. Réactivez-la.' });
      if (!otp) return res.status(206).json({ mfaRequired: true, message: 'Code de vérification à 6 chiffres requis.' });
      if (!authenticator.check(otp, user.multi_factor_secret)) return res.status(401).json({ error: 'Code de vérification incorrect.' });
    }
    const { token: refreshToken } = await issueRefreshToken(user);
    res.json({ user: sanitize(user), accessToken: signAccessToken(user), refreshToken });
  } catch (err) {
    next(err);
  }
}

async function enableMfa(req, res, next) {
  try {
    const user = await db.prepare('SELECT id, email, multi_factor_secret FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const secret = user.multi_factor_secret || authenticator.generateSecret();
    await db.prepare('UPDATE users SET mfa_enabled = TRUE, multi_factor_secret = COALESCE(multi_factor_secret, ?) WHERE id = ?').run(secret, req.user.id);
    res.json({ message: 'Authentification à deux facteurs activée.', mfaSetup: { otpAuthUrl: authenticator.keyuri(user.email, process.env.OTP_ISSUER || 'NeoBank', secret), secret } });
  } catch (err) {
    next(err);
  }
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
    res.json({ accessToken: signAccessToken(user), refreshToken: replacement.token });
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ error: 'Compte suspendu. Contactez le support.' });
    if (err.status === 401 || ['JsonWebTokenError', 'TokenExpiredError'].includes(err.name)) return res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const payload = jwt.verify(req.body.refreshToken, process.env.JWT_REFRESH_SECRET, { ignoreExpiration: true });
    if (payload.jti) await db.prepare('UPDATE refresh_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id = ? AND user_id = ?').run(payload.jti, payload.sub);
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

module.exports = { register, login, refresh, logout, me, enableMfa };

