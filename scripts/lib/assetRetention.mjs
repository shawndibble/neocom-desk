export const RETENTION_MS = 24 * 60 * 60 * 1000;

export const ASSET_HISTORY_FILE = 'asset-history.json';

const ASSET_PATH = /^assets\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

function isAssetPath(path) {
  return typeof path === 'string' && ASSET_PATH.test(path) && !path.includes('..');
}

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

export function assetsFromServiceWorker(text) {
  const paths = [];
  for (const match of text.matchAll(/"url":"([^"]+)"/g)) {
    if (isAssetPath(match[1])) paths.push(match[1]);
  }
  return paths;
}

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
