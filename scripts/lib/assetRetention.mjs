// Pure logic behind `keep-old-assets.mjs` (the deploy step that keeps retired
// hashed chunks on GitHub Pages). Extracted so it's testable without a build
// or a live site: every function here takes plain data and returns plain data.
//
// Why the step exists: a Pages deploy replaces the whole site, so the last
// build's `assets/*` vanish the moment the new one lands. A tab still running
// the old entry — or a browser/CDN still serving the old `index.html` for its
// `max-age=600` — then asks for a chunk that 404s ("Failed to fetch
// dynamically imported module"). `main.tsx` reloads once on that, but a
// reload inside the cache window gets the same stale shell and fails again.
// Deploys land minutes apart, so one build back is not enough: retired assets
// are kept by age instead.

/** How long an asset stays on the site after the build stops shipping it. */
export const RETENTION_MS = 24 * 60 * 60 * 1000;

/** Published next to `index.html`; read back off the live site next deploy. */
export const ASSET_HISTORY_FILE = 'asset-history.json';

// A flat, hashed file under `assets/` — never `index.html`, `sw.js`, or a
// path that could climb out of `dist/assets/`. The history file comes back
// off the live site, so every path in it is checked against this.
const ASSET_PATH = /^assets\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

function isAssetPath(path) {
  return typeof path === 'string' && ASSET_PATH.test(path) && !path.includes('..');
}

/**
 * The last deploy's `current`/`retired` sets from its published history
 * file. Anything unreadable is an empty history rather than an error: the
 * deploy must still go out, just without carrying anything.
 */
export function parseAssetHistory(text) {
  const empty = { current: [], retired: {} };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return empty;
  }
  if (!raw || typeof raw !== 'object') return empty;
  const current = Array.isArray(raw.current) ? raw.current.filter(isAssetPath) : [];
  const retired = {};
  if (raw.retired && typeof raw.retired === 'object' && !Array.isArray(raw.retired)) {
    for (const [path, at] of Object.entries(raw.retired)) {
      if (isAssetPath(path) && Number.isFinite(at)) retired[path] = at;
    }
  }
  return { current, retired };
}

/**
 * The `assets/` entries of a built `sw.js`'s precache manifest — the live
 * build's own file list. Seeds the first deploy (no history file yet), and
 * backs up a history file a CDN served stale.
 */
export function assetsFromServiceWorker(text) {
  const paths = [];
  for (const match of text.matchAll(/"url":"([^"]+)"/g)) {
    if (isAssetPath(match[1])) paths.push(match[1]);
  }
  return paths;
}

/**
 * What this deploy carries forward, and the history it publishes.
 *
 * An asset is retired the first deploy it is missing from, and that time —
 * not when it first shipped — starts its retention clock: a chunk that was
 * current for a week and replaced today must still be served tomorrow. An
 * asset a build ships again is simply current again.
 *
 * @param {{ previous: { current: string[], retired: Record<string, number> },
 *   built: string[], now: number, retentionMs?: number }} input
 */
export function planRetention({ previous, built, now, retentionMs = RETENTION_MS }) {
  const shipped = new Set(built);
  const retired = {};
  for (const [path, at] of Object.entries(previous.retired)) {
    if (!shipped.has(path) && now - at <= retentionMs) retired[path] = at;
  }
  for (const path of previous.current) {
    if (!shipped.has(path) && !(path in previous.retired)) retired[path] = now;
  }
  return {
    carry: Object.keys(retired).sort(),
    history: { deployedAt: now, current: [...built], retired },
  };
}
