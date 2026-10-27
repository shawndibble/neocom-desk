/**
 * Holds the app's JS back on the landing page until its prerendered hero has
 * painted (#3950). Vite writes the entry `<script type="module">` and a
 * `<link rel="modulepreload">` per static import into `index.html`, and the
 * parser starts them all at once: about 60 files and 520 KB that, on a slow
 * phone, share the line with the stylesheet the first paint waits on. The
 * landing visitor is looking at the static hero (`app/landingShell.ts`) until
 * React takes over, so none of that is needed for the first paint.
 *
 * `vite.config.ts` runs `deferEntryHtml` over the built page: those tags come
 * out, and an inline loader puts them back. Where the landing-shell gate in
 * `<head>` chose the shell, it waits until the hero's ship (the page's largest
 * paint) is on screen, a first tap or key, or a backstop. Not `load`: that
 * fires once the ship has loaded, which can be well before it paints (the
 * stylesheet still blocking), and JS started then held the paint back by
 * seconds on PageSpeed's slow phone. Everywhere else it starts the preloads
 * at once and inserts the entry once the document is parsed, matching the
 * deferred module script it replaces: a returning pilot loads as before.
 *
 * Imported by `vite.config.ts`, so it imports nothing.
 */

/** Mirrors `LANDING_SHELL_ATTR` (`app/landingShell.ts`); pinned by the test. */
export const DEFERRED_ENTRY_SHELL_ATTR = 'data-landing-shell';

/** The longest a landing visit holds the app back if the ship never paints (a failed load, an early scroll). */
export const DEFERRED_ENTRY_BACKSTOP_MS = 5_000;

/** The hero's ship, the landing page's largest paint; pinned to the shell snapshot by the test. */
export const DEFERRED_ENTRY_HERO_IMAGE = '/landing/megathron.webp';

export const DEFERRED_ENTRY_SCRIPT_ID = 'app-entry-boot';

const ENTRY = /<script type="module" crossorigin src="([^"]+)"><\/script>\s*/g;
const MODULE_PRELOAD = /<link rel="modulepreload" crossorigin href="([^"]+)">\s*/g;

/**
 * The inline loader, as plain ES5 so it runs before any bundle. `start` adds
 * the preloads (the entry's first, so it is fetched as early as the static
 * tag was) and then the entry; a script-inserted module runs as soon as it
 * loads, so the entry waits for the parse to finish, as `type="module"` did.
 */
function loaderSource(entry: string, preloads: readonly string[]): string {
  return `(function (entry, preloads, hero) {
  var started = false;
  function preload(href) {
    var l = document.createElement('link');
    l.rel = 'modulepreload';
    l.setAttribute('crossorigin', '');
    l.href = href;
    document.head.appendChild(l);
  }
  function run() {
    var s = document.createElement('script');
    s.type = 'module';
    s.setAttribute('crossorigin', '');
    s.src = entry;
    document.head.appendChild(s);
  }
  function start() {
    if (started) return;
    started = true;
    preload(entry);
    for (var i = 0; i < preloads.length; i++) preload(preloads[i]);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }
  function afterPaint() {
    setTimeout(start, 0);
  }
  if (!document.documentElement.hasAttribute('${DEFERRED_ENTRY_SHELL_ATTR}')) {
    start();
    return;
  }
  var PO = window.PerformanceObserver;
  var types = (PO && PO.supportedEntryTypes) || [];
  if (types.indexOf('largest-contentful-paint') !== -1) {
    var observer = new PO(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        var url = entries[i].url || '';
        if (url.slice(-hero.length) === hero) {
          observer.disconnect();
          afterPaint();
          return;
        }
      }
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } else {
    window.addEventListener('load', function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(afterPaint);
      });
    });
  }
  // A visitor who acts before the paint wants the page live now.
  window.addEventListener('pointerdown', start, { once: true, capture: true });
  window.addEventListener('keydown', start, { once: true, capture: true });
  setTimeout(start, ${DEFERRED_ENTRY_BACKSTOP_MS});
})(${JSON.stringify(entry)}, ${JSON.stringify(preloads)}, ${JSON.stringify(DEFERRED_ENTRY_HERO_IMAGE)});`;
}

const IMPORT_MAP = /<script type="importmap"[^>]*>/g;

/**
 * What is wrong with where the built page's chunk import map sits, or `null`.
 * Chunks import each other by stable names that only the map resolves
 * (`build.chunkImportMap`), so the page needs exactly one, ahead of the loader
 * that starts the first module. Vite writes it before the first module tag it
 * finds and, finding none, before everything, doctype included: that is why
 * `deferEntryHtml` runs on the emitted page, after Vite placed the map.
 */
export function importMapProblem(html: string): string | null {
  if (!/^<!doctype html>/i.test(html.trimStart())) return 'the page does not open with its doctype';
  const maps = [...html.matchAll(IMPORT_MAP)];
  if (maps.length === 0) return 'the page has no import map';
  if (maps.length > 1) return `the page has ${maps.length} import maps`;
  const loader = html.indexOf(`<script id="${DEFERRED_ENTRY_SCRIPT_ID}">`);
  if (loader < 0) return 'the page has no entry loader';
  if ((maps[0].index ?? 0) > loader) return 'the import map comes after the entry loader';
  return null;
}

/** Swaps the built entry and module preloads for the loader, where the entry was. Throws if the page is not shaped as expected. */
export function deferEntryHtml(html: string): string {
  const entries = [...html.matchAll(ENTRY)];
  if (entries.length !== 1) {
    throw new Error(`deferEntryHtml: expected one module entry script, found ${entries.length}`);
  }
  const entry = entries[0][1];
  const preloads = [...html.matchAll(MODULE_PRELOAD)].map((match) => match[1]);
  const loader = `<script id="${DEFERRED_ENTRY_SCRIPT_ID}">${loaderSource(entry, preloads)}</script>\n`;
  return html.replace(MODULE_PRELOAD, '').replace(ENTRY, () => loader);
}
