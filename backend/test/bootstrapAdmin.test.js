const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://';
process.env.ADMIN_PASSWORD = 'SyntheticBootstrap123!';
const db = require('../src/config/database');
const { bootstrapAdmin } = require('../src/config/bootstrapAdmin');
before(() => db.initDatabase());
after(() => db.close());

test('redémarrer préserve mot de passe, suspension et KYC de l’administrateur', async () => {
  process.env.ADMIN_EMAIL = 'admin-bootstrap@example.test';
  await bootstrapAdmin();
  const created = await db.prepare('SELECT * FROM users WHERE email=?').get(process.env.ADMIN_EMAIL);
  await db.prepare("UPDATE users SET status_compte='suspended', status_kyc='pending' WHERE id=?").run(created.id);
  process.env.ADMIN_PASSWORD = 'AnotherSyntheticPassword123!';
  await bootstrapAdmin();
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(created.id);
  assert.equal(user.password_hash, created.password_hash);
  assert.equal(user.status_compte, 'suspended');
  assert.equal(user.status_kyc, 'pending');
});

test('un client ne peut pas devenir administrateur par une collision d’e-mail', async () => {
  process.env.ADMIN_EMAIL = 'client-bootstrap@example.test';
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO users(id,nom,prenom,email,password_hash) VALUES(?,?,?,?,?)')
    .run(id, 'Test', 'Client', process.env.ADMIN_EMAIL, 'unchanged');
  await assert.rejects(bootstrapAdmin(), /appartient à un client/);
  const user = await db.prepare('SELECT role,password_hash FROM users WHERE id=?').get(id);
  assert.equal(user.role, 'client');
  assert.equal(user.password_hash, 'unchanged');
});
