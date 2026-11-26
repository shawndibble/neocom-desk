import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const LATEST_URL =
  'https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip';
const ZIP_NAME = /^eve-online-static-data-\d+-jsonl\.zip$/;
const RESOLVE_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export async function resolveLatestUrl(userAgent) {
  const res = await fetch(LATEST_URL, {
    method: 'HEAD',
    redirect: 'manual',
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
  });
  const location = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && location) {
    const url = new URL(location, LATEST_URL).href;
    if (ZIP_NAME.test(basename(new URL(url).pathname))) return url;
    throw new Error(`${LATEST_URL} redirected to an unrecognised file: ${url}`);
  }
  throw new Error(`HTTP ${res.status} resolving ${LATEST_URL}; expected a redirect`);
}

async function newestCachedZip(cacheDir) {
  const names = (await readdir(cacheDir).catch(() => [])).filter((n) => ZIP_NAME.test(n));
  const build = (n) => Number(n.match(/\d+/)[0]);
  names.sort((a, b) => build(b) - build(a));
  return names[0] ? join(cacheDir, names[0]) : null;
}

async function cachedZip(cacheDir, userAgent) {
  let url;
  try {
    url = await resolveLatestUrl(userAgent);
  } catch (err) {
    const fallback = await newestCachedZip(cacheDir);
    if (!fallback) throw err;
    console.warn(`  ${err.message} — using cached ${basename(fallback)}`);
    return readFile(fallback);
  }
  const path = join(cacheDir, basename(new URL(url).pathname));
  try {
    const s = await stat(path);
    if (s.size > 0) {
      console.log(`  ${basename(path)}: cache hit (${(s.size / 1048576).toFixed(1)} MB)`);
      return readFile(path);
    }
  } catch {}
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path, bytes);
  console.log(`  ${basename(path)}: downloaded (${(bytes.length / 1048576).toFixed(1)} MB)`);
  return bytes;
}

export async function readCcpStaticDataFiles(cacheDir, names, userAgent) {
  const zip = await cachedZip(cacheDir, userAgent);
  const wanted = new Set(names);
  const members = unzipSync(new Uint8Array(zip), { filter: (file) => wanted.has(file.name) });
  const out = {};
  for (const name of names) {
    if (!members[name]) throw new Error(`${name} missing from CCP's static data export`);
    out[name] = strFromU8(members[name]);
  }
  return out;
}
