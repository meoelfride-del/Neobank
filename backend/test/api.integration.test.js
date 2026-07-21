const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { authenticator } = require('otplib');

const PORT = 4199;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const TEST_DATA_DIR = path.join(__dirname, '.tmp');
const DB_PATH = path.join(TEST_DATA_DIR, `neobank-integration-${process.pid}.sqlite`);
const testEnv = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(PORT),
  SOCKET_PORT: String(PORT),
  CLIENT_URL: 'http://localhost:5173',
  DB_PATH,
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
};
delete testEnv.NODE_TEST_CONTEXT;

let server;
let clientToken;
let adminToken;
let sourceAccount;
let recipient;
let serverError = '';
let serverOutput = '';

async function request(route, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${BASE_URL}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  return { status: response.status, body: payload };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server?.exitCode !== null) {
      throw new Error(`Le serveur de test s'est arrêté : ${serverError || `code ${server.exitCode}`}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Le serveur de test ne répond pas. Sortie: ${serverOutput} ${serverError}`);
}

before(async () => {
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  execFileSync(process.execPath, ['src/config/seed.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: testEnv,
    stdio: 'pipe',
  });

  server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: testEnv,
    stdio: 'pipe',
    windowsHide: true,
  });
  server.stderr.on('data', (chunk) => {
    serverError += chunk.toString();
  });
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  server.on('error', (error) => {
    serverError += error.stack || error.message;
  });
  await waitForServer();
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

test('health check et protection des routes', async () => {
  const rootResponse = await fetch(`http://127.0.0.1:${PORT}/`);
  const root = await rootResponse.json();
  assert.equal(rootResponse.status, 200);
  assert.equal(root.status, 'online');

  const health = await request('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');

  const protectedRoute = await request('/accounts');
  assert.equal(protectedRoute.status, 401);
});

test('connexion client et lecture du profil', async () => {
  const invalid = await request('/auth/login', {
    method: 'POST',
    body: { email: 'client@neobank.demo', password: 'incorrect' },
  });
  assert.equal(invalid.status, 401);

  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: 'client@neobank.demo', password: 'Client123!' },
  });
  assert.equal(login.status, 200);
  clientToken = login.body.accessToken;
  assert.ok(clientToken);

  const refreshed = await request('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: login.body.refreshToken },
  });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.accessToken);

  const me = await request('/auth/me', { token: clientToken });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'client@neobank.demo');
  assert.equal(me.body.user.password_hash, undefined);
});

test('comptes et contrôle de propriété', async () => {
  const accounts = await request('/accounts', { token: clientToken });
  assert.equal(accounts.status, 200);
  assert.equal(accounts.body.accounts.length, 2);
  sourceAccount = accounts.body.accounts.find((account) => account.type === 'Courant');
  assert.ok(sourceAccount);

  const created = await request('/accounts', {
    token: clientToken,
    method: 'POST',
    body: { type: 'Epargne', currency: 'EUR', label: 'Projet test' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.account.label, 'Projet test');
});

test('création, masquage, révélation et blocage de carte', async () => {
  const created = await request('/cards', {
    token: clientToken,
    method: 'POST',
    body: { account_id: sourceAccount.id, type: 'Virtuelle', pin: '1234' },
  });
  assert.equal(created.status, 201);
  assert.match(created.body.card.fullNumber, /^\d{16}$/);
  const cardId = created.body.card.id;

  const cards = await request(`/cards/account/${sourceAccount.id}`, { token: clientToken });
  assert.equal(cards.status, 200);
  assert.equal(cards.body.cards[0].fullNumber, undefined);
  assert.equal(cards.body.cards[0].number_encrypted, undefined);

  const wrongPassword = await request(`/cards/${cardId}/reveal`, {
    token: clientToken,
    method: 'POST',
    body: { password: 'incorrect' },
  });
  assert.equal(wrongPassword.status, 401);

  const revealed = await request(`/cards/${cardId}/reveal`, {
    token: clientToken,
    method: 'POST',
    body: { password: 'Client123!' },
  });
  assert.equal(revealed.status, 200);
  assert.match(revealed.body.fullNumber, /^\d{16}$/);

  const blocked = await request(`/cards/${cardId}/status`, {
    token: clientToken,
    method: 'PATCH',
    body: { status: 'Blocked' },
  });
  assert.equal(blocked.status, 200);
});

test('inscription, KYC et virement interne dynamique', async () => {
  const email = `recipient-${process.pid}@example.com`;
  const phone = `+229${String(process.pid).padStart(8, '0').slice(-8)}`;
  const registration = await request('/auth/register', {
    method: 'POST',
    body: { nom: 'Test', prenom: 'Recipient', email, password: 'StrongPass123!', phone },
  });
  assert.equal(registration.status, 201);
  recipient = {
    token: registration.body.accessToken,
    phone,
    email,
    password: 'StrongPass123!',
    mfaSecret: registration.body.mfaSetup.secret,
  };

  const recipientAccounts = await request('/accounts', { token: recipient.token });
  const recipientAccount = recipientAccounts.body.accounts[0];

  const forbidden = await request(`/accounts/${sourceAccount.id}`, { token: recipient.token });
  assert.equal(forbidden.status, 403);

  const kyc = await request('/accounts/kyc/submit', { token: recipient.token, method: 'POST' });
  assert.equal(kyc.status, 200);
  assert.equal(kyc.body.status, 'in_review');

  const transfer = await request('/transactions/transfer', {
    token: clientToken,
    method: 'POST',
    body: {
      source_account_id: sourceAccount.id,
      destination_type: 'phone',
      destination_info: phone,
      amount: 25,
      libelle: 'Remboursement test',
    },
  });
  assert.equal(transfer.status, 201);
  assert.equal(transfer.body.flagged, false);

  const credited = await request(`/accounts/${recipientAccount.id}`, { token: recipient.token });
  assert.equal(credited.status, 200);
  assert.equal(credited.body.account.balance, 25);

  const enabledMfa = await request('/auth/mfa/enable', {
    token: recipient.token,
    method: 'POST',
  });
  assert.equal(enabledMfa.status, 200);

  const missingOtp = await request('/auth/login', {
    method: 'POST',
    body: { email: recipient.email, password: recipient.password },
  });
  assert.equal(missingOtp.status, 206);
  assert.equal(missingOtp.body.mfaRequired, true);

  const otpLogin = await request('/auth/login', {
    method: 'POST',
    body: {
      email: recipient.email,
      password: recipient.password,
      otp: authenticator.generate(recipient.mfaSecret),
    },
  });
  assert.equal(otpLogin.status, 200);
});

test('budget, prélèvement programmé et chatbot', async () => {
  const budget = await request(`/budget/${sourceAccount.id}`, { token: clientToken });
  assert.equal(budget.status, 200);
  assert.ok(budget.body.totalSpent > 0);
  assert.ok(budget.body.summary.length > 0);

  const scheduled = await request('/transactions/scheduled', {
    token: clientToken,
    method: 'POST',
    body: {
      account_id: sourceAccount.id,
      destination_info: 'FR7612345678901234567890123',
      amount: 10,
      label: 'Abonnement test',
      frequency: 'mensuel',
    },
  });
  assert.equal(scheduled.status, 201);

  const payments = await request(`/transactions/scheduled/${sourceAccount.id}`, { token: clientToken });
  assert.equal(payments.status, 200);
  assert.equal(payments.body.payments.length, 1);

  const chat = await request('/chatbot/message', {
    token: clientToken,
    method: 'POST',
    body: { content: 'Comment consulter mon solde ?' },
  });
  assert.equal(chat.status, 201);
  assert.match(chat.body.reply, /solde/i);
});

test('administration et suspension bloquent les nouvelles sessions', async () => {
  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: 'admin@neobank.demo', password: 'Admin123!' },
  });
  assert.equal(login.status, 200);
  adminToken = login.body.accessToken;

  const users = await request('/admin/users', { token: adminToken });
  const recipientUser = users.body.users.find((user) => user.phone === recipient.phone);
  assert.ok(recipientUser);

  const verifiedKyc = await request(`/admin/kyc/${recipientUser.id}`, {
    token: adminToken,
    method: 'POST',
    body: { decision: 'verified' },
  });
  assert.equal(verifiedKyc.status, 200);

  const kycStatus = await request('/accounts/kyc/status', { token: recipient.token });
  assert.equal(kycStatus.status, 200);
  assert.equal(kycStatus.body.status_kyc, 'verified');

  const suspended = await request(`/admin/users/${recipientUser.id}/suspend`, {
    token: adminToken,
    method: 'POST',
    body: { suspended: true },
  });
  assert.equal(suspended.status, 200);

  const denied = await request('/accounts', { token: recipient.token });
  assert.equal(denied.status, 403);
});
