const crypto = require('crypto');
require('dotenv').config();

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(
  process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd',
  'hex'
);

/**
 * Chiffre une chaîne (ex: numéro de carte) avec AES-256-GCM.
 * Retourne "iv:tag:cipherText" encodé en hex.
 */
function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * Déchiffre une chaîne produite par encrypt().
 */
function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Génère un IBAN fictif mais plausible (FR76 + 23 chiffres). */
function generateIban() {
  const digits = Array.from({ length: 23 }, () => Math.floor(Math.random() * 10)).join('');
  return `FR76${digits}`;
}

/** Génère un numéro de carte à 16 chiffres (Luhn-valide) commençant par un préfixe donné. */
function generateCardNumber(prefix = '4970') {
  let base = prefix + Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join('');
  let sum = 0;
  let alt = true;
  for (let i = base.length - 1; i >= 0; i--) {
    let n = parseInt(base[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

module.exports = { encrypt, decrypt, generateIban, generateCardNumber };
