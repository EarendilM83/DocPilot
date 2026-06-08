import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { loadSessionMode, saveSessionMode } from '../reader/theme';
import {
  ApiError,
  authLogout,
  authMe,
  publicCompanyBySlug,
  loadClientAreaContent,
  saveClientAreaContent,
  saveCompanyDocs,
  updateCompanyBranding,
  listAccountManagers,
  listCompanyUsers,
  updateUserAccountManager,
  updateUserStagingCard,
  DEFAULT_CLIENT_AREA_CONTENT,
} from './api';
import type {
  AuthUser,
  PublicCompany,
  ClientAreaContent,
  DocCardPayload,
  CompanyBranding,
  AccountManagerSummary,
} from './api';
import './multitenant.css';

type DocCard = DocCardPayload;

async function fetchCompanyDocs(): Promise<DocCard[]> {
  try {
    const res = await fetch('/api/docpilot/state/cms_docs_v2', { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    const persisted = Array.isArray(data?.value) ? data.value : [];
    return persisted.map((d: Record<string, unknown>) => ({
      id: String(d.id ?? ''),
      slug: String(d.slug ?? d.id ?? ''),
      title: String(d.title ?? 'Untitled'),
      type: String(d.type ?? 'doc'),
      description: String(d.description ?? ''),
      audience: String(d.audience ?? ''),
      status: String(d.status ?? 'draft'),
      version: String(d.version ?? ''),
    })).filter((d: DocCard) => d.id);
  } catch {
    return [];
  }
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; user: AuthUser; company: PublicCompany };

const FALLBACK_PRIMARY = '#ff1b23';
const FALLBACK_ACCENT = '#63cdff';
const DOC_STATUSES = ['draft', 'review', 'published'] as const;

// Branding subset we let admins edit inline. Mirrors fields the
// CompanyAdmin page already manages, but rendered next to the live UI
// so changes feel immediate.
interface EditableBranding {
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  footerText: string;
}

function brandingFrom(b: CompanyBranding | null | undefined): EditableBranding {
  return {
    logoUrl: b?.logoUrl ?? '',
    primaryColor: b?.primaryColor ?? FALLBACK_PRIMARY,
    accentColor: b?.accentColor ?? FALLBACK_ACCENT,
    footerText: b?.footerText ?? '',
  };
}

function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => a[k] === b[k]);
}

function docsEqual(a: DocCard[], b: DocCard[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((d, i) => shallowEqual(d as unknown as Record<string, unknown>, b[i] as unknown as Record<string, unknown>));
}

export default function CompanyClientArea(): JSX.Element {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? '';
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    // Honour the slug-scoped reader preference first so the client
    // area opens in the same mode as the doc reader the user just
    // came from. Fall back to system default ('dark').
    if (typeof window === 'undefined') return 'dark';
    const stored = loadSessionMode(slug || 'default');
    if (stored) return stored;
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  });
  const toggleTheme = useCallback(() => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      saveSessionMode(slug || 'default', next);
      return next;
    });
  }, [slug]);

  const [docs, setDocs] = useState<DocCard[]>([]);
  const [docsBaseline, setDocsBaseline] = useState<DocCard[]>([]);

  const [content, setContent] = useState<ClientAreaContent>(DEFAULT_CLIENT_AREA_CONTENT);
  const [contentBaseline, setContentBaseline] = useState<ClientAreaContent>(DEFAULT_CLIENT_AREA_CONTENT);

  const [branding, setBranding] = useState<EditableBranding>(brandingFrom(null));
  const [brandingBaseline, setBrandingBaseline] = useState<EditableBranding>(brandingFrom(null));

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // AM management (admin-only, populated lazily when edit mode opens)
  const [companyUsers, setCompanyUsers] = useState<AuthUser[]>([]);
  const [accountManagers, setAccountManagers] = useState<AccountManagerSummary[]>([]);
  const [amPanelError, setAmPanelError] = useState<string | null>(null);
  const [amPanelBusy, setAmPanelBusy] = useState<string | null>(null);

  const goLogin = useCallback(() => {
    navigate(`/c/${slug}`, { replace: true });
  }, [navigate, slug]);

  useEffect(() => {
    let aborted = false;

    if (!slug) {
      goLogin();
      return;
    }

    (async () => {
      try {
        const [me, branding] = await Promise.all([
          authMe(),
          publicCompanyBySlug(slug),
        ]);
        if (aborted) return;
        if (!me.user || me.user.companyId !== branding.company.id) {
          goLogin();
          return;
        }
        setPhase({ kind: 'ready', user: me.user, company: branding.company });
        const initialBranding = brandingFrom(branding.company.branding);
        setBranding(initialBranding);
        setBrandingBaseline(initialBranding);
      } catch (err) {
        if (aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          goLogin();
        } else {
          // Any other failure (404 company, network) → bounce to landing.
          goLogin();
        }
      }
    })();

    return () => {
      aborted = true;
    };
  }, [slug, goLogin]);

  useEffect(() => {
    if (phase.kind !== 'ready') return;
    let cancelled = false;
    Promise.all([fetchCompanyDocs(), loadClientAreaContent(slug)]).then(([list, c]) => {
      if (cancelled) return;
      setDocs(list);
      setDocsBaseline(list);
      setContent(c);
      setContentBaseline(c);
    });
    return () => { cancelled = true; };
  }, [phase.kind, slug]);

  const wrapperStyle = useMemo<CSSProperties>(() => {
    const source = editMode ? branding : (phase.kind === 'ready' ? brandingFrom(phase.company.branding) : null);
    const style: Record<string, string> = {
      '--brand-primary': source?.primaryColor || FALLBACK_PRIMARY,
      '--brand-accent': source?.accentColor || FALLBACK_ACCENT,
    };
    return style as CSSProperties;
  }, [editMode, branding, phase]);

  // Retry the logo when the URL changes (e.g. admin edits it in edit mode).
  const activeLogoUrl = editMode ? branding.logoUrl : (phase.kind === 'ready' ? phase.company.branding?.logoUrl ?? '' : '');
  useEffect(() => {
    setLogoBroken(false);
  }, [activeLogoUrl]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await authLogout();
    } catch {
      // Silent — we redirect either way.
    }
    // Hard reload: CompanyLanding mounts CompanyClientArea inline at the same
    // /c/:slug URL based on local auth state, so React Router's navigate() to
    // the same path is a no-op. Full reload forces authMe() to re-run and the
    // login form to render.
    window.location.assign(`/c/${slug}`);
  }, [loggingOut, slug]);

  const isCompanyAdmin = phase.kind === 'ready' && phase.user.roles.includes('company-admin');

  // Lazy-load AM management data the first time edit mode opens for an admin.
  useEffect(() => {
    if (!editMode || !isCompanyAdmin || phase.kind !== 'ready') return;
    let cancelled = false;
    (async () => {
      setAmPanelError(null);
      try {
        const [usersResp, amResp] = await Promise.all([
          listCompanyUsers(phase.company.id),
          listAccountManagers(phase.company.id),
        ]);
        if (cancelled) return;
        setCompanyUsers(usersResp.users);
        setAccountManagers(amResp.accountManagers);
      } catch (err) {
        if (cancelled) return;
        setAmPanelError(err instanceof Error ? err.message : 'Failed to load assignments.');
      }
    })();
    return () => { cancelled = true; };
  }, [editMode, isCompanyAdmin, phase]);

  const handleAssignAccountManager = useCallback(async (userId: string, amUserId: string | null) => {
    if (phase.kind !== 'ready') return;
    setAmPanelBusy(userId);
    setAmPanelError(null);
    try {
      const { user: updated } = await updateUserAccountManager(phase.company.id, userId, amUserId);
      setCompanyUsers((list) => list.map((u) => (u.id === userId ? updated : u)));
      // If the admin changed THEIR OWN assignment, update phase so the AM card
      // on the page refreshes without a reload.
      if (updated.id === phase.user.id) {
        setPhase({ kind: 'ready', user: updated, company: phase.company });
      }
    } catch (err) {
      setAmPanelError(err instanceof Error ? err.message : 'Assignment failed.');
    } finally {
      setAmPanelBusy(null);
    }
  }, [phase]);

  const handleToggleStagingCard = useCallback(async (userId: string, enabled: boolean) => {
    if (phase.kind !== 'ready') return;
    setAmPanelBusy(userId);
    setAmPanelError(null);
    try {
      const { user: updated } = await updateUserStagingCard(phase.company.id, userId, enabled);
      setCompanyUsers((list) => list.map((u) => (u.id === userId ? updated : u)));
      if (updated.id === phase.user.id) {
        setPhase({ kind: 'ready', user: updated, company: phase.company });
      }
    } catch (err) {
      setAmPanelError(err instanceof Error ? err.message : 'Toggle failed.');
    } finally {
      setAmPanelBusy(null);
    }
  }, [phase]);

  const dirty = useMemo(() => {
    if (!editMode) return false;
    if (!shallowEqual(content as unknown as Record<string, unknown>, contentBaseline as unknown as Record<string, unknown>)) return true;
    if (!shallowEqual(branding as unknown as Record<string, unknown>, brandingBaseline as unknown as Record<string, unknown>)) return true;
    if (!docsEqual(docs, docsBaseline)) return true;
    return false;
  }, [editMode, content, contentBaseline, branding, brandingBaseline, docs, docsBaseline]);

  const handleDiscard = useCallback(() => {
    setContent(contentBaseline);
    setBranding(brandingBaseline);
    setDocs(docsBaseline);
    setSaveError(null);
  }, [contentBaseline, brandingBaseline, docsBaseline]);

  const handleSave = useCallback(async () => {
    if (phase.kind !== 'ready') return;
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const actor = { id: phase.user.id, role: 'company-admin' };
    const tasks: Promise<unknown>[] = [];
    if (!shallowEqual(content as unknown as Record<string, unknown>, contentBaseline as unknown as Record<string, unknown>)) {
      tasks.push(saveClientAreaContent(slug, actor, content));
    }
    if (!docsEqual(docs, docsBaseline)) {
      tasks.push(saveCompanyDocs(actor, docs));
    }
    if (!shallowEqual(branding as unknown as Record<string, unknown>, brandingBaseline as unknown as Record<string, unknown>)) {
      const patch: Record<string, string> = {};
      (Object.keys(branding) as Array<keyof EditableBranding>).forEach((k) => {
        if (branding[k] !== brandingBaseline[k]) patch[k] = branding[k];
      });
      tasks.push(updateCompanyBranding(phase.company.id, patch));
    }
    try {
      await Promise.all(tasks);
      setContentBaseline(content);
      setDocsBaseline(docs);
      setBrandingBaseline(branding);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [phase, saving, content, contentBaseline, docs, docsBaseline, branding, brandingBaseline, slug]);

  const handleExitEdit = useCallback(() => {
    if (dirty) {
      const ok = window.confirm('Discard unsaved changes?');
      if (!ok) return;
      handleDiscard();
    }
    setEditMode(false);
  }, [dirty, handleDiscard]);

  if (phase.kind === 'loading') {
    return (
      <div className="company-client-shell" style={wrapperStyle}>
        <p className="company-client-loading">Loading…</p>
      </div>
    );
  }

  const { user, company } = phase;
  const logoUrl = (editMode ? branding.logoUrl : (company.branding?.logoUrl || '')) || '';
  const showLogo = !!logoUrl && !logoBroken;
  const footerText = (editMode ? branding.footerText : (company.branding?.footerText || '')) || '';

  return (
    <div
      className={`company-client-shell${editMode ? ' is-edit' : ''}`}
      style={wrapperStyle}
      data-theme={themeMode}
    >
      <header className="company-client-header">
        <div className="company-client-brand">
          {showLogo ? (
            <img
              className="company-client-logo"
              src={logoUrl}
              alt={`${company.name} logo`}
              onError={() => setLogoBroken(true)}
            />
          ) : (
            <span className="company-client-logo-fallback">
              {company.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="company-client-name">{company.name}</span>
        </div>

        <div className="company-client-header-actions">
          <button
            type="button"
            className="company-client-theme-toggle"
            aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
            aria-pressed={themeMode === 'dark'}
            onClick={toggleTheme}
            title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
          >◐</button>
          {isCompanyAdmin && (
            editMode ? (
              <button
                type="button"
                className="company-client-edit-toggle is-active"
                onClick={handleExitEdit}
                aria-pressed
              >
                ✕ Exit edit
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="company-client-edit-toggle"
                  onClick={() => setEditMode(true)}
                  aria-pressed={false}
                  title="Edit this landing page in place"
                >
                  ✎ Edit page
                </button>
                <Link
                  to={`/c/${slug}/admin/cms`}
                  className="company-client-backoffice-link"
                  title="Open the full back-office (docs, sections, media, translations, users, audit)"
                >
                  ⚙ Back office →
                </Link>
              </>
            )
          )}

          <div className="company-client-user-menu">
            <button
              type="button"
              className="company-client-user-trigger"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="company-client-user-email">{user.email}</span>
              <span className="company-client-user-caret" aria-hidden>▾</span>
            </button>
            {menuOpen && (
              <div className="company-client-user-dropdown" role="menu">
                <button
                  type="button"
                  className="company-client-user-action"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  role="menuitem"
                >
                  {loggingOut ? 'Signing out…' : 'Logout'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="company-client-main">
        {editMode && (
          <BrandingPanel
            value={branding}
            onChange={setBranding}
          />
        )}

        {editMode && isCompanyAdmin && (
          <AccountManagerAssignmentsPanel
            users={companyUsers}
            managers={accountManagers}
            currentUserId={user.id}
            busyUserId={amPanelBusy}
            error={amPanelError}
            onAssign={handleAssignAccountManager}
            onToggleStaging={handleToggleStagingCard}
          />
        )}

        <ClientAreaBody
          user={user}
          company={company}
          docs={docs}
          content={content}
          editMode={editMode}
          onContentChange={setContent}
          onDocsChange={setDocs}
        />
      </main>

      {footerText && !editMode && (
        <footer className="company-client-footer">{footerText}</footer>
      )}
      {editMode && (
        <footer className="company-client-footer company-client-footer-edit">
          <label className="company-client-edit-field">
            <span>Footer text</span>
            <input
              type="text"
              value={branding.footerText}
              onChange={(e) => setBranding({ ...branding, footerText: e.target.value })}
              placeholder="© 2026 Company · All rights reserved"
            />
          </label>
        </footer>
      )}

      {editMode && (
        <div className={`company-client-edit-bar${dirty ? ' is-dirty' : ''}`} role="region" aria-label="Unsaved changes">
          <div className="company-client-edit-bar-message">
            {saveError
              ? <span className="company-client-edit-bar-error">⚠ {saveError}</span>
              : dirty
                ? <span>You have unsaved changes.</span>
                : <span className="company-client-edit-bar-clean">All changes saved.</span>}
          </div>
          <div className="company-client-edit-bar-actions">
            <button
              type="button"
              className="company-client-edit-bar-discard"
              onClick={handleDiscard}
              disabled={!dirty || saving}
            >
              Discard
            </button>
            <button
              type="button"
              className="company-client-edit-bar-save"
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BrandingPanel({
  value,
  onChange,
}: {
  value: EditableBranding;
  onChange: (next: EditableBranding) => void;
}) {
  return (
    <section className="company-client-branding-panel" aria-label="Branding">
      <header className="company-client-panel-header">
        <h2>Branding</h2>
        <span className="company-client-panel-hint">Visible to everyone in your company</span>
      </header>
      <div className="company-client-branding-grid">
        <label className="company-client-edit-field">
          <span>Logo URL</span>
          <input
            type="url"
            value={value.logoUrl}
            onChange={(e) => onChange({ ...value, logoUrl: e.target.value })}
            placeholder="https://…/logo.png"
          />
        </label>
        <label className="company-client-edit-field">
          <span>Primary color</span>
          <div className="company-client-color-row">
            <input
              type="color"
              value={value.primaryColor || FALLBACK_PRIMARY}
              onChange={(e) => onChange({ ...value, primaryColor: e.target.value })}
            />
            <input
              type="text"
              value={value.primaryColor}
              onChange={(e) => onChange({ ...value, primaryColor: e.target.value })}
              placeholder="#ff1b23"
            />
          </div>
        </label>
        <label className="company-client-edit-field">
          <span>Accent color</span>
          <div className="company-client-color-row">
            <input
              type="color"
              value={value.accentColor || FALLBACK_ACCENT}
              onChange={(e) => onChange({ ...value, accentColor: e.target.value })}
            />
            <input
              type="text"
              value={value.accentColor}
              onChange={(e) => onChange({ ...value, accentColor: e.target.value })}
              placeholder="#63cdff"
            />
          </div>
        </label>
      </div>
    </section>
  );
}

function ClientAreaBody({
  user,
  company,
  docs,
  content,
  editMode,
  onContentChange,
  onDocsChange,
}: {
  user: AuthUser;
  company: PublicCompany;
  docs: DocCard[];
  content: ClientAreaContent;
  editMode: boolean;
  onContentChange: (next: ClientAreaContent) => void;
  onDocsChange: (next: DocCard[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<string>('all');

  const docTypes = useMemo(() => {
    const set = new Set<string>();
    docs.forEach((d) => { if (d.type) set.add(d.type); });
    return Array.from(set).sort();
  }, [docs]);

  const filteredDocs = useMemo(() => {
    if (editMode) return docs; // No filtering in edit mode — admin needs to see all.
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (activeType !== 'all' && d.type !== activeType) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q)
        || d.description.toLowerCase().includes(q)
        || d.audience.toLowerCase().includes(q)
        || d.type.toLowerCase().includes(q)
      );
    });
  }, [docs, query, activeType, editMode]);

  const publishedCount = docs.filter((d) => d.status === 'published').length;
  const reviewCount = docs.filter((d) => d.status === 'review').length;
  const draftCount = docs.filter((d) => d.status === 'draft').length;
  const primaryRole = user.roles.includes('company-admin')
    ? 'Company admin'
    : user.roles.includes('editor')
      ? 'Editor'
      : user.roles.includes('reviewer')
        ? 'Reviewer'
        : 'Viewer';

  const firstName = user.name.split(' ')[0] || user.name;
  const welcomeKicker = content.welcomeKicker || `${company.name} client area`;
  const welcomeTitle = (content.welcomeTitleTemplate || 'Hello, {firstName}').replace('{firstName}', firstName);

  const recentItems = docs.slice(0, 4).map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type,
    note: d.status === 'published' ? `Published · v${d.version}` : `${d.status} · v${d.version}`,
  }));

  const updateDoc = (id: string, patch: Partial<DocCard>) => {
    onDocsChange(docs.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  return (
    <>
      <section className="company-client-welcome">
        {editMode ? (
          <div className="company-client-welcome-edit">
            <label className="company-client-edit-field">
              <span>Kicker</span>
              <input
                type="text"
                value={content.welcomeKicker}
                onChange={(e) => onContentChange({ ...content, welcomeKicker: e.target.value })}
                placeholder={`${company.name} client area`}
              />
            </label>
            <label className="company-client-edit-field">
              <span>Title template <em>(use {'{firstName}'} for the user's first name)</em></span>
              <input
                type="text"
                value={content.welcomeTitleTemplate}
                onChange={(e) => onContentChange({ ...content, welcomeTitleTemplate: e.target.value })}
                placeholder="Hello, {firstName}"
              />
            </label>
            <label className="company-client-edit-field">
              <span>Body</span>
              <textarea
                rows={3}
                value={content.welcomeBody}
                onChange={(e) => onContentChange({ ...content, welcomeBody: e.target.value })}
                placeholder="One sentence about what this workspace is for."
              />
            </label>
          </div>
        ) : (
          <div>
            <p className="company-client-welcome-kicker">{welcomeKicker}</p>
            <h1 className="company-client-welcome-title">{welcomeTitle}</h1>
            <p className="company-client-welcome-body">{content.welcomeBody}</p>
          </div>
        )}
        {/* Welcome-card admin shortcuts removed — admins use the
            ✎ Back office button in the page header instead. */}
      </section>

      <section className="company-client-stats" aria-label="At a glance">
        <Stat label="Documents" value={String(docs.length)} hint={publishedCount ? `${publishedCount} published` : 'none published'} tone="primary" />
        <Stat label="In review" value={String(reviewCount)} hint={reviewCount === 0 ? 'nothing pending' : 'awaiting publish'} />
        <Stat label="Drafts" value={String(draftCount)} hint={draftCount === 0 ? 'no drafts' : 'editor in progress'} />
        <Stat label="Your role" value={primaryRole} hint={user.email} />
      </section>

      <div className="company-client-grid">
        <section className="company-client-docs-panel" aria-label="Documents">
          <header className="company-client-panel-header">
            <h2>Documents</h2>
            <span className="company-client-panel-count">
              {editMode ? `${docs.length} editable` : `${filteredDocs.length} of ${docs.length}`}
            </span>
          </header>
          {!editMode && (
            <div className="company-client-docs-tools">
              <label className="company-client-search">
                <span className="company-client-search-icon" aria-hidden>⌕</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by title, audience, or type"
                  aria-label="Search documents"
                />
              </label>
              {docTypes.length > 1 && (
                <div className="company-client-type-chips" role="tablist" aria-label="Filter by document type">
                  <button
                    type="button"
                    className={`company-client-chip${activeType === 'all' ? ' active' : ''}`}
                    onClick={() => setActiveType('all')}
                    role="tab"
                    aria-selected={activeType === 'all'}
                  >All</button>
                  {docTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`company-client-chip${activeType === t ? ' active' : ''}`}
                      onClick={() => setActiveType(t)}
                      role="tab"
                      aria-selected={activeType === t}
                    >{t}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {filteredDocs.length === 0 ? (
            <p className="company-client-placeholder">
              {docs.length === 0
                ? 'No documents have been published yet. Ask your administrator.'
                : 'No documents match the current filter.'}
            </p>
          ) : (
            <div className="company-client-doc-grid">
              {filteredDocs.map((doc) => (
                editMode ? (
                  <div key={doc.id} className="company-client-doc-card is-edit">
                    <div className="company-client-doc-meta">
                      <input
                        type="text"
                        className="company-client-doc-type-input"
                        value={doc.type}
                        onChange={(e) => updateDoc(doc.id, { type: e.target.value })}
                        placeholder="type"
                      />
                      <select
                        className="company-client-doc-status-input"
                        value={doc.status}
                        onChange={(e) => updateDoc(doc.id, { status: e.target.value })}
                      >
                        {DOC_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      className="company-client-doc-title-input"
                      value={doc.title}
                      onChange={(e) => updateDoc(doc.id, { title: e.target.value })}
                      placeholder="Document title"
                    />
                    <textarea
                      rows={2}
                      className="company-client-doc-desc-input"
                      value={doc.description}
                      onChange={(e) => updateDoc(doc.id, { description: e.target.value })}
                      placeholder="Short description"
                    />
                    <input
                      type="text"
                      className="company-client-doc-audience-input"
                      value={doc.audience}
                      onChange={(e) => updateDoc(doc.id, { audience: e.target.value })}
                      placeholder="Audience (e.g. operators, partners)"
                    />
                  </div>
                ) : (
                  <Link key={doc.id} className="company-client-doc-card" to={`/docs/${doc.slug}`}>
                    <div className="company-client-doc-meta">
                      <span className="company-client-doc-type">{doc.type}</span>
                      <span className="company-client-doc-status">{doc.status} · v{doc.version}</span>
                    </div>
                    <h3 className="company-client-doc-title">{doc.title}</h3>
                    {doc.description && <p className="company-client-doc-desc">{doc.description}</p>}
                    {doc.audience && <p className="company-client-doc-audience">{doc.audience}</p>}
                    <span className="company-client-doc-cta">Open document →</span>
                  </Link>
                )
              ))}
            </div>
          )}
        </section>

        <aside className="company-client-side">
          <section className="company-client-side-card" aria-label="Recently updated">
            <h2 className="company-client-side-title">Recently updated</h2>
            {recentItems.length === 0 ? (
              <p className="company-client-side-empty">No updates yet.</p>
            ) : (
              <ul className="company-client-recent-list">
                {recentItems.map((item) => (
                  <li key={item.id}>
                    <Link to={`/docs/${docs.find((d) => d.id === item.id)?.slug ?? item.id}`}>
                      <span className="company-client-recent-type">{item.type}</span>
                      <strong className="company-client-recent-title">{item.title}</strong>
                      <span className="company-client-recent-note">{item.note}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!editMode && user.accountManager ? (
            <AccountManagerCard manager={user.accountManager} />
          ) : null}

          {/* "Need help?" and "Workspace" sections removed — staging
              card replaces them. */}

          {editMode ? (
            <section className="company-client-side-card" aria-label="Staging link (admin)">
              <h2 className="company-client-side-title">Staging card</h2>
              <p className="company-client-side-body">
                Edit the label and URL viewers see in their right rail. Toggle per-user visibility in the Account manager assignments table below.
              </p>
              <div className="company-client-help-edit">
                <label className="company-client-edit-field">
                  <span>Label</span>
                  <input
                    type="text"
                    value={content.stagingLabel}
                    onChange={(e) => onContentChange({ ...content, stagingLabel: e.target.value })}
                    placeholder="Test latest on staging"
                  />
                </label>
                <label className="company-client-edit-field">
                  <span>URL</span>
                  <input
                    type="url"
                    value={content.stagingUrl}
                    onChange={(e) => onContentChange({ ...content, stagingUrl: e.target.value })}
                    placeholder="https://staging.example.com"
                  />
                </label>
              </div>
            </section>
          ) : user.stagingCardEnabled !== false && content.stagingUrl ? (
            <section className="company-client-side-card" aria-label={content.stagingLabel || 'Staging'}>
              <h2 className="company-client-side-title">{content.stagingLabel || 'Test latest on staging'}</h2>
              <a
                className="company-client-staging-link"
                href={content.stagingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {content.stagingUrl} ↗
              </a>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function AccountManagerAssignmentsPanel({
  users,
  managers,
  currentUserId,
  busyUserId,
  error,
  onAssign,
  onToggleStaging,
}: {
  users: AuthUser[];
  managers: AccountManagerSummary[];
  currentUserId: string;
  busyUserId: string | null;
  error: string | null;
  onAssign: (userId: string, amUserId: string | null) => void;
  onToggleStaging: (userId: string, enabled: boolean) => void;
}) {
  // Users who can have an AM = anyone in the company who isn't themselves an AM.
  // Account managers don't get an AM assigned to them (no self-reference).
  const assignableUsers = users.filter((u) => !u.roles.includes('account-manager'));
  return (
    <section className="company-client-am-panel" aria-label="Account manager assignments">
      <header className="company-client-panel-header">
        <h2>Account manager assignments</h2>
        <span className="company-client-panel-hint">
          {managers.length} account manager{managers.length === 1 ? '' : 's'} · {assignableUsers.length} assignable user{assignableUsers.length === 1 ? '' : 's'}
        </span>
      </header>
      {error && <p className="company-client-am-panel-error">⚠ {error}</p>}
      {managers.length === 0 ? (
        <p className="company-client-side-hint">
          No account managers in this company yet. Add a user with role <strong>account-manager</strong> in the company admin area to enable assignments.
        </p>
      ) : assignableUsers.length === 0 ? (
        <p className="company-client-side-hint">No users to assign yet.</p>
      ) : (
        <table className="company-client-am-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Assigned account manager</th>
              <th>Staging card</th>
            </tr>
          </thead>
          <tbody>
            {assignableUsers.map((u) => {
              const fullName = `${u.name}${u.surname ? ' ' + u.surname : ''}`.trim();
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id}>
                  <td>
                    <strong>{fullName}{isSelf && <em className="company-client-am-self-tag"> (you)</em>}</strong>
                    <div className="company-client-am-table-sub">{u.email}</div>
                  </td>
                  <td>{u.roles.join(', ') || '—'}</td>
                  <td>
                    <select
                      value={u.accountManagerUserId ?? ''}
                      disabled={busyUserId === u.id}
                      onChange={(e) => onAssign(u.id, e.target.value || null)}
                    >
                      <option value="">— unassigned —</option>
                      {managers.filter((m) => m.id !== u.id).map((m) => {
                        const amName = `${m.name}${m.surname ? ' ' + m.surname : ''}`.trim();
                        return (
                          <option key={m.id} value={m.id}>
                            {amName} ({m.email})
                          </option>
                        );
                      })}
                    </select>
                  </td>
                  <td>
                    <label className="company-client-am-toggle">
                      <input
                        type="checkbox"
                        checked={u.stagingCardEnabled !== false}
                        disabled={busyUserId === u.id}
                        onChange={(e) => onToggleStaging(u.id, e.target.checked)}
                      />
                      <span>{u.stagingCardEnabled !== false ? 'Visible' : 'Hidden'}</span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function telegramHref(value: string): string {
  // t.me resolves both usernames and phone numbers. Strip the leading '@' if
  // present; leading '+' on a phone is fine for t.me.
  const trimmed = value.trim();
  if (!trimmed) return '';
  return `https://t.me/${trimmed.replace(/^@/, '')}`;
}

function AccountManagerCard({ manager }: { manager: AccountManagerSummary }) {
  const fullName = `${manager.name}${manager.surname ? ' ' + manager.surname : ''}`.trim();
  const initial = (manager.name || manager.email).charAt(0).toUpperCase();
  return (
    <section className="company-client-side-card company-client-am-card" aria-label="Account manager">
      <h2 className="company-client-side-title">Your account manager</h2>
      <div className="company-client-am-identity">
        <span className="company-client-am-avatar company-client-am-avatar-fallback">
          {initial}
        </span>
        <div className="company-client-am-name-block">
          <strong className="company-client-am-name">{fullName}</strong>
          <span className="company-client-am-title">Account manager</span>
        </div>
      </div>
      <ul className="company-client-help-list">
        <li>
          <span>Email</span>
          <a href={`mailto:${manager.email}`}>{manager.email}</a>
        </li>
        {manager.phone && (
          <li>
            <span>Phone</span>
            <a href={`tel:${manager.phone.replace(/[^+\d]/g, '')}`}>{manager.phone}</a>
          </li>
        )}
        {manager.telegram && (
          <li>
            <span>Telegram</span>
            <a href={telegramHref(manager.telegram)} target="_blank" rel="noopener noreferrer">{manager.telegram}</a>
          </li>
        )}
        {manager.signalUsername && (
          <li>
            <span>Signal</span>
            <strong>{manager.signalUsername}</strong>
          </li>
        )}
      </ul>
    </section>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'primary' }) {
  return (
    <div className={`company-client-stat${tone === 'primary' ? ' is-primary' : ''}`}>
      <div className="company-client-stat-label">{label}</div>
      <div className="company-client-stat-value">{value}</div>
      {hint && <div className="company-client-stat-hint">{hint}</div>}
    </div>
  );
}
