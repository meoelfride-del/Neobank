const crypto = require('node:crypto');
function key() {
  if (!process.env.ENCRYPTION_KEY) throw Object.assign(new Error('Clé MFA absente'), { status: 503, publicMessage: 'Le stockage sécurisé MFA n’est pas configuré.' });
  return crypto.createHash('sha256').update('mfa-secret:v1:').update(process.env.ENCRYPTION_KEY).digest();
}
function encryptSecret(secret) {
  const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const bytes=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),bytes.toString('base64')].join('.');
}
function decryptSecret(payload) {
  const [version,iv,tag,data]=payload.split('.');if(version!=='v1')throw Error('Format MFA invalide');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64'));decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');
}
module.exports={encryptSecret,decryptSecret};
