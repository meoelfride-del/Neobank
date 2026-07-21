const cron = require('node-cron');
const db = require('../config/database');
const { categorize } = require('./budgetService');
const { v4: uuid } = require('uuid');

/**
 * Tâche planifiée (toutes les heures) qui exécute les prélèvements
 * automatiques (SEPA) dont la date d'échéance (next_run) est atteinte.
 */
function startCronJobs(io) {
  const task = cron.schedule('0 * * * *', async () => {
    try {
      const due = await db.prepare(`
        SELECT * FROM scheduled_payments WHERE active = TRUE AND next_run <= ?
      `).all(new Date());

      for (const payment of due) {
        try {
          const account = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(payment.account_id);
          if (!account || account.balance < payment.amount) continue;

          const runPayment = db.transaction(async () => {
            await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(payment.amount, account.id);
            await db.prepare(`
              INSERT INTO transactions (id, source_account_id, destination_info, amount, type, category, status, libelle)
              VALUES (?, ?, ?, ?, 'prelevement', ?, 'completed', ?)
            `).run(uuid(), account.id, payment.destination_info, -payment.amount, categorize(payment.label), payment.label);

            const next = new Date(payment.next_run);
            next.setDate(next.getDate() + (payment.frequency === 'hebdomadaire' ? 7 : 30));
            await db.prepare('UPDATE scheduled_payments SET next_run = ? WHERE id = ?').run(next.toISOString(), payment.id);
          });

          await runPayment();

          if (io) {
            const updated = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id);
            io.to(`user:${account.user_id}`).emit('balance:update', { accountId: account.id, balance: updated.balance });
          }
        } catch (paymentError) {
          console.error('[cron] Failed to process scheduled payment', payment.id, paymentError);
        }
      }
    } catch (err) {
      console.error('[cron] Unexpected error while running scheduled payments', err);
    }
  });

  console.log('[cron] Prélèvements automatiques : tâche planifiée active (toutes les heures).');
  return task;
}

module.exports = { startCronJobs };
