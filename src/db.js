// Database SQLite (modulo integrato di Node 22: node:sqlite) — nessuna dipendenza esterna.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'designs'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'mark.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  customizable INTEGER NOT NULL DEFAULT 1,
  unit_label TEXT NOT NULL,          -- es. "cartone", "confezione", "pezzo"
  unit_detail TEXT DEFAULT '',       -- es. "10 kg · circa 1.818 bustine"
  qty_step INTEGER NOT NULL DEFAULT 1,
  unit_weight_kg REAL DEFAULT NULL,  -- per il calcolo spedizione
  setup_fee REAL NOT NULL DEFAULT 0, -- contributo impianto stampa
  variants TEXT NOT NULL DEFAULT '[]',
  print_options TEXT NOT NULL DEFAULT '[]',
  profile TEXT NOT NULL DEFAULT '{}',-- profilo tecnico editor (misure, aree, lati, colori)
  image TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS price_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_code TEXT NOT NULL,
  min_qty INTEGER NOT NULL,
  unit_price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS fonts (
  family TEXT PRIMARY KEY, category TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shape TEXT NOT NULL,           -- sachet | cup | box : il template vale per tutti i prodotti con quella forma
  group_name TEXT NOT NULL,      -- "Bar e ristoranti" | "Eventi"
  name TEXT NOT NULL,
  design TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (     -- bozze salvate dal cliente
  token TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL,
  name TEXT DEFAULT '',
  design TEXT NOT NULL,
  customer_id INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS designs (      -- grafiche CONFERMATE: immutabili
  id TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL,
  option_code TEXT NOT NULL,
  design TEXT NOT NULL,
  profile_snapshot TEXT NOT NULL,
  checks TEXT NOT NULL DEFAULT '[]',
  files TEXT NOT NULL DEFAULT '{}',
  uses_side3 INTEGER NOT NULL DEFAULT 0,
  confirm_text TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'da_verificare', -- da_verificare | approvata | da_correggere
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '', company TEXT DEFAULT '', vat TEXT DEFAULT '', phone TEXT DEFAULT '',
  password_hash TEXT,
  partner_id INTEGER,
  first_order_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
  rate_first REAL NOT NULL DEFAULT 0,     -- % sul primo ordine
  rate_reorder REAL NOT NULL DEFAULT 0,   -- % sui riordini
  reorder_months INTEGER NOT NULL DEFAULT 0, -- 0 = senza scadenza
  include_setup INTEGER NOT NULL DEFAULT 0,  -- base provvigione include l'impianto stampa
  is_default INTEGER NOT NULL DEFAULT 0,     -- partner attribuito ai clienti senza codice
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  billing TEXT NOT NULL, shipping TEXT NOT NULL,
  items TEXT NOT NULL,           -- snapshot righe con prezzi
  totals TEXT NOT NULL,          -- snapshot totali
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'in_attesa',  -- in_attesa | pagato | rimborsato | annullato
  payment_ref TEXT DEFAULT '',
  production_status TEXT NOT NULL DEFAULT 'grafica_da_verificare', -- grafica_da_verificare | in_produzione | spedito | consegnato | annullato
  tracking TEXT DEFAULT '',
  is_reorder INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '', admin_notes TEXT DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  kind TEXT NOT NULL,            -- primo_ordine | riordino
  base REAL NOT NULL, rate REAL NOT NULL, amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_attesa_pagamento', -- in_attesa_pagamento | maturata | da_liquidare | liquidata | rettificata
  adjusted_amount REAL, note TEXT DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, kind TEXT NOT NULL, ref INTEGER, expires_at INTEGER NOT NULL);
`);

const now = () => new Date().toISOString();
const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

function getSetting(key, def) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? J(r.value, def) : def;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
}

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { db, DATA_DIR, now, J, getSetting, setSetting, tx };
