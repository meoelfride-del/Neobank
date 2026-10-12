const { v4: uuidv4 } = require('uuid');
const { randomInt } = require('node:crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const kycService = require('../services/kycService');

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

async function getUserDetail(req, res) {
  const { userId } = req.params;
  const user = await db.prepare(`
    SELECT id, nom, prenom, email, phone, role, status_kyc, status_compte, fraud_score, created_at
    FROM users WHERE id = ?
  `).get(userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const accounts = await db.prepare(`
    SELECT id, type, currency, balance, iban, iban_version, label, created_at
    FROM accounts WHERE user_id = ? ORDER BY created_at ASC
  `).all(userId);
  const transactions = await db.prepare(`
    SELECT t.* FROM transactions t
    JOIN accounts a ON a.id = t.source_account_id
    WHERE a.user_id = ? ORDER BY t.timestamp DESC LIMIT 100
  `).all(userId);
  const notifications = await db.prepare(`
    SELECT id, title, message, kind, action_url, read_at, created_at
    FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(userId);
  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.balance), 0);
  const profile = await db.prepare('SELECT * FROM customer_profiles WHERE user_id = ?').get(userId);
  const document = await db.prepare('SELECT id, document_type, uploaded_at, reviewed_at, review_reason FROM kyc_documents WHERE user_id = ?').get(userId);
  res.set('Cache-Control', 'private, no-store');

  res.json({
    user,
    profile: profile || null,
    document: document || null,
    accounts,
    transactions,
    notifications,
    summary: { totalBalance, accountCount: accounts.length, transactionCount: transactions.length },
  });
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
  const result = await kycService.review(userId, req.user.id, req.body);
  const io = req.app.get('io');
  io?.to('role:admin').emit('kyc:updated', { userId, status: result.status });
  io?.to('user:' + userId).emit('kyc:updated', { status: result.status });
  res.json({ ...result, message: result.status === 'verified' ? 'KYC validé.' : result.status === 'rejected' ? 'KYC refusé.' : 'Validation KYC annulée.' });
}

async function updateUser(req, res, next) {
  const { userId } = req.params;
  const { nom, prenom, email, phone } = req.body;
  const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  try {
    await db.transaction(async () => {
      await db.prepare('SELECT id FROM users WHERE id = ? FOR UPDATE').get(userId);
      await db.prepare(`UPDATE users SET nom = ?, prenom = ?, email = ?, phone = ? WHERE id = ?`)
        .run(nom, prenom, email.toLowerCase(), phone, userId);
      await db.prepare('UPDATE kyc_documents SET id = ? WHERE user_id = ?').run(uuidv4(), userId);
      await logAudit(req.user.id, 'user_update', `user=${userId}`);
    })();
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
    SELECT id, user_id, type, currency, balance, iban, iban_version, label, created_at
    FROM accounts WHERE user_id = ? ORDER BY created_at ASC
  `).all(req.params.userId);
  res.json({ accounts });
}

async function sendUserNotification(req, res) {
  const { userId } = req.params;
  const { title, message, kind, actionUrl } = req.body;
  const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const notification = {
    id: uuidv4(), user_id: userId, title, message, kind, action_url: actionUrl || null,
  };
  await db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, kind, action_url, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(notification.id, userId, title, message, kind, notification.action_url, req.user.id);
  await logAudit(req.user.id, 'client_notification', `user=${userId} notification=${notification.id} kind=${kind}`);

  const io = req.app.get('io');
  if (io) io.to(`user:${userId}`).emit('admin:notification', notification);
  res.status(201).json({ message: 'Notification envoyée au client.', notification });
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

      if (operation === 'debit') {
        if (!account.iban) throw httpError(409, 'Attribuez un IBAN avant une opération sortante.');
        const txId = uuidv4();
        await db.prepare(`INSERT INTO transactions(id,source_account_id,destination_info,amount,type,category,status,libelle,debit_applied)
          VALUES(?,?,?,?, 'paiement','Autre','pending',?,FALSE)`).run(txId,accountId,'Ajustement débiteur',-amount,reason);
        await logAudit(req.user.id, 'debit_request', `tx=${txId}`);
        return { account, newBalance: account.balance, txId };
      }

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
      if(!result.txId) io.to(`user:${result.account.user_id}`).emit('balance:update', { accountId, balance: result.newBalance });
      io.to(`user:${result.account.user_id}`).emit('transaction:notification', {
        direction: operation === 'credit' ? 'incoming' : 'outgoing',
        status: result.txId ? 'pending' : 'completed',
        amount,
        message: operation === 'credit' ? 'Fonds ajoutés à votre compte' : 'Solde de votre compte ajusté',
      });
    }
    res.json({ message: result.txId ? 'Demande sortante créée. OTP et validation requis avant débit.' : 'Solde ajusté.', accountId, balance: result.newBalance, transactionId: result.txId });
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

  await db.transaction(async () => {
    await db.prepare('UPDATE users SET status_compte = ? WHERE id = ?').run(suspended ? 'suspended' : 'active', userId);
    await logAudit(req.user.id, 'account_suspend', `user=${userId} suspended=${suspended}`);
  })();
  const io = req.app.get('io');
  io?.to('role:admin').emit('user:updated', { userId });
  if (suspended) io?.in('user:' + userId).disconnectSockets(true);
  res.json({ message: suspended ? 'Compte suspendu.' : 'Compte réactivé.' });
}

async function pendingTransactions(req, res) {
  const transactions = await db.prepare(`
    SELECT t.*, a.iban, u.email, u.fraud_score,
      c.client_message AS otp_message,
      c.expires_at AS otp_expires_at,
      CASE WHEN c.verified_at IS NOT NULL THEN TRUE ELSE FALSE END AS otp_verified,
      CASE WHEN c.transaction_id IS NOT NULL THEN TRUE ELSE FALSE END AS otp_generated
    FROM transactions t
    JOIN accounts a ON t.source_account_id = a.id
    JOIN users u ON a.user_id = u.id
    LEFT JOIN transfer_challenges c ON c.transaction_id = t.id
    WHERE t.status = 'pending'
    ORDER BY t.timestamp DESC
  `).all();
  res.json({ transactions });
}

async function generateTransferOtp(req,res,next) {
  try {
    const otp=String(randomInt(0,1000000)).padStart(6,'0');const codeHash=await bcrypt.hash(otp,10);
    const expiresAt=new Date(Date.now()+req.body.expiresInMinutes*60000).toISOString();
    const userId=await db.transaction(async()=>{
      const tx=await db.prepare('SELECT * FROM transactions WHERE id=? FOR UPDATE').get(req.params.txId);
      if(!tx)throw httpError(404,'Transaction introuvable.');
      if(tx.status!=='pending'||Number(tx.amount)>=0)throw httpError(409,'Operation sortante non disponible.');
      const account=await db.prepare('SELECT user_id FROM accounts WHERE id=?').get(tx.source_account_id);
      await db.prepare(`INSERT INTO transfer_challenges(transaction_id,code_hash,client_message,expires_at,attempts,verified_at,created_by)
        VALUES(?,?,?,?,0,NULL,?) ON CONFLICT(transaction_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,
        client_message=EXCLUDED.client_message,expires_at=EXCLUDED.expires_at,attempts=0,verified_at=NULL,created_by=EXCLUDED.created_by,created_at=CURRENT_TIMESTAMP`)
        .run(tx.id,codeHash,req.body.message,expiresAt,req.user.id);
      await logAudit(req.user.id,'transfer_otp_generated','tx='+tx.id);return account.user_id;
    })();
    req.app.get('io')?.to('user:'+userId).emit('transaction:notification',{direction:'outgoing',status:'otp_required',message:req.body.message});
    res.set('Cache-Control','private, no-store');res.status(201).json({otp,expiresAt,clientMessage:req.body.message,message:'OTP genere. Transmettez-le au client par un canal securise.'});
  }catch(error){if(error.status)return res.status(error.status).json({error:error.publicMessage});next(error);}
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

      const destination = tx.destination_account_id
        ? await db.prepare('SELECT * FROM accounts WHERE id=?').get(tx.destination_account_id)
        : tx.type === 'virement_interne' ? await resolveDestinationAccount(tx.destination_info) : null;
      const lockIds = [...new Set([tx.source_account_id, destination?.id].filter(Boolean))].sort();
      for (const id of lockIds) await db.prepare('SELECT id FROM accounts WHERE id=? FOR UPDATE').get(id);

      const source = tx.source_account_id
        ? await db.prepare('SELECT * FROM accounts WHERE id = ? FOR UPDATE').get(tx.source_account_id)
        : null;
      if (!source) throw httpError(404, 'Compte source introuvable.');

      if (approve) {
        if (Number(tx.amount) >= 0) throw httpError(409, 'Cette revue exige une opération sortante.');
        const challenge = await db.prepare('SELECT verified_at, expires_at FROM transfer_challenges WHERE transaction_id = ?').get(txId);
        if (!challenge) throw httpError(409, 'Générez d’abord un code OTP pour ce transfert.');
        if (!challenge.verified_at) throw httpError(409, 'Le client doit d’abord confirmer le code OTP.');
        if (new Date(challenge.expires_at).getTime() <= Date.now()) throw httpError(409, 'La validation OTP a expiré. Générez un nouveau code.');
        const destAccount = destination;

        if ((tx.type === 'virement_interne' || tx.destination_account_id) && !destAccount) {
          throw httpError(409, 'Compte destinataire introuvable.');
        }



        const creditAmount = Math.abs(tx.amount);
        const owner = await db.prepare('SELECT status_kyc,status_compte FROM users WHERE id=? FOR UPDATE').get(source.user_id);
        if (!source.iban || owner.status_kyc !== 'verified' || owner.status_compte !== 'active') throw httpError(409, 'Le compte source doit être actif avec un IBAN et un KYC validé.');
        if (destAccount && destAccount.currency !== source.currency) throw httpError(409, 'Les devises des comptes doivent correspondre.');
        if (!tx.debit_applied) {
          if (Number(source.balance) < creditAmount) throw httpError(409, 'Solde insuffisant au moment de la validation.');
          await db.prepare('UPDATE accounts SET balance=balance-? WHERE id=?').run(creditAmount,source.id);
          await db.prepare('UPDATE transactions SET debit_applied=TRUE WHERE id=?').run(txId);
        }
        await db.prepare(`UPDATE transactions SET status = 'completed' WHERE id = ?`).run(txId);
        if (destAccount) {
          await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(creditAmount, destAccount.id);
          await db.prepare(`
            INSERT INTO transactions (id, source_account_id, destination_info, amount, type, category, status, libelle)
            VALUES (?, ?, ?, ?, 'depot', 'Autre', 'completed', ?)
          `).run(uuidv4(), destAccount.id, source.iban, creditAmount, tx.libelle || `Virement de ${source.iban}`);
        }

        if (tx.type.startsWith('virement')) {
          const sms = require('../services/smsService');
          const amount = creditAmount.toFixed(2) + ' ' + source.currency;
          await sms.enqueue(source.user_id, 'transfer:' + txId + ':sent', 'NEO BANK : votre transfert de ' + amount + ' a été validé. Consultez les détails dans votre espace.');
          if (destAccount) await sms.enqueue(destAccount.user_id, 'transfer:' + txId + ':received', 'NEO BANK : vous avez reçu un transfert de ' + amount + '. Consultez votre espace.');
        }
        await logAudit(req.user.id,'tx_review','tx='+txId+' approve=true');
        return { source, destAccount, balanceChanged: true };
      }

      await db.prepare(`UPDATE transactions SET status = 'failed' WHERE id = ?`).run(txId);
      if (tx.debit_applied) await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(Math.abs(tx.amount), tx.source_account_id);
      await logAudit(req.user.id,'tx_review','tx='+txId+' approve=false');
      return { source, destAccount: null, balanceChanged: tx.debit_applied };
    });

    const result = await runReview();


    if (io && result.source) {
      const sourceBalance = (await db.prepare('SELECT balance FROM accounts WHERE id = ?').get(result.source.id)).balance;
      if(result.balanceChanged) io.to(`user:${result.source.user_id}`).emit('balance:update', {
        accountId: result.source.id,
        balance: sourceBalance,
      });
      const reviewedTx = await db.prepare('SELECT amount FROM transactions WHERE id = ?').get(txId);
      io.to(`user:${result.source.user_id}`).emit('transaction:notification', {
        direction: 'outgoing',
        status: approve ? 'completed' : 'cancelled',
        amount: Math.abs(reviewedTx.amount),
        message: approve ? 'Votre opération sortante a été validée' : 'Votre opération a été rejetée',
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

    res.json({ message: approve ? 'Transaction validée.' : 'Transaction rejetée.' });
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
  getUserDetail,
  getStats,
  validateKyc,
  updateUser,
  listUserAccounts,
  sendUserNotification,
  adjustBalance,
  suspendUser,
  pendingTransactions,
  generateTransferOtp,
  reviewTransaction,
};
