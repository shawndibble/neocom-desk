import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { FUZZWORK_DUMP_URL } from './sdeBuild.mjs';

export function isMarketType(t) {
  return t.published && t.marketGroupID != null;
}

export async function download(dump, name, cacheRoot) {
  const cacheDir = join(cacheRoot, 'fuzzwork', dump.dir);
  const cached = join(cacheDir, name);
  try {
    const s = await stat(cached);
    if (s.size > 0) {
      console.log(`  ${name}: cache hit (${(s.size / 1048576).toFixed(1)} MB)`);
      return readFile(cached, 'utf8');
    }
  } catch {}
  const url = `${FUZZWORK_DUMP_URL}${dump.dir}/csv/${name}`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      await mkdir(cacheDir, { recursive: true });
      await writeFile(cached, text);
      console.log(`  ${name}: downloaded (${(text.length / 1048576).toFixed(1)} MB)`);
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(`  ${name}: attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function indexHeader(rows) {
  const header = rows[0];
  const idx = {};
  for (let i = 0; i < header.length; i++) idx[header[i]] = i;
  return idx;
}

export function num(s) {
  return s === '' ? null : Number(s);
}

export function isRefinable(t) {
  return Boolean(t && t.published && t.marketGroupID !== null);
}

export function intOrNull(s) {
  const value = num(s);
  return Number.isInteger(value) ? value : null;
}

export function packagedVolumesFrom(ccpTypes) {
  const volumes = new Map();
  for (const t of ccpTypes) {
    if (typeof t.packagedVolume === 'number' && t.packagedVolume > 0) {
      volumes.set(t._key, t.packagedVolume);
    }
  }
  return volumes;
}
