import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '.docpilot-data');
const DB_PATH = process.env.DOCPILOT_DB || join(DATA_DIR, 'docpilot.sqlite');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// Idempotent column-add migrations for existing databases.
// SQLite's CREATE TABLE IF NOT EXISTS doesn't add columns to an already-created
// table, so for each column we check PRAGMA table_info and ALTER if missing.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

ensureColumn('users', 'surname', 'surname TEXT');
ensureColumn('users', 'phone', 'phone TEXT');
ensureColumn('users', 'telegram', 'telegram TEXT');
ensureColumn('users', 'signal_username', 'signal_username TEXT');
ensureColumn('users', 'account_manager_user_id', 'account_manager_user_id TEXT REFERENCES users(id) ON DELETE SET NULL');
ensureColumn('users', 'staging_card_enabled', 'staging_card_enabled INTEGER NOT NULL DEFAULT 1');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_account_manager ON users(account_manager_user_id)');

// Slug aliases — when a company slug is renamed, the old slug keeps working
// via redirect instead of dead-ending (migration-era random slugs live on in
// bookmarks and the printed credentials sheet).
db.exec(`CREATE TABLE IF NOT EXISTS company_slug_aliases (
  old_slug TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
)`);

// Backfill a known migration-era slug alias when configured via env.
// Set LEGACY_SLUG_ALIAS (the old slug) + LEGACY_COMPANY_SLUG (its current slug)
// to map an old bookmarked slug to a company. Idempotent; skipped if unset or the
// company doesn't exist. Tenant-specific values live in deployment env, not code.
if (process.env.LEGACY_SLUG_ALIAS && process.env.LEGACY_COMPANY_SLUG) {
  const company = db
    .prepare('SELECT id FROM companies WHERE slug = ?')
    .get(process.env.LEGACY_COMPANY_SLUG);
  if (company) {
    db.prepare(
      'INSERT OR IGNORE INTO company_slug_aliases (old_slug, company_id, created_at) VALUES (?, ?, ?)',
    ).run(process.env.LEGACY_SLUG_ALIAS, company.id, new Date().toISOString());
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix) {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export function makeSlug() {
  // 16 chars, URL-safe, unguessable (~96 bits of entropy)
  return randomBytes(12).toString('base64url').slice(0, 16);
}

export function makeToken() {
  // 256-bit session token
  return randomBytes(32).toString('base64url');
}

export function transaction(fn) {
  const tx = db.transaction(fn);
  return tx();
}
