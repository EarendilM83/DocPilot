// API client for the multi-tenant /api/v2 surface. All calls send the
// session cookie via `credentials: 'include'` and throw a consistent error
// shape so the UI can render polite, non-leaky messages.

export type CompanyStatus = 'active' | 'suspended' | 'archived' | string;

export interface CompanyBranding {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  footerText: string | null;
  description: string | null;
}

export interface PublicCompany {
  id: string;
  slug: string;
  name: string;
  status: CompanyStatus;
  branding: CompanyBranding | null;
}

export interface AccountManagerSummary {
  id: string;
  name: string;
  surname: string | null;
  email: string;
  phone: string | null;
  telegram: string | null;
  signalUsername: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  surname: string | null;
  phone: string | null;
  telegram: string | null;
  signalUsername: string | null;
  status: string;
  companyId: string | null;
  roles: string[];
  lastLoginAt: string | null;
  accountManagerUserId: string | null;
  accountManager: AccountManagerSummary | null;
  stagingCardEnabled: boolean;
}

export interface AuthSessionResponse {
  ok?: boolean;
  user: AuthUser;
  company: PublicCompany | null;
  expiresAt?: string;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && body !== null && 'error' in body &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

export interface LoginArgs {
  email: string;
  password: string;
  companySlug?: string;
}

export function authLogin(args: LoginArgs): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/api/v2/auth/login', {
    method: 'POST',
    body: JSON.stringify(args),
  }).then((res) => {
    invalidateAuthSession();
    return res;
  });
}

export function authLogout(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/v2/auth/logout', { method: 'POST' }).then((res) => {
    invalidateAuthSession();
    return res;
  });
}

export function authMe(): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/api/v2/auth/me');
}

// ─── Shared session lookup ─────────────────────────────────────────────────
// Several components need the session on mount (auth gate, reader chrome,
// account-manager card, admin context strip …). Each used to fire its own
// /auth/me — six requests per doc page. Share one in-flight promise plus a
// short-lived result instead. Login/logout invalidate the cache. Network
// errors (fetch TypeError — NOT an ApiError like 401) are retried with a
// short backoff before the failure surfaces; failures are never cached.

const AUTH_ME_TTL_MS = 60_000;
let authMeCache: { at: number; promise: Promise<AuthSessionResponse> } | null = null;

async function authMeWithRetry(retries = 2): Promise<AuthSessionResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await authMe();
    } catch (err) {
      // An ApiError means the server answered (e.g. 401) — that's a real
      // verdict, don't retry. Only retry genuine network failures.
      if (err instanceof ApiError || attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
}

export function invalidateAuthSession(): void {
  authMeCache = null;
}

export function authMeCached(): Promise<AuthSessionResponse> {
  if (authMeCache && Date.now() - authMeCache.at < AUTH_ME_TTL_MS) {
    return authMeCache.promise;
  }
  const entry: { at: number; promise: Promise<AuthSessionResponse> } = {
    at: Date.now(),
    promise: authMeWithRetry().catch((err) => {
      // Don't cache failures past the shared in-flight window — the next
      // caller should hit the network again.
      if (authMeCache === entry) authMeCache = null;
      throw err;
    }),
  };
  authMeCache = entry;
  return entry.promise;
}

export function publicCompanyBySlug(slug: string): Promise<{ company: PublicCompany }> {
  return apiFetch<{ company: PublicCompany }>(
    `/api/v2/public/companies/${encodeURIComponent(slug)}/branding`,
  );
}

// Owning company for a doc (by reader slug or document id) — used to route
// an anonymous deep link to the right tenant login.
export function publicDocCompany(
  slugOrId: string,
): Promise<{ company: { slug: string; name: string } }> {
  return apiFetch<{ company: { slug: string; name: string } }>(
    `/api/v2/public/docs/${encodeURIComponent(slugOrId)}/company`,
  );
}

// ─── Client area editable content ─────────────────────────────────────────
// Stored in the legacy JSON state store under `client_area_<slug>`. Holds the
// welcome copy and the help/support card — fields the company-admin tunes
// without touching CMS docs or branding.

export interface ClientAreaContent {
  welcomeKicker: string;
  welcomeTitleTemplate: string; // supports `{firstName}` token
  welcomeBody: string;
  // Legacy support card fields — preserved in the schema for migration
  // compatibility, but no longer rendered in the client area.
  supportEmail: string;
  supportHours: string;
  supportStatus: string;
  // Staging card — shown to viewers whose stagingCardEnabled flag is true.
  stagingLabel: string;
  stagingUrl: string;
}

export const DEFAULT_CLIENT_AREA_CONTENT: ClientAreaContent = {
  welcomeKicker: '',
  welcomeTitleTemplate: 'Hello, {firstName}',
  welcomeBody:
    'Your private documentation workspace. Browse the documents your administrators have published, search by title or audience, and reach out to support if you need help.',
  supportEmail: '',
  supportHours: 'Mon–Fri · 09:00–18:00',
  supportStatus: 'All services operational',
  stagingLabel: 'Test latest on staging',
  stagingUrl: '',
};

function clientAreaKey(slug: string): string {
  return `client_area_${slug}`;
}

export async function loadClientAreaContent(slug: string): Promise<ClientAreaContent> {
  try {
    const res = await fetch(`/api/docpilot/state/${encodeURIComponent(clientAreaKey(slug))}`, {
      credentials: 'include',
    });
    if (!res.ok) return DEFAULT_CLIENT_AREA_CONTENT;
    const data = await res.json();
    const v = (data?.value ?? {}) as Partial<ClientAreaContent>;
    return { ...DEFAULT_CLIENT_AREA_CONTENT, ...v };
  } catch {
    return DEFAULT_CLIENT_AREA_CONTENT;
  }
}

export async function saveClientAreaContent(
  slug: string,
  actor: { id: string; role: string },
  content: ClientAreaContent,
): Promise<void> {
  const res = await fetch(`/api/docpilot/state/${encodeURIComponent(clientAreaKey(slug))}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-docpilot-user': actor.id,
      'x-docpilot-role': actor.role,
    },
    body: JSON.stringify({ value: content }),
  });
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    throw new ApiError('Failed to save client area content', res.status, body);
  }
}

// ─── Doc cards (card-level edit on the client area) ───────────────────────
// Reuses the existing `cms_docs_v2` state key — the same source the client
// area already reads from.

export interface DocCardPayload {
  id: string;
  slug: string;
  title: string;
  type: string;
  description: string;
  audience: string;
  status: string;
  version: string;
}

export async function saveCompanyDocs(
  actor: { id: string; role: string },
  docs: DocCardPayload[],
): Promise<void> {
  const res = await fetch('/api/docpilot/state/cms_docs_v2', {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-docpilot-user': actor.id,
      'x-docpilot-role': actor.role,
    },
    body: JSON.stringify({ value: docs }),
  });
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    throw new ApiError('Failed to save documents', res.status, body);
  }
}

// ─── Branding update ──────────────────────────────────────────────────────
// PUT /api/v2/companies/:id/branding — accepts camelCase string fields.

export interface BrandingPatch {
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  footerText?: string;
}

export function updateCompanyBranding(
  companyId: string,
  patch: BrandingPatch,
): Promise<{ branding: CompanyBranding }> {
  return apiFetch<{ branding: CompanyBranding }>(
    `/api/v2/companies/${encodeURIComponent(companyId)}/branding`,
    {
      method: 'PUT',
      body: JSON.stringify(patch),
    },
  );
}

// ─── Account managers (real user role) ────────────────────────────────────
// AMs are users in the company with the 'account-manager' role. Viewers can
// have one assigned via users.account_manager_user_id (set by company-admin).

export function listAccountManagers(
  companyId: string,
): Promise<{ accountManagers: AccountManagerSummary[] }> {
  return apiFetch<{ accountManagers: AccountManagerSummary[] }>(
    `/api/v2/companies/${encodeURIComponent(companyId)}/account-managers`,
  );
}

export function listCompanyUsers(
  companyId: string,
): Promise<{ users: AuthUser[] }> {
  return apiFetch<{ users: AuthUser[] }>(
    `/api/v2/companies/${encodeURIComponent(companyId)}/users`,
  );
}

export function updateUserAccountManager(
  companyId: string,
  userId: string,
  accountManagerUserId: string | null,
): Promise<{ user: AuthUser }> {
  return apiFetch<{ user: AuthUser }>(
    `/api/v2/companies/${encodeURIComponent(companyId)}/users/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ accountManagerUserId }),
    },
  );
}

export function updateUserStagingCard(
  companyId: string,
  userId: string,
  enabled: boolean,
): Promise<{ user: AuthUser }> {
  return apiFetch<{ user: AuthUser }>(
    `/api/v2/companies/${encodeURIComponent(companyId)}/users/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ stagingCardEnabled: enabled }),
    },
  );
}
