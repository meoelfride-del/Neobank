const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { authenticator } = require('otplib');

const PORT = 4199;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
process.env.NODE_ENV = 'test';
process.env.PORT = String(PORT);
process.env.SOCKET_PORT = String(PORT);
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.DATABASE_URL = 'pg-mem://';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.ADMIN_EMAIL = 'admin@neobank.app';
process.env.ADMIN_PASSWORD = 'ProductionAdmin123!';
process.env.ADMIN_PHONE = '+22900000000';

const { seed } = require('../src/config/seed');
const { startServer } = require('../server');

let server;
let clientToken;
let adminToken;
let sourceAccount;
let recipient;

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

before(async () => {
  await seed();
  server = await startServer();
});

after(async () => {
  if (server) await server.close();
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

  const corsResponse = await fetch(`${BASE_URL}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://neobank-team-eig.vercel.app',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(corsResponse.status, 204);
  assert.equal(corsResponse.headers.get('access-control-allow-origin'), 'https://neobank-team-eig.vercel.app');

  const customDomainCorsResponse = await fetch(`${BASE_URL}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://www.neo-finance.app',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(customDomainCorsResponse.status, 204);
  assert.equal(customDomainCorsResponse.headers.get('access-control-allow-origin'), 'https://www.neo-finance.app');

  const monitoring = await request('/monitoring/client-error', {
    method: 'POST',
    body: { name: 'TestError', message: 'Rapport synthétique', path: '/test' },
  });
  assert.equal(monitoring.status, 202);
  assert.equal(monitoring.body.accepted, true);
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

test('bootstrap et connexion de l’administrateur de production', async () => {
  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.email, process.env.ADMIN_EMAIL);
  assert.equal(login.body.user.role, 'admin');
  assert.equal(login.body.user.status_compte, 'active');
  adminToken = login.body.accessToken;
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
  assert.equal(transfer.body.requiresApproval, true);

  const transferOtp = await request(`/admin/transactions/${transfer.body.transactionId}/otp`, {
    token: adminToken,
    method: 'POST',
    body: { message: 'Saisissez le code reçu pour confirmer ce virement.', expiresInMinutes: 15 },
  });
  assert.equal(transferOtp.status, 201);

  const confirmedTransferOtp = await request(`/transactions/${transfer.body.transactionId}/verify-otp`, {
    token: clientToken,
    method: 'POST',
    body: { otp: transferOtp.body.otp },
  });
  assert.equal(confirmedTransferOtp.status, 200);

  const approvedTransfer = await request(`/admin/transactions/${transfer.body.transactionId}/review`, {
    token: adminToken,
    method: 'POST',
    body: { approve: true },
  });
  assert.equal(approvedTransfer.status, 200);

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

  const fundedSource = await request(`/admin/accounts/${sourceAccount.id}/adjust-balance`, {
    token: adminToken,
    method: 'POST',
    body: { operation: 'credit', amount: 10000, reason: 'Provision test annulation' },
  });
  assert.equal(fundedSource.status, 200);

  const pendingTransfer = await request('/transactions/transfer', {
    token: clientToken,
    method: 'POST',
    body: {
      source_account_id: sourceAccount.id,
      destination_type: 'iban',
      destination_info: 'FR7611111111111111111111111',
      amount: 6000,
      libelle: 'Virement à contrôler',
    },
  });
  assert.equal(pendingTransfer.status, 201);
  assert.equal(pendingTransfer.body.flagged, true);

  const cancelledTransfer = await request(`/transactions/${pendingTransfer.body.transactionId}/cancel`, {
    token: clientToken,
    method: 'POST',
  });
  assert.equal(cancelledTransfer.status, 200);
  const duplicateCancellation = await request(`/transactions/${pendingTransfer.body.transactionId}/cancel`, {
    token: clientToken,
    method: 'POST',
  });
  assert.equal(duplicateCancellation.status, 409);

  const otpTransfer = await request('/transactions/transfer', {
    token: clientToken,
    method: 'POST',
    body: {
      source_account_id: sourceAccount.id,
      destination_type: 'iban',
      destination_info: 'FR7622222222222222222222222',
      amount: 6000,
      libelle: 'Virement protégé OTP',
    },
  });
  assert.equal(otpTransfer.status, 201);
  assert.equal(otpTransfer.body.flagged, true);

  const generatedOtp = await request(`/admin/transactions/${otpTransfer.body.transactionId}/otp`, {
    token: adminToken,
    method: 'POST',
    body: { message: 'Confirmez le code communiqué pour autoriser ce virement.', expiresInMinutes: 15 },
  });
  assert.equal(generatedOtp.status, 201);
  assert.match(generatedOtp.body.otp, /^[0-9]{6}$/);

  const prematureApproval = await request(`/admin/transactions/${otpTransfer.body.transactionId}/review`, {
    token: adminToken,
    method: 'POST',
    body: { approve: true },
  });
  assert.equal(prematureApproval.status, 409);

  const invalidOtp = await request(`/transactions/${otpTransfer.body.transactionId}/verify-otp`, {
    token: clientToken,
    method: 'POST',
    body: { otp: '999999' },
  });
  if (generatedOtp.body.otp !== '999999') assert.equal(invalidOtp.status, 401);

  const verifiedOtp = await request(`/transactions/${otpTransfer.body.transactionId}/verify-otp`, {
    token: clientToken,
    method: 'POST',
    body: { otp: generatedOtp.body.otp },
  });
  assert.equal(verifiedOtp.status, 200);
  assert.equal(verifiedOtp.body.verified, true);

  const approvedOtpTransfer = await request(`/admin/transactions/${otpTransfer.body.transactionId}/review`, {
    token: adminToken,
    method: 'POST',
    body: { approve: true },
  });
  assert.equal(approvedOtpTransfer.status, 200);

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

  const adminAccounts = await request(`/admin/users/${recipientUser.id}/accounts`, { token: adminToken });
  assert.equal(adminAccounts.status, 200);
  assert.equal(adminAccounts.body.accounts.length, 1);
  const managedAccount = adminAccounts.body.accounts[0];

  const credited = await request(`/admin/accounts/${managedAccount.id}/adjust-balance`, {
    token: adminToken,
    method: 'POST',
    body: { operation: 'credit', amount: 100.5, reason: 'Régularisation test' },
  });
  assert.equal(credited.status, 200);
  assert.equal(credited.body.balance, 125.5);

  const neutralTransaction = await request(`/transactions/account/${managedAccount.id}`, { token: adminToken });
  assert.equal(neutralTransaction.status, 200);
  const adjustmentEntry = neutralTransaction.body.transactions.find((tx) => tx.libelle === 'Régularisation test');
  assert.ok(adjustmentEntry);
  assert.equal(adjustmentEntry.destination_info, 'Crédit de compte');
  assert.equal(adjustmentEntry.category, 'Autre');

  const debited = await request(`/admin/accounts/${managedAccount.id}/adjust-balance`, {
    token: adminToken,
    method: 'POST',
    body: { operation: 'debit', amount: 20.25, reason: 'Correction test' },
  });
  assert.equal(debited.status, 200);
  assert.equal(debited.body.balance, 105.25);

  const overdraft = await request(`/admin/accounts/${managedAccount.id}/adjust-balance`, {
    token: adminToken,
    method: 'POST',
    body: { operation: 'debit', amount: 999, reason: 'Retrait excessif' },
  });
  assert.equal(overdraft.status, 409);

  const updated = await request(`/admin/users/${recipientUser.id}`, {
    token: adminToken,
    method: 'PATCH',
    body: {
      nom: 'Client',
      prenom: 'Modifié',
      email: `updated-${recipient.email}`,
      phone: `+228${String(process.pid).padStart(8, '0').slice(-8)}`,
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.user.prenom, 'Modifié');

  const suspended = await request(`/admin/users/${recipientUser.id}/suspend`, {
    token: adminToken,
    method: 'POST',
    body: { suspended: true },
  });
  assert.equal(suspended.status, 200);

  const denied = await request('/accounts', { token: recipient.token });
  assert.equal(denied.status, 403);
});
