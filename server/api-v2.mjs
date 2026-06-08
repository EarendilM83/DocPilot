// /api/v2/* — secure multi-tenant API. Server-enforced auth + RBAC + tenant boundary.

import {
  hashPassword, verifyPassword, validatePasswordPolicy,
  findUserByEmail, getUserById, getUserRoles, createUser, setUserRoles, updatePassword,
  recordLoginAttempt, isRateLimited,
  createSession, deleteSession,
  parseCookies, sessionCookieHeader, clearSessionCookieHeader,
  loadAuthFromRequest, hasAnyRole, isSuperAdmin, appendAudit,
} from './auth.mjs';
import { db, makeId, makeSlug, nowIso } from './db.mjs';

function send(res, status, body, extraHeaders = {}) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, cookie',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    ...extraHeaders,
  };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(new Error('Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
}

function findCompanyBySlug(slug) {
  if (!slug) return null;
  return db.prepare('SELECT * FROM companies WHERE slug = ?').get(String(slug)) ?? null;
}

function companyById(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM companies WHERE id = ?').get(id) ?? null;
}

function companyBrandingPayload(companyId) {
  const row = db.prepare('SELECT * FROM company_branding WHERE company_id = ?').get(companyId);
  return row ?? null;
}

function publicCompanyPayload(company) {
  if (!company) return null;
  const branding = companyBrandingPayload(company.id);
  return {
    id: company.id,
    slug: company.slug,
    name: company.name,
    status: company.status,
    branding: branding && {
      logoUrl: branding.logo_url,
      primaryColor: branding.primary_color,
      accentColor: branding.accent_color,
      heroTitle: branding.hero_title,
      heroSubtitle: branding.hero_subtitle,
      footerText: branding.footer_text,
      description: branding.description,
    },
  };
}

function accountManagerSummary(amUserId) {
  if (!amUserId) return null;
  const am = db.prepare('SELECT id, name, surname, email, phone, telegram, signal_username FROM users WHERE id = ? AND status = ?').get(amUserId, 'active');
  if (!am) return null;
  return {
    id: am.id,
    name: am.name,
    surname: am.surname,
    email: am.email,
    phone: am.phone,
    telegram: am.telegram,
    signalUsername: am.signal_username,
  };
}

function userPayload(user, roles) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    surname: user.surname,
    phone: user.phone,
    telegram: user.telegram,
    signalUsername: user.signal_username,
    status: user.status,
    companyId: user.company_id,
    roles: roles ?? getUserRoles(user.id),
    lastLoginAt: user.last_login_at,
    accountManagerUserId: user.account_manager_user_id,
    accountManager: accountManagerSummary(user.account_manager_user_id),
    stagingCardEnabled: user.staging_card_enabled === 0 ? false : true,
  };
}

async function routeAuthLogin(req, res) {
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const companySlug = body.companySlug ? String(body.companySlug).trim() : '';
  const ip = getIp(req);

  if (!email || !password) return send(res, 400, { error: 'Email and password required.' });

  if (isRateLimited({ email, ip })) {
    appendAudit({ action: 'login.ratelimit', summary: `Login rate-limited for ${email}`, ip, userAgent: req.headers['user-agent'] });
    return send(res, 429, { error: 'Too many attempts. Please wait 15 minutes.' });
  }

  let companyId = null;
  if (companySlug) {
    const company = findCompanyBySlug(companySlug);
    if (!company) {
      recordLoginAttempt({ email, ip, success: false });
      return send(res, 401, { error: 'Invalid credentials.' });
    }
    if (company.status !== 'active') {
      return send(res, 403, { error: 'Company access is suspended.' });
    }
    companyId = company.id;
  }

  const user = findUserByEmail(companyId, email);
  if (!user || user.status !== 'active') {
    recordLoginAttempt({ email, companyId, ip, success: false });
    appendAudit({ companyId, action: 'login.fail', summary: `Unknown user ${email}`, ip });
    return send(res, 401, { error: 'Invalid credentials.' });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    recordLoginAttempt({ email, companyId, ip, success: false });
    appendAudit({ companyId, userId: user.id, action: 'login.fail', summary: `Bad password for ${email}`, ip });
    return send(res, 401, { error: 'Invalid credentials.' });
  }

  recordLoginAttempt({ email, companyId, ip, success: true });
  const session = createSession({ userId: user.id, companyId, ip, userAgent: req.headers['user-agent'] });
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  appendAudit({ companyId, userId: user.id, action: 'login.success', summary: `Login from ${ip}`, ip, userAgent: req.headers['user-agent'] });

  const roles = getUserRoles(user.id);
  const cookie = sessionCookieHeader(session.token, { expires: session.expiresAt });
  return send(res, 200, {
    ok: true,
    user: userPayload(user, roles),
    company: publicCompanyPayload(companyById(companyId)),
    expiresAt: session.expiresAt,
  }, { 'set-cookie': cookie });
}

function routeAuthLogout(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['dp_session'];
  if (token) {
    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    if (session) {
      appendAudit({ companyId: session.company_id, userId: session.user_id, action: 'logout', ip: getIp(req) });
    }
    deleteSession(token);
  }
  return send(res, 200, { ok: true }, { 'set-cookie': clearSessionCookieHeader() });
}

function routeAuthMe(req, res) {
  const { session, user, roles } = loadAuthFromRequest(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const company = user.company_id ? publicCompanyPayload(companyById(user.company_id)) : null;
  return send(res, 200, { user: userPayload(user, roles), company, expiresAt: session?.expires_at });
}

// SUPERADMIN — companies CRUD
async function routeCompaniesList(req, res) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user || !isSuperAdmin(roles)) return send(res, 403, { error: 'Forbidden.' });
  const rows = db.prepare('SELECT * FROM companies ORDER BY created_at DESC').all();
  return send(res, 200, { companies: rows.map((row) => publicCompanyPayload(row)) });
}

async function routeCompanyCreate(req, res) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user || !isSuperAdmin(roles)) return send(res, 403, { error: 'Forbidden.' });
  const body = await readBody(req);
  const name = String(body.name || '').trim();
  if (!name) return send(res, 400, { error: 'Company name required.' });
  const slug = makeSlug();
  const id = makeId('co');
  const now = nowIso();
  db.prepare(`
    INSERT INTO companies (id, slug, name, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `).run(id, slug, name, now, now);
  db.prepare(`
    INSERT INTO company_branding (company_id, primary_color, accent_color, hero_title, hero_subtitle, description, footer_text, updated_at)
    VALUES (?, '#ff1b23', '#63cdff', ?, ?, ?, ?, ?)
  `).run(id, `${name} Documentation`, 'Welcome. Sign in to access your client area.', `${name} client area on DocPilot.`, `${name} · Hosted by DocPilot`, now);
  appendAudit({ userId: user.id, action: 'company.create', entityType: 'company', entityId: id, summary: `Created company ${name}`, ip: getIp(req) });
  return send(res, 201, { company: publicCompanyPayload(companyById(id)) });
}

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{5,63}$/;

async function routeCompanyUpdate(req, res, companyId) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user || !isSuperAdmin(roles)) return send(res, 403, { error: 'Forbidden.' });
  const existing = companyById(companyId);
  if (!existing) return send(res, 404, { error: 'Company not found.' });
  const body = await readBody(req);

  const fields = [];
  const values = [];
  const changes = [];

  if (typeof body.name === 'string') {
    const next = body.name.trim();
    if (!next) return send(res, 400, { error: 'Name cannot be empty.' });
    if (next !== existing.name) {
      fields.push('name = ?');
      values.push(next);
      changes.push(`name: ${existing.name} → ${next}`);
    }
  }

  if (typeof body.status === 'string') {
    const next = body.status.trim();
    if (!['active', 'suspended', 'archived'].includes(next)) {
      return send(res, 400, { error: 'Invalid status. Must be active, suspended, or archived.' });
    }
    if (next !== existing.status) {
      fields.push('status = ?');
      values.push(next);
      changes.push(`status: ${existing.status} → ${next}`);
    }
  }

  if (typeof body.slug === 'string') {
    const next = body.slug.trim();
    if (next !== existing.slug) {
      if (!SLUG_RE.test(next)) {
        return send(res, 400, { error: 'Slug must be 6–64 chars, alphanumeric/underscore/dash, and start with a letter or digit.' });
      }
      const collision = db.prepare('SELECT id FROM companies WHERE slug = ? AND id != ?').get(next, companyId);
      if (collision) return send(res, 409, { error: 'Slug already in use by another company.' });
      fields.push('slug = ?');
      values.push(next);
      changes.push(`slug: ${existing.slug} → ${next}`);
    }
  }

  if (!fields.length) return send(res, 200, { company: publicCompanyPayload(existing), unchanged: true });

  fields.push('updated_at = ?');
  values.push(nowIso());
  values.push(companyId);
  db.prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  // Slug renamed → keep the old slug working as a redirect alias, and free
  // the new slug from any alias row it may have occupied.
  const slugChange = changes.find((c) => c.startsWith('slug:'));
  if (slugChange) {
    db.prepare(
      'INSERT OR REPLACE INTO company_slug_aliases (old_slug, company_id, created_at) VALUES (?, ?, ?)',
    ).run(existing.slug, companyId, nowIso());
    db.prepare('DELETE FROM company_slug_aliases WHERE old_slug = ?').run(body.slug.trim());
  }
  appendAudit({
    userId: user.id,
    action: 'company.update',
    entityType: 'company',
    entityId: companyId,
    summary: changes.join(' · ') || 'Updated company',
    metadata: { changes },
    ip: getIp(req),
  });
  return send(res, 200, { company: publicCompanyPayload(companyById(companyId)) });
}

async function routeCompanyDelete(req, res, companyId) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user || !isSuperAdmin(roles)) return send(res, 403, { error: 'Forbidden.' });
  db.prepare('UPDATE companies SET status = ?, updated_at = ? WHERE id = ?').run('archived', nowIso(), companyId);
  appendAudit({ userId: user.id, action: 'company.archive', entityType: 'company', entityId: companyId, summary: `Archived company`, ip: getIp(req) });
  return send(res, 200, { ok: true });
}

// Branding update (superadmin OR company-admin in this company)
async function routeBrandingUpdate(req, res, companyId) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const canEdit = isSuperAdmin(roles) || (user.company_id === companyId && hasAnyRole(roles, ['company-admin']));
  if (!canEdit) return send(res, 403, { error: 'Forbidden.' });
  const body = await readBody(req);
  const allowed = ['logo_url', 'primary_color', 'accent_color', 'hero_title', 'hero_subtitle', 'footer_text', 'description'];
  const fields = [];
  const values = [];
  for (const f of allowed) {
    const camelKey = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (typeof body[camelKey] === 'string') {
      fields.push(`${f} = ?`);
      values.push(body[camelKey]);
    }
  }
  if (!fields.length) return send(res, 400, { error: 'No fields to update.' });
  fields.push('updated_at = ?');
  values.push(nowIso());
  values.push(companyId);
  db.prepare(`UPDATE company_branding SET ${fields.join(', ')} WHERE company_id = ?`).run(...values);
  appendAudit({ userId: user.id, companyId, action: 'branding.update', entityType: 'company', entityId: companyId, summary: 'Branding updated', ip: getIp(req) });
  return send(res, 200, { branding: companyBrandingPayload(companyId) });
}

// Public-by-slug: returns minimal branding for the login page render (no PII).
// Renamed slugs resolve via company_slug_aliases — the payload carries the
// CURRENT slug, so the client can redirect old bookmarks to the canonical URL.
async function routePublicCompanyBranding(req, res, slug) {
  let company = findCompanyBySlug(slug);
  if (!company) {
    const alias = db.prepare('SELECT company_id FROM company_slug_aliases WHERE old_slug = ?').get(String(slug));
    if (alias) company = companyById(alias.company_id);
  }
  if (!company) return send(res, 404, { error: 'Not found.' });
  if (company.status !== 'active') return send(res, 404, { error: 'Not found.' });
  return send(res, 200, { company: publicCompanyPayload(company) }, {
    'x-robots-tag': 'noindex, nofollow',
  });
}

// Public doc → owning company. Lets the doc auth gate bounce an anonymous
// deep link to the owning tenant's login instead of a hardcoded one.
// Reader URLs use either the document slug or id; only active companies.
async function routePublicDocCompany(req, res, slugOrId) {
  const row = db.prepare(
    `SELECT c.slug, c.name, c.status FROM documents d
       JOIN companies c ON c.id = d.company_id
      WHERE d.slug = ? OR d.id = ?`,
  ).get(slugOrId, slugOrId);
  if (!row || row.status !== 'active') return send(res, 404, { error: 'Not found.' });
  return send(res, 200, { company: { slug: row.slug, name: row.name } }, {
    'x-robots-tag': 'noindex, nofollow',
  });
}

// USERS — superadmin or company-admin scope
async function routeUsersList(req, res, companyId) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const canRead = isSuperAdmin(roles) || (user.company_id === companyId && hasAnyRole(roles, ['company-admin']));
  if (!canRead) return send(res, 403, { error: 'Forbidden.' });
  const rows = db.prepare('SELECT * FROM users WHERE company_id = ? ORDER BY created_at DESC').all(companyId);
  return send(res, 200, { users: rows.map((u) => userPayload(u)) });
}

async function routeUserCreate(req, res, companyId) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const canCreate = isSuperAdmin(roles) || (user.company_id === companyId && hasAnyRole(roles, ['company-admin']));
  if (!canCreate) return send(res, 403, { error: 'Forbidden.' });
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const surname = typeof body.surname === 'string' ? body.surname.trim() : null;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : null;
  const telegram = typeof body.telegram === 'string' ? body.telegram.trim() : null;
  const signalUsername = typeof body.signalUsername === 'string' ? body.signalUsername.trim() : null;
  const password = String(body.password || '');
  const userRoles = Array.isArray(body.roles) ? body.roles : ['viewer'];
  if (!email || !name) return send(res, 400, { error: 'Email and name required.' });
  const policyError = validatePasswordPolicy(password);
  if (policyError) return send(res, 400, { error: policyError });

  // Optional accountManagerUserId — must be a user in the same company with 'account-manager' role.
  let amId = null;
  if (typeof body.accountManagerUserId === 'string' && body.accountManagerUserId) {
    const am = getUserById(body.accountManagerUserId);
    if (!am || am.company_id !== companyId) return send(res, 400, { error: 'Assigned account manager not in this company.' });
    if (!getUserRoles(am.id).includes('account-manager')) return send(res, 400, { error: 'Assigned user is not an account manager.' });
    amId = am.id;
  }

  try {
    const created = await createUser({
      email, password, name, surname, phone, telegram, signalUsername,
      accountManagerUserId: amId,
      companyId, status: 'active', roles: userRoles,
    });
    appendAudit({ userId: user.id, companyId, action: 'user.create', entityType: 'user', entityId: created.id, summary: `Created ${created.email}`, ip: getIp(req) });
    return send(res, 201, { user: userPayload(created) });
  } catch (err) {
    return send(res, 400, { error: err.message || 'Could not create user.' });
  }
}

async function routeUserUpdate(req, res, companyId, userId) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const canUpdate = isSuperAdmin(roles) || (user.company_id === companyId && hasAnyRole(roles, ['company-admin']));
  if (!canUpdate) return send(res, 403, { error: 'Forbidden.' });
  const target = getUserById(userId);
  if (!target || target.company_id !== companyId) return send(res, 404, { error: 'User not found.' });
  const body = await readBody(req);
  if (typeof body.name === 'string') db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').run(body.name, nowIso(), userId);
  if (typeof body.surname === 'string') db.prepare('UPDATE users SET surname = ?, updated_at = ? WHERE id = ?').run(body.surname.trim() || null, nowIso(), userId);
  if (typeof body.phone === 'string') db.prepare('UPDATE users SET phone = ?, updated_at = ? WHERE id = ?').run(body.phone.trim() || null, nowIso(), userId);
  if (typeof body.telegram === 'string') db.prepare('UPDATE users SET telegram = ?, updated_at = ? WHERE id = ?').run(body.telegram.trim() || null, nowIso(), userId);
  if (typeof body.signalUsername === 'string') db.prepare('UPDATE users SET signal_username = ?, updated_at = ? WHERE id = ?').run(body.signalUsername.trim() || null, nowIso(), userId);
  if (typeof body.status === 'string') {
    // Self-disable is an instant lockout — the session dies with the account.
    if (userId === user.id && body.status !== 'active') return send(res, 400, { error: 'You cannot disable your own account.' });
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(body.status, nowIso(), userId);
  }
  if (Array.isArray(body.roles)) setUserRoles(userId, body.roles);
  if (Object.prototype.hasOwnProperty.call(body, 'stagingCardEnabled')) {
    const enabled = body.stagingCardEnabled === false || body.stagingCardEnabled === 0 ? 0 : 1;
    db.prepare('UPDATE users SET staging_card_enabled = ?, updated_at = ? WHERE id = ?').run(enabled, nowIso(), userId);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'accountManagerUserId')) {
    const raw = body.accountManagerUserId;
    if (raw === null || raw === '') {
      db.prepare('UPDATE users SET account_manager_user_id = NULL, updated_at = ? WHERE id = ?').run(nowIso(), userId);
    } else if (typeof raw === 'string') {
      const am = getUserById(raw);
      if (!am || am.company_id !== companyId) return send(res, 400, { error: 'Assigned account manager not in this company.' });
      if (!getUserRoles(am.id).includes('account-manager')) return send(res, 400, { error: 'Assigned user is not an account manager.' });
      if (am.id === userId) return send(res, 400, { error: 'A user cannot be their own account manager.' });
      db.prepare('UPDATE users SET account_manager_user_id = ?, updated_at = ? WHERE id = ?').run(am.id, nowIso(), userId);
    }
  }
  if (typeof body.password === 'string' && body.password.length) {
    try { await updatePassword(userId, body.password); }
    catch (err) { return send(res, 400, { error: err.message }); }
  }
  appendAudit({ userId: user.id, companyId, action: 'user.update', entityType: 'user', entityId: userId, summary: 'User updated', ip: getIp(req) });
  return send(res, 200, { user: userPayload(getUserById(userId)) });
}

// List active account-managers in a company — used by the assignment dropdown.
async function routeAccountManagersList(req, res, companyId) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const canRead = isSuperAdmin(roles) || (user.company_id === companyId && hasAnyRole(roles, ['company-admin']));
  if (!canRead) return send(res, 403, { error: 'Forbidden.' });
  const rows = db.prepare(`
    SELECT u.id, u.name, u.surname, u.email, u.phone, u.telegram, u.signal_username
    FROM users u
    JOIN user_roles r ON r.user_id = u.id
    WHERE u.company_id = ? AND u.status = 'active' AND r.role = 'account-manager'
    ORDER BY u.name COLLATE NOCASE
  `).all(companyId);
  return send(res, 200, {
    accountManagers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      surname: r.surname,
      email: r.email,
      phone: r.phone,
      telegram: r.telegram,
      signalUsername: r.signal_username,
    })),
  });
}

async function routeUserDelete(req, res, companyId, userId) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const canDelete = isSuperAdmin(roles) || (user.company_id === companyId && hasAnyRole(roles, ['company-admin']));
  if (!canDelete) return send(res, 403, { error: 'Forbidden.' });
  if (userId === user.id) return send(res, 400, { error: 'Cannot delete your own account.' });
  db.prepare('DELETE FROM users WHERE id = ? AND company_id = ?').run(userId, companyId);
  appendAudit({ userId: user.id, companyId, action: 'user.delete', entityType: 'user', entityId: userId, ip: getIp(req) });
  return send(res, 200, { ok: true });
}

// Audit log (superadmin or company-admin scope)
function routeAuditList(req, res, companyId) {
  const { user, roles } = loadAuthFromRequest(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const canRead = isSuperAdmin(roles) || (user.company_id === companyId && hasAnyRole(roles, ['company-admin']));
  if (!canRead) return send(res, 403, { error: 'Forbidden.' });
  const rows = db.prepare('SELECT * FROM audit_events WHERE company_id = ? OR (? IS NULL AND company_id IS NULL) ORDER BY created_at DESC LIMIT 500')
    .all(companyId, companyId);
  return send(res, 200, { events: rows });
}

// ROUTE DISPATCHER
export async function handleApiV2(req, res, url) {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  const p = url.pathname;

  // Auth
  if (p === '/api/v2/auth/login' && req.method === 'POST') return routeAuthLogin(req, res);
  if (p === '/api/v2/auth/logout' && req.method === 'POST') return routeAuthLogout(req, res);
  if (p === '/api/v2/auth/me' && req.method === 'GET') return routeAuthMe(req, res);

  // Public-by-slug branding (anyone hitting /c/:slug)
  let m = p.match(/^\/api\/v2\/public\/companies\/([A-Za-z0-9_-]+)\/branding$/);
  if (m && req.method === 'GET') return routePublicCompanyBranding(req, res, m[1]);

  // Public doc → owning company (login routing for gated doc deep links)
  m = p.match(/^\/api\/v2\/public\/docs\/([A-Za-z0-9_-]+)\/company$/);
  if (m && req.method === 'GET') return routePublicDocCompany(req, res, m[1]);

  // Superadmin scope
  if (p === '/api/v2/companies' && req.method === 'GET') return routeCompaniesList(req, res);
  if (p === '/api/v2/companies' && req.method === 'POST') return routeCompanyCreate(req, res);

  m = p.match(/^\/api\/v2\/companies\/([A-Za-z0-9_-]+)$/);
  if (m) {
    if (req.method === 'PUT') return routeCompanyUpdate(req, res, m[1]);
    if (req.method === 'DELETE') return routeCompanyDelete(req, res, m[1]);
  }

  // Branding update
  m = p.match(/^\/api\/v2\/companies\/([A-Za-z0-9_-]+)\/branding$/);
  if (m && req.method === 'PUT') return routeBrandingUpdate(req, res, m[1]);

  // Account managers list (scoped to company) — used by the assignment dropdown.
  m = p.match(/^\/api\/v2\/companies\/([A-Za-z0-9_-]+)\/account-managers$/);
  if (m && req.method === 'GET') return routeAccountManagersList(req, res, m[1]);

  // Users (scoped to company)
  m = p.match(/^\/api\/v2\/companies\/([A-Za-z0-9_-]+)\/users$/);
  if (m) {
    if (req.method === 'GET') return routeUsersList(req, res, m[1]);
    if (req.method === 'POST') return routeUserCreate(req, res, m[1]);
  }
  m = p.match(/^\/api\/v2\/companies\/([A-Za-z0-9_-]+)\/users\/([A-Za-z0-9_-]+)$/);
  if (m) {
    if (req.method === 'PUT') return routeUserUpdate(req, res, m[1], m[2]);
    if (req.method === 'DELETE') return routeUserDelete(req, res, m[1], m[2]);
  }

  // Audit log
  m = p.match(/^\/api\/v2\/companies\/([A-Za-z0-9_-]+)\/audit$/);
  if (m && req.method === 'GET') return routeAuditList(req, res, m[1]);

  return null; // signal unhandled — fall through to legacy router
}
