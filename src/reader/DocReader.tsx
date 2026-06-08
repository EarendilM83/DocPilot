import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { setGlobalTheme } from '@atlaskit/tokens';
import { authMeCached } from '../multitenant/api';
import { attachDocComponentInteractions } from '../shared/docInteractions';
import { useDocReaderState } from './useDocReaderState';
import { applyReaderTheme, loadSessionMode, resolveReaderTheme, saveSessionMode } from './theme';
import { Drawer } from './Drawer';
import { SearchModal } from './SearchModal';
import { DocSelector, type DocSelectorItem } from './DocSelector';
import { AccountManagerCard } from './AccountManagerCard';

export type DocReaderProps = {
  resolveDoc: (docId: string) => DocReaderModel | null;
};

export type DocReaderModel = {
  doc: { id: string; title: string; description: string; version: string; updatedAt: string };
  sections: { id: string; number: string; title: string; html: string }[];
  product: { name: string; slug: string } | null;
  themePreset: { readerAccent: string; readerDefaultMode: 'light' | 'dark' | 'system' };
  company: { slug: string; name: string; branding?: { accent?: string; defaultTheme?: 'light' | 'dark' | 'system' } } | null;
  siblings: { prev: { id: string; title: string } | null; next: { id: string; title: string } | null };
  availableDocs: DocSelectorItem[];
};

type TocEntry = { id: string; number: string; title: string; subs: { id: string; title: string }[] };

const NUMBER_PREFIX = /^\s*\d+(?:\.\d+)?\s+/;

function stripNumberPrefix(text: string): string {
  return text.replace(NUMBER_PREFIX, '').trim();
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
}

function polishSectionHtml(html: string, sectionId: string): { html: string; subs: { id: string; title: string }[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const subs: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll('h2, h3').forEach((el) => {
    const raw = (el.textContent || '').trim();
    const clean = stripNumberPrefix(raw);
    if (clean !== raw) el.textContent = clean;
    if (el.tagName === 'H3') {
      if (!el.id) {
        let id = slugify(clean) || `${sectionId}-h3-${subs.length + 1}`;
        let n = 2;
        while (seen.has(id)) { id = `${slugify(clean)}-${n++}`; }
        el.id = id;
      }
      seen.add(el.id);
      subs.push({ id: el.id, title: clean });
    }
  });
  return { html: doc.body.innerHTML, subs };
}

function buildToc(sections: { id: string; number: string; title: string; html: string }[]): { toc: TocEntry[]; polishedSections: { id: string; html: string }[] } {
  const polishedSections: { id: string; html: string }[] = [];
  const toc = sections.map((section) => {
    const { html, subs } = polishSectionHtml(section.html, section.id);
    polishedSections.push({ id: section.id, html });
    return { id: section.id, number: section.number, title: stripNumberPrefix(section.title), subs };
  });
  return { toc, polishedSections };
}

export function DocReader({ resolveDoc }: DocReaderProps) {
  const { docId = '' } = useParams();
  const navigate = useNavigate();
  const model = resolveDoc(docId);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { toc, polishedSections } = useMemo(() => buildToc(model?.sections ?? []), [model]);
  const polishedMap = useMemo(() => new Map(polishedSections.map((s) => [s.id, s.html])), [polishedSections]);
  const sectionRootIds = useMemo(() => toc.map((entry) => entry.id), [toc]);
  const subAnchorIds = useMemo(() => {
    const ids: string[] = [];
    toc.forEach((entry) => entry.subs.forEach((s) => ids.push(s.id)));
    return ids;
  }, [toc]);
  const { activeSectionId, scrollProgress, showBackToTop } = useDocReaderState(sectionRootIds, subAnchorIds);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionCompany, setSessionCompany] = useState<{ slug: string; name: string } | null>(null);

  // Pull the logged-in user's company so the brand link lands on the
  // company documentation hub (/c/<slug>) instead of the marketing
  // landing. authMeCached shares one /auth/me round-trip with the auth
  // gate and the account-manager card.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authMeCached();
        if (cancelled) return;
        if (data?.company?.slug) {
          setSessionCompany({ slug: data.company.slug, name: data.company.name ?? data.company.slug });
        }
      } catch { /* anonymous — leave null */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const anchors = useMemo(() => {
    const list: { id: string; title: string; section: string }[] = [];
    toc.forEach((entry) => {
      list.push({ id: entry.id, title: `${entry.number} ${entry.title}`, section: entry.title });
      entry.subs.forEach((s) => list.push({ id: s.id, title: s.title, section: entry.title }));
    });
    return list;
  }, [toc]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === '.') {
        const hovered = document.querySelector<HTMLElement>('.docpilot-reader main h2:hover, .docpilot-reader main h3:hover');
        if (!hovered?.id) return;
        const url = `${location.origin}${location.pathname}#${hovered.id}`;
        navigator.clipboard.writeText(url).catch(() => {});
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Shared wiring with the admin editor preview: tabs (both markup eras),
  // carousels, and marker hotspots. Without this the components rendered via
  // dangerouslySetInnerHTML are completely inert in the reader.
  // Re-attach when section content changes — sections hydrate from the server
  // after first paint, and carousels/markers must see the final DOM.
  const sectionsFingerprint = useMemo(
    () => (model ? model.sections.map((s) => `${s.id}:${s.html.length}`).join('|') : ''),
    [model],
  );
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return attachDocComponentInteractions(root);
  }, [model?.doc.id, sectionsFingerprint]);

  // Deep-link #hash scroll — the auth gate and section hydration land after
  // first paint, so the browser's native anchor scroll finds no target.
  // Scroll once the element exists; never again after that (don't yank the
  // user back if content keeps hydrating after they scrolled away).
  const didHashScroll = useRef(false);
  useEffect(() => {
    if (didHashScroll.current) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;
    const el = document.getElementById(hash);
    if (!el) return;
    didHashScroll.current = true;
    el.scrollIntoView();
  }, [sectionsFingerprint]);

  const slugForTheme = model?.company?.slug ?? model?.product?.slug ?? 'default';

  useEffect(() => {
    if (!rootRef.current || !model) return;
    const theme = resolveReaderTheme(model.themePreset, model.company);
    // ?previewTheme=dark|light forces a mode for this view — used by the
    // editor's "preview in reader" links so authors can check both themes
    // before publishing without touching their own saved preference.
    const previewParam = new URLSearchParams(window.location.search).get('previewTheme');
    const previewTheme = previewParam === 'dark' || previewParam === 'light' ? previewParam : null;
    const session = previewTheme ?? loadSessionMode(slugForTheme);
    const effective = applyReaderTheme(rootRef.current, theme, session ?? undefined);
    // Keep the global ADS color mode in lockstep so --ds-* tokens flip too.
    void setGlobalTheme({ colorMode: effective });
    // intentionally NOT depending on slugForTheme/session — first paint only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.doc.id]);

  const toggleTheme = useCallback(() => {
    if (!rootRef.current) return;
    const current = rootRef.current.dataset.theme === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    rootRef.current.dataset.theme = next;
    void setGlobalTheme({ colorMode: next });
    saveSessionMode(slugForTheme, next);
  }, [slugForTheme]);

  if (!model) {
    return (
      <div className="docpilot-reader" ref={rootRef}>
        <main><h1>Not found</h1></main>
      </div>
    );
  }

  return (
    <div className="docpilot-reader" ref={rootRef}>
      <header className="reader-header">
        <a
          className="brand"
          href={
            sessionCompany ? `/c/${sessionCompany.slug}`
              : model.company ? `/c/${model.company.slug}`
              : '/'
          }
        >
          <span className="brand-mark" aria-hidden="true">{((sessionCompany?.name ?? model.company?.name ?? model.product?.name ?? 'DocPilot').charAt(0)).toUpperCase()}</span>
          <span className="brand-name">{sessionCompany?.name ?? model.company?.name ?? model.product?.name ?? 'DocPilot'}</span>
        </a>
        <DocSelector
          items={model.availableDocs}
          currentDocId={model.doc.id}
          onPick={(id) => navigate(`/docs/${id}`)}
        />
        <button type="button" className="search-trigger" aria-label="Search documentation" onClick={() => setSearchOpen(true)}>
          <span>⌕ Search documentation…</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="header-actions">
          <button type="button" className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}>◐</button>
          <button type="button" className="icon-btn" aria-label="Language">EN</button>
          <button type="button" className="icon-btn hamburger" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>☰</button>
        </div>
        <div className="scroll-progress" style={{ width: `${scrollProgress}%` }} aria-hidden="true" />
      </header>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <ul className="side-list">
          {toc.map((entry) => (
            <li key={entry.id}>
              <a href={`#${entry.id}`} onClick={() => setDrawerOpen(false)}>
                {entry.title}
              </a>
              {entry.subs.length ? (
                <ul className="sub">
                  {entry.subs.map((sub) => (
                    <li key={sub.id}>
                      <a href={`#${sub.id}`} onClick={() => setDrawerOpen(false)}>{sub.title}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </Drawer>
      <div className="shell">
        <aside className="side" aria-label="Table of contents">
          {model.product?.name ? <div className="side-group-label">{model.product.name}</div> : null}
          <ul className="side-list">
            {toc.map((entry) => (
              <li key={entry.id}>
                <a className={entry.id === activeSectionId ? 'active' : undefined} href={`#${entry.id}`}>
                  {entry.title}
                </a>
                {entry.subs.length ? (
                  <ul className="sub">
                    {entry.subs.map((sub) => (
                      <li key={sub.id}>
                        <a className={sub.id === activeSectionId ? 'active' : undefined} href={`#${sub.id}`}>
                          {sub.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>
        <main>
          <header className="doc-head">
            <div className="doc-meta">
              <span className="pill"><span className="dot" />{model.doc.title ? 'Live' : 'Draft'}</span>
              <span>v{model.doc.version}</span>
              <span>·</span>
              <span>Updated {model.doc.updatedAt}</span>
            </div>
            <h1 className="doc-title">{model.doc.title}</h1>
            {model.doc.description ? <p className="lede">{model.doc.description}</p> : null}
          </header>
          {model.sections.map((s) => (
            <section key={s.id} id={s.id} dangerouslySetInnerHTML={{ __html: polishedMap.get(s.id) ?? s.html }} />
          ))}
          <nav className="flow-nav" aria-label="Document navigation">
            {model.siblings.prev ? (
              <a className="flow-link prev" href={`/docs/${model.siblings.prev.id}`}>
                <span className="dir">Previous</span>
                <span className="ttl">{model.siblings.prev.title}</span>
              </a>
            ) : <span />}
            {model.siblings.next ? (
              <a className="flow-link next" href={`/docs/${model.siblings.next.id}`}>
                <span className="dir">Next</span>
                <span className="ttl">{model.siblings.next.title} →</span>
              </a>
            ) : <span />}
          </nav>
        </main>
        <aside className="toc-right" aria-label="Resources">
          <div className="group">
            <div className="label">Resources</div>
            <a href="#" onClick={(e) => { e.preventDefault(); window.print(); }}>Print / PDF</a>
          </div>
          <AccountManagerCard />
        </aside>
      </div>
      <footer className="reader-foot">
        <div className="foot-inner">
          <div>© {new Date().getFullYear()} {model.product?.name ?? 'DocPilot'} · {model.doc.title} · v{model.doc.version}</div>
          <div className="foot-links">
            {model.siblings.next ? <a href={`/docs/${model.siblings.next.id}`}>Next: {model.siblings.next.title} →</a> : null}
            <a href="#">Status</a>
            <a href="#">Support</a>
          </div>
        </div>
      </footer>
      <button
        type="button"
        className={`back-to-top${showBackToTop ? ' visible' : ''}`}
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >↑</button>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} anchors={anchors} />
    </div>
  );
}

