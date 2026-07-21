const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { authenticator } = require('otplib');
const db = require('../config/database');
const { generateIban } = require('../services/cryptoService');

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
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

    const passwordHash = await bcrypt.hash(password, 12);
    const mfaSecret = authenticator.generateSecret();
    const userId = uuid();

    await db.prepare(`
      INSERT INTO users (id, nom, prenom, email, password_hash, phone, multi_factor_secret)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, nom, prenom, email, passwordHash, phone, mfaSecret);

    // Création automatique d'un compte Courant par défaut (multi-comptes possible ensuite)
    const accountId = uuid();
    await db.prepare(`
      INSERT INTO accounts (id, user_id, type, currency, balance, iban, label)
      VALUES (?, ?, 'Courant', 'EUR', 0, ?, 'Compte Courant')
    `).run(accountId, userId, generateIban());

    const otpAuthUrl = authenticator.keyuri(email, process.env.OTP_ISSUER || 'NeoBank', mfaSecret);

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.status(201).json({
      user: sanitize(user),
      accessToken,
      refreshToken,
      mfaSetup: { otpAuthUrl, secret: mfaSecret },
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password, otp } = req.body;
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Identifiants invalides.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants invalides.' });

    if (user.status_compte === 'suspended') {
      return res.status(403).json({ error: 'Compte suspendu. Contactez le support.' });
    }

    // Authentification forte (SCA) : si le MFA est activé, l'OTP TOTP est requis
    if (user.mfa_enabled) {
      if (!user.multi_factor_secret) {
        return res.status(409).json({ error: 'MFA mal configurée. Réactivez l\'authentification à deux facteurs.' });
      }
      if (!otp) {
        return res.status(206).json({ mfaRequired: true, message: 'Code de vérification à 6 chiffres requis.' });
      }
      const isValidOtp = authenticator.check(otp, user.multi_factor_secret);
      if (!isValidOtp) return res.status(401).json({ error: 'Code de vérification incorrect.' });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({ user: sanitize(user), accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
}

async function enableMfa(req, res, next) {
  try {
    const user = await db.prepare('SELECT id, email, multi_factor_secret, mfa_enabled FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const secret = user.multi_factor_secret || authenticator.generateSecret();
    await db.prepare('UPDATE users SET mfa_enabled = TRUE, multi_factor_secret = COALESCE(multi_factor_secret, ?) WHERE id = ?')
      .run(secret, req.user.id);

    const otpAuthUrl = authenticator.keyuri(user.email, process.env.OTP_ISSUER || 'NeoBank', secret);
    res.json({
      message: 'Authentification à deux facteurs activée.',
      mfaSetup: { otpAuthUrl, secret },
    });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token manquant.' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable.' });
    if (user.status_compte === 'suspended') {
      return res.status(403).json({ error: 'Compte suspendu. Contactez le support.' });
    }
    const accessToken = signAccessToken(user);
    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: 'Refresh token invalide ou expiré.' });
  }
}

async function me(req, res) {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: sanitize(user) });
}

module.exports = { register, login, refresh, me, enableMfa };
