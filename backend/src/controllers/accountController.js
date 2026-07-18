const { v4: uuid } = require('uuid');
const db = require('../config/database');
const { generateIban } = require('../services/cryptoService');
const kycService = require('../services/kycService');

function listAccounts(req, res) {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC').all(req.user.id);
  res.json({ accounts });
}

function createAccount(req, res, next) {
  try {
    const { type, currency, label } = req.body;
    const id = uuid();
    db.prepare(`
      INSERT INTO accounts (id, user_id, type, currency, balance, iban, label)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(id, req.user.id, type, currency, generateIban(), label);

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    res.status(201).json({ account });
  } catch (err) {
    next(err);
  }
}

function getAccount(req, res) {
  const { accountId } = req.params;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) {
    return res.status(404).json({ error: 'Compte introuvable.' });
  }
  if (account.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
  }

  res.json({ account });
}

function submitKyc(req, res) {
  const result = kycService.submitKyc(req.user.id);
  res.json(result);
}

function kycStatus(req, res) {
  const user = db.prepare('SELECT status_kyc FROM users WHERE id = ?').get(req.user.id);
  res.json({ status_kyc: user.status_kyc });
}

module.exports = { listAccounts, createAccount, getAccount, submitKyc, kycStatus };
