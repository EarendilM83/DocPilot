// Idempotent boot-time seed. Runs on every server start; only inserts what's missing.
//
// Reads admin credentials from env vars:
//   ADMIN_EMAIL    — admin email; defaults to admin@example.com
//   ADMIN_PASSWORD — required for first-time seed; subsequent boots ignore it
//   COMPANY_SLUG   — defaults to 'demo'
//   COMPANY_NAME   — defaults to 'Demo Company'
//
// On a clean database: creates the company, the company-admin user, an initial
// branding row, and copies server/seed-state.json into the CMS state file so the
// docs grid + sections render on first paint. On an existing database: silently
// no-ops (we never reset passwords here — use the admin UI for that).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, makeId, nowIso } from './db.mjs';
import { createUser, setUserRoles, findUserByEmail } from './auth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DEFAULTS = {
  email: 'admin@example.com',
  // No default password — the operator must set ADMIN_PASSWORD on first deploy.
  companySlug: 'demo',
  companyName: 'Demo Company',
  adminName: 'Platform Admin',
};

function ensureCompany(slug, name) {
  const existing = db.prepare('SELECT * FROM companies WHERE slug = ?').get(slug);
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
  console.log(`[seed] Created company "${name}" (${slug}) → ${id}`);
  return db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
}

function ensureCmsState() {
  // Copy server/seed-state.json into the live state file if the live file is
  // missing or has no keys. Tenant docs live in legacy JSON state, not SQLite —
  // without this the docs grid in /c/<slug> renders empty even though
  // /docs/:slug fallback works.
  const seedPath = join(__dirname, 'seed-state.json');
  const stateFile = process.env.DOCPILOT_STATE_FILE
    || join(process.env.DOCPILOT_DATA_DIR || join(ROOT, '.docpilot-data'), 'cms-state.json');
  if (!existsSync(seedPath)) return;
  let live = { keys: {} };
  if (existsSync(stateFile)) {
    try { live = JSON.parse(readFileSync(stateFile, 'utf8')) || { keys: {} }; }
    catch { live = { keys: {} }; }
  }
  const liveKeyCount = Object.keys(live.keys || {}).length;
  if (liveKeyCount > 0) {
    console.log(`[seed] cms-state has ${liveKeyCount} key(s) already; skipping state seed.`);
    return;
  }
  const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(seed, null, 2));
  console.log(`[seed] Wrote initial cms-state with ${Object.keys(seed.keys || {}).length} key(s) → ${stateFile}`);
}

// Idempotent, content-agnostic reconcile: any image/video embedded in a doc
// section but missing from the Media Library (cms_media_assets_v1) gets
// registered, so the library mirrors what the docs actually reference. Runs on
// EVERY boot (including already-seeded volumes) — this is what backfills the
// library on an existing deploy after a redeploy. Only adds srcs that are
// currently referenced, so an asset an admin deleted does not come back unless
// a doc still uses it. Metadata is enriched from seed-state.json when present,
// else derived from the file name.
const MEDIA_SRC_RE = /(?:\/images\/[A-Za-z0-9\-_/]+|\/api\/docpilot\/media\/files\/[A-Za-z0-9\-_.]+)\.(?:png|jpe?g|gif|webp|svg|mp4|mov|webm)/gi;
const MEDIA_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};

function deriveAlt(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

function backfillMediaLibrary() {
  const stateFile = process.env.DOCPILOT_STATE_FILE
    || join(process.env.DOCPILOT_DATA_DIR || join(ROOT, '.docpilot-data'), 'cms-state.json');
  if (!existsSync(stateFile)) return; // ensureCmsState handles the fresh case
  let state;
  try { state = JSON.parse(readFileSync(stateFile, 'utf8')); }
  catch { return; }
  const keys = state.keys || {};

  const mediaEntry = keys.cms_media_assets_v1;
  const media = Array.isArray(mediaEntry?.value) ? mediaEntry.value : [];
  const haveSrc = new Set(media.map((a) => a && a.src));

  // Curated metadata from the shipped seed (alt/tags/id), keyed by src.
  const seedPath = join(__dirname, 'seed-state.json');
  let seedBySrc = new Map();
  if (existsSync(seedPath)) {
    try {
      const seedMedia = JSON.parse(readFileSync(seedPath, 'utf8'))?.keys?.cms_media_assets_v1?.value || [];
      seedBySrc = new Map(seedMedia.filter((a) => a && a.src).map((a) => [a.src, a]));
    } catch { /* seed optional */ }
  }

  const docTitle = new Map((keys.cms_docs_v2?.value || []).map((d) => [d.id, d.title]));

  // Walk every section across custom + regular sections, collect referenced srcs.
  const usage = new Map(); // src -> Set(labels)
  const order = [];
  const collect = (docId, section) => {
    if (!section || typeof section.html !== 'string') return;
    for (const src of section.html.match(MEDIA_SRC_RE) || []) {
      if (!usage.has(src)) { usage.set(src, new Set()); order.push(src); }
      usage.get(src).add(`${docTitle.get(docId) || docId} · ${section.number} ${section.title}`);
    }
  };
  const customRoot = keys.cms_custom_sections_v1?.value || {};
  for (const [docId, sections] of Object.entries(customRoot)) {
    for (const s of (Array.isArray(sections) ? sections : Object.values(sections))) collect(docId, s);
  }
  for (const s of (keys.cms_sections_v2?.value || [])) collect(s.docId || s.documentId || 'unknown', s);

  const nowIsoStr = nowIso();
  const today = nowIsoStr.slice(0, 10);
  const added = [];
  for (const src of order) {
    if (haveSrc.has(src)) continue;
    const fileName = src.split('/').pop();
    const ext = fileName.split('.').pop().toLowerCase();
    const seed = seedBySrc.get(src);
    added.push({
      id: seed?.id || `media-backfill-${fileName.replace(/\.[^.]+$/, '').slice(0, 40)}`,
      src,
      alt: seed?.alt || deriveAlt(fileName),
      tags: (seed?.tags?.length ? seed.tags : ['imported']),
      owner: seed?.owner || 'Docs',
      updatedAt: today,
      createdAt: seed?.createdAt || nowIsoStr,
      fileName,
      originalName: seed?.originalName || fileName,
      mimeType: MEDIA_MIME[ext] || 'application/octet-stream',
      usageRefs: Array.from(usage.get(src)),
      ...(MEDIA_MIME[ext]?.startsWith('video/') ? { videoLoopEnabled: true } : {}),
    });
  }

  if (!added.length) return;
  keys.cms_media_assets_v1 = {
    value: [...added, ...media],
    revision: `cms_media_assets_v1:backfill:${Date.now()}`,
    previous_revision: mediaEntry?.revision || null,
    updated_at: nowIsoStr,
  };
  state.keys = keys;
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(`[seed] Media backfill: registered ${added.length} embedded asset(s) into the library.`);
}

export async function seedOnBoot() {
  const slug = process.env.COMPANY_SLUG || DEFAULTS.companySlug;
  const name = process.env.COMPANY_NAME || DEFAULTS.companyName;
  const email = process.env.ADMIN_EMAIL || DEFAULTS.email;
  const password = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || DEFAULTS.adminName;

  ensureCmsState();
  backfillMediaLibrary();

  const company = ensureCompany(slug, name);

  // Only attempt to create the admin user if password is set AND user doesn't already exist.
  const existing = findUserByEmail(company.id, email);
  if (existing) {
    console.log(`[seed] Admin "${email}" already exists for ${slug}; skipping.`);
    return;
  }

  if (!password) {
    console.warn(
      `[seed] No ADMIN_PASSWORD env var set — skipping admin user creation. ` +
      `Set ADMIN_PASSWORD on first boot to create "${email}" for company "${slug}".`,
    );
    return;
  }

  const user = await createUser({
    email,
    password,
    name: adminName,
    companyId: company.id,
    status: 'active',
  });
  setUserRoles(user.id, ['company-admin']);
  console.log(`[seed] Created admin user "${email}" → ${user.id}, role=company-admin`);
}
