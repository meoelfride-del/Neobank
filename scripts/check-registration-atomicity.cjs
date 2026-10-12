const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const backend = path.resolve(__dirname, '../backend');
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env') });
const target = new URL(process.env.DATABASE_URL);
if (target.hostname !== '127.0.0.1' || target.port !== '5433' || target.pathname !== '/neobank_local'
  || process.env.NODE_ENV !== 'development') throw new Error('Contrôle limité à la base locale dédiée.');
const db = require(path.join(backend, 'src/config/database'));
const { register } = require(path.join(backend, 'src/controllers/authController'));
const email = crypto.randomUUID() + '@example.test';
const req = { app: { get: () => undefined }, body: {
  email, nom: 'Test', prenom: 'Atomicité', password: crypto.randomBytes(20).toString('hex'),
  phone: '+229' + crypto.randomInt(10000000, 99999999), birth_date: '1990-01-01', birth_place: 'Ville Test',
  nationality: 'Test', address_line: '12 rue Test', city: 'Ville Test', postal_code: '', country: 'Pays Test', occupation: '',
} };
(async () => {
  const originalExpiry = process.env.JWT_EXPIRES_IN;
  let createdId;
  try {
    process.env.JWT_EXPIRES_IN = 'invalid-synthetic-expiry';
    let failure;
    await register(req, { status() { return this; }, json() { throw Error('Unexpected success'); } }, err => { failure = err; });
    assert.ok(failure);
    assert.equal(await db.prepare('SELECT id FROM users WHERE email=?').get(email), undefined);
    process.env.JWT_EXPIRES_IN = originalExpiry || '15m';
    let result;
    await register(req, { status(code) { assert.equal(code, 201); return this; }, json(data) { result = data; } }, err => { throw err; });
    assert.ok(result.accessToken && result.refreshToken);
    createdId = result.user.id;
    assert.ok(await db.prepare('SELECT user_id FROM customer_profiles WHERE user_id=?').get(createdId));
    assert.equal((await db.prepare('SELECT id FROM accounts WHERE user_id=?').all(createdId)).length, 1);
    assert.equal((await db.prepare('SELECT id FROM refresh_sessions WHERE user_id=?').all(createdId)).length, 1);
    console.log('PASS PostgreSQL réel : compte, profil et session atomiques ; échec JWT sans compte orphelin.');
  } finally {
    if (originalExpiry === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = originalExpiry;
    try { if (createdId) await db.prepare('DELETE FROM users WHERE id=?').run(createdId); }
    finally { await db.close(); }
  }
})().catch(() => { console.error('FAIL atomicité de l’inscription locale.'); process.exitCode = 1; });
