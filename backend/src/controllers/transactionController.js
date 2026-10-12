const { v4: uuid } = require('uuid');
const bcrypt = require('bcryptjs');
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
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '50', 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(req.query.offset || '0', 10) || 0, 0);
  const account = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return res.status(404).json({ error: 'Compte introuvable.' });
  if (account.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
  }

  const transactions = await db.prepare(`
    SELECT t.*,
      c.client_message AS otp_message,
      c.expires_at AS otp_expires_at,
      CASE WHEN c.verified_at IS NOT NULL THEN TRUE ELSE FALSE END AS otp_verified,
      CASE WHEN c.transaction_id IS NOT NULL THEN TRUE ELSE FALSE END AS otp_required
    FROM transactions t
    LEFT JOIN transfer_challenges c ON c.transaction_id = t.id
    WHERE t.source_account_id = ? ORDER BY t.timestamp DESC LIMIT ? OFFSET ?
  `).all(accountId, limit + 1, offset);
  const hasMore = transactions.length > limit;
  if (hasMore) transactions.pop();
  res.json({ transactions, pagination: { limit, offset, hasMore, nextOffset: hasMore ? offset + limit : null } });
}

/** Demande sortante : debit uniquement apres OTP et revue admin. */
async function transfer(req, res, next) {
  const { source_account_id, destination_type, destination_info, amount, libelle } = req.body;
  const idempotencyKey = req.get('Idempotency-Key');
  const io = req.app.get('io');

  if (!idempotencyKey || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'Une clé Idempotency-Key valide (8 à 128 caractères) est requise.' });
  }

  try {
    const runTransfer = db.transaction(async () => {
      const source = await db.prepare('SELECT * FROM accounts WHERE id = ? FOR UPDATE').get(source_account_id);
      if (!source) throw httpError(404, 'Compte source introuvable.');
      if (source.user_id !== req.user.id) throw httpError(403, 'Ce compte ne vous appartient pas.');
      if (!source.iban) throw httpError(409, 'Votre IBAN doit être attribué avant une opération sortante.');
      const existing = await db.prepare('SELECT * FROM transactions WHERE source_account_id = ? AND idempotency_key = ?').get(source_account_id, idempotencyKey);
      if (existing) {
        if (Math.abs(Number(existing.amount)) !== Number(amount) || existing.destination_info !== destination_info || (existing.libelle || '') !== (libelle || '')) throw httpError(409, 'Cette clé correspond à une autre demande.');
        return { txId: existing.id, updatedSource: source, destAccount: null, flagged: false, requiresApproval: existing.status === 'pending', replayed: true };
      }
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
      const requiresApproval = true;
      const category = categorize(libelle || '');
      const txId = uuid();
      const destAccount = await resolveDestinationAccount(destination_info);
      if (destination_type === 'phone' && !destAccount) throw httpError(422, 'Aucun compte associé à ce téléphone.');
      if (destAccount?.id === source.id) throw httpError(422, 'Choisissez un autre compte destinataire.');
      if (destAccount && destAccount.currency !== source.currency) throw httpError(409, 'Les devises des comptes doivent correspondre.');
      const txType = destAccount ? 'virement_interne' : 'virement_externe';

      // Aucun debit avant confirmation OTP et decision administrateur.

      await db.prepare(`
        INSERT INTO transactions (id, source_account_id, destination_info, amount, type, category, status, libelle, idempotency_key, debit_applied, destination_account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?)
      `).run(txId, source_account_id, destination_info, -amount, txType, category, requiresApproval ? 'pending' : 'completed', libelle || '', idempotencyKey, destAccount?.id || null);



      if (flagged) {
        await db.prepare('UPDATE users SET fraud_score = ? WHERE id = ?').run(fraudScore, req.user.id);
      }

      const updatedSource = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(source_account_id);
      return { txId, updatedSource, destAccount, flagged, requiresApproval, fraudScore, txType, source };
    });
    const result = await runTransfer();

    if (io && !result.replayed) {

      io.to(`user:${req.user.id}`).emit('transaction:notification', {
        direction: 'outgoing',
        status: result.requiresApproval ? 'pending' : 'completed',
        amount,
        message: result.requiresApproval ? 'Virement sortant en attente de validation' : 'Virement sortant effectué',
      });


    }

    res.status(result.replayed ? 200 : 201).json({
      message: result.replayed
        ? 'Cette demande a déjà été traitée.'
        : result.flagged
        ? 'Virement en attente de validation manuelle (activité inhabituelle détectée).'
        : 'Virement enregistré. Un administrateur va générer votre code OTP avant validation.',
      transactionId: result.txId,
      newBalance: result.updatedSource.balance,
      flagged: result.flagged,
      requiresApproval: result.requiresApproval,
      idempotentReplayed: Boolean(result.replayed),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.publicMessage });
    next(err);
  }
}

async function cancelTransfer(req, res, next) {
  const { txId } = req.params;
  const io = req.app.get('io');
  try {
    const runCancellation = db.transaction(async () => {
      const tx = await db.prepare('SELECT * FROM transactions WHERE id = ? FOR UPDATE').get(txId);
      if (!tx) throw httpError(404, 'Transaction introuvable.');
      if (!['virement_interne', 'virement_externe', 'prelevement', 'paiement'].includes(tx.type)) throw httpError(409, 'Cette opération ne peut pas être annulée.');
      if (tx.status !== 'pending') throw httpError(409, 'Seul un transfert en attente peut être annulé.');
      const source = await db.prepare('SELECT * FROM accounts WHERE id = ? FOR UPDATE').get(tx.source_account_id);
      if (!source) throw httpError(404, 'Compte source introuvable.');
      if (source.user_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'Ce transfert ne vous appartient pas.');

      const refund = Math.abs(tx.amount);
      await db.prepare(`UPDATE transactions SET status = 'failed', libelle = ? WHERE id = ?`)
        .run(`${tx.libelle || 'Virement'} — annulé`, txId);
      if (tx.debit_applied) await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(refund, source.id);
      await logAudit(req.user.id, 'transfer_cancel', 'tx='+txId);
      return { source, refund, refunded: tx.debit_applied };
    });
    const result = await runCancellation();

    if (io) {
      const updated = await db.prepare('SELECT balance FROM accounts WHERE id = ?').get(result.source.id);
      if(result.refunded) io.to(`user:${result.source.user_id}`).emit('balance:update', { accountId: result.source.id, balance: updated.balance });
      io.to(`user:${result.source.user_id}`).emit('transaction:notification', {
        direction: 'outgoing', status: 'cancelled', amount: result.refund, message: result.refunded ? 'Opération annulée et montant remboursé' : 'Opération annulée, sans débit',
      });
    }
    res.json({ message: result.refunded ? 'Opération annulée et montant remboursé.' : 'Opération annulée. Aucun montant n’a été débité.' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.publicMessage });
    next(err);
  }
}

async function verifyTransferOtp(req,res,next) {
  const {txId}=req.params;
  try {
    const verdict=await db.transaction(async()=>{
      const tx=await db.prepare('SELECT * FROM transactions WHERE id=? FOR UPDATE').get(txId);
      if(!tx)throw httpError(404,'Transaction introuvable.');
      const account=await db.prepare('SELECT user_id FROM accounts WHERE id=?').get(tx.source_account_id);
      if(account?.user_id!==req.user.id)throw httpError(403,'Acces refuse.');
      if(tx.status!=='pending'||Number(tx.amount)>=0)throw httpError(409,'Operation non disponible.');
      const challenge=await db.prepare('SELECT * FROM transfer_challenges WHERE transaction_id=? FOR UPDATE').get(txId);
      if(!challenge)throw httpError(409,'Le code OTP doit etre fourni par un administrateur.');
      if(new Date(challenge.expires_at).getTime()<=Date.now())throw httpError(410,'Ce code OTP a expire.');
      if(challenge.verified_at)throw httpError(409,'Code OTP deja confirme.');
      if(challenge.attempts>=5)throw httpError(429,'Demandez un nouveau code OTP.');
      if(!await bcrypt.compare(req.body.otp,challenge.code_hash)){await db.prepare('UPDATE transfer_challenges SET attempts=attempts+1 WHERE transaction_id=?').run(txId);return false;}
      await db.prepare('UPDATE transfer_challenges SET verified_at=CURRENT_TIMESTAMP WHERE transaction_id=?').run(txId);
      await logAudit(req.user.id,'transfer_otp_verified','tx='+txId);return true;
    })();
    if(!verdict)throw httpError(401,'Code OTP incorrect.');
    req.app.get('io')?.to('role:admin').emit('transaction:otp-verified',{transactionId:txId});
    res.json({message:'Code OTP confirme. Validation administrateur requise avant debit.',verified:true});
  } catch(error){if(error.status)return res.status(error.status).json({error:error.publicMessage});next(error);}
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
    if (!account.iban) return res.status(409).json({ error: 'Votre IBAN doit être attribué avant de programmer une opération.' });

    const id = uuid();
    const nextRun = new Date();
    nextRun.setDate(nextRun.getDate() + (frequency === 'hebdomadaire' ? 7 : 30));

    await db.prepare(`
      INSERT INTO scheduled_payments (id, account_id, destination_info, amount, label, frequency, next_run)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, account_id, destination_info, amount, label, frequency, nextRun.toISOString());

    res.status(201).json({ message: 'Échéance enregistrée. Aucun mandat SEPA ni signature électronique collecté par ce formulaire.', id });
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

async function reviewTransaction(req,res,next) {
  if(req.user?.role!=='admin')return res.status(403).json({error:'Acces refuse.'});
  return require('./adminController').reviewTransaction(req,res,next);
}

async function logAudit(userId, action, details) {
  const { v4: uuidv4 } = require('uuid');
  await db.prepare('INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(uuidv4(), userId, action, details);
}

module.exports = { listTransactions, transfer, cancelTransfer, verifyTransferOtp, createScheduledPayment, listScheduledPayments, reviewTransaction };

