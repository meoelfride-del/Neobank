// Execution explicite sur une base PostgreSQL de recette isolee uniquement.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const target = process.env.TEST_DATABASE_URL;
if (!target || process.env.TEST_DATABASE_CONFIRM !== 'ISOLATED') {
  console.error('Configurer TEST_DATABASE_URL (base PostgreSQL de recette dediee) et TEST_DATABASE_CONFIRM=ISOLATED.');
  process.exit(2);
}
if (target === process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(target)) {
  console.error('La base de test doit etre distincte de DATABASE_URL et utiliser PostgreSQL.'); process.exit(2);
}
if (!new URL(target).pathname.slice(1).startsWith('neobank_validation_')) {
  console.error('Nom de base requis : neobank_validation_ suivi de votre suffixe de recette.');process.exit(2);
}
process.env.NODE_ENV='test';process.env.DATABASE_URL=target;
process.env.ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');
const db=require('../src/config/database');const mfa=require('../src/services/mfaService');const {authenticator}=require('otplib');
const id=crypto.randomUUID();
(async()=>{
  try {
    await db.initDatabase();
    const secret=authenticator.generateSecret();
    await db.prepare('INSERT INTO users(id,nom,prenom,email,password_hash,multi_factor_secret,mfa_enabled) VALUES(?,?,?,?,?,?,?)').run(id,'Test','PostgreSQL',id+'@example.test','unused',secret,true);
    await assert.rejects(db.transaction(async()=>{await db.prepare("UPDATE users SET status_kyc='verified' WHERE id=?").run(id);throw Error('rollback-synthetic');})(),/rollback-synthetic/);
    assert.equal((await db.prepare('SELECT status_kyc FROM users WHERE id=?').get(id)).status_kyc,'pending');
    const epoch=Date.now();const fixed=authenticator.clone();fixed.options={epoch,window:0};const otp=fixed.generate(secret);
    const originalNow=Date.now;Date.now=()=>epoch;
    let results;
    try { results=await Promise.allSettled([1,2].map(()=>db.transaction(async()=>{const user=await db.prepare('SELECT * FROM users WHERE id=? FOR UPDATE').get(id);await mfa.consume(user,otp);})())); }
    finally {Date.now=originalNow;}
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===401).length,1);
    console.log('PASS : rollback reel et verrouillage concurrent TOTP sur PostgreSQL.');
  } finally {
    try { await db.prepare('DELETE FROM users WHERE id=?').run(id); }
    finally { await db.close(); }
  }
})().catch(()=>{console.error('FAIL : controle PostgreSQL non valide. Verifier acces, permissions et base de recette sans publier ses identifiants.');process.exitCode=1;});
