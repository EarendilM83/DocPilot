const PREFIX = 'docpilot_admin_';
const USERS_KEY = `${PREFIX}users_v1`;
const SESSION_KEY = 'docpilot_admin_session_user';
const LEGACY_SESSION_KEY = 'docpilot_admin_session';
const MIGRATION_REPORT_KEY = `${PREFIX}migration_report_v1`;
const API_BASE = (import.meta.env.VITE_DOCPILOT_API_BASE || '/api/docpilot').replace(/\/$/, '');

export type UserRole = 'admin' | 'editor' | 'reviewer' | 'viewer' | 'partner' | 'tam' | 'developer';
export type WritePermission = 'documents:write' | 'sections:write' | 'media:write' | 'translations:write' | 'releases:write' | 'users:manage' | 'settings:write' | 'integrations:write';
export type PersistenceStatus = 'checking' | 'server' | 'offline';
export type AppUser = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  password: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
};

type StoredStateResponse<T> = {
  found: boolean;
  value?: T;
  revision?: string;
};

type MigrationReport = {
  imported: number;
  skipped: number;
  errors: { key: string | null; error: string }[];
  at: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const DEFAULT_USERS: AppUser[] = [
  { id: 'user-admin', name: 'Admin', username: 'admin', role: 'admin', password: 'admin', status: 'active', createdAt: '2026-05-05', updatedAt: '2026-05-05' },
];
export const PERMISSION_MATRIX: { permission: WritePermission; label: string; resource: string }[] = [
  { permission: 'documents:write', label: 'Documents', resource: 'documents' },
  { permission: 'sections:write', label: 'Sections', resource: 'sections' },
  { permission: 'media:write', label: 'Media', resource: 'media' },
  { permission: 'translations:write', label: 'Translations', resource: 'translations' },
  { permission: 'releases:write', label: 'Releases', resource: 'releases' },
  { permission: 'users:manage', label: 'Users', resource: 'users' },
  { permission: 'settings:write', label: 'Settings', resource: 'settings' },
  { permission: 'integrations:write', label: 'Integrations', resource: 'integrations' },
];
const WRITE_PERMISSIONS: Record<UserRole, WritePermission[]> = {
  admin: PERMISSION_MATRIX.map((item) => item.permission),
  editor: ['documents:write', 'sections:write', 'media:write', 'translations:write', 'releases:write', 'integrations:write'],
  reviewer: ['translations:write'],
  viewer: [],
  partner: ['documents:write', 'translations:write'],
  tam: ['documents:write', 'sections:write', 'media:write', 'translations:write', 'releases:write', 'integrations:write'],
  developer: ['documents:write', 'sections:write', 'media:write', 'settings:write', 'integrations:write'],
};
let persistenceStatus: PersistenceStatus = 'checking';
const persistenceListeners = new Set<(status: PersistenceStatus) => void>();

function setPersistenceStatus(status: PersistenceStatus) {
  if (persistenceStatus === status) return;
  persistenceStatus = status;
  persistenceListeners.forEach((listener) => listener(status));
}

function notifyPersistenceError(message: string) {
  window.dispatchEvent(new CustomEvent('docpilot:persistence-error', { detail: message }));
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function readLocalValue<T>(key: string, fallback: T) {
  const raw = localStorage.getItem(PREFIX + key);
  if (raw === null) return { value: fallback, valid: false, hadRaw: false };
  try {
    return { value: JSON.parse(raw) as T, valid: true, hadRaw: true };
  } catch {
    const report: MigrationReport = {
      imported: 0,
      skipped: 0,
      errors: [{ key, error: 'Malformed local prototype data was ignored.' }],
      at: new Date().toISOString(),
    };
    localStorage.setItem(MIGRATION_REPORT_KEY, JSON.stringify(report));
    return { value: fallback, valid: false, hadRaw: true };
  }
}

async function persistValue<T>(key: string, value: T, operation: string) {
  const actor = getSessionActor();
  await requestJson(`/state/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: {
      'x-docpilot-user': actor?.id || 'anonymous',
      'x-docpilot-role': actor?.role || 'viewer',
    },
    body: JSON.stringify({
      value,
      operation,
      target_entity: key,
      actor: actor?.id || 'anonymous',
    }),
  });
  setPersistenceStatus('server');
}

async function checkPersistence() {
  try {
    await requestJson('/health');
    setPersistenceStatus('server');
  } catch {
    setPersistenceStatus('offline');
  }
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function permissionForKey(key: string): WritePermission {
  if (key.includes('users')) return 'users:manage';
  if (key.includes('media')) return 'media:write';
  if (key.includes('translation')) return 'translations:write';
  if (key.includes('release')) return 'releases:write';
  if (key.includes('integration') || key.includes('api_keys') || key.includes('webhook') || key.includes('external_references')) return 'integrations:write';
  if (key.includes('section')) return 'sections:write';
  if (key.includes('doc')) return 'documents:write';
  if (key.includes('selected_product') || key.includes('marker_color_presets') || key.includes('theme_preset')) return 'settings:write';
  return 'documents:write';
}

function getSessionActor() {
  const sessionUserId = sessionStorage.getItem(SESSION_KEY);
  return readUsers().find((item) => item.id === sessionUserId && item.status === 'active') || null;
}

export function canRoleWrite(role: UserRole, permission: WritePermission) {
  return WRITE_PERMISSIONS[role].includes(permission);
}

export function canCurrentUserWriteKey(key: string) {
  const actor = getSessionActor();
  if (!actor) return false;
  return canRoleWrite(actor.role, permissionForKey(key));
}

function readUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    const parsed = raw ? JSON.parse(raw) as AppUser[] : DEFAULT_USERS;
    const hasAdmin = parsed.some((user) => user.username === 'admin');
    const users = hasAdmin ? parsed : [...DEFAULT_USERS, ...parsed];
    if (!raw || !hasAdmin) writeUsers(users, false);
    return users;
  } catch {
    writeUsers(DEFAULT_USERS, false);
    return DEFAULT_USERS;
  }
}

function writeUsers(users: AppUser[], persist = true) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  if (persist && persistenceStatus === 'server') {
    void persistValue('users_v1', users, 'users_update').catch(() => {
      setPersistenceStatus('offline');
      notifyPersistenceError('User update could not be persisted server-side.');
    });
  }
}

function isLastAdmin(users: AppUser[], userId: string) {
  const target = users.find((user) => user.id === userId);
  if (target?.role !== 'admin' || target.status !== 'active') return false;
  return users.filter((user) => user.role === 'admin' && user.status === 'active').length <= 1;
}

export const auth = {
  isLoggedIn: () => Boolean(auth.currentUser()),
  currentUser: () => {
    const users = readUsers();
    const sessionUserId = sessionStorage.getItem(SESSION_KEY);
    const user = users.find((item) => item.id === sessionUserId && item.status === 'active');
    if (user) return user;

    if (sessionStorage.getItem(LEGACY_SESSION_KEY) === '1') {
      const admin = users.find((item) => item.username === 'admin' && item.status === 'active') ?? DEFAULT_USERS[0];
      sessionStorage.setItem(SESSION_KEY, admin.id);
      return admin;
    }

    return null;
  },
  login: (username: string, password: string) => {
    const normalized = normalizeUsername(username);
    const user = readUsers().find((item) => item.username === normalized && item.password === password && item.status === 'active');
    if (user) {
      sessionStorage.setItem(SESSION_KEY, user.id);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
      return true;
    }

    return false;
  },
  logout: () => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  },
  listUsers: () => readUsers(),
  createUser: (input: Pick<AppUser, 'name' | 'username' | 'role' | 'password'>) => {
    if (!canCurrentUserWriteKey('users_v1')) throw new Error('Admin role required to manage users.');
    const username = normalizeUsername(input.username);
    const users = readUsers();
    if (!input.name.trim()) throw new Error('Name is required.');
    if (!username) throw new Error('Username is required.');
    if (users.some((user) => user.username === username)) throw new Error('Username already exists.');
    if (input.password.length < 4) throw new Error('Password must be at least 4 characters.');

    const next: AppUser = {
      id: `user-${Date.now()}`,
      name: input.name.trim(),
      username,
      role: input.role,
      password: input.password,
      status: 'active',
      createdAt: today(),
      updatedAt: today(),
    };
    writeUsers([next, ...users]);
    return next;
  },
  updateUser: (userId: string, input: Pick<AppUser, 'name' | 'username' | 'role' | 'status'>) => {
    if (!canCurrentUserWriteKey('users_v1')) throw new Error('Admin role required to manage users.');
    const username = normalizeUsername(input.username);
    const users = readUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) throw new Error('User not found.');
    if (!input.name.trim()) throw new Error('Name is required.');
    if (!username) throw new Error('Username is required.');
    if (users.some((user) => user.id !== userId && user.username === username)) throw new Error('Username already exists.');
    if (isLastAdmin(users, userId) && (input.role !== 'admin' || input.status !== 'active')) throw new Error('At least one active admin is required.');

    writeUsers(users.map((user) => user.id === userId ? {
      ...user,
      name: input.name.trim(),
      username,
      role: input.role,
      status: input.status,
      updatedAt: today(),
    } : user));
  },
  resetPassword: (userId: string, password: string) => {
    if (!canCurrentUserWriteKey('users_v1')) throw new Error('Admin role required to manage users.');
    if (password.length < 4) throw new Error('Password must be at least 4 characters.');
    const users = readUsers();
    const exists = users.some((user) => user.id === userId);
    if (!exists) throw new Error('User not found.');
    writeUsers(users.map((user) => user.id === userId ? { ...user, password, updatedAt: today() } : user));
  },
  deleteUser: (userId: string, currentUserId: string) => {
    if (!canCurrentUserWriteKey('users_v1')) throw new Error('Admin role required to manage users.');
    const users = readUsers();
    const exists = users.some((user) => user.id === userId);
    if (!exists) throw new Error('User not found.');
    if (userId === currentUserId) throw new Error('You cannot delete your own active session.');
    if (isLastAdmin(users, userId)) throw new Error('At least one active admin is required.');
    writeUsers(users.filter((user) => user.id !== userId));
  },
};

// Keys whose server value has been fetched this session. Writing a key
// BEFORE it hydrates would persist state derived from code defaults and
// clobber the server value (verified data loss: a doc delete fired before
// hydration wiped every doc/section not present in the defaults).
const hydratedKeys = new Set<string>();
// Pure preference keys carry the user's explicit new choice (not state
// derived from a possibly-unhydrated collection), so writing them early is
// harmless — and blocking them freezes basic UI like the product filter.
const PREHYDRATION_SAFE_KEYS = new Set([
  'cms_selected_product_v1',
  'cms_active_theme_preset_v1',
  'cms_marker_color_presets_v1',
]);

// Exposed for useStoredState: whole-collection writes must additionally be
// gated PER COMPONENT INSTANCE. The global hydratedKeys set is not enough —
// when a large value can't be cached in localStorage (quota), a component
// mounted later initialises from code defaults while the key already counts
// as hydrated globally, and its first save clobbers the server value.
export function isPrehydrationSafeKey(key: string) {
  return PREHYDRATION_SAFE_KEYS.has(key);
}

export function notifyBlockedWrite(message: string) {
  notifyPersistenceError(message);
}

export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  async hydrate<T>(key: string, fallback: T): Promise<T> {
    const local = readLocalValue(key, fallback);
    try {
      const remote = await requestJson<StoredStateResponse<T>>(`/state/${encodeURIComponent(key)}`);
      setPersistenceStatus('server');
      if (remote.found) {
        try {
          localStorage.setItem(PREFIX + key, JSON.stringify(remote.value));
        } catch {
          // Quota or other write failure on cache hydration — proceed with the
          // server value, skip the local cache. Server remains source of truth.
          try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
        }
        hydratedKeys.add(key);
        return remote.value as T;
      }

      const actor = getSessionActor();
      if (!actor) {
        return local.hadRaw && local.valid ? local.value : fallback;
      }

      const seed = local.hadRaw && local.valid ? local.value : fallback;
      await persistValue(key, seed, local.valid ? 'import_local_prototype' : 'seed_default');
      hydratedKeys.add(key);
      return seed;
    } catch {
      setPersistenceStatus('offline');
      return local.value;
    }
  },
  set<T>(key: string, value: T) {
    if (persistenceStatus !== 'server') {
      notifyPersistenceError('Server persistence is unavailable. Changes were blocked to avoid local-only saves.');
      return false;
    }
    if (!hydratedKeys.has(key) && !PREHYDRATION_SAFE_KEYS.has(key)) {
      notifyPersistenceError('Still loading the latest data from the server — please retry in a moment.');
      return false;
    }
    if (!canCurrentUserWriteKey(key)) {
      notifyPersistenceError('Your role is not allowed to perform this action.');
      return false;
    }
    // localStorage is a write-through cache. The authoritative store is the
    // server. If the value is too big for localStorage (e.g. accumulated
    // translations push past the ~5MB browser quota), don't kill the calling
    // effect — drop the local cache and continue with the server write.
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (err) {
      const isQuota = err instanceof DOMException && (
        err.name === 'QuotaExceededError'
        || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || err.code === 22
        || err.code === 1014
      );
      if (isQuota) {
        try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
        // eslint-disable-next-line no-console
        console.warn(`[storage] localStorage quota exceeded for "${key}" — server-only persistence for this key.`);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[storage] localStorage write failed for "${key}":`, err);
      }
    }
    void persistValue(key, value, 'update').catch(() => {
      setPersistenceStatus('offline');
      notifyPersistenceError('Server persistence failed. Reload after the persistence API is restored before editing further.');
    });
    return true;
  },
  getPersistenceStatus: () => persistenceStatus,
  canMutate: () => persistenceStatus === 'server',
  canMutateKey: (key: string) => persistenceStatus === 'server' && canCurrentUserWriteKey(key),
  subscribePersistenceStatus(listener: (status: PersistenceStatus) => void) {
    persistenceListeners.add(listener);
    return () => {
      persistenceListeners.delete(listener);
    };
  },
  checkPersistence,
  migrationReport: () => {
    try {
      const raw = localStorage.getItem(MIGRATION_REPORT_KEY);
      return raw ? JSON.parse(raw) as MigrationReport : null;
    } catch {
      return null;
    }
  },
};

void checkPersistence();
