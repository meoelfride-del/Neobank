const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../config/database');
const { encrypt, decrypt, generateCardNumber } = require('../services/cryptoService');

function maskCard(card) {
  const { number_encrypted, pin_hash, ...safe } = card;
  return { ...safe, display: `•••• •••• •••• ${card.last4}` };
}

function listCards(req, res) {
  const accountId = req.params.accountId;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return res.status(404).json({ error: 'Compte introuvable.' });
  if (account.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
  }

  const cards = db.prepare('SELECT * FROM cards WHERE account_id = ?').all(accountId);
  res.json({ cards: cards.map(maskCard) });
}

async function createCard(req, res, next) {
  try {
    const { account_id, type, limits, pin } = req.body;
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
    if (!account || account.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
    }

    const cardNumber = generateCardNumber(type === 'Virtuelle' ? '5412' : '4970');
    const last4 = cardNumber.slice(-4);
    const pinHash = await bcrypt.hash(pin || '0000', 10);

    // Cartes virtuelles : validité courte (24h) et plafond strict par défaut
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + (type === 'Virtuelle' ? 0 : 48));
    if (type === 'Virtuelle') expiryDate.setDate(expiryDate.getDate() + 1);
    const expiry = `${String(expiryDate.getMonth() + 1).padStart(2, '0')}/${expiryDate.getFullYear()}`;

    const id = uuid();
    db.prepare(`
      INSERT INTO cards (id, account_id, type, number_encrypted, last4, pin_hash, expiry, limits, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active')
    `).run(id, account_id, type, encrypt(cardNumber), last4, pinHash, expiry, limits || (type === 'Virtuelle' ? 500 : 3000));

    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
    res.status(201).json({ card: { ...maskCard(card), fullNumber: type === 'Virtuelle' ? cardNumber : undefined } });
  } catch (err) {
    next(err);
  }
}

function toggleCard(req, res) {
  const { cardId } = req.params;
  const { status } = req.body;

  const card = db.prepare(`
    SELECT cards.*, accounts.user_id FROM cards
    JOIN accounts ON cards.account_id = accounts.id
    WHERE cards.id = ?
  `).get(cardId);

  if (!card) return res.status(404).json({ error: 'Carte introuvable.' });
  if (card.user_id !== req.user.id) return res.status(403).json({ error: 'Cette carte ne vous appartient pas.' });

  db.prepare('UPDATE cards SET status = ? WHERE id = ?').run(status, cardId);
  res.json({ message: `Carte ${status === 'Blocked' ? 'bloquée' : 'activée'} avec succès.` });
}

/** Révèle le numéro complet + PIN, protégé par re-vérification du mot de passe. */
async function revealSecrets(req, res) {
  const { cardId } = req.params;
  const { password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect.' });

  const card = db.prepare(`
    SELECT cards.*, accounts.user_id FROM cards
    JOIN accounts ON cards.account_id = accounts.id
    WHERE cards.id = ?
  `).get(cardId);
  if (!card || card.user_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé.' });

  res.json({ fullNumber: decrypt(card.number_encrypted), expiry: card.expiry });
}

module.exports = { listCards, createCard, toggleCard, revealSecrets };
