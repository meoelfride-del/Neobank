const db = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { authenticator } = require('otplib');
const { encryptSecret, decryptSecret } = require('./mfaCrypto');
function failure(status, publicMessage) { return Object.assign(new Error(publicMessage), { status, publicMessage }); }
function decode(value) { return value?.startsWith('v1.') ? decryptSecret(value) : value; }
async function password(user, value) {
  if (!await bcrypt.compare(value, user.password_hash)) throw failure(401, 'Mot de passe incorrect.');
}
async function consume(user, otp, secret = decode(user.multi_factor_secret)) {
  const epoch = Date.now();
  const validator = authenticator.clone(); validator.options = { window: 0, epoch };
  const delta = validator.checkDelta(otp, secret);
  if (delta === null) throw failure(401, 'Code de vérification incorrect ou expiré.');
  const step = Math.floor(epoch / 30000) + delta;
  const used = await db.prepare('SELECT step FROM mfa_used_steps WHERE user_id=? AND step=?').get(user.id, step);
  if (used) throw failure(401, 'Code déjà utilisé. Attendez le prochain code.');
  const result = await db.prepare(`INSERT INTO mfa_used_steps (user_id, step) VALUES (?, ?)
    ON CONFLICT (user_id, step) DO NOTHING`).run(user.id, step);
  if (!result.changes) throw failure(401, 'Code déjà utilisé. Attendez le prochain code.');
}
async function setup(userId, providedPassword) {
  return db.transaction(async () => {
    const user = await db.prepare('SELECT * FROM users WHERE id=? FOR UPDATE').get(userId);
    await password(user, providedPassword);
    if (user.mfa_enabled) throw failure(409, 'La double authentification est déjà active.');
    const secret = authenticator.generateSecret();
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
    await db.prepare(`INSERT INTO mfa_setups (user_id, secret_encrypted, expires_at) VALUES (?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET secret_encrypted=EXCLUDED.secret_encrypted, expires_at=EXCLUDED.expires_at`)
      .run(userId, encryptSecret(secret), expiresAt);
    return { secret, otpAuthUrl: authenticator.keyuri(user.email, process.env.OTP_ISSUER || 'NEO BANK', secret), expiresAt };
  })();
}
async function enable(userId, providedPassword, otp) {
  await db.transaction(async () => {
    const user = await db.prepare('SELECT * FROM users WHERE id=? FOR UPDATE').get(userId);
    await password(user, providedPassword);
    if (user.mfa_enabled) throw failure(409, 'La double authentification est déjà active.');
    const setup = await db.prepare('SELECT * FROM mfa_setups WHERE user_id=?').get(userId);
    if (!setup || new Date(setup.expires_at).getTime() <= Date.now()) throw failure(409, 'La configuration a expiré. Recommencez.');
    const secret = decode(setup.secret_encrypted);
    await consume(user, otp, secret);
    await db.prepare('UPDATE users SET multi_factor_secret=?, mfa_enabled=TRUE WHERE id=?').run(setup.secret_encrypted, userId);
    await db.prepare('DELETE FROM mfa_setups WHERE user_id=?').run(userId);
    await db.prepare('INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), userId, 'mfa_enable', '{}');
  })();
}
module.exports = { setup, enable, consume, decode };
