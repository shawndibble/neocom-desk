// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFERRED_ENTRY_BACKSTOP_MS,
  DEFERRED_ENTRY_SCRIPT_ID,
  DEFERRED_ENTRY_SHELL_ATTR,
  deferEntryHtml,
} from './deferredEntry';
import { LANDING_SHELL_ATTR } from './landingShell';

/** The shape Vite writes into the built `index.html` head. */
const BUILT = `<!doctype html>
<html><head>
<script id="landing-shell-gate">/* gate */</script>
<script type="module" crossorigin src="/assets/index-AAA.js"></script>
<link rel="modulepreload" crossorigin href="/assets/vendor-react-BBB.js">
<link rel="modulepreload" crossorigin href="/assets/db-CCC.js">
<link rel="stylesheet" crossorigin href="/assets/index-DDD.css">
</head><body><div id="root"></div></body></html>`;

function loaderOf(html: string): string {
  const script = new DOMParser()
    .parseFromString(html, 'text/html')
    .getElementById(DEFERRED_ENTRY_SCRIPT_ID);
  if (script === null) throw new Error('no loader script');
  return script.textContent ?? '';
}

function runLoader(): void {
  // Indirect eval: global scope, as a classic <script> runs.
  (0, eval)(loaderOf(deferEntryHtml(BUILT)));
}

function preloads(): string[] {
  return [...document.head.querySelectorAll('link[rel="modulepreload"]')].map(
    (link) => link.getAttribute('href') ?? ''
  );
}

function entry(): HTMLScriptElement | null {
  return document.head.querySelector('script[type="module"]');
}

const html = document.documentElement;

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  html.removeAttribute(LANDING_SHELL_ATTR);
  document.head.innerHTML = '';
});

describe('deferEntryHtml', () => {
  it('swaps the entry and its module preloads for the loader, in the entry’s place', () => {
    const out = deferEntryHtml(BUILT);
    expect(out).not.toContain('type="module"');
    expect(out).not.toContain('rel="modulepreload"');
    expect(out).toContain('rel="stylesheet"');
    expect(out.indexOf('landing-shell-gate')).toBeLessThan(out.indexOf(DEFERRED_ENTRY_SCRIPT_ID));
    expect(out.indexOf(DEFERRED_ENTRY_SCRIPT_ID)).toBeLessThan(out.indexOf('rel="stylesheet"'));
  });

  it('refuses a page without exactly one entry, rather than ship one that never boots', () => {
    expect(() => deferEntryHtml('<html><head></head></html>')).toThrow(/one module entry/);
    const twice = BUILT.replace(
      '</head>',
      '<script type="module" crossorigin src="/x.js"></script></head>'
    );
    expect(() => deferEntryHtml(twice)).toThrow(/found 2/);
  });

  it('reads the same attribute the landing-shell gate sets', () => {
    expect(DEFERRED_ENTRY_SHELL_ATTR).toBe(LANDING_SHELL_ATTR);
  });
});

describe('the loader', () => {
  it('starts everything at once off the landing page', () => {
    runLoader();
    expect(preloads()).toEqual([
      '/assets/index-AAA.js',
      '/assets/vendor-react-BBB.js',
      '/assets/db-CCC.js',
    ]);
    expect(entry()?.getAttribute('src')).toBe('/assets/index-AAA.js');
    expect(entry()?.getAttribute('crossorigin')).toBe('');
    expect(
      document.head.querySelector('link[rel="modulepreload"]')?.getAttribute('crossorigin')
    ).toBe('');
  });

  it('inserts the entry only once the document is parsed, as a deferred module script runs', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    runLoader();
    expect(preloads()).toHaveLength(3);
    expect(entry()).toBeNull();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(entry()?.getAttribute('src')).toBe('/assets/index-AAA.js');
  });

  it('holds everything back on the landing page until load', () => {
    html.setAttribute(LANDING_SHELL_ATTR, '');
    runLoader();
    expect(preloads()).toHaveLength(0);
    expect(entry()).toBeNull();
    window.dispatchEvent(new Event('load'));
    expect(preloads()).toHaveLength(3);
    expect(entry()).not.toBeNull();
  });

  it('starts on the landing page after the backstop if load never comes, and only once', () => {
    html.setAttribute(LANDING_SHELL_ATTR, '');
    runLoader();
    vi.advanceTimersByTime(DEFERRED_ENTRY_BACKSTOP_MS);
    expect(entry()).not.toBeNull();
    window.dispatchEvent(new Event('load'));
    expect(document.head.querySelectorAll('script[type="module"]')).toHaveLength(1);
    expect(preloads()).toHaveLength(3);
  });
});
