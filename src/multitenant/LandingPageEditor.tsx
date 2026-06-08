import { useEffect, useState } from 'react';
import {
  ApiError,
  authMe,
  DEFAULT_CLIENT_AREA_CONTENT,
  loadClientAreaContent,
  publicCompanyBySlug,
  saveClientAreaContent,
  updateCompanyBranding,
  type ClientAreaContent,
  type CompanyBranding,
  type PublicCompany,
} from './api';

type Props = {
  companySlug: string | null;
  toast: (message: string) => void;
};

type Branding = {
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
};

const EMPTY_BRANDING: Branding = { logoUrl: '', primaryColor: '#ff1b23', accentColor: '#63cdff' };

function brandingFrom(b: CompanyBranding | null): Branding {
  return {
    logoUrl: b?.logoUrl ?? '',
    primaryColor: b?.primaryColor ?? '#ff1b23',
    accentColor: b?.accentColor ?? '#63cdff',
  };
}

/**
 * Tenant CMS surface that lets a company admin edit the public-facing
 * landing copy at /c/<slug> + the company branding (logo / colours)
 * without leaving the back-office.
 */
export default function LandingPageEditor({ companySlug, toast }: Props): JSX.Element {
  const [content, setContent] = useState<ClientAreaContent>(DEFAULT_CLIENT_AREA_CONTENT);
  const [contentBaseline, setContentBaseline] = useState<ClientAreaContent>(DEFAULT_CLIENT_AREA_CONTENT);
  const [branding, setBranding] = useState<Branding>(EMPTY_BRANDING);
  const [brandingBaseline, setBrandingBaseline] = useState<Branding>(EMPTY_BRANDING);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);

  useEffect(() => {
    if (!companySlug) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const [c, me, pub] = await Promise.all([
          loadClientAreaContent(companySlug),
          authMe().catch(() => null),
          publicCompanyBySlug(companySlug),
        ]);
        if (cancelled) return;
        setContent(c);
        setContentBaseline(c);
        const b = brandingFrom(pub.company.branding ?? null);
        setBranding(b);
        setBrandingBaseline(b);
        setCompany(pub.company);
        setCompanyId(me?.user?.companyId ?? pub.company.id);
      } catch (err) {
        if (!cancelled) toast(`Load failed: ${err instanceof ApiError ? err.message : 'unknown'}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companySlug, toast]);

  useEffect(() => { setLogoBroken(false); }, [branding.logoUrl]);

  const contentDirty = JSON.stringify(content) !== JSON.stringify(contentBaseline);
  const brandingDirty = JSON.stringify(branding) !== JSON.stringify(brandingBaseline);
  const dirty = contentDirty || brandingDirty;

  async function save() {
    if (!companySlug) return;
    setSaving(true);
    try {
      if (contentDirty) {
        await saveClientAreaContent(companySlug, { id: 'admin', role: 'company-admin' }, content);
        setContentBaseline(content);
      }
      if (brandingDirty && companyId) {
        await updateCompanyBranding(companyId, {
          logoUrl: branding.logoUrl.trim() || undefined,
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
        });
        setBrandingBaseline(branding);
      }
      toast('Landing page saved.');
    } catch (err) {
      toast(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setContent(contentBaseline);
    setBranding(brandingBaseline);
  }

  if (!companySlug) {
    return (
      <section className="landing-editor-empty">
        <h2>Landing page editor</h2>
        <p>This editor is only available inside a tenant CMS (/c/&lt;slug&gt;/admin/cms).</p>
      </section>
    );
  }
  if (loading) {
    return <section className="landing-editor-loading"><p>Loading…</p></section>;
  }

  const showLogoPreview = Boolean(branding.logoUrl.trim()) && !logoBroken;
  const initial = (company?.name ?? companySlug).charAt(0).toUpperCase();

  return (
    <section className="landing-editor">
      <header className="landing-editor-head">
        <div>
          <h1>Landing page</h1>
          <p>Edit the company landing at <code>/c/{companySlug}</code>. Viewers see these strings when they sign in.</p>
        </div>
        <a className="landing-editor-preview-link" href={`/c/${companySlug}`} target="_blank" rel="noopener noreferrer">
          Open landing ↗
        </a>
      </header>

      <div className="landing-editor-grid">
        <section className="landing-editor-card">
          <h2>Brand</h2>
          <div className="landing-editor-brand-row">
            <div className="landing-editor-brand-preview">
              {showLogoPreview ? (
                <img
                  src={branding.logoUrl}
                  alt={`${company?.name ?? companySlug} logo`}
                  onError={() => setLogoBroken(true)}
                />
              ) : (
                <span
                  className="landing-editor-brand-initial"
                  style={{ background: branding.primaryColor }}
                >{initial}</span>
              )}
            </div>
            <div className="landing-editor-brand-fields">
              <label className="landing-editor-field">
                <span>Logo URL</span>
                <input
                  type="url"
                  value={branding.logoUrl}
                  onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                  placeholder="https://cdn.example.com/logo.svg"
                />
                {branding.logoUrl && logoBroken ? (
                  <small className="landing-editor-warn">Logo failed to load. Header + reader will fall back to the brand initial.</small>
                ) : null}
              </label>
              <div className="landing-editor-color-row">
                <label className="landing-editor-field landing-editor-field--color">
                  <span>Primary color</span>
                  <input
                    type="color"
                    value={branding.primaryColor}
                    onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  />
                  <input
                    type="text"
                    value={branding.primaryColor}
                    onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  />
                </label>
                <label className="landing-editor-field landing-editor-field--color">
                  <span>Accent color</span>
                  <input
                    type="color"
                    value={branding.accentColor}
                    onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                  />
                  <input
                    type="text"
                    value={branding.accentColor}
                    onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-editor-card">
          <h2>Hero</h2>
          <label className="landing-editor-field">
            <span>Kicker</span>
            <input
              type="text"
              value={content.welcomeKicker}
              onChange={(e) => setContent({ ...content, welcomeKicker: e.target.value })}
              placeholder="Studio client area"
            />
          </label>
          <label className="landing-editor-field">
            <span>Title template <em>(use <code>{'{firstName}'}</code> for the user's first name)</em></span>
            <input
              type="text"
              value={content.welcomeTitleTemplate}
              onChange={(e) => setContent({ ...content, welcomeTitleTemplate: e.target.value })}
              placeholder="Hello, {firstName}"
            />
          </label>
          <label className="landing-editor-field">
            <span>Body</span>
            <textarea
              rows={4}
              value={content.welcomeBody}
              onChange={(e) => setContent({ ...content, welcomeBody: e.target.value })}
            />
          </label>
        </section>

        <section className="landing-editor-card landing-editor-card--wide">
          <h2>Staging card</h2>
          <p className="landing-editor-hint">
            Per-user visibility is controlled from the company admin Users page.
          </p>
          <div className="landing-editor-staging-grid">
            <label className="landing-editor-field">
              <span>Label</span>
              <input
                type="text"
                value={content.stagingLabel}
                onChange={(e) => setContent({ ...content, stagingLabel: e.target.value })}
                placeholder="Test latest on staging"
              />
            </label>
            <label className="landing-editor-field">
              <span>URL</span>
              <input
                type="url"
                value={content.stagingUrl}
                onChange={(e) => setContent({ ...content, stagingUrl: e.target.value })}
                placeholder="https://staging.example.com"
              />
            </label>
          </div>
        </section>
      </div>

      <footer className="landing-editor-footer">
        <button
          type="button"
          className="btn btn-red"
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={!dirty || saving}
          onClick={discard}
        >
          Discard
        </button>
        {dirty ? <span className="landing-editor-dirty">Unsaved changes</span> : <span className="landing-editor-clean">All changes saved.</span>}
      </footer>
    </section>
  );
}
