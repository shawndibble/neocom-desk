// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFERRED_ENTRY_BACKSTOP_MS,
  DEFERRED_ENTRY_HERO_IMAGE,
  DEFERRED_ENTRY_SCRIPT_ID,
  DEFERRED_ENTRY_SHELL_ATTR,
  deferEntryHtml,
  importMapProblem,
} from './deferredEntry';
import { LANDING_SHELL_ATTR } from './landingShell';
import shellSnapshot from '@/features/landing/landingShell.snapshot.html?raw';

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
  vi.unstubAllGlobals();
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

  it("waits on the shell's own high-priority ship", () => {
    const ship = new DOMParser()
      .parseFromString(shellSnapshot, 'text/html')
      .querySelector('img[fetchpriority="high"]');
    expect(ship?.getAttribute('src')).toBe(DEFERRED_ENTRY_HERO_IMAGE);
  });

  it('leaves the chunk import map where Vite put it, ahead of the loader', () => {
    const mapped = BUILT.replace(
      '<script type="module"',
      '<script type="importmap">{"imports":{}}</script>\n<script type="module"'
    );
    const out = deferEntryHtml(mapped);
    expect(importMapProblem(out)).toBeNull();
    expect(out.indexOf('type="importmap"')).toBeLessThan(out.indexOf(DEFERRED_ENTRY_SCRIPT_ID));
  });
});

describe('importMapProblem', () => {
  const MAP = '<script type="importmap">{"imports":{}}</script>';
  const LOADER = `<script id="${DEFERRED_ENTRY_SCRIPT_ID}">/* loader */</script>`;

  it('passes a page that opens with its doctype and maps chunks before the loader', () => {
    expect(
      importMapProblem(`<!doctype html>\n<html><head>${MAP}${LOADER}</head></html>`)
    ).toBeNull();
  });

  it('flags a map written ahead of the doctype, which puts the page in quirks mode', () => {
    expect(importMapProblem(`${MAP}\n<!doctype html><html><head>${LOADER}</head></html>`)).toMatch(
      /doctype/
    );
  });

  it('flags a page with no map, whose chunks would import names nothing resolves', () => {
    expect(importMapProblem(`<!doctype html><html><head>${LOADER}</head></html>`)).toMatch(
      /no import map/
    );
  });

  it('flags a map after the loader, too late for the modules it starts', () => {
    expect(importMapProblem(`<!doctype html><html><head>${LOADER}${MAP}</head></html>`)).toMatch(
      /after/
    );
  });

  it('flags a second map', () => {
    expect(
      importMapProblem(`<!doctype html><html><head>${MAP}${MAP}${LOADER}</head></html>`)
    ).toMatch(/2 import maps/);
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

  describe('on the landing page', () => {
    type Emit = (entries: { url?: string }[]) => void;
    let emit: Emit | undefined;
    let disconnected = false;

    /** Chromium's LCP observer, reduced to what the loader uses. */
    function stubLcpObserver(): void {
      emit = undefined;
      disconnected = false;
      class FakeObserver {
        static supportedEntryTypes = ['paint', 'largest-contentful-paint'];
        constructor(callback: (list: { getEntries: () => { url?: string }[] }) => void) {
          emit = (entries) => callback({ getEntries: () => entries });
        }
        observe(options: { type: string; buffered: boolean }) {
          expect(options).toEqual({ type: 'largest-contentful-paint', buffered: true });
        }
        disconnect() {
          disconnected = true;
        }
      }
      vi.stubGlobal('PerformanceObserver', FakeObserver);
    }

    beforeEach(() => {
      html.setAttribute(LANDING_SHELL_ATTR, '');
    });

    it('holds everything back until the ship paints, then starts after that frame', () => {
      stubLcpObserver();
      runLoader();
      window.dispatchEvent(new Event('load'));
      emit?.([{ url: '' }]);
      vi.advanceTimersByTime(10);
      expect(preloads()).toHaveLength(0);

      emit?.([{ url: `https://neocomdesk.com${DEFERRED_ENTRY_HERO_IMAGE}` }]);
      expect(disconnected).toBe(true);
      expect(entry()).toBeNull();
      vi.advanceTimersByTime(0);
      expect(preloads()).toHaveLength(3);
      expect(entry()).not.toBeNull();
    });

    it('falls back to load and two frames without an LCP observer', () => {
      vi.stubGlobal('PerformanceObserver', undefined);
      runLoader();
      window.dispatchEvent(new Event('load'));
      expect(entry()).toBeNull();
      vi.advanceTimersByTime(100);
      expect(entry()).not.toBeNull();
    });

    it('starts at once on a first tap, so the button works', () => {
      stubLcpObserver();
      runLoader();
      window.dispatchEvent(new Event('pointerdown'));
      expect(entry()).not.toBeNull();
    });

    it('starts after the backstop if the ship never paints, and only once', () => {
      stubLcpObserver();
      runLoader();
      vi.advanceTimersByTime(DEFERRED_ENTRY_BACKSTOP_MS);
      expect(entry()).not.toBeNull();
      emit?.([{ url: DEFERRED_ENTRY_HERO_IMAGE }]);
      window.dispatchEvent(new Event('keydown'));
      vi.advanceTimersByTime(DEFERRED_ENTRY_BACKSTOP_MS);
      expect(document.head.querySelectorAll('script[type="module"]')).toHaveLength(1);
      expect(preloads()).toHaveLength(3);
    });
  });
});
