// Recette dans un schéma éphémère isolé de la base locale, sans envoi externe.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const backend = path.resolve(__dirname, '../backend');
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env') });
const target = new URL(process.env.DATABASE_URL);
if (target.hostname !== '127.0.0.1' || target.port !== '5433' || target.pathname !== '/neobank_local'
  || process.env.NODE_ENV !== 'development') {
  throw new Error('Recette réservée à la base locale dédiée.');
}
const { Client } = require(path.join(backend, 'node_modules/pg'));
const control = new Client({ connectionString: process.env.DATABASE_URL });
const schema = 'neobank_validation_flow_' + crypto.randomUUID().replace(/-/g, '');
let schemaCreated = false;
process.env.SMS_ENABLED = 'false';
process.env.PORT = '4198';
process.env.SOCKET_PORT = '4198';
let db;
let startServer;
const iban = require(path.join(backend, 'node_modules/iban'));
const { generateCardNumber } = require(path.join(backend, 'src/services/cryptoService'));
const { io } = require('socket.io-client');
const base = 'http://127.0.0.1:4198/api';
const users = [];
const sockets = [];
let running;
async function request(route, token, method = 'GET', body, expected = 200, key) {
  const response = await fetch(base + route, { method, headers: {
    ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(key ? { 'Idempotency-Key': key } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected, route + ' HTTP ' + response.status);
  return response.status === 204 ? null : response.json();
}
async function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io('http://127.0.0.1:4198', { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 3000 });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}
const newIban = () => iban.fromBBAN('FR', Array.from({ length: 23 }, () => crypto.randomInt(0, 10)).join(''));

(async () => {
  try {
    await control.connect();
    await control.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    target.searchParams.set('options', '-c search_path=' + schema);
    process.env.DATABASE_URL = target.toString();
    db = require(path.join(backend, 'src/config/database'));
    ({ startServer } = require(path.join(backend, 'server')));
    running = await startServer();
    await request('/health');
    const admin = await request('/auth/login', null, 'POST', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
    const adminSocket = await connect(admin.accessToken);
    let registered = 0;
    let kycEvents = 0;
    adminSocket.on('user:registered', () => registered++);
    adminSocket.on('kyc:updated', () => kycEvents++);
    const clients = [];
    for (let index = 0; index < 2; index++) {
      const result = await request('/auth/register', null, 'POST', {
        nom: 'Recette', prenom: 'Synthétique', email: crypto.randomUUID() + '@example.test',
        password: crypto.randomBytes(20).toString('hex'), phone: '+229' + crypto.randomInt(10000000, 99999999),
        birth_date: '1990-01-01', birth_place: 'Ville Test', nationality: 'Test', address_line: '12 rue Test',
        city: 'Ville Test', postal_code: '', country: 'Pays Test', occupation: '', accept_terms: true,
      }, 201);
      users.push(result.user.id);
      const socket = await connect(result.accessToken);
      let clientKycEvents = 0;
      socket.on('kyc:updated', () => clientKycEvents++);
      const form = new FormData();
      form.set('document_type', 'identity_card');
      form.set('document', new Blob([fs.readFileSync(path.resolve(__dirname, '../audit/kyc-synthetic.jpg'))], { type: 'image/jpeg' }), 'synthetic.jpg');
      const upload = await fetch(base + '/accounts/kyc/document', { method: 'POST', headers: { Authorization: 'Bearer ' + result.accessToken }, body: form });
      assert.equal(upload.status, 201);
      await request('/accounts/kyc/submit', result.accessToken, 'POST', {});
      const dossier = await request('/admin/kyc/' + result.user.id, admin.accessToken);
      await request('/admin/kyc/' + result.user.id, admin.accessToken, 'POST', { decision: 'verified', documentId: dossier.document.id });
      const detail = await request('/admin/users/' + result.user.id + '/detail', admin.accessToken);
      assert.equal(detail.profile.birth_place, 'Ville Test');
      assert.ok(detail.profile.terms_accepted_at);
      assert.equal(detail.document.payload_encrypted, undefined);
      const photo = await fetch(base + '/admin/kyc/' + result.user.id + '/document?download=true', { headers: { Authorization: 'Bearer ' + admin.accessToken } });
      assert.equal(photo.status, 200);
      assert.ok(photo.headers.get('content-disposition').startsWith('attachment'));
      assert.ok(clientKycEvents > 0);
      const account = detail.accounts[0];
      await request('/admin/accounts/' + account.id + '/iban', admin.accessToken, 'PATCH', { iban: newIban(), version: account.iban_version });
      clients.push({ ...result, account: (await request('/accounts', result.accessToken)).accounts[0] });
    }
    assert.equal(registered, 2);
    assert.ok(kycEvents >= 4);
    const [source, destination] = clients;
    const card = await request('/admin/accounts/' + source.account.id + '/cards', admin.accessToken, 'POST', {
      number: generateCardNumber(), expiry: '12/' + (new Date().getFullYear() + 4), type: 'Virtuelle', limits: 1000,
    }, 201);
    assert.equal(card.card.number_encrypted, undefined);
    await request('/admin/cards/' + card.card.id, admin.accessToken, 'PATCH', {
      expiry: card.card.expiry, type: 'Virtuelle', limits: 500, status: 'Blocked', version: card.card.version,
    });
    await request('/admin/accounts/' + source.account.id + '/adjust-balance', admin.accessToken, 'POST', { operation: 'credit', amount: 100, reason: 'Recette synthétique' });
    const transfer = await request('/transactions/transfer', source.accessToken, 'POST', {
      source_account_id: source.account.id, destination_type: 'iban', destination_info: destination.account.iban, amount: 10, libelle: 'Recette synthétique',
    }, 201, crypto.randomUUID());
    assert.equal(Number((await request('/accounts/' + source.account.id, source.accessToken)).account.balance), 100);
    await request('/admin/transactions/' + transfer.transactionId + '/review', admin.accessToken, 'POST', { approve: true }, 409);
    const otp = await request('/admin/transactions/' + transfer.transactionId + '/otp', admin.accessToken, 'POST', { message: 'Confirmez le transfert synthétique.', expiresInMinutes: 15 }, 201);
    await request('/transactions/' + transfer.transactionId + '/verify-otp', source.accessToken, 'POST', { otp: otp.otp });
    await request('/admin/transactions/' + transfer.transactionId + '/review', admin.accessToken, 'POST', { approve: true });
    await request('/admin/transactions/' + transfer.transactionId + '/review', admin.accessToken, 'POST', { approve: true }, 409);
    assert.equal(Number((await request('/accounts/' + source.account.id, source.accessToken)).account.balance), 90);
    assert.equal(Number((await request('/accounts/' + destination.account.id, destination.accessToken)).account.balance), 10);
    for (const event of ['transfer:' + transfer.transactionId + ':sent', 'transfer:' + transfer.transactionId + ':received']) {
      assert.equal((await db.prepare('SELECT status FROM sms_outbox WHERE event_key=?').get(event)).status, 'pending');
    }
    await request('/auth/logout', null, 'POST', { refreshToken: admin.refreshToken }, 204);
    console.log('PASS PostgreSQL réel : inscription, KYC privé, événements temps réel, profil admin, IBAN, carte modifiée, OTP, débit/crédit uniques et SMS en file.');
  } finally {
    sockets.forEach(socket => socket.close());
    try { if (running) await running.close(); else if (db) await db.close(); }
    finally {
      try {
        if (schemaCreated && /^neobank_validation_flow_[a-f0-9]{32}$/.test(schema)) {
          await control.query(`DROP SCHEMA "${schema}" CASCADE`);
        }
      } finally { await control.end(); }
    }
  }
})().catch(error => { console.error('FAIL recette locale : ' + error.message.slice(0, 180)); process.exitCode = 1; });
