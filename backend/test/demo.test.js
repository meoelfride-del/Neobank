const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://';
process.env.KYC_DEMO_AUTO_APPROVE = 'false';
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const db = require('../src/config/database');
const { submitKyc, saveProfile, saveDocument } = require('../src/services/kycService');
const { seed } = require('../src/config/seed');
const { getBotReply } = require('../src/services/chatbotService');
before(() => db.initDatabase());
after(() => db.close());

async function user(status = 'pending') {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO users (id, nom, prenom, email, password_hash, status_kyc) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, 'Audit', 'Demo', `${id}@example.test`, 'hash-synthetique-non-utilise', status);
  if (status === 'pending') {
    await saveProfile(id, { birth_date: '1990-01-01', birth_place: 'Ville Test', nationality: 'Test', address_line: '12 rue Test', city: 'Ville Test', country: 'Pays Test', postal_code: '', occupation: '' });
    const buffer = await require('sharp')({ create: { width: 20, height: 20, channels: 3, background: '#123456' } }).jpeg().toBuffer();
    await saveDocument(id, { buffer, mimetype: 'image/jpeg' }, 'identity_card', { buffer, mimetype: 'image/jpeg' });
  }
  return id;
}

test('la demande reste en revue manuelle après plusieurs soumissions', async () => {
  const id = await user();
  assert.deepEqual(await submitKyc(id), { status: 'in_review' });
  assert.equal((await submitKyc(id)).status, 'in_review');
});

test('une soumission ne peut pas écraser une décision administrateur', async () => {
  for (const decision of ['verified', 'rejected']) {
    const id = await user();
    await submitKyc(id);
    await db.prepare('UPDATE users SET status_kyc = ? WHERE id = ?').run(decision, id);
    assert.equal((await submitKyc(id)).status, decision);
  }
});

test('aucun drapeau historique ne permet une validation automatique', async () => {
  process.env.KYC_DEMO_AUTO_APPROVE = 'true';
  try { assert.equal((await submitKyc(await user())).status, 'in_review'); }
  finally { process.env.KYC_DEMO_AUTO_APPROVE = 'false'; }
});

test('le seed production est refusé avant toute initialisation de schéma', async (t) => {
  const init = t.mock.method(db, 'initDatabase', () => { throw new Error('La base ne doit pas être touchée'); });
  process.env.NODE_ENV = 'production';
  process.env.ENABLE_DEMO_SEED = 'true';
  try {
    await assert.rejects(seed(), /Seed de démonstration interdit/);
    assert.equal(init.mock.callCount(), 0);
  } finally { process.env.NODE_ENV = 'test'; delete process.env.ENABLE_DEMO_SEED; }
});

test('un utilisateur absent ne devient pas vérifié', async () => {
  await assert.rejects(submitKyc(crypto.randomUUID()), error => error.status === 404);
});

test('l’assistant ne promet ni transfert réel ni intervention humaine', () => {
  const transfer = getBotReply('virement');
  assert.match(transfer.reply, /demandes/);
  assert.match(transfer.reply, /ne se connecte pas à un réseau de paiement externe/);
  const support = getBotReply('conseiller');
  assert.equal(support.escalated, true);
  assert.match(support.reply, /sans transmission/);
  assert.match(support.reply, /Aucun suivi humain/);
});
