#!/usr/bin/env node
// Migration script: JSON file state -> SQLite multi-tenant schema.
// Idempotent: skips entries already present in SQLite. Safe to re-run.

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { db, makeId, makeSlug, nowIso } from './db.mjs';
import { createUser, setUserRoles, appendAudit } from './auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '..', '.docpilot-data', 'cms-state.json');
const STATE_BACKUP = join(__dirname, '..', '.docpilot-data', 'cms-state.pre-migration.json');
const CREDS_FILE = join(__dirname, '..', '.docpilot-data', 'migration-credentials.txt');

function loadLegacyState() {
  if (!existsSync(STATE_FILE)) {
    console.log('No legacy state file found at', STATE_FILE);
    return null;
  }
  const raw = readFileSync(STATE_FILE, 'utf8');
  return JSON.parse(raw);
}

function legacyKey(state, key) {
  const entry = state?.keys?.[key];
  return entry?.value;
}

function safeRandomPassword() {
  // 24-char base64 — meets policy (mixed case, digits, symbol via '+/-=').
  // Force at least one symbol by appending '!aA1' suffix that doesn't break entropy.
  const base = randomBytes(18).toString('base64').replace(/=+$/, '');
  return `${base}!Aa9`;
}

function ensureCompany({ name, slug }) {
  const existing = db.prepare('SELECT * FROM companies WHERE name = ?').get(name);
  if (existing) return existing;
  const id = makeId('co');
  const now = nowIso();
  db.prepare(`
    INSERT INTO companies (id, slug, name, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `).run(id, slug, name, now, now);
  db.prepare(`
    INSERT INTO company_branding (company_id, primary_color, accent_color, hero_title, hero_subtitle, description, footer_text, updated_at)
    VALUES (?, '#ff1b23', '#63cdff', ?, ?, ?, ?, ?)
  `).run(
    id,
    `${name} Documentation`,
    `Welcome. Sign in to view the latest game, back-office, and integration documentation prepared for your team.`,
    `${name} client area — internal & partner documentation, hosted on DocPilot.`,
    `${name} · Hosted by DocPilot`,
    now,
  );
  return db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
}

async function ensureSuperadmin() {
  const row = db.prepare(`
    SELECT u.* FROM users u
    JOIN user_roles r ON r.user_id = u.id
    WHERE r.role = 'superadmin'
    LIMIT 1
  `).get();
  if (row) return { user: row, password: null };
  const email = 'admin@docpilot.local';
  const password = process.env.DOCPILOT_ADMIN_PASSWORD || safeRandomPassword();
  const user = await createUser({
    email,
    password,
    name: 'DocPilot Superadmin',
    companyId: null,
    status: 'active',
    roles: ['superadmin'],
  });
  return { user, password };
}

async function ensureCompanyAdmin(company, displayName, email) {
  const existing = db.prepare(
    'SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND company_id = ?'
  ).get(email, company.id);
  if (existing) return { user: existing, password: null };
  const password = safeRandomPassword();
  const user = await createUser({
    email,
    password,
    name: displayName,
    companyId: company.id,
    status: 'active',
    roles: ['company-admin'],
  });
  return { user, password };
}

function migrateProducts(state, company) {
  const games = legacyKey(state, 'cms_games_v1') || [];
  const docs = legacyKey(state, 'cms_docs_v2') || [];
  const referencedGameIds = new Set(docs.map((d) => d.gameId).filter(Boolean));
  const inserted = [];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO products
    (id, company_id, name, studio, status, description, version, nav_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  games.forEach((game, idx) => {
    if (!referencedGameIds.has(game.id)) return;
    insert.run(
      game.id,
      company.id,
      game.name || 'Untitled product',
      game.studio || 'Demo Studio',
      game.status || 'draft',
      game.description || '',
      game.version || '0.1.0',
      idx + 1,
      game.updatedAt || nowIso(),
      nowIso(),
    );
    inserted.push(game.id);
  });
  return inserted.length;
}

function migrateDocuments(state, company) {
  const docs = legacyKey(state, 'cms_docs_v2') || [];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO documents
    (id, company_id, product_id, slug, title, type, status, version, description, audience, taxonomy, nav_placement, nav_order, owner, reviewer, template_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let count = 0;
  for (const doc of docs) {
    if (!doc.gameId) continue;
    insert.run(
      doc.id,
      company.id,
      doc.gameId,
      doc.slug || doc.id,
      doc.title || 'Untitled document',
      doc.type || 'game',
      doc.status || 'draft',
      doc.version || '0.1.0',
      doc.description || '',
      doc.audience || '',
      doc.taxonomy || '',
      doc.navPlacement || 'primary',
      doc.navOrder ?? null,
      doc.owner || '',
      doc.reviewer || '',
      doc.templateId || '',
      doc.updatedAt || nowIso(),
      nowIso(),
    );
    count += 1;
  }
  return count;
}

function migrateSections(state, company) {
  const buckets = [
    legacyKey(state, 'cms_sections_v2'),
    legacyKey(state, 'cms_backoffice_sections_v1'),
    legacyKey(state, 'cms_integration_sections_v1'),
  ].filter(Array.isArray);
  const customSections = legacyKey(state, 'cms_custom_sections_v1') || {};
  const allDocs = legacyKey(state, 'cms_docs_v2') || [];
  const docsById = new Map(allDocs.map((d) => [d.id, d]));
  const insert = db.prepare(`
    INSERT OR IGNORE INTO sections
    (id, company_id, document_id, number, slug, title, summary, html, status, owner, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let count = 0;

  // Top-level section arrays — attach to whichever doc they were associated with.
  // Hard mapping: cms_sections_v2 -> doc-manual; cms_backoffice_sections_v1 -> doc-backoffice;
  // cms_integration_sections_v1 -> doc-integration.
  const namedMap = new Map([
    ['cms_sections_v2', 'doc-manual'],
    ['cms_backoffice_sections_v1', 'doc-backoffice'],
    ['cms_integration_sections_v1', 'doc-integration'],
  ]);
  for (const [key, docId] of namedMap.entries()) {
    const sections = legacyKey(state, key);
    if (!Array.isArray(sections)) continue;
    if (!docsById.has(docId)) continue;
    sections.forEach((s, idx) => {
      insert.run(
        s.id || `${docId}-s${idx + 1}`,
        company.id,
        docId,
        s.number || `${idx + 1}.0`,
        s.slug || '',
        s.title || 'Untitled',
        s.summary || '',
        s.html || '',
        s.status || 'draft',
        s.owner || '',
        idx,
        s.updatedAt || nowIso(),
        nowIso(),
      );
      count += 1;
    });
  }

  // Custom sections (doc-id keyed)
  for (const [docId, sections] of Object.entries(customSections)) {
    if (!docsById.has(docId)) continue;
    if (!Array.isArray(sections)) continue;
    sections.forEach((s, idx) => {
      insert.run(
        s.id || `${docId}-s${idx + 1}`,
        company.id,
        docId,
        s.number || `${idx + 1}.0`,
        s.slug || '',
        s.title || 'Untitled',
        s.summary || '',
        s.html || '',
        s.status || 'draft',
        s.owner || '',
        idx,
        s.updatedAt || nowIso(),
        nowIso(),
      );
      count += 1;
    });
  }
  return count;
}

function migrateMedia(state, company) {
  const assets = legacyKey(state, 'cms_media_assets_v1') || [];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO media_assets
    (id, company_id, file_name, original_name, mime_type, size_bytes, alt, caption, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let count = 0;
  for (const asset of assets) {
    insert.run(
      asset.id || makeId('media'),
      company.id,
      asset.fileName || asset.originalName || asset.id || 'unknown',
      asset.originalName || asset.fileName || '',
      asset.mimeType || 'application/octet-stream',
      asset.sizeBytes || 0,
      asset.alt || '',
      asset.caption || '',
      JSON.stringify(asset.tags || []),
      asset.createdAt || asset.updatedAt || nowIso(),
      asset.updatedAt || nowIso(),
    );
    count += 1;
  }
  return count;
}

function migrateKvFallback(state, company) {
  const keysToCopy = [
    'cms_theme_presets_v1',
    'cms_active_theme_preset_v1',
    'cms_releases_v2',
    'cms_translations_v2',
    'cms_audit_events_v1',
    'cms_doc_revision_history_v1',
    'cms_marker_color_presets_v1',
    'cms_external_references_v1',
    'cms_api_keys_v1',
    'cms_webhook_endpoints_v1',
  ];
  const insert = db.prepare(`
    INSERT OR REPLACE INTO kv_store (company_scope, key, value, revision, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  let count = 0;
  for (const key of keysToCopy) {
    const entry = state?.keys?.[key];
    if (!entry) continue;
    insert.run(company.id, key, JSON.stringify(entry.value ?? null), entry.revision ?? 1, entry.updated_at ?? nowIso());
    count += 1;
  }
  return count;
}

async function main() {
  console.log('--- DocPilot migration: JSON -> SQLite ---');
  const state = loadLegacyState();

  // 1. Superadmin
  const { user: superUser, password: superPassword } = await ensureSuperadmin();
  console.log(`Superadmin: ${superUser.email} (id=${superUser.id})`);

  // 2. Default company
  const company = ensureCompany({ name: process.env.COMPANY_NAME || 'Demo Studio', slug: makeSlug() });
  console.log(`Company: ${company.name} (slug=${company.slug}, id=${company.id})`);

  // 3. Migrate everything
  let report = { products: 0, documents: 0, sections: 0, media: 0, kv: 0 };
  if (state) {
    report.products = migrateProducts(state, company);
    report.documents = migrateDocuments(state, company);
    report.sections = migrateSections(state, company);
    report.media = migrateMedia(state, company);
    report.kv = migrateKvFallback(state, company);
  }
  console.log('Migrated:', report);

  // 4. Default company admin
  const { user: coAdmin, password: coPassword } = await ensureCompanyAdmin(
    company,
    process.env.ADMIN_NAME || 'Studio Admin',
    process.env.ADMIN_EMAIL || 'admin@example.com',
  );
  console.log(`Company admin: ${coAdmin.email} (id=${coAdmin.id})`);

  appendAudit({
    companyId: null,
    userId: superUser.id,
    action: 'migration.complete',
    entityType: 'system',
    summary: `Migrated ${report.products} products, ${report.documents} documents, ${report.sections} sections, ${report.media} media, ${report.kv} kv entries.`,
    metadata: report,
  });

  // 5. Snapshot credentials to file (only when newly generated)
  const lines = ['DocPilot — migration credentials', '====================================', ''];
  if (superPassword) {
    lines.push(`Superadmin login: ${superUser.email}  /  ${superPassword}`);
    lines.push(`URL: http://localhost:5173/login`);
    lines.push('');
  } else {
    lines.push('Superadmin already existed — password unchanged.');
    lines.push('');
  }
  if (coPassword) {
    lines.push(`Company admin (${company.name}):  ${coAdmin.email}  /  ${coPassword}`);
    lines.push(`Company landing URL: http://localhost:5173/c/${company.slug}`);
    lines.push('');
  } else {
    lines.push(`Company admin already existed for ${company.name}.`);
    lines.push('');
  }
  lines.push(`Company slug: ${company.slug}`);
  lines.push(`Migration timestamp: ${nowIso()}`);
  writeFileSync(CREDS_FILE, lines.join('\n'));
  console.log(`Credentials written to ${CREDS_FILE}`);

  // 6. Archive legacy state
  if (state && existsSync(STATE_FILE) && !existsSync(STATE_BACKUP)) {
    renameSync(STATE_FILE, STATE_BACKUP);
    console.log(`Archived legacy state -> ${STATE_BACKUP}`);
  }

  console.log('--- Migration complete ---');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
