/* Peuple la base avec un compte admin et un client de démonstration. */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('./database');
const { generateIban } = require('../services/cryptoService');

async function seed() {
  await db.initDatabase();
  const existingAdmin = await db.prepare('SELECT id FROM users WHERE email = ?').get('admin@neobank.demo');

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);
    await db.prepare(`
      INSERT INTO users (id, nom, prenom, email, password_hash, phone, role, status_kyc, status_compte)
      VALUES (?, 'Admin', 'NeoBank', 'admin@neobank.demo', ?, '+33600000000', 'admin', 'verified', 'active')
    `).run(uuid(), passwordHash);
    console.log('✔ Admin créé : admin@neobank.demo / Admin123!');
  }

  const existingClient = await db.prepare('SELECT id FROM users WHERE email = ?').get('client@neobank.demo');
  if (!existingClient) {
    const passwordHash = await bcrypt.hash('Client123!', 12);
    const userId = uuid();
    await db.prepare(`
      INSERT INTO users (id, nom, prenom, email, password_hash, phone, role, status_kyc, status_compte)
      VALUES (?, 'Dupont', 'Alice', 'client@neobank.demo', ?, '+33612345678', 'client', 'verified', 'active')
    `).run(userId, passwordHash);

    const accountId = uuid();
    await db.prepare(`
      INSERT INTO accounts (id, user_id, type, currency, balance, iban, label)
      VALUES (?, ?, 'Courant', 'EUR', 2450.75, ?, 'Compte Courant')
    `).run(accountId, userId, generateIban());

    const savingsId = uuid();
    await db.prepare(`
      INSERT INTO accounts (id, user_id, type, currency, balance, iban, label)
      VALUES (?, ?, 'Epargne', 'EUR', 8300.00, ?, 'Livret Épargne')
    `).run(savingsId, userId, generateIban());

    const demoTx = [
      ['Salaire Juillet', 2800, 'depot'],
      ['Carrefour Market', -54.3, 'paiement'],
      ['Netflix Abonnement', -15.99, 'paiement'],
      ['Loyer Juillet', -890, 'prelevement'],
      ['SNCF Billet', -42.5, 'paiement'],
    ];
    const { categorize } = require('../services/budgetService');
    for (const [libelle, amount, type] of demoTx) {
      await db.prepare(`
        INSERT INTO transactions (id, source_account_id, destination_info, amount, type, category, status, libelle)
        VALUES (?, ?, '', ?, ?, ?, 'completed', ?)
      `).run(uuid(), accountId, amount, type, categorize(libelle), libelle);
    }

    console.log('✔ Client démo créé : client@neobank.demo / Client123!');
  }

  console.log('Seed terminé.');
}

if (require.main === module) {
  seed()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { seed };
