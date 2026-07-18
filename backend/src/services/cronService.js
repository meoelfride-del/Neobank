const cron = require('node-cron');
const db = require('../config/database');
const { categorize } = require('./budgetService');
const { v4: uuid } = require('uuid');

/**
 * Tâche planifiée (toutes les heures) qui exécute les prélèvements
 * automatiques (SEPA) dont la date d'échéance (next_run) est atteinte.
 */
function startCronJobs(io) {
  cron.schedule('0 * * * *', () => {
    try {
      const due = db.prepare(`
        SELECT * FROM scheduled_payments WHERE active = 1 AND next_run <= datetime('now')
      `).all();

      for (const payment of due) {
        try {
          const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(payment.account_id);
          if (!account || account.balance < payment.amount) continue;

          const runPayment = db.transaction(() => {
            db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(payment.amount, account.id);
            db.prepare(`
              INSERT INTO transactions (id, source_account_id, destination_info, amount, type, category, status, libelle)
              VALUES (?, ?, ?, ?, 'prelevement', ?, 'completed', ?)
            `).run(uuid(), account.id, payment.destination_info, -payment.amount, categorize(payment.label), payment.label);

            const next = new Date(payment.next_run);
            next.setDate(next.getDate() + (payment.frequency === 'hebdomadaire' ? 7 : 30));
            db.prepare('UPDATE scheduled_payments SET next_run = ? WHERE id = ?').run(next.toISOString(), payment.id);
          });

          runPayment();

          if (io) {
            const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id);
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
}

module.exports = { startCronJobs };
