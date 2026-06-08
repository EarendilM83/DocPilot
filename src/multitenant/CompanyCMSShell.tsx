// Mounts the legacy <Admin> CMS inside the multi-tenant flow.
// Verifies /api/v2/auth/me + that the user belongs to the company in the URL,
// bridges to the legacy sessionStorage auth so the existing Admin sub-pages
// (Dashboard, Documents, Sections, Media, Translations, etc.) keep working,
// and renders <Admin /> with the basePath context already aware of /c/:slug/admin/cms.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  authLogout,
  authMe,
  publicCompanyBySlug,
} from './api';
import type { AuthUser, CompanyBranding, PublicCompany } from './api';
import { auth } from '../storage';

type Phase =
  | { kind: 'loading' }
  | { kind: 'denied'; reason: string }
  | { kind: 'ready'; user: AuthUser; company: PublicCompany };

const LEGACY_SESSION_FLAG = 'docpilot_admin_session';

function setLegacyAdminSession() {
  try {
    window.sessionStorage.setItem(LEGACY_SESSION_FLAG, '1');
  } catch {
    // sessionStorage blocked — admin features may not work fully
  }
}

function clearLegacyAdminSession() {
  try {
    window.sessionStorage.removeItem(LEGACY_SESSION_FLAG);
    window.sessionStorage.removeItem('docpilot_admin_session_user');
  } catch {
    // ignore
  }
}

export function TenantCMSEntry({ children }: { children: ReactNode }) {
  const params = useParams<{ slug: string; page?: string }>();
  const slug = params.slug ?? '';
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (!slug) {
      setPhase({ kind: 'denied', reason: 'Missing company slug.' });
      return;
    }

    (async () => {
      try {
        const [me, branding] = await Promise.all([
          authMe(),
          publicCompanyBySlug(slug),
        ]);
        if (cancelled) return;

        if (!me.user || me.user.companyId !== branding.company.id) {
          setPhase({ kind: 'denied', reason: 'Wrong company.' });
          return;
        }

        const allowedRoles = ['company-admin', 'editor', 'reviewer', 'superadmin'];
        const canAccess = me.user.roles.some((r) => allowedRoles.includes(r));
        if (!canAccess) {
          setPhase({ kind: 'denied', reason: 'Insufficient role.' });
          return;
        }

        // Bridge to legacy sessionStorage auth so the existing Admin sub-pages
        // (Dashboard, Documents, Sections, Media, Translations, Publishing,
        // Integrations, Users) keep working without per-component refactors.
        setLegacyAdminSession();

        setPhase({ kind: 'ready', user: me.user, company: branding.company });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setPhase({ kind: 'denied', reason: 'Not authenticated.' });
        } else {
          setPhase({ kind: 'denied', reason: 'Could not verify access.' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    // Re-bridge on every tab activation (defensive — guards against
    // session getting cleared by some other path while CMS is mounted).
    if (phase.kind === 'ready') setLegacyAdminSession();
  }, [phase.kind]);

  if (phase.kind === 'loading') {
    return (
      <div className="company-cms-loading">
        <p>Verifying access…</p>
      </div>
    );
  }

  if (phase.kind === 'denied') {
    return <Navigate to={`/c/${slug}`} replace />;
  }

  return (
    <CompanyCMSChrome
      company={phase.company}
      user={phase.user}
      onLogout={async () => {
        clearLegacyAdminSession();
        auth.logout();
        try { await authLogout(); } catch { /* ignore */ }
        navigate(`/c/${slug}`);
      }}
    >
      {children}
    </CompanyCMSChrome>
  );
}

function CompanyCMSChrome({
  company,
  user,
  onLogout,
  children,
}: {
  company: PublicCompany;
  user: AuthUser;
  onLogout: () => void;
  children: ReactNode;
}) {
  const branding: Partial<CompanyBranding> = company.branding ?? {};
  const [logoBroken, setLogoBroken] = useState(false);
  const showLogo = Boolean(branding.logoUrl) && !logoBroken;
  return (
    <div
      className="company-cms-shell"
      style={{
        ['--brand-primary' as string]: branding.primaryColor || '#ff1b23',
        ['--brand-accent' as string]: branding.accentColor || '#63cdff',
      }}
    >
      <header className="company-cms-topbar">
        <div className="company-cms-topbar-brand">
          {showLogo ? (
            <img
              className="company-cms-logo"
              src={branding.logoUrl ?? undefined}
              alt=""
              onError={() => setLogoBroken(true)}
            />
          ) : (
            <span className="company-cms-logo-fallback">
              {company.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <div className="company-cms-kicker">Documentation CMS</div>
            <div className="company-cms-company-name">{company.name}</div>
          </div>
        </div>
        <nav className="company-cms-topnav">
          <a href={`/c/${company.slug}`}>← Client area</a>
          <a href={`/c/${company.slug}/admin`}>Company admin</a>
          <span className="company-cms-user-email">{user.email}</span>
          <button type="button" onClick={onLogout}>Logout</button>
        </nav>
      </header>
      <div className="company-cms-body">
        {children}
      </div>
    </div>
  );
}
