// Contrôles limités à l'instance locale dédiée ; aucune modification du schéma.
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const backend = path.resolve(__dirname, '../backend');
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env') });
const target = new URL(process.env.DATABASE_URL);
if (target.hostname !== '127.0.0.1' || target.port !== '5433' || target.pathname !== '/neobank_local'
  || process.env.NODE_ENV !== 'development') {
  console.error('Contrôle réservé à la base locale dédiée neobank_local sur 127.0.0.1:5433.');
  process.exit(2);
}
const db = require(path.join(backend, 'src/config/database'));
const mfa = require(path.join(backend, 'src/services/mfaService'));
const { authenticator } = require(path.join(backend, 'node_modules/otplib'));
const id = crypto.randomUUID();
const email = `${id}@example.test`;
(async () => {
  try {
    await assert.rejects(db.transaction(async () => {
      await db.prepare('INSERT INTO users(id,nom,prenom,email,password_hash) VALUES(?,?,?,?,?)')
        .run(id, 'Rollback', 'Synthétique', email, 'unused');
      throw new Error('rollback-synthetic');
    })(), /rollback-synthetic/);
    assert.equal(await db.prepare('SELECT id FROM users WHERE id=?').get(id), undefined);
    const secret = authenticator.generateSecret();
    await db.prepare('INSERT INTO users(id,nom,prenom,email,password_hash,multi_factor_secret,mfa_enabled) VALUES(?,?,?,?,?,?,?)')
      .run(id, 'Concurrence', 'Synthétique', email, 'unused', secret, true);
    const epoch = Date.now();
    const fixed = authenticator.clone();
    fixed.options = { epoch, window: 0 };
    const otp = fixed.generate(secret);
    const originalNow = Date.now;
    let results;
    try {
      Date.now = () => epoch;
      results = await Promise.allSettled([1, 2].map(() => db.transaction(async () => {
        const user = await db.prepare('SELECT * FROM users WHERE id=? FOR UPDATE').get(id);
        await mfa.consume(user, otp);
      })()));
    } finally {
      Date.now = originalNow;
    }
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.status === 401).length, 1);
    console.log('PASS : rollback et exclusion concurrente du même TOTP sur PostgreSQL réel local.');
  } finally {
    try { await db.prepare('DELETE FROM users WHERE id=?').run(id); }
    finally { await db.close(); }
  }
})().catch(() => {
  console.error('FAIL : contrôles PostgreSQL locaux non validés. Aucun secret affiché.');
  process.exitCode = 1;
});
