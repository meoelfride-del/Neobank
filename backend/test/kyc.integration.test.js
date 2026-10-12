const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sharp = require('sharp');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const db = require('../src/config/database');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const profile = { birth_date: '1990-01-01', birth_place: 'Ville Test', nationality: 'Test', address_line: '12 rue Test', city: 'Ville Test', country: 'Pays Test', occupation: '', postal_code: '' };
let server, base, client, other, admin, image, docId;
async function json(route, token, method = 'GET', body) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
async function upload(token, bytes = image, mime = 'image/jpeg', extra = false) {
  const form = new FormData(); form.append('document_type', 'identity_card'); form.append('document', new Blob([bytes], { type: mime }), 'synthetic.jpg');
  if (extra) form.append('unexpected', 'value');
  const response = await fetch(base + '/accounts/kyc/document', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  return { status: response.status, body: await response.json() };
}
async function testToken(id) {
  const sid=crypto.randomUUID();
  await db.prepare('INSERT INTO refresh_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)').run(sid,id,'synthetic-unused',new Date(Date.now()+3600000).toISOString());
  return jwt.sign({sub:id,type:'access',sid},process.env.JWT_SECRET,{expiresIn:'1h'});
}
async function createClient(index) {
  const result = await json('/auth/register', null, 'POST', { ...profile, nom: 'Synthétique', prenom: 'Test', email: `kyc${index}@example.test`, phone: `+2290000000${index}`, password: 'Synthetic123!', accept_terms: true });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return { id: result.body.user.id, token: result.body.accessToken };
}
before(async () => {
  await db.initDatabase();
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  client = await createClient(1); other = await createClient(2);
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO users (id, nom, prenom, email, password_hash, role, status_kyc) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, 'Test', 'Admin', 'kycadmin@example.test', 'unused', 'admin', 'verified');
  admin = await testToken(id);
  image = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#123456' } }).jpeg().toBuffer();
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await db.close(); });

test('inscription : profil complet, consentement et date valide obligatoires', async () => {
  const data = { nom: 'Test', prenom: 'Test', email: 'invalid@example.test', phone: '+22900000009', password: 'Synthetic123!', accept_terms: true };
  assert.equal((await json('/auth/register', null, 'POST', data)).status, 422);
  assert.equal((await json('/auth/register', null, 'POST', { ...data, ...profile, accept_terms: false })).status, 422);
  assert.equal((await json('/auth/register', null, 'POST', { ...data, ...profile, birth_date: '2099-01-01' })).status, 422);
  assert.equal((await json('/auth/register', null, 'POST', { ...data, ...profile, birth_date: '1990-02-30' })).status, 422);
  assert.equal((await json('/accounts/kyc/submit', client.token, 'POST')).status, 422);
  assert.ok((await json('/accounts/kyc/status', client.token)).body.profile.terms_accepted_at);
});

test('dépôt : faux JPEG, SVG, volume excessif et champs supplémentaires refusés', async () => {
  assert.equal((await upload(client.token, Buffer.from('<html>pas une photo</html>'))).status, 422);
  assert.equal((await upload(client.token, Buffer.from('<svg/>'), 'image/svg+xml')).status, 422);
  assert.equal((await upload(client.token, Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await upload(client.token, image, 'image/jpeg', true)).status, 422);
  const result = await upload(client.token); assert.equal(result.status, 201, JSON.stringify(result.body)); docId = result.body.documentId;
  const stored = await db.prepare('SELECT payload_encrypted FROM kyc_documents WHERE user_id=?').get(client.id);
  assert.match(stored.payload_encrypted, /^v1\./); assert.ok(!stored.payload_encrypted.includes(image.toString('base64')));
  const dossier = await json('/accounts/kyc/status', client.token); assert.equal(dossier.body.document.id, docId);
  assert.ok(!JSON.stringify(dossier.body).includes('payload_encrypted'));
});

test('photo privée : propriétaire et administrateur uniquement, aucun cache public', async () => {
  assert.equal((await fetch(base + '/accounts/kyc/document')).status, 401);
  assert.equal((await json(`/admin/kyc/${client.id}`, other.token)).status, 403);
  assert.equal((await fetch(base + `/admin/kyc/${client.id}/document`, { headers: { Authorization: 'Bearer ' + other.token } })).status, 403);
  assert.equal((await fetch(base + `/accounts/kyc/document?userId=${client.id}`, { headers: { Authorization: 'Bearer ' + other.token } })).status, 404);
  for (const endpoint of ['/accounts/kyc/document', `/admin/kyc/${client.id}/document?download=true`]) {
    const response = await fetch(base + endpoint, { headers: { Authorization: 'Bearer ' + (endpoint.startsWith('/admin') ? admin : client.token) } });
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private, no-store/); assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.match(response.headers.get('content-disposition'), endpoint.includes('download') ? /^attachment/ : /^inline/);
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata(); assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined);
  }
  const logs = await db.prepare("SELECT action, details FROM audit_logs WHERE action IN ('kyc_document_view','kyc_document_download')").all();
  assert.equal(logs.length, 2); assert.ok(logs.every(row => !row.details.includes('payload_encrypted')));
});

test('revue manuelle : verrouillage, motif, refus, remplacement, ancienne version refusée', async () => {
  assert.equal((await json('/accounts/kyc/submit', client.token, 'POST')).body.status, 'in_review');
  assert.equal((await upload(client.token)).status, 409);
  assert.equal((await json('/accounts/kyc/profile', client.token, 'PUT', profile)).status, 409);
  const path = `/admin/kyc/${client.id}`;
  assert.equal((await json(path, admin, 'POST', { decision: 'verified' })).status, 422);
  assert.equal((await json(path, admin, 'POST', { decision: 'rejected', documentId: docId })).status, 422);
  assert.equal((await json(path, admin, 'POST', { decision: 'rejected', documentId: docId, reason: 'Image illisible' })).status, 200);
  assert.equal((await json('/accounts/kyc/submit', client.token, 'POST')).body.status, 'rejected');
  assert.equal((await json('/accounts/kyc/status', client.token)).body.document.review_reason, 'Image illisible');
  const replacement = await upload(client.token); assert.equal(replacement.status, 201);
  await json('/accounts/kyc/submit', client.token, 'POST');
  assert.equal((await json(path, admin, 'POST', { decision: 'verified', documentId: docId })).status, 409);
  docId = replacement.body.documentId;
  assert.equal((await json(path, admin, 'POST', { decision: 'verified', documentId: docId })).status, 200);
  assert.equal((await json('/accounts', client.token)).status, 200);
});

test('annulation : validation retirée et accès bancaire bloqué malgré le même jeton', async () => {
  const path = `/admin/kyc/${client.id}`;
  assert.equal((await json(path, admin, 'POST', { decision: 'pending', documentId: docId })).status, 422);
  assert.equal((await json(path, admin, 'POST', { decision: 'pending', documentId: docId, reason: 'Contrôle complémentaire' })).status, 200);
  assert.equal((await json('/accounts', client.token)).status, 403);
  assert.equal((await json('/accounts/kyc/status', client.token)).body.status_kyc, 'pending');
  assert.equal((await json('/accounts/kyc/profile', client.token, 'PUT', profile)).status, 200);
  assert.equal((await json('/accounts/kyc/submit', client.token, 'POST')).body.status, 'in_review');
  assert.equal((await json(path, admin, 'POST', { decision: 'verified', documentId: docId })).status, 409);
  docId = (await json('/accounts/kyc/status', client.token)).body.document.id;
  assert.equal((await json(path, admin, 'POST', { decision: 'verified', documentId: docId })).status, 200);
});

test('PNG normalisé en JPEG, limite de pixels et absence de clé de stockage', async () => {
  const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#abcdef' } }).png().toBuffer();
  assert.equal((await upload(other.token, png, 'image/jpeg')).status, 422);
  const oversized = await sharp({ create: { width: 5000, height: 4200, channels: 3, background: '#abcdef' } }).png().toBuffer();
  assert.equal((await upload(other.token, oversized, 'image/png')).status, 422);
  const key = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  try { assert.equal((await upload(other.token, png, 'image/png')).status, 503); }
  finally { process.env.ENCRYPTION_KEY = key; }
  const result = await upload(other.token, png, 'image/png');
  assert.equal(result.status, 201);
  const response = await fetch(base + '/accounts/kyc/document', { headers: { Authorization: 'Bearer ' + other.token } });
  assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, 'jpeg');
});

test('anciens comptes validés sans document : annulation et complément du dossier possibles', async () => {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO users (id, nom, prenom, email, password_hash, status_kyc) VALUES (?, ?, ?, ?, ?, ?)').run(id, 'Test', 'Ancien', 'legacy@example.test', 'unused', 'verified');
  const token = await testToken(id);
  assert.equal((await json(`/admin/kyc/${id}`, admin, 'POST', { decision: 'pending', reason: 'Pièce à fournir' })).status, 200);
  assert.equal((await json('/accounts', token)).status, 403);
  assert.equal((await json('/accounts/kyc/profile', token, 'PUT', profile)).status, 200);
  assert.equal((await json('/accounts/kyc/status', token)).body.profile.terms_accepted_at, null);
  assert.equal((await upload(token)).status, 201);
  assert.equal((await json('/accounts/kyc/submit', token, 'POST')).body.status, 'in_review');
  const oldId = (await json('/accounts/kyc/status', token)).body.document.id;
  assert.equal((await json(`/admin/users/${id}`, admin, 'PATCH', { nom: 'Test', prenom: 'Corrigé', email: 'legacy@example.test', phone: '+22900000007' })).status, 200);
  assert.equal((await json(`/admin/kyc/${id}`, admin, 'POST', { decision: 'verified', documentId: oldId })).status, 409);
});
