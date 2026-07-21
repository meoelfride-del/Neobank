require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('./database');

async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password || password.length < 12) {
    throw new Error('ADMIN_EMAIL et ADMIN_PASSWORD (12 caractères minimum) sont obligatoires.');
  }

  await db.initDatabase();
  const existing = await db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
  if (existing) {
    if (existing.role !== 'admin') {
      await db.prepare("UPDATE users SET role = 'admin', status_compte = 'active', status_kyc = 'verified' WHERE id = ?")
        .run(existing.id);
    }
    console.log(`Compte administrateur prêt : ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.prepare(`
    INSERT INTO users (id, nom, prenom, email, password_hash, phone, role, status_kyc, status_compte)
    VALUES (?, 'Administrateur', 'NeoBank', ?, ?, ?, 'admin', 'verified', 'active')
  `).run(uuid(), email, passwordHash, process.env.ADMIN_PHONE || '+22900000000');

  console.log(`Compte administrateur créé : ${email}`);
}

if (require.main === module) {
  bootstrapAdmin()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { bootstrapAdmin };
