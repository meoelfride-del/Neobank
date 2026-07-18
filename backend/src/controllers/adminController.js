const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

function resolveDestinationAccount(destinationInfo) {
  const byIban = db.prepare('SELECT * FROM accounts WHERE iban = ?').get(destinationInfo);
  if (byIban) return byIban;

  const destUser = db.prepare('SELECT id FROM users WHERE phone = ?').get(destinationInfo);
  if (!destUser) return null;

  return db.prepare(`SELECT * FROM accounts WHERE user_id = ? AND type = 'Courant'`).get(destUser.id);
}

function httpError(status, publicMessage) {
  const error = new Error(publicMessage);
  error.status = status;
  error.publicMessage = publicMessage;
  return error;
}

function listUsers(req, res) {
  const users = db.prepare(`
    SELECT id, nom, prenom, email, phone, role, status_kyc, status_compte, fraud_score, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json({ users });
}

function getStats(req, res) {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const pendingKyc = db.prepare(`SELECT COUNT(*) as c FROM users WHERE status_kyc IN ('pending','in_review')`).get().c;
  const suspended = db.prepare(`SELECT COUNT(*) as c FROM users WHERE status_compte = 'suspended'`).get().c;
  const flaggedTx = db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE status = 'pending'`).get().c;
  const totalBalance = db.prepare('SELECT COALESCE(SUM(balance),0) as s FROM accounts').get().s;

  res.json({ totalUsers, pendingKyc, suspended, flaggedTx, totalBalance });
}

function validateKyc(req, res) {
  const { userId } = req.params;
  const { decision } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable.' });
  }

  db.prepare('UPDATE users SET status_kyc = ? WHERE id = ?').run(decision, userId);
  logAudit(req.user.id, 'kyc_review', `user=${userId} decision=${decision}`);
  res.json({ message: `KYC ${decision === 'verified' ? 'validé' : 'rejeté'}.` });
}

function suspendUser(req, res) {
  const { userId } = req.params;
  const { suspended } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable.' });
  }

  db.prepare('UPDATE users SET status_compte = ? WHERE id = ?').run(suspended ? 'suspended' : 'active', userId);
  logAudit(req.user.id, 'account_suspend', `user=${userId} suspended=${suspended}`);
  res.json({ message: suspended ? 'Compte suspendu.' : 'Compte réactivé.' });
}

function pendingTransactions(req, res) {
  const transactions = db.prepare(`
    SELECT t.*, a.iban, u.email, u.fraud_score FROM transactions t
    JOIN accounts a ON t.source_account_id = a.id
    JOIN users u ON a.user_id = u.id
    WHERE t.status = 'pending'
    ORDER BY t.timestamp DESC
  `).all();
  res.json({ transactions });
}

function reviewTransaction(req, res, next) {
  const { txId } = req.params;
  const { approve } = req.body;
  const io = req.app.get('io');

  try {
    const runReview = db.transaction(() => {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
      if (!tx) throw httpError(404, 'Transaction introuvable.');

      if (tx.status !== 'pending') {
        throw httpError(409, 'Transaction déjà traitée.');
      }

      const source = tx.source_account_id
        ? db.prepare('SELECT * FROM accounts WHERE id = ?').get(tx.source_account_id)
        : null;
      if (!source) throw httpError(404, 'Compte source introuvable.');

      if (approve) {
        const destAccount = tx.type === 'virement_externe'
          ? null
          : resolveDestinationAccount(tx.destination_info);

        if (tx.type !== 'virement_externe' && !destAccount) {
          throw httpError(409, 'Compte destinataire introuvable.');
        }

        db.prepare(`UPDATE transactions SET status = 'completed' WHERE id = ?`).run(txId);

        const creditAmount = Math.abs(tx.amount);
        if (destAccount) {
          db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(creditAmount, destAccount.id);
          db.prepare(`
            INSERT INTO transactions (id, source_account_id, destination_info, amount, type, category, status, libelle)
            VALUES (?, ?, ?, ?, 'depot', 'Autre', 'completed', ?)
          `).run(uuidv4(), destAccount.id, source.iban, creditAmount, tx.libelle || `Virement de ${source.iban}`);
        }

        return { source, destAccount };
      }

      db.prepare(`UPDATE transactions SET status = 'failed' WHERE id = ?`).run(txId);
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(Math.abs(tx.amount), tx.source_account_id);
      return { source, destAccount: null };
    });

    const result = runReview();
    logAudit(req.user.id, 'tx_review', `tx=${txId} approve=${approve}`);

    if (io && result.source) {
      const sourceBalance = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(result.source.id).balance;
      io.to(`user:${result.source.user_id}`).emit('balance:update', {
        accountId: result.source.id,
        balance: sourceBalance,
      });
    }

    if (io && result.destAccount) {
      const destBalance = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(result.destAccount.id).balance;
      io.to(`user:${result.destAccount.user_id}`).emit('balance:update', {
        accountId: result.destAccount.id,
        balance: destBalance,
      });
      io.to(`user:${result.destAccount.user_id}`).emit('transaction:new', { message: 'Virement approuvé' });
    }

    res.json({ message: approve ? 'Transaction validée.' : 'Transaction rejetée et remboursée.' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.publicMessage });
    next(err);
  }
}

function logAudit(userId, action, details) {
  db.prepare('INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), userId, action, details);
}

module.exports = { listUsers, getStats, validateKyc, suspendUser, pendingTransactions, reviewTransaction };
