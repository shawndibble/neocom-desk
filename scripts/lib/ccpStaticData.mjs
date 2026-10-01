// CCP's own static data export (JSONL), for the few tables Fuzzwork's CSV
// dump doesn't carry — today only `skillPlans.jsonl` (issue #2392).
//
// The export is one ~100 MB zip. "latest" redirects to a build-numbered file,
// so the zip is cached under that build-numbered name: a cache keyed on
// "latest" would serve the first build ever downloaded forever. Only the
// requested members are inflated (fflate's `filter`), not the whole archive.

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const LATEST_URL =
  'https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip';
const USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk)';

/** The build-numbered URL "latest" currently redirects to. */
async function resolveLatestUrl() {
  const res = await fetch(LATEST_URL, {
    method: 'HEAD',
    redirect: 'manual',
    headers: { 'User-Agent': USER_AGENT },
  });
  const location = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && location) {
    return new URL(location, LATEST_URL).href;
  }
  if (res.ok) return LATEST_URL;
  throw new Error(`HTTP ${res.status} resolving ${LATEST_URL}`);
}

async function cachedZip(cacheDir) {
  const url = await resolveLatestUrl();
  const path = join(cacheDir, basename(new URL(url).pathname));
  try {
    const s = await stat(path);
    if (s.size > 0) {
      console.log(`  ${basename(path)}: cache hit (${(s.size / 1048576).toFixed(1)} MB)`);
      return readFile(path);
    }
  } catch {
    /* not cached */
  }
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path, bytes);
  console.log(`  ${basename(path)}: downloaded (${(bytes.length / 1048576).toFixed(1)} MB)`);
  return bytes;
}

/** The named members of CCP's latest JSONL export, as text, keyed by name. */
export async function readCcpStaticDataFiles(cacheDir, names) {
  const zip = await cachedZip(cacheDir);
  const wanted = new Set(names);
  const members = unzipSync(new Uint8Array(zip), { filter: (file) => wanted.has(file.name) });
  const out = {};
  for (const name of names) {
    if (!members[name]) throw new Error(`${name} missing from CCP's static data export`);
    out[name] = strFromU8(members[name]);
  }
  return out;
}
