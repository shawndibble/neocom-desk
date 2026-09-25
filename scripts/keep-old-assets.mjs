#!/usr/bin/env node
// Deploy step: copy recently retired hashed assets from the live site into
// `dist/assets/`, so a tab still on an older build can load its route chunks.
// Why, and the retention rules: scripts/lib/assetRetention.mjs.
//
// Usage (after `npm run build`, before the Pages upload):
//   node scripts/keep-old-assets.mjs https://neocomdesk.com [history.json]
//
// The optional history path is read first and rewritten afterwards — CI keeps
// it in the Actions cache. The copy on the live site is only the fallback:
// Pages' CDN serves anything up to 10 minutes stale and ignores query strings
// and no-cache headers, and deploys land minutes apart, so it can be the
// history from two deploys ago.
//
// Runs after the build on purpose: `vite-plugin-pwa` has already written the
// precache manifest, so carried files are served but never precached — the
// install download stays one build's size.
//
// Never fails the deploy. If the live site can't be read, the step warns and
// ships the build as-is, which is exactly what deploys did before it.
// No deps; Node 24 built-ins only.

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASSET_HISTORY_FILE,
  assetsFromServiceWorker,
  parseAssetHistory,
  planRetention,
} from './lib/assetRetention.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PARALLEL = 8;

const site = process.argv[2]?.replace(/\/+$/, '');
const localHistory = process.argv[3];
if (!site) {
  console.error('usage: node scripts/keep-old-assets.mjs <site-url> [history.json]');
  process.exit(1);
}

async function fetchLive(path) {
  const res = await fetch(`${site}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res;
}

async function readLocal(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function readText(path) {
  try {
    return await (await fetchLive(path)).text();
  } catch (error) {
    console.warn(`keep-old-assets: could not read ${path} (${error.message})`);
    return null;
  }
}

async function builtAssets() {
  const names = await readdir(join(DIST, 'assets'));
  const files = [];
  for (const name of names) {
    if ((await stat(join(DIST, 'assets', name))).isFile()) files.push(`assets/${name}`);
  }
  return files.sort();
}

async function download(path) {
  const res = await fetchLive(path);
  const body = Buffer.from(await res.arrayBuffer());
  await writeFile(join(DIST, path), body);
  return body.length;
}

// One retry: a dropped file leaves the history for good, so a network blip
// must not be what drops it.
async function downloadWithRetry(path) {
  try {
    return await download(path);
  } catch {
    return await download(path);
  }
}

const now = Date.now();
const built = await builtAssets();

// The history file is the record; the live `sw.js` manifest is the last
// build's own list, which covers the first deploy (no history yet) and a
// history the CDN still served stale.
const historyText =
  (localHistory && (await readLocal(localHistory))) ?? (await readText(ASSET_HISTORY_FILE));
const swText = await readText('sw.js');
const history =
  historyText === null ? { current: [], retired: {} } : parseAssetHistory(historyText);
const previous = {
  current: [...new Set([...history.current, ...(swText ? assetsFromServiceWorker(swText) : [])])],
  retired: history.retired,
};

const plan = planRetention({ previous, built, now });

let bytes = 0;
const missing = [];
const queue = [...plan.carry];
await mkdir(join(DIST, 'assets'), { recursive: true });
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let path = queue.shift(); path; path = queue.shift()) {
      try {
        const size = await downloadWithRetry(path);
        bytes += size;
      } catch (error) {
        missing.push(path);
        console.warn(`keep-old-assets: dropped ${path} (${error.message})`);
      }
    }
  })
);

// A file the live site no longer has can't be carried now or later.
for (const path of missing) delete plan.history.retired[path];
const historyJson = `${JSON.stringify(plan.history)}\n`;
await writeFile(join(DIST, ASSET_HISTORY_FILE), historyJson);
if (localHistory) {
  await mkdir(dirname(localHistory), { recursive: true });
  await writeFile(localHistory, historyJson);
}

console.log(
  `keep-old-assets: ${built.length} built, ${plan.carry.length - missing.length} carried ` +
    `(${(bytes / 1024 / 1024).toFixed(1)} MB), ${missing.length} dropped`
);
