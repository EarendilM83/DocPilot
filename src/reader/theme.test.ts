import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveReaderTheme,
  applyReaderTheme,
  loadSessionMode,
  saveSessionMode,
} from './theme';

describe('resolveReaderTheme', () => {
  it('prefers v2 company branding when present', () => {
    const theme = resolveReaderTheme(
      { readerAccent: '#111111', readerDefaultMode: 'light' },
      { branding: { accent: '#abcdef', defaultTheme: 'dark' } },
    );
    expect(theme).toEqual({ accent: '#abcdef', defaultMode: 'dark' });
  });

  it('falls back to v1 preset when v2 company missing', () => {
    const theme = resolveReaderTheme(
      { readerAccent: '#111111', readerDefaultMode: 'light' },
      null,
    );
    expect(theme).toEqual({ accent: '#111111', defaultMode: 'light' });
  });

  it('defaults to brand red + system when both surfaces are missing', () => {
    const theme = resolveReaderTheme(null, null);
    expect(theme).toEqual({ accent: '#ff1b23', defaultMode: 'system' });
  });

  it('rejects malformed accent values and falls back to default', () => {
    const theme = resolveReaderTheme({ readerAccent: 'not-a-color', readerDefaultMode: 'light' }, null);
    expect(theme.accent).toBe('#ff1b23');
  });
});

describe('applyReaderTheme', () => {
  it('writes data-theme and inline CSS variables to the root', () => {
    const root = document.createElement('div');
    applyReaderTheme(root, { accent: '#abcdef', defaultMode: 'dark' });
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.getPropertyValue('--accent')).toBe('#abcdef');
  });

  it('uses sessionMode override when provided', () => {
    const root = document.createElement('div');
    applyReaderTheme(root, { accent: '#abcdef', defaultMode: 'dark' }, 'light');
    expect(root.dataset.theme).toBe('light');
  });

  it('resolves "system" mode to light when prefers-color-scheme is light', () => {
    const root = document.createElement('div');
    const matchMedia = ((query: string) => ({ matches: query.includes('light') })) as unknown as typeof window.matchMedia;
    applyReaderTheme(root, { accent: '#abcdef', defaultMode: 'system' }, undefined, matchMedia);
    expect(root.dataset.theme).toBe('light');
  });
});

describe('session mode storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a session mode by tenant slug', () => {
    saveSessionMode('demo', 'dark');
    expect(loadSessionMode('demo')).toBe('dark');
  });

  it('returns null when nothing is stored', () => {
    expect(loadSessionMode('unknown')).toBeNull();
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem('docpilot:reader-mode:bad', 'purple');
    expect(loadSessionMode('bad')).toBeNull();
  });
});
