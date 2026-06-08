import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PasswordField from './PasswordField';
import './password-field.css';

type Branding = {
  logoUrl?: string | null;
  primaryColor?: string;
  accentColor?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  footerText?: string;
  description?: string;
};

type PublicCompany = {
  id: string;
  slug: string;
  name: string;
  status: string;
  branding: Branding | null;
};

type AccountManagerSummary = {
  id: string;
  name: string;
  surname: string | null;
  email: string;
  phone: string | null;
  telegram: string | null;
  signalUsername: string | null;
};

type AuthUser = {
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
};

type TenantUser = AuthUser;

type AuditEvent = {
  id: number;
  company_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip: string | null;
  summary: string | null;
  created_at: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = 'Request failed';
    try { detail = (await res.json())?.error ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

type Tab = 'users' | 'branding' | 'audit';

export function CompanyAdmin() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [tab, setTab] = useState<Tab>('users');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api<{ user: AuthUser; company: PublicCompany | null }>(`/api/v2/auth/me`);
        if (cancelled) return;
        const co = await api<{ company: PublicCompany }>(`/api/v2/public/companies/${encodeURIComponent(slug)}/branding`);
        if (cancelled) return;
        if (me.user.companyId !== co.company.id || !me.user.roles.includes('company-admin')) {
          navigate(`/c/${slug}`, { replace: true });
          return;
        }
        setAuthUser(me.user);
        setCompany(co.company);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load.');
        navigate(`/c/${slug}`, { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [slug, navigate]);

  if (loadError) return <main className="company-admin-error">{loadError}</main>;
  if (!authUser || !company) return <main className="company-admin-loading">Loading…</main>;

  return (
    <main className="company-admin" style={{
      ['--brand-primary' as string]: company.branding?.primaryColor || '#ff1b23',
      ['--brand-accent' as string]: company.branding?.accentColor || '#63cdff',
    }}>
      <header className="company-admin-header">
        <div>
          <div className="company-admin-kicker">Company admin</div>
          <h1>{company.name}</h1>
        </div>
        <nav className="company-admin-nav">
          <Link to={`/c/${slug}/admin/cms`} className="company-admin-cms-link">Build docs in CMS →</Link>
          <Link to={`/c/${slug}`}>← Back to client area</Link>
          <button type="button" onClick={async () => { await api('/api/v2/auth/logout', { method: 'POST' }).catch(() => null); navigate(`/c/${slug}`); }}>Logout</button>
        </nav>
      </header>
      <div className="company-admin-tabs" role="tablist">
        {(['users', 'branding', 'audit'] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="company-admin-body">
        {tab === 'users' && <UsersTab companyId={company.id} currentUserId={authUser.id} />}
        {tab === 'branding' && <BrandingTab companyId={company.id} initial={company.branding ?? {}} onSaved={(b) => setCompany({ ...company, branding: b })} />}
        {tab === 'audit' && <AuditTab companyId={company.id} />}
      </div>
    </main>
  );
}

function UsersTab({ companyId, currentUserId }: { companyId: string; currentUserId: string }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [managers, setManagers] = useState<AccountManagerSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const usersData = await api<{ users: TenantUser[] }>(`/api/v2/companies/${companyId}/users`);
      setUsers(usersData.users);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load users.');
    } finally { setBusy(false); }
    // AM list is non-critical — if the server hasn't been restarted with the
    // new route, fail silently and leave the assignment dropdown empty.
    try {
      const amData = await api<{ accountManagers: AccountManagerSummary[] }>(`/api/v2/companies/${companyId}/account-managers`);
      setManagers(amData.accountManagers);
    } catch {
      setManagers([]);
    }
  }, [companyId]);

  useEffect(() => { reload(); }, [reload]);

  async function deleteUser(userId: string) {
    if (userId === currentUserId) return;
    if (!confirm('Delete this user? They lose access immediately.')) return;
    try { await api(`/api/v2/companies/${companyId}/users/${userId}`, { method: 'DELETE' }); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Delete failed.'); }
  }

  async function toggleStatus(user: TenantUser) {
    if (user.id === currentUserId) return; // disabling yourself is an instant lockout
    const next = user.status === 'active' ? 'disabled' : 'active';
    try { await api(`/api/v2/companies/${companyId}/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) }); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Update failed.'); }
  }

  async function assignManager(userId: string, amUserId: string | null) {
    try {
      await api(`/api/v2/companies/${companyId}/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ accountManagerUserId: amUserId }),
      });
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Assignment failed.');
    }
  }

  return (
    <section className="company-admin-users">
      <div className="company-admin-section-header">
        <h2>Users in this company</h2>
        <button type="button" className="company-admin-btn" onClick={() => setShowCreate(true)}>+ New user</button>
      </div>
      {err && <div className="company-admin-error-banner">{err}</div>}
      {busy && <div>Loading…</div>}
      <table className="company-admin-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Phone</th><th>Roles</th><th>Assigned AM</th><th>Status</th><th>Last login</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const fullName = `${u.name}${u.surname ? ' ' + u.surname : ''}`.trim();
            const isAccountManager = u.roles.includes('account-manager');
            const canHaveAm = !isAccountManager && u.id !== currentUserId;
            return (
              <tr key={u.id} className={u.status === 'disabled' ? 'disabled' : ''}>
                <td>{fullName}</td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td>{u.roles.join(', ') || '—'}</td>
                <td>
                  {canHaveAm ? (
                    <select
                      value={u.accountManagerUserId ?? ''}
                      onChange={(e) => assignManager(u.id, e.target.value || null)}
                    >
                      <option value="">— unassigned —</option>
                      {managers.filter((m) => m.id !== u.id).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}{m.surname ? ' ' + m.surname : ''} ({m.email})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>—</span>
                  )}
                </td>
                <td>{u.status}</td>
                <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'never'}</td>
                <td>
                  {u.id !== currentUserId && <button type="button" onClick={() => toggleStatus(u)}>{u.status === 'active' ? 'Disable' : 'Enable'}</button>}
                  {u.id !== currentUserId && <button type="button" onClick={() => deleteUser(u.id)} className="danger">Delete</button>}
                </td>
              </tr>
            );
          })}
          {!users.length && !busy && <tr><td colSpan={8}>No users yet.</td></tr>}
        </tbody>
      </table>
      {showCreate && (
        <UserCreateModal companyId={companyId} managers={managers} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); reload(); }} />
      )}
    </section>
  );
}

function UserCreateModal({
  companyId,
  managers,
  onClose,
  onCreated,
}: {
  companyId: string;
  managers: AccountManagerSummary[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [signalUsername, setSignalUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [accountManagerUserId, setAccountManagerUserId] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api(`/api/v2/companies/${companyId}/users`, {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          surname: surname.trim(),
          phone: phone.trim(),
          telegram: telegram.trim(),
          signalUsername: signalUsername.trim(),
          password,
          roles: [role],
          accountManagerUserId: role !== 'account-manager' && accountManagerUserId ? accountManagerUserId : null,
        }),
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="company-admin-modal-backdrop" onClick={onClose}>
      <div className="company-admin-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Invite a user</h3>
        <form onSubmit={submit}>
          <label><span>First name</span><input name="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
          <label><span>Surname</span><input name="surname" value={surname} onChange={(e) => setSurname(e.target.value)} /></label>
          <label><span>Email</span><input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" /></label>
          <label><span>Phone</span><input name="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" /></label>
          <label><span>Telegram <em>(@username or phone)</em></span><input name="telegram" type="text" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username or +1 555 123 4567" autoCapitalize="off" autoCorrect="off" /></label>
          <label><span>Signal username</span><input name="signalUsername" type="text" value={signalUsername} onChange={(e) => setSignalUsername(e.target.value)} placeholder="signal.handle" autoCapitalize="off" autoCorrect="off" /></label>
          <label>
            <span>Initial password</span>
            <PasswordField
              name="password"
              value={password}
              onChange={setPassword}
              required
              minLength={12}
              autoComplete="new-password"
              showGenerator
            />
          </label>
          <label><span>Role</span>
            <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="company-admin">Company admin</option>
              <option value="editor">Editor</option>
              <option value="reviewer">Reviewer</option>
              <option value="account-manager">Account manager</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          {role !== 'account-manager' && managers.length > 0 && (
            <label><span>Assigned account manager <em>(optional)</em></span>
              <select value={accountManagerUserId} onChange={(e) => setAccountManagerUserId(e.target.value)}>
                <option value="">— none —</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.surname ? ' ' + m.surname : ''} ({m.email})
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="company-admin-hint">Password must be ≥ 12 chars with upper, lower, digit, and symbol. User should change it on first login.</p>
          {err && <div className="company-admin-error-banner">{err}</div>}
          <div className="company-admin-modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={busy} className="company-admin-btn">{busy ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BrandingTab({ companyId, initial, onSaved }: { companyId: string; initial: Branding; onSaved: (next: Branding) => void }) {
  const [draft, setDraft] = useState<Branding>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setField<K extends keyof Branding>(key: K, value: Branding[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const { branding } = await api<{ branding: Branding }>(`/api/v2/companies/${companyId}/branding`, {
        method: 'PUT',
        body: JSON.stringify({
          logoUrl: draft.logoUrl ?? '',
          primaryColor: draft.primaryColor ?? '#ff1b23',
          accentColor: draft.accentColor ?? '#63cdff',
          heroTitle: draft.heroTitle ?? '',
          heroSubtitle: draft.heroSubtitle ?? '',
          footerText: draft.footerText ?? '',
          description: draft.description ?? '',
        }),
      });
      setMsg('Saved.');
      onSaved(branding);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="company-admin-branding">
      <h2>Branding</h2>
      <p>Controls how your company landing page renders for clients at <code>/c/&lt;your-slug&gt;</code>.</p>
      <div className="company-admin-branding-grid">
        <div className="company-admin-form">
          <label><span>Logo URL</span><input value={draft.logoUrl ?? ''} onChange={(e) => setField('logoUrl', e.target.value)} placeholder="https://..." /></label>
          <label><span>Primary color</span><input type="color" value={draft.primaryColor ?? '#ff1b23'} onChange={(e) => setField('primaryColor', e.target.value)} /></label>
          <label><span>Accent color</span><input type="color" value={draft.accentColor ?? '#63cdff'} onChange={(e) => setField('accentColor', e.target.value)} /></label>
          <label><span>Hero title</span><input value={draft.heroTitle ?? ''} onChange={(e) => setField('heroTitle', e.target.value)} /></label>
          <label><span>Hero subtitle</span><textarea rows={2} value={draft.heroSubtitle ?? ''} onChange={(e) => setField('heroSubtitle', e.target.value)} /></label>
          <label><span>Description</span><textarea rows={3} value={draft.description ?? ''} onChange={(e) => setField('description', e.target.value)} /></label>
          <label><span>Footer text</span><input value={draft.footerText ?? ''} onChange={(e) => setField('footerText', e.target.value)} /></label>
          <div className="company-admin-form-actions">
            <button type="button" className="company-admin-btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save branding'}</button>
            {msg && <span className="company-admin-feedback">{msg}</span>}
          </div>
        </div>
        <div className="company-admin-branding-preview" style={{
          ['--brand-primary' as string]: draft.primaryColor || '#ff1b23',
          ['--brand-accent' as string]: draft.accentColor || '#63cdff',
        }}>
          <div className="company-admin-branding-preview-card">
            {draft.logoUrl ? <img src={draft.logoUrl} alt="" style={{ maxHeight: 56 }} /> : <div className="preview-logo-placeholder">LOGO</div>}
            <h3>{draft.heroTitle || 'Hero title'}</h3>
            <p>{draft.heroSubtitle || 'Hero subtitle goes here.'}</p>
            <div className="preview-form">
              <input placeholder="you@company.com" readOnly />
              <input placeholder="••••••••" readOnly />
              <button type="button" disabled>Sign in</button>
            </div>
            <small>{draft.description || 'Description shown beneath the login form.'}</small>
            <footer>{draft.footerText || 'Footer text'}</footer>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuditTab({ companyId }: { companyId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    api<{ events: AuditEvent[] }>(`/api/v2/companies/${companyId}/audit`)
      .then((data) => { if (!cancelled) setEvents(data.events); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  return (
    <section className="company-admin-audit">
      <h2>Audit log</h2>
      {err && <div className="company-admin-error-banner">{err}</div>}
      {busy && <div>Loading…</div>}
      <table className="company-admin-table">
        <thead>
          <tr><th>When</th><th>Action</th><th>Entity</th><th>Summary</th><th>IP</th></tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.created_at).toLocaleString()}</td>
              <td><code>{e.action}</code></td>
              <td>{e.entity_type ?? '—'}{e.entity_id ? ` · ${e.entity_id.slice(0, 12)}` : ''}</td>
              <td>{e.summary ?? ''}</td>
              <td>{e.ip ?? ''}</td>
            </tr>
          ))}
          {!events.length && !busy && <tr><td colSpan={5}>No events yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
