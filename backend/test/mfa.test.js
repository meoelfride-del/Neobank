const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
process.env.NODE_ENV='test';process.env.DATABASE_URL='pg-mem://';process.env.ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');
const db=require('../src/config/database');const mfa=require('../src/services/mfaService');
before(()=>db.initDatabase());after(()=>db.close());
async function user() { const id=crypto.randomUUID();await db.prepare('INSERT INTO users (id, nom, prenom, email, password_hash) VALUES (?, ?, ?, ?, ?)').run(id,'Test','MFA',id+'@example.test',await bcrypt.hash('Synthetic123!',4));return id; }
async function record(id) { return db.prepare('SELECT * FROM users WHERE id=?').get(id); }
test('configuration nécessite le mot de passe, reste inactive et stocke un secret chiffré',async()=>{
  const id=await user();await assert.rejects(mfa.setup(id,'incorrect'),error=>error.status===401);
  const setup=await mfa.setup(id,'Synthetic123!');assert.ok(setup.secret);assert.equal((await record(id)).mfa_enabled,false);
  const row=await db.prepare('SELECT * FROM mfa_setups WHERE user_id=?').get(id);assert.match(row.secret_encrypted,/^v1\./);assert.ok(!row.secret_encrypted.includes(setup.secret));
});
test('activation impossible sans configuration, avec code invalide ou configuration expirée',async()=>{
  const id=await user();await assert.rejects(mfa.enable(id,'Synthetic123!','123456'),error=>error.status===409);
  const setup=await mfa.setup(id,'Synthetic123!');let bad='000000';if(authenticator.check(bad,setup.secret))bad='111111';
  await assert.rejects(mfa.enable(id,'Synthetic123!',bad),error=>error.status===401);assert.equal((await record(id)).mfa_enabled,false);
  await db.prepare('UPDATE mfa_setups SET expires_at=? WHERE user_id=?').run('2000-01-01T00:00:00Z',id);
  await assert.rejects(mfa.enable(id,'Synthetic123!',authenticator.generate(setup.secret)),error=>error.status===409);
});
test('activation confirmée, secret non redonné, code consommé et code suivant accepté',async(t)=>{
  const epoch=1800000000000;t.mock.method(Date,'now',()=>epoch);
  const id=await user();const setup=await mfa.setup(id,'Synthetic123!');const otp=authenticator.generate(setup.secret);
  await mfa.enable(id,'Synthetic123!',otp);const enabled=await record(id);assert.equal(enabled.mfa_enabled,true);assert.match(enabled.multi_factor_secret,/^v1\./);
  assert.equal(await db.prepare('SELECT * FROM mfa_setups WHERE user_id=?').get(id),undefined);
  await assert.rejects(mfa.setup(id,'Synthetic123!'),error=>error.status===409);
  await assert.rejects(mfa.consume(enabled,otp),error=>error.status===401);
  Date.now.mock.restore();t.mock.method(Date,'now',()=>epoch+30000);
  await mfa.consume(enabled,authenticator.generate(setup.secret));
  await assert.rejects(mfa.consume(enabled,authenticator.generate(setup.secret)),error=>error.status===401);
});
test('un compte MFA historique conserve son secret et bénéficie du contrôle de rejeu',async(t)=>{
  t.mock.method(Date,'now',()=>1800000000000);
  const id=await user();const secret=authenticator.generateSecret();await db.prepare('UPDATE users SET multi_factor_secret=?, mfa_enabled=TRUE WHERE id=?').run(secret,id);
  const row=await record(id);const otp=authenticator.generate(secret);await mfa.consume(row,otp);await assert.rejects(mfa.consume(row,otp),error=>error.status===401);
});
