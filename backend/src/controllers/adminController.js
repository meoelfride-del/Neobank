const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

async function resolveDestinationAccount(destinationInfo) {
  const byIban = await db.prepare('SELECT * FROM accounts WHERE iban = ?').get(destinationInfo);
  if (byIban) return byIban;

  const destUser = await db.prepare('SELECT id FROM users WHERE phone = ?').get(destinationInfo);
  if (!destUser) return null;

  return db.prepare(`SELECT * FROM accounts WHERE user_id = ? AND type = 'Courant'`).get(destUser.id);
}

function httpError(status, publicMessage) {
  const error = new Error(publicMessage);
  error.status = status;
  error.publicMessage = publicMessage;
  return error;
}

async function listUsers(req, res) {
  const users = await db.prepare(`
    SELECT id, nom, prenom, email, phone, role, status_kyc, status_compte, fraud_score, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json({ users });
}

async function getStats(req, res) {
  const totalUsers = (await db.prepare('SELECT COUNT(*) as c FROM users').get()).c;
  const pendingKyc = (await db.prepare(`SELECT COUNT(*) as c FROM users WHERE status_kyc IN ('pending','in_review')`).get()).c;
  const suspended = (await db.prepare(`SELECT COUNT(*) as c FROM users WHERE status_compte = 'suspended'`).get()).c;
  const flaggedTx = (await db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE status = 'pending'`).get()).c;
  const totalBalance = (await db.prepare('SELECT COALESCE(SUM(balance),0) as s FROM accounts').get()).s;

  res.json({ totalUsers, pendingKyc, suspended, flaggedTx, totalBalance });
}

async function validateKyc(req, res) {
  const { userId } = req.params;
  const { decision } = req.body;
  const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable.' });
  }

  await db.prepare('UPDATE users SET status_kyc = ? WHERE id = ?').run(decision, userId);
  await logAudit(req.user.id, 'kyc_review', `user=${userId} decision=${decision}`);
  res.json({ message: `KYC ${decision === 'verified' ? 'validé' : 'rejeté'}.` });
}

async function updateUser(req, res, next) {
  const { userId } = req.params;
  const { nom, prenom, email, phone } = req.body;
  const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  try {
    await db.prepare(`
      UPDATE users SET nom = ?, prenom = ?, email = ?, phone = ? WHERE id = ?
    `).run(nom, prenom, email.toLowerCase(), phone, userId);
    await logAudit(req.user.id, 'user_update', `user=${userId}`);
    const updatedUser = await db.prepare(`
      SELECT id, nom, prenom, email, phone, role, status_kyc, status_compte, fraud_score, created_at
      FROM users WHERE id = ?
    `).get(userId);
    res.json({ message: 'Coordonnées mises à jour.', user: updatedUser });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Cet email ou ce téléphone est déjà utilisé.' });
    next(error);
  }
}

async function listUserAccounts(req, res) {
  const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const accounts = await db.prepare(`
    SELECT id, user_id, type, currency, balance, iban, label, created_at
    FROM accounts WHERE user_id = ? ORDER BY created_at ASC
  `).all(req.params.userId);
  res.json({ accounts });
}

async function adjustBalance(req, res, next) {
  const { accountId } = req.params;
  const { operation, amount, reason } = req.body;
  const io = req.app.get('io');

  try {
    const runAdjustment = db.transaction(async () => {
      const account = await db.prepare('SELECT * FROM accounts WHERE id = ? FOR UPDATE').get(accountId);
      if (!account) throw httpError(404, 'Compte introuvable.');
      const signedAmount = operation === 'credit' ? amount : -amount;
      const newBalance = Number(account.balance) + signedAmount;
      if (newBalance < 0) throw httpError(409, 'Solde insuffisant pour effectuer ce retrait.');

      await db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(newBalance, accountId);
      const publicSource = operation === 'credit' ? 'Crédit de compte' : 'Ajustement de solde';
      await db.prepare(`
        INSERT INTO transactions (id, source_account_id, destination_info, amount, type, category, status, libelle)
        VALUES (?, ?, ?, ?, 'depot', 'Autre', 'completed', ?)
      `).run(uuidv4(), accountId, publicSource, signedAmount, reason);
      await logAudit(req.user.id, 'balance_adjustment', `account=${accountId} operation=${operation} amount=${amount} reason=${reason}`);
      return { account, newBalance };
    });

    const result = await runAdjustment();
    if (io) {
      io.to(`user:${result.account.user_id}`).emit('balance:update', { accountId, balance: result.newBalance });
      io.to(`user:${result.account.user_id}`).emit('transaction:notification', {
        direction: operation === 'credit' ? 'incoming' : 'outgoing',
        status: 'completed',
        amount,
        message: operation === 'credit' ? 'Fonds ajoutés à votre compte' : 'Solde de votre compte ajusté',
      });
    }
    res.json({ message: 'Solde ajusté.', accountId, balance: result.newBalance });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.publicMessage });
    next(error);
  }
}

async function suspendUser(req, res) {
  const { userId } = req.params;
  const { suspended } = req.body;
  const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable.' });
  }

  await db.prepare('UPDATE users SET status_compte = ? WHERE id = ?').run(suspended ? 'suspended' : 'active', userId);
  await logAudit(req.user.id, 'account_suspend', `user=${userId} suspended=${suspended}`);
  res.json({ message: suspended ? 'Compte suspendu.' : 'Compte réactivé.' });
}

async function pendingTransactions(req, res) {
  const transactions = await db.prepare(`
    SELECT t.*, a.iban, u.email, u.fraud_score FROM transactions t
    JOIN accounts a ON t.source_account_id = a.id
    JOIN users u ON a.user_id = u.id
    WHERE t.status = 'pending'
    ORDER BY t.timestamp DESC
  `).all();
  res.json({ transactions });
}

async function reviewTransaction(req, res, next) {
  const { txId } = req.params;
  const { approve } = req.body;
  const io = req.app.get('io');

  try {
    const runReview = db.transaction(async () => {
      const tx = await db.prepare('SELECT * FROM transactions WHERE id = ? FOR UPDATE').get(txId);
      if (!tx) throw httpError(404, 'Transaction introuvable.');

      if (tx.status !== 'pending') {
        throw httpError(409, 'Transaction déjà traitée.');
      }

      const source = tx.source_account_id
        ? await db.prepare('SELECT * FROM accounts WHERE id = ? FOR UPDATE').get(tx.source_account_id)
        : null;
      if (!source) throw httpError(404, 'Compte source introuvable.');

      if (approve) {
        const destAccount = tx.type === 'virement_externe'
          ? null
          : await resolveDestinationAccount(tx.destination_info);

        if (tx.type !== 'virement_externe' && !destAccount) {
          throw httpError(409, 'Compte destinataire introuvable.');
        }

        await db.prepare(`UPDATE transactions SET status = 'completed' WHERE id = ?`).run(txId);

        const creditAmount = Math.abs(tx.amount);
        if (destAccount) {
          await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(creditAmount, destAccount.id);
          await db.prepare(`
            INSERT INTO transactions (id, source_account_id, destination_info, amount, type, category, status, libelle)
            VALUES (?, ?, ?, ?, 'depot', 'Autre', 'completed', ?)
          `).run(uuidv4(), destAccount.id, source.iban, creditAmount, tx.libelle || `Virement de ${source.iban}`);
        }

        return { source, destAccount };
      }

      await db.prepare(`UPDATE transactions SET status = 'failed' WHERE id = ?`).run(txId);
      await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(Math.abs(tx.amount), tx.source_account_id);
      return { source, destAccount: null };
    });

    const result = await runReview();
    await logAudit(req.user.id, 'tx_review', `tx=${txId} approve=${approve}`);

    if (io && result.source) {
      const sourceBalance = (await db.prepare('SELECT balance FROM accounts WHERE id = ?').get(result.source.id)).balance;
      io.to(`user:${result.source.user_id}`).emit('balance:update', {
        accountId: result.source.id,
        balance: sourceBalance,
      });
      const reviewedTx = await db.prepare('SELECT amount FROM transactions WHERE id = ?').get(txId);
      io.to(`user:${result.source.user_id}`).emit('transaction:notification', {
        direction: 'outgoing',
        status: approve ? 'completed' : 'cancelled',
        amount: Math.abs(reviewedTx.amount),
        message: approve ? 'Votre virement a été validé' : 'Votre virement a été rejeté et remboursé',
      });
    }

    if (io && result.destAccount) {
      const destBalance = (await db.prepare('SELECT balance FROM accounts WHERE id = ?').get(result.destAccount.id)).balance;
      io.to(`user:${result.destAccount.user_id}`).emit('balance:update', {
        accountId: result.destAccount.id,
        balance: destBalance,
      });
      io.to(`user:${result.destAccount.user_id}`).emit('transaction:new', { message: 'Virement approuvé' });
      const reviewedTx = await db.prepare('SELECT amount FROM transactions WHERE id = ?').get(txId);
      io.to(`user:${result.destAccount.user_id}`).emit('transaction:notification', {
        direction: 'incoming', status: 'completed', amount: Math.abs(reviewedTx.amount), message: 'Nouveau virement reçu',
      });
    }

    res.json({ message: approve ? 'Transaction validée.' : 'Transaction rejetée et remboursée.' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.publicMessage });
    next(err);
  }
}

async function logAudit(userId, action, details) {
  await db.prepare('INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), userId, action, details);
}

module.exports = {
  listUsers,
  getStats,
  validateKyc,
  updateUser,
  listUserAccounts,
  adjustBalance,
  suspendUser,
  pendingTransactions,
  reviewTransaction,
};
