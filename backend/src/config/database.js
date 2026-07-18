const { DatabaseSync } = require('node:sqlite');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, '../../neobank.sqlite');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * node:sqlite (DatabaseSync) n'a pas d'équivalent à better-sqlite3's db.transaction().
 * Ce helper exécute fn dans un BEGIN/COMMIT, avec ROLLBACK automatique en cas d'erreur.
 */
db.transaction = function transaction(fn) {
  return function runInTransaction(...args) {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

// --- Schéma ---------------------------------------------------------------

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'client' CHECK(role IN ('client','admin')),
  status_kyc TEXT NOT NULL DEFAULT 'pending' CHECK(status_kyc IN ('pending','in_review','verified','rejected')),
  status_compte TEXT NOT NULL DEFAULT 'active' CHECK(status_compte IN ('active','suspended')),
  multi_factor_secret TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  fraud_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('Courant','Epargne')),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK(currency IN ('EUR','USD','GBP')),
  balance REAL NOT NULL DEFAULT 0,
  iban TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  limits REAL NOT NULL DEFAULT 1000,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Blocked','Expired')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cards_account ON cards(account_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  source_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  destination_info TEXT,
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('virement_interne','virement_externe','paiement','prelevement','depot')),
  category TEXT NOT NULL DEFAULT 'Autre',
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','completed','failed')),
  libelle TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(source_account_id, timestamp);

CREATE TABLE IF NOT EXISTS scheduled_payments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  destination_info TEXT NOT NULL,
  amount REAL NOT NULL,
  label TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK(frequency IN ('mensuel','hebdomadaire')),
  next_run TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK(sender IN ('user','bot','human_agent')),
  content TEXT NOT NULL,
  escalated INTEGER NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;
