const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../config/database');
const { decrypt } = require('../services/cryptoService');

function maskCard(card) {
  const { number_encrypted, pin_hash, number_fingerprint, ...safe } = card;
  return { ...safe, display: `•••• •••• •••• ${card.last4}` };
}

async function listCards(req, res) {
  const accountId = req.params.accountId;
  const account = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return res.status(404).json({ error: 'Compte introuvable.' });
  if (account.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
  }

  const cards = await db.prepare('SELECT * FROM cards WHERE account_id = ?').all(accountId);
  const requests=await db.prepare('SELECT id,type,status,created_at FROM card_requests WHERE account_id=? ORDER BY created_at DESC').all(accountId);
  res.json({ cards: cards.map(maskCard), requests });
}

async function createCard(req, res) {
  const { account_id, type } = req.body;
  const account = await db.prepare('SELECT * FROM accounts WHERE id=?').get(account_id);
  if (!account || account.user_id !== req.user.id) return res.status(403).json({ error: 'Acces refuse.' });
  const existing = await db.prepare("SELECT * FROM card_requests WHERE account_id=? AND type=? AND status='pending'").get(account_id,type);
  if (existing) return res.status(200).json({request:existing,message:'Demande deja en attente.'});
  const id=uuid();await db.prepare('INSERT INTO card_requests(id,account_id,type) VALUES(?,?,?)').run(id,account_id,type);
  res.status(201).json({request:{id,account_id,type,status:'pending'},message:'Demande enregistree. Attribution par un administrateur.'});
}

async function toggleCard(req, res) {
  const { cardId } = req.params;
  const { status } = req.body;

  const card = await db.prepare(`
    SELECT cards.*, accounts.user_id FROM cards
    JOIN accounts ON cards.account_id = accounts.id
    WHERE cards.id = ?
  `).get(cardId);

  if (!card) return res.status(404).json({ error: 'Carte introuvable.' });
  if (card.user_id !== req.user.id) return res.status(403).json({ error: 'Cette carte ne vous appartient pas.' });

  const [month, year] = card.expiry.split('/').map(Number);
  if (status === 'Active' && (card.status === 'Expired' || new Date(year, month, 1).getTime() <= Date.now())) return res.status(409).json({ error: 'Une carte expirée ne peut pas être réactivée.' });
  if (status === 'Active' && card.admin_locked) return res.status(409).json({ error: 'Le déblocage doit être effectué par un administrateur.' });
  await db.prepare('UPDATE cards SET status = ?, version=version+1 WHERE id = ?').run(status, cardId);
  res.json({ message: `Carte ${status === 'Blocked' ? 'bloquée' : 'activée'} avec succès.` });
}

/** Révèle le numéro complet + PIN, protégé par re-vérification du mot de passe. */
async function revealSecrets(req, res) {
  const { cardId } = req.params;
  const { password } = req.body;

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect.' });

  const card = await db.prepare(`
    SELECT cards.*, accounts.user_id FROM cards
    JOIN accounts ON cards.account_id = accounts.id
    WHERE cards.id = ?
  `).get(cardId);
  if (!card || card.user_id !== req.user.id) return res.status(403).json({ error: 'Accès refusé.' });

  res.set('Cache-Control', 'private, no-store');
  res.json({ fullNumber: decrypt(card.number_encrypted), expiry: card.expiry });
}

module.exports = { listCards, createCard, toggleCard, revealSecrets, maskCard };
