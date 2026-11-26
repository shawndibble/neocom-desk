export const DEFERRED_ENTRY_SHELL_ATTR = 'data-landing-shell';

export const DEFERRED_ENTRY_SHELL_ID = 'landing-shell';

export const DEFERRED_ENTRY_BACKSTOP_MS = 5_000;

export const DEFERRED_ENTRY_HERO_IMAGE = '/landing/megathron.webp';

export const DEFERRED_ENTRY_SCRIPT_ID = 'app-entry-boot';

const ENTRY = /<script type="module" crossorigin src="([^"]+)"><\/script>\s*/g;
const MODULE_PRELOAD = /<link rel="modulepreload" crossorigin href="([^"]+)">\s*/g;

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
        var el = entries[i].element;
        if (url.slice(-hero.length) === hero || (el && el.closest && el.closest('#${DEFERRED_ENTRY_SHELL_ID} main'))) {
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
  window.addEventListener('pointerdown', start, { once: true, capture: true });
  window.addEventListener('keydown', start, { once: true, capture: true });
  setTimeout(start, ${DEFERRED_ENTRY_BACKSTOP_MS});
})(${JSON.stringify(entry)}, ${JSON.stringify(preloads)}, ${JSON.stringify(DEFERRED_ENTRY_HERO_IMAGE)});`;
}

const IMPORT_MAP = /<script type="importmap"[^>]*>/g;

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
