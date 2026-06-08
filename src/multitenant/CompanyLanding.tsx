import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import {
  ApiError,
  authLogin,
  authMe,
  publicCompanyBySlug,
} from './api';
import type { PublicCompany } from './api';
import PasswordField from './PasswordField';
import CompanyClientArea from './CompanyClientArea';
import LandingBackdrop from './LandingBackdrop';
import './multitenant.css';
import './password-field.css';

type LoadState =
  | { phase: 'loading'; slug: string }
  | { phase: 'missing'; slug: string }
  | { phase: 'ready'; slug: string; company: PublicCompany };

const FALLBACK_PRIMARY = '#ff1b23';
const FALLBACK_ACCENT = '#63cdff';

function useNoIndexMeta(): void {
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex,nofollow';
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, []);
}

export default function CompanyLanding(): JSX.Element {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? '';
  const location = useLocation();
  const returnTo = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('returnTo');
    if (!raw) return null;
    // Only honour same-origin paths to prevent open-redirect.
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return null;
  }, [location.search]);
  const [state, setState] = useState<LoadState>({ phase: 'loading', slug });
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoBroken, setLogoBroken] = useState(false);
  const cancelledRef = useRef(false);

  useNoIndexMeta();

  // After successful auth, if we have a returnTo, we navigate the user
  // back via the synchronous <Navigate /> below. Keep the imperative
  // form available for any future programmatic flow.
  // (no-op effect; navigation happens in the synchronous render below)

  useEffect(() => {
    cancelledRef.current = false;
    if (!slug) return;

    let aborted = false;
    (async () => {
      let company: PublicCompany;
      try {
        const result = await publicCompanyBySlug(slug);
        company = result.company;
      } catch {
        if (aborted) return;
        // Treat any failure (404, network, etc.) as a generic "missing" page
        // to avoid leaking whether the slug exists.
        setState({ phase: 'missing', slug });
        return;
      }
      if (aborted) return;

      // Check session BEFORE committing 'ready', so we render the login form
      // and the client area exactly once each — never the login form first
      // followed by an auth-success swap (which flashed on refresh).
      let isAuthed = false;
      try {
        const me = await authMe();
        if (aborted) return;
        isAuthed = Boolean(me.user && me.user.companyId === company.id);
      } catch {
        // Not logged in or session invalid — proceed with login form.
      }
      if (aborted) return;

      // Both updates in the same microtask → React 18 batches them → 1 render.
      setAuthed(isAuthed);
      setState({ phase: 'ready', slug, company });
    })();

    return () => {
      aborted = true;
      cancelledRef.current = true;
    };
  }, [slug]);

  // Derive a consistent state view:
  // - no slug at all → treat as missing (defensive; router shouldn't allow this)
  // - slug changed but state hasn't caught up → loading
  // - otherwise → current state
  const effectiveState: LoadState = !slug
    ? { phase: 'missing', slug: '' }
    : state.slug === slug
      ? state
      : { phase: 'loading', slug };

  const company = effectiveState.phase === 'ready' ? effectiveState.company : null;
  const branding = company?.branding ?? null;

  const wrapperStyle = useMemo<CSSProperties>(() => {
    const style: Record<string, string> = {
      '--brand-primary': branding?.primaryColor || FALLBACK_PRIMARY,
      '--brand-accent': branding?.accentColor || FALLBACK_ACCENT,
    };
    return style as CSSProperties;
  }, [branding?.primaryColor, branding?.accentColor]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!company) return;
      if (submitting) return;
      setError(null);
      setSubmitting(true);
      try {
        await authLogin({
          email: email.trim(),
          password,
          companySlug: company.slug,
        });
        // Honour returnTo immediately to avoid CompanyClientArea's own
        // auth re-probe racing with this redirect.
        if (returnTo) {
          window.location.assign(returnTo);
          return;
        }
        setAuthed(true);
      } catch (err) {
        // Never reveal whether the email exists vs the password is wrong.
        if (err instanceof ApiError && err.status === 429) {
          setError('Too many attempts. Please wait a few minutes and try again.');
        } else {
          setError('Invalid credentials. Please try again.');
        }
      } finally {
        if (!cancelledRef.current) setSubmitting(false);
      }
    },
    [company, email, password, submitting],
  );

  // Renamed slug resolved via server alias — the payload carries the current
  // canonical slug. Move the browser there (keeping ?returnTo etc.) so old
  // bookmarks and the printed credentials sheet keep working.
  if (company && slug && company.slug !== slug) {
    return <Navigate to={`/c/${company.slug}${location.search}`} replace />;
  }

  // Already authenticated and we have a returnTo (e.g. the user was
  // bounced here by the doc auth gate) — head straight to the original
  // destination instead of rendering the client area.
  if (authed && returnTo && effectiveState.phase === 'ready') {
    return <Navigate to={returnTo} replace />;
  }

  // Already authenticated for this company — swap to the client area inline
  // at the same /c/:slug URL (no /app suffix). This was previously a navigate.
  if (authed && effectiveState.phase === 'ready') {
    return <CompanyClientArea />;
  }

  if (effectiveState.phase === 'loading') {
    return (
      <div className="company-landing-shell" style={wrapperStyle}>
        <div className="company-landing-card">
          <p className="company-landing-loading">Loading…</p>
        </div>
      </div>
    );
  }

  if (effectiveState.phase === 'missing') {
    return (
      <div className="company-landing-shell company-landing-shell--missing">
        <div className="company-landing-card company-landing-card--missing">
          <h1 className="company-landing-missing-title">This space is not available</h1>
          <p className="company-landing-missing-body">
            The link you followed may be incorrect, or this area is no longer
            accessible. If you believe this is a mistake, please contact the
            person who shared this link with you.
          </p>
          <a className="company-landing-missing-home" href="/">Go to DocPilot home</a>
        </div>
      </div>
    );
  }

  const heroTitle = branding?.heroTitle || `${company!.name} Documentation`;
  const heroSubtitle = branding?.heroSubtitle || 'Welcome. Sign in to access your client area.';
  const description = branding?.description || '';
  const footerText = branding?.footerText || '';
  const logoUrl = branding?.logoUrl || '';
  const showLogo = !!logoUrl && !logoBroken;

  return (
    <div className="company-landing-shell" style={wrapperStyle}>
      <LandingBackdrop
        brandPrimary={branding?.primaryColor || FALLBACK_PRIMARY}
        brandAccent={branding?.accentColor || FALLBACK_ACCENT}
      />
      <div className="company-landing-card">
        {showLogo && (
          <div className="company-landing-logo-wrap">
            <img
              className="company-landing-logo"
              src={logoUrl}
              alt={`${company!.name} logo`}
              onError={() => setLogoBroken(true)}
            />
          </div>
        )}

        <header className="company-landing-hero">
          <h1 className="company-landing-title">{heroTitle}</h1>
          <p className="company-landing-subtitle">{heroSubtitle}</p>
          {description && (
            <p className="company-landing-description">{description}</p>
          )}
        </header>

        <form className="company-landing-form" onSubmit={handleSubmit} noValidate>
          <label className="company-landing-field">
            <span className="company-landing-label">Email</span>
            <input
              className="company-landing-input"
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              placeholder="you@example.com"
            />
          </label>

          <label className="company-landing-field">
            <span className="company-landing-label">Password</span>
            <PasswordField
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={setPassword}
              disabled={submitting}
              placeholder="••••••••"
            />
          </label>

          {error && (
            <div className="company-landing-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="company-landing-submit"
            type="submit"
            disabled={submitting || !email || !password}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="company-landing-help">
          Don't have an account? Ask your administrator.
        </p>

        {footerText && (
          <footer className="company-landing-footer">{footerText}</footer>
        )}
      </div>
    </div>
  );
}
