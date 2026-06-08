export type ReaderMode = 'light' | 'dark';
export type ReaderModePref = ReaderMode | 'system';

export type ReaderTheme = {
  accent: string;
  defaultMode: ReaderModePref;
};

type TenantPreset = { readerAccent: string; readerDefaultMode: ReaderModePref };
type Company = { branding?: { accent?: string; defaultTheme?: ReaderModePref } } | null;

const DEFAULT_ACCENT = '#ff1b23';
const HEX = /^#[0-9a-f]{6}$/i;
const STORAGE_PREFIX = 'docpilot:reader-mode:';

function safeHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value : fallback;
}

function safeMode(value: unknown, fallback: ReaderModePref): ReaderModePref {
  return value === 'light' || value === 'dark' || value === 'system' ? value : fallback;
}

export function resolveReaderTheme(preset: TenantPreset | null, company: Company): ReaderTheme {
  if (company?.branding?.accent || company?.branding?.defaultTheme) {
    return {
      accent: safeHex(company.branding.accent, DEFAULT_ACCENT),
      defaultMode: safeMode(company.branding.defaultTheme, 'system'),
    };
  }
  if (preset) {
    return {
      accent: safeHex(preset.readerAccent, DEFAULT_ACCENT),
      defaultMode: safeMode(preset.readerDefaultMode, 'system'),
    };
  }
  return { accent: DEFAULT_ACCENT, defaultMode: 'system' };
}

const NOOP_MATCH_MEDIA = ((() => ({ matches: false })) as unknown) as typeof window.matchMedia;
const RESOLVED_MATCH_MEDIA: typeof window.matchMedia =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window)
    : NOOP_MATCH_MEDIA;

export function applyReaderTheme(
  root: HTMLElement,
  theme: ReaderTheme,
  sessionMode?: ReaderMode,
  matchMedia: typeof window.matchMedia = RESOLVED_MATCH_MEDIA,
): ReaderMode {
  const effective: ReaderMode = sessionMode
    ?? (theme.defaultMode === 'system'
        ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme.defaultMode);
  root.dataset.theme = effective;
  root.style.setProperty('--accent', theme.accent);
  return effective;
}

export function loadSessionMode(slug: string | null | undefined): ReaderMode | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_PREFIX + (slug || 'default'));
  return raw === 'light' || raw === 'dark' ? raw : null;
}

export function saveSessionMode(slug: string | null | undefined, mode: ReaderMode): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_PREFIX + (slug || 'default'), mode);
}
