const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://';
process.env.SMS_ENABLED = 'false';
process.env.SMS_PROVIDER = 'twilio';
const db = require('../src/config/database');
const sms = require('../src/services/smsService');
const user = crypto.randomUUID();
const sid = 'SM' + '1'.repeat(32);
before(async () => {
  await db.initDatabase();
  await db.prepare('INSERT INTO users(id,nom,prenom,email,password_hash,phone) VALUES(?,?,?,?,?,?)')
    .run(user, 'SMS', 'Test', 'sms@example.test', 'unused', '+22990000000');
});
after(() => db.close());
function enable() {
  process.env.SMS_ENABLED = 'true';
  process.env.TWILIO_ACCOUNT_SID = 'AC' + '1'.repeat(32);
  process.env.TWILIO_AUTH_TOKEN = 'synthetic-not-real';
  process.env.TWILIO_FROM = '+15005550006';
}

test('file durable idempotente, sans envoi lorsque désactivé', async () => {
  await sms.enqueue(user, 'validation:one', 'NEO BANK : validation synthétique.');
  await sms.enqueue(user, 'validation:one', 'Message en double.');
  assert.equal((await db.prepare('SELECT * FROM sms_outbox').all()).length, 1);
  await sms.dispatch(() => { throw Error('Aucun appel externe autorisé'); });
  assert.equal((await db.prepare('SELECT status FROM sms_outbox').get()).status, 'pending');
});

test('acceptation Twilio puis confirmation de livraison, sans nouvel envoi', async () => {
  enable();
  let sends = 0;
  const mock = async (url, options) => {
    if (options.method === 'POST') {
      sends++;
      assert.equal(new URLSearchParams(options.body).get('To'), '+22990000000');
      assert.ok(options.headers.Authorization.startsWith('Basic '));
      return { ok: true, status: 201, json: async () => ({ sid, status: 'queued' }) };
    }
    return { ok: true, status: 200, json: async () => ({ sid, status: 'delivered' }) };
  };
  await sms.dispatch(mock);
  await sms.dispatch(mock);
  assert.equal(sends, 1);
  assert.equal((await db.prepare('SELECT status FROM sms_outbox WHERE event_key=?').get('validation:one')).status, 'delivered');
});

test('accusé de réception inconnu : aucune répétition automatique du SMS', async () => {
  await sms.enqueue(user, 'transfer:unknown', 'NEO BANK : transfert synthétique.');
  let sends = 0;
  await sms.dispatch(async () => { sends++; throw Error('timeout'); });
  await sms.dispatch(async () => { sends++; throw Error('Unexpected resend'); });
  assert.equal(sends, 1);
  assert.equal((await db.prepare('SELECT status FROM sms_outbox WHERE event_key=?').get('transfer:unknown')).status, 'uncertain');
});

test('numéro sans préfixe international refusé sans envoyer', async () => {
  await db.prepare('UPDATE users SET phone=? WHERE id=?').run('90000000', user);
  await sms.enqueue(user, 'invalid:phone', 'NEO BANK : test.');
  assert.equal((await db.prepare('SELECT status FROM sms_outbox WHERE event_key=?').get('invalid:phone')).status, 'invalid_phone');
});

test('TextBee : envoi authentifié, appareil conservé et livraison confirmée', async () => {
  process.env.SMS_PROVIDER = 'textbee';
  process.env.TEXTBEE_API_KEY = 'synthetic-api-key';
  process.env.TEXTBEE_DEVICE_ID = '1'.repeat(24);
  await db.prepare('UPDATE users SET phone=? WHERE id=?').run('+22990000000', user);
  await sms.enqueue(user, 'textbee:delivery', 'NEO BANK : test TextBee.');
  let sends = 0;
  let delivery = 'sent';
  const mock = async (url, options) => {
    assert.equal(options.headers['x-api-key'], 'synthetic-api-key');
    if (options.method === 'POST') {
      sends++;
      const payload = JSON.parse(options.body);
      assert.equal(payload.deviceId, '1'.repeat(24));
      assert.deepEqual(payload.recipients, ['+22990000000']);
      return { ok: true, status: 200, json: async () => ({ data: { success: true, smsBatchId: '2'.repeat(24) } }) };
    }
    assert.ok(url.includes('/devices/' + '1'.repeat(24) + '/sms-batch/'));
    return { ok: true, status: 200, json: async () => ({ data: { messages: [{ recipient: '+22990000000', status: delivery }] } }) };
  };
  await sms.dispatch(mock);
  assert.equal((await db.prepare('SELECT status FROM sms_outbox WHERE event_key=?').get('textbee:delivery')).status, 'accepted');
  process.env.TEXTBEE_DEVICE_ID = '3'.repeat(24);
  delivery = 'delivered';
  await sms.dispatch(mock);
  assert.equal(sends, 1);
  assert.equal((await db.prepare('SELECT status FROM sms_outbox WHERE event_key=?').get('textbee:delivery')).status, 'delivered');
});

test('TextBee : quota conserve le SMS et diffère la tentative suivante', async () => {
  await sms.enqueue(user, 'textbee:quota', 'NEO BANK : test quota.');
  let sends = 0;
  const mock = async () => { sends++; return { ok: false, status: 429 }; };
  await sms.dispatch(mock);
  await sms.dispatch(mock);
  assert.equal(sends, 1);
  const job = await db.prepare('SELECT status,error_code,next_attempt_at FROM sms_outbox WHERE event_key=?').get('textbee:quota');
  assert.equal(job.status, 'pending');
  assert.equal(job.error_code, 'QUOTA_LIMIT');
  assert.ok(new Date(job.next_attempt_at).getTime() > Date.now());
});

test('TextBee : une réponse sans référence de lot ne prouve pas la livraison', async () => {
  await sms.enqueue(user, 'textbee:unknown', 'NEO BANK : test réponse.');
  let sends = 0;
  const mock = async () => { sends++; return { ok: true, status: 200, json: async () => ({ data: { success: true } }) }; };
  await sms.dispatch(mock);
  await sms.dispatch(mock);
  assert.equal(sends, 1);
  assert.equal((await db.prepare('SELECT status FROM sms_outbox WHERE event_key=?').get('textbee:unknown')).status, 'uncertain');
});

test('diagnostic sans accès : aucun appel fournisseur et aucun secret retourné', async () => {
  const key = process.env.TEXTBEE_API_KEY;
  delete process.env.TEXTBEE_API_KEY;
  try {
    const result = await sms.diagnose(() => { throw new Error('Unexpected external call'); });
    assert.equal(result.state, 'configuration_required');
    assert.deepEqual(result.missing, ['TEXTBEE_API_KEY']);
    assert.ok(!JSON.stringify(result).includes('synthetic-api-key'));
  } finally { process.env.TEXTBEE_API_KEY = key; }
});

test('diagnostic TextBee en lecture seule possible avec envoi désactivé', async () => {
  process.env.SMS_ENABLED = 'false';
  const result = await sms.diagnose(async (url, options) => {
    assert.ok(url.endsWith('/devices/' + process.env.TEXTBEE_DEVICE_ID));
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    return { ok: true, status: 200, json: async () => ({ data: { _id: process.env.TEXTBEE_DEVICE_ID } }) };
  });
  assert.equal(result.state, 'connected');
  assert.equal(result.sendingEnabled, false);
});

test('diagnostic traduit refus, téléphone absent et réseau sans exposer la réponse fournisseur', async () => {
  for (const [status, state] of [[401, 'authentication_failed'], [403, 'authentication_failed'], [404, 'device_unavailable'], [429, 'provider_unavailable'], [503, 'provider_unavailable']]) {
    assert.equal((await sms.diagnose(async () => ({ ok: false, status }))).state, state);
  }
  assert.equal((await sms.diagnose(async () => { throw new Error('Sensitive upstream error'); })).state, 'provider_unavailable');
});
