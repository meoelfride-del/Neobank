const jwt = require('jsonwebtoken');
const db = require('../config/database');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, email, role, status_compte, status_kyc FROM users WHERE id = ?').get(payload.sub);

    if (!user) return res.status(401).json({ error: 'Utilisateur introuvable.' });
    if (user.status_compte === 'suspended') {
      return res.status(403).json({ error: 'Compte suspendu. Contactez le support.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé : privilèges insuffisants.' });
    }
    next();
  };
}

/** Vérifie que le compte demandé appartient bien à l'utilisateur authentifié. */
function ownsAccount(req, res, next) {
  const accountId = req.params.accountId || req.body.accountId || req.body.account_id || req.body.source_account_id;
  if (!accountId) return next();

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return res.status(404).json({ error: 'Compte introuvable.' });
  if (account.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Ce compte ne vous appartient pas." });
  }
  req.account = account;
  next();
}

module.exports = { authenticate, requireRole, ownsAccount };
