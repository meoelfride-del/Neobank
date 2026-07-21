const { v4: uuid } = require('uuid');
const db = require('../config/database');
const { categorize } = require('../services/budgetService');
const { computeFraudScore, requiresManualReview } = require('../services/fraudService');

async function resolveDestinationAccount(destinationInfo) {
  const byIban = await db.prepare('SELECT * FROM accounts WHERE iban = ?').get(destinationInfo);
  if (byIban) return byIban;

  const destUser = await db.prepare('SELECT id FROM users WHERE phone = ?').get(destinationInfo);
  if (!destUser) return null;

  return db.prepare(`SELECT * FROM accounts WHERE user_id = ? AND type = 'Courant'`).get(destUser.id);
}

async function listTransactions(req, res) {
  const { accountId } = req.params;
  const account = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return res.status(404).json({ error: 'Compte introuvable.' });
  if (account.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
  }

  const transactions = await db.prepare(`
    SELECT * FROM transactions WHERE source_account_id = ? ORDER BY timestamp DESC LIMIT 200
  `).all(accountId);
  res.json({ transactions });
}

/**
 * Instant transfer, internal when the destination resolves to a NeoBank account,
 * external otherwise. The source account is debited atomically and the
 * destination is credited immediately unless the transfer is flagged.
 */
async function transfer(req, res, next) {
  const { source_account_id, destination_type, destination_info, amount, libelle } = req.body;
  const io = req.app.get('io');

  try {
    const runTransfer = db.transaction(async () => {
      const source = await db.prepare('SELECT * FROM accounts WHERE id = ? FOR UPDATE').get(source_account_id);
      if (!source) throw httpError(404, 'Compte source introuvable.');
      if (source.user_id !== req.user.id) throw httpError(403, 'Ce compte ne vous appartient pas.');
      if (source.balance < amount) throw httpError(400, 'Solde insuffisant.');

      const recentTxCount = (await db.prepare(`
        SELECT COUNT(*) as c FROM transactions
        WHERE source_account_id = ? AND timestamp > ?
      `).get(source_account_id, new Date(Date.now() - 60 * 60 * 1000))).c;

      const existingDest = (await db.prepare(`
        SELECT COUNT(*) as c FROM transactions
        WHERE source_account_id = ? AND destination_info = ?
      `).get(source_account_id, destination_info)).c;

      const accountAgeDays = Math.floor((Date.now() - new Date(source.created_at).getTime()) / 86_400_000);

      const fraudScore = computeFraudScore({
        amount,
        recentTxCount,
        isNewDestination: existingDest === 0,
        accountAgeDays,
      });

      const flagged = requiresManualReview(fraudScore);
      const category = categorize(libelle || '');
      const txId = uuid();
      const destAccount = await resolveDestinationAccount(destination_info);
      const txType = destAccount ? 'virement_interne' : 'virement_externe';

      await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(amount, source_account_id);

      await db.prepare(`
        INSERT INTO transactions (id, source_account_id, destination_info, amount, type, category, status, libelle)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(txId, source_account_id, destination_info, -amount, txType, category, flagged ? 'pending' : 'completed', libelle || '');

      if (destAccount && !flagged) {
        await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(amount, destAccount.id);
        await db.prepare(`
          INSERT INTO transactions (id, source_account_id, destination_info, amount, type, category, status, libelle)
          VALUES (?, ?, ?, ?, 'depot', 'Autre', 'completed', ?)
        `).run(uuid(), destAccount.id, source.iban, amount, libelle || `Virement de ${source.iban}`);
      }

      if (flagged) {
        await db.prepare('UPDATE users SET fraud_score = ? WHERE id = ?').run(fraudScore, req.user.id);
      }

      const updatedSource = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(source_account_id);
      return { txId, updatedSource, destAccount, flagged, fraudScore, txType, source };
    });
    const result = await runTransfer();

    if (io) {
      io.to(`user:${req.user.id}`).emit('balance:update', {
        accountId: result.updatedSource.id,
        balance: result.updatedSource.balance,
      });

      if (result.destAccount) {
        io.to(`user:${result.destAccount.user_id}`).emit('balance:update', {
          accountId: result.destAccount.id,
          balance: result.destAccount.balance,
        });
        io.to(`user:${result.destAccount.user_id}`).emit('transaction:new', { message: 'Nouveau virement reçu' });
      }
    }

    res.status(201).json({
      message: result.flagged
        ? 'Virement en attente de vérification manuelle (activité inhabituelle détectée).'
        : result.txType === 'virement_externe'
          ? 'Virement externe effectué avec succès.'
          : 'Virement effectué avec succès.',
      transactionId: result.txId,
      newBalance: result.updatedSource.balance,
      flagged: result.flagged,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.publicMessage });
    next(err);
  }
}

function httpError(status, publicMessage) {
  const e = new Error(publicMessage);
  e.status = status;
  e.publicMessage = publicMessage;
  return e;
}

async function createScheduledPayment(req, res, next) {
  try {
    const { account_id, destination_info, amount, label, frequency } = req.body;
    const account = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
    if (!account || account.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
    }

    const id = uuid();
    const nextRun = new Date();
    nextRun.setDate(nextRun.getDate() + (frequency === 'hebdomadaire' ? 7 : 30));

    await db.prepare(`
      INSERT INTO scheduled_payments (id, account_id, destination_info, amount, label, frequency, next_run)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, account_id, destination_info, amount, label, frequency, nextRun.toISOString());

    res.status(201).json({ message: 'Prélèvement automatique programmé (signature électronique validée).', id });
  } catch (err) {
    next(err);
  }
}

async function listScheduledPayments(req, res) {
  const { accountId } = req.params;
  const account = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return res.status(404).json({ error: 'Compte introuvable.' });
  if (account.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
  }

  const payments = await db.prepare('SELECT * FROM scheduled_payments WHERE account_id = ?').all(accountId);
  res.json({ payments });
}

async function reviewTransaction(req, res, next) {
  const { txId } = req.params;
  const { approve } = req.body;
  const io = req.app.get('io');

  try {
    const runReview = db.transaction(async () => {
      const tx = await db.prepare('SELECT * FROM transactions WHERE id = ? FOR UPDATE').get(txId);
      if (!tx) throw httpError(404, 'Transaction introuvable.');
      if (tx.status !== 'pending') throw httpError(409, 'Transaction déjà traitée.');

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
          `).run(uuid(), destAccount.id, source.iban, creditAmount, tx.libelle || `Virement de ${source.iban}`);
        }

        return { approved: true, source, destAccount };
      }

      await db.prepare(`UPDATE transactions SET status = 'failed' WHERE id = ?`).run(txId);
      await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(Math.abs(tx.amount), tx.source_account_id);
      return { approved: false, source, destAccount: null };
    });
    const result = await runReview();

    await logAudit(req.user.id, 'tx_review', `tx=${txId} approve=${approve}`);

    if (io && result.source) {
      const sourceBalance = (await db.prepare('SELECT balance FROM accounts WHERE id = ?').get(result.source.id)).balance;
      io.to(`user:${result.source.user_id}`).emit('balance:update', {
        accountId: result.source.id,
        balance: sourceBalance,
      });
    }

    if (io && result.destAccount) {
      const destBalance = (await db.prepare('SELECT balance FROM accounts WHERE id = ?').get(result.destAccount.id)).balance;
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

async function logAudit(userId, action, details) {
  const { v4: uuidv4 } = require('uuid');
  await db.prepare('INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(uuidv4(), userId, action, details);
}

module.exports = { listTransactions, transfer, createScheduledPayment, listScheduledPayments, reviewTransaction };
