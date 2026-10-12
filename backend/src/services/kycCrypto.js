const crypto = require('node:crypto');

function key() {
  const material = process.env.KYC_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!material) throw Object.assign(new Error('Clé de stockage KYC absente'), { status: 503, publicMessage: 'Le stockage KYC n’est pas configuré. Contactez le support.' });
  return crypto.createHash('sha256').update('kyc-document:v1:').update(material).digest();
}
function encryptDocument(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}
function decryptDocument(payload) {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1') throw new Error('Format de document KYC inconnu');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
}
module.exports = { encryptDocument, decryptDocument };
