const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const envPath = path.join(backend, '.env');
const localDir = path.join(backend, '.local-postgres');
const dataDir = path.join(localDir, 'data');
const bin = process.env.NEOBANK_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
function run(command, args, env = process.env) {
  const result = spawnSync(path.join(bin, command + '.exe'), args, { env, encoding: 'utf8', windowsHide: true, stdio: command === 'pg_ctl' ? 'ignore' : 'pipe' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || `${command} failed`);
}

(async () => {
  if (fs.existsSync(envPath) || fs.existsSync(dataDir)) throw new Error('Configuration existante : arrêt pour conserver les clés et les données.');
  const { Client } = require(path.join(backend, 'node_modules/pg'));
  const net = require('node:net');
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error('Le port 5433 est déjà occupé.')));
    probe.listen(5433, '127.0.0.1', () => probe.close(resolve));
  });
  fs.mkdirSync(localDir, { recursive: true });
  const password = crypto.randomBytes(32).toString('hex');
  const passwordFile = path.join(localDir, 'init-password');
  fs.writeFileSync(passwordFile, password + '\n', { mode: 0o600 });
  try {
    run('initdb', ['-D', dataDir, '-U', 'neobank_local', '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--pwfile', passwordFile]);
  } finally {
    fs.unlinkSync(passwordFile);
  }
  fs.appendFileSync(path.join(dataDir, 'postgresql.conf'), "\nlisten_addresses = '127.0.0.1'\nport = 5433\n");
  run('pg_ctl', ['-D', dataDir, '-l', path.join(localDir, 'postgres.log'), '-w', 'start']);
  const client = new Client({ host: '127.0.0.1', port: 5433, user: 'neobank_local', password, database: 'postgres' });
  try {
    await client.connect();
    const appPassword = crypto.randomBytes(32).toString('hex');
    await client.query(`CREATE ROLE neobank_app LOGIN PASSWORD '${appPassword}'`);
    await client.query('CREATE DATABASE neobank_local OWNER neobank_app');
    const key = () => crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(envPath, [
      'NODE_ENV=development', 'PORT=4000', 'SOCKET_PORT=4000', 'CLIENT_URL=http://localhost:5173',
      `DATABASE_URL=postgresql://neobank_app:${appPassword}@127.0.0.1:5433/neobank_local`,
      `JWT_SECRET=${key()}`, `JWT_REFRESH_SECRET=${key()}`, `ENCRYPTION_KEY=${key()}`,
      'JWT_EXPIRES_IN=15m', 'JWT_REFRESH_EXPIRES_IN=7d', 'OTP_ISSUER=Neobank', '',
    ].join('\n'), { mode: 0o600 });
    console.log('Base locale persistante créée sur 127.0.0.1:5433 ; backend/.env configuré. Aucun secret affiché.');
  } finally {
    await client.end();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
