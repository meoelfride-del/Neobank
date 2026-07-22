require('dotenv').config();
const { AsyncLocalStorage } = require('node:async_hooks');
const { Pool, types } = require('pg');

types.setTypeParser(20, (value) => Number.parseInt(value, 10));
types.setTypeParser(1700, (value) => Number.parseFloat(value));

const transactionStorage = new AsyncLocalStorage();

function createPool() {
  if (process.env.DATABASE_URL === 'pg-mem://') {
    const { newDb } = require('pg-mem');
    const memoryDb = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
    const adapter = memoryDb.adapters.createPg();
    return new adapter.Pool();
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL est obligatoire pour démarrer NeoBank.');
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: Number.parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

const pool = createPool();

function postgresSql(sql) {
  let index = 0;
  return sql
    .replace(/\?/g, () => `$${++index}`)
    .replace(/datetime\('now',\s*'-1 hour'\)/gi, "CURRENT_TIMESTAMP - INTERVAL '1 hour'")
    .replace(/datetime\('now',\s*'-30 days'\)/gi, "CURRENT_TIMESTAMP - INTERVAL '30 days'")
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
    .replace(
      /CAST\(julianday\('now'\)\s*-\s*julianday\(created_at\)\s+AS\s+INTEGER\)/gi,
      'FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 86400)::INTEGER',
    );
}

function executor() {
  return transactionStorage.getStore() || pool;
}

function prepare(sql) {
  const text = postgresSql(sql);
  return {
    async get(...params) {
      const result = await executor().query(text, params);
      return result.rows[0];
    },
    async all(...params) {
      const result = await executor().query(text, params);
      return result.rows;
    },
    async run(...params) {
      const result = await executor().query(text, params);
      return { changes: result.rowCount, rows: result.rows };
    },
  };
}

function transaction(fn) {
  return async (...args) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await transactionStorage.run(client, () => fn(...args));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'client' CHECK(role IN ('client','admin')),
      status_kyc TEXT NOT NULL DEFAULT 'pending' CHECK(status_kyc IN ('pending','in_review','verified','rejected')),
      status_compte TEXT NOT NULL DEFAULT 'active' CHECK(status_compte IN ('active','suspended')),
      multi_factor_secret TEXT,
      mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      fraud_score INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('Courant','Epargne')),
      currency TEXT NOT NULL DEFAULT 'EUR' CHECK(currency IN ('EUR','USD','GBP')),
      balance NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK(balance >= 0),
      iban TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('Physique','Virtuelle')),
      number_encrypted TEXT NOT NULL,
      last4 TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      expiry TEXT NOT NULL,
      limits NUMERIC(18,2) NOT NULL DEFAULT 1000 CHECK(limits > 0),
      status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Blocked','Expired')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cards_account ON cards(account_id);

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      source_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      destination_info TEXT,
      amount NUMERIC(18,2) NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('virement_interne','virement_externe','paiement','prelevement','depot')),
      category TEXT NOT NULL DEFAULT 'Autre',
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','completed','failed')),
      libelle TEXT,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(source_account_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS transfer_challenges (
      transaction_id TEXT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      client_message TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      verified_at TIMESTAMPTZ,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scheduled_payments (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      destination_info TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL CHECK(amount > 0),
      label TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('mensuel','hebdomadaire')),
      next_run TIMESTAMPTZ NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender TEXT NOT NULL CHECK(sender IN ('user','bot','human_agent')),
      content TEXT NOT NULL,
      escalated BOOLEAN NOT NULL DEFAULT FALSE,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT (version) DO NOTHING;
  `);
}

async function close() {
  await pool.end();
}

module.exports = { prepare, transaction, initDatabase, close, pool };
