import { spawnSync } from 'node:child_process';
import { createR2Get, createR2Put } from '../src/r2Client.ts';
import { parseCostIndices, writeCostIndicesToR2 } from '../src/costIndicesSnapshot.ts';

const BASE = 'https://data.everef.net/industry-systems/history';
const USER_AGENT = 'Neocom Desk cost index backfill (https://neocomdesk.com)';
const days = Number(process.argv[2] ?? 90);
if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive integer');

const config = {
  endpoint: process.env.R2_ENDPOINT,
  bucket: process.env.R2_BUCKET,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
};
for (const [name, value] of Object.entries(config)) {
  if (!value) throw new Error(`missing R2 setting: ${name}`);
}

async function fetchOk(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  return response.ok ? response : null;
}

async function lastFileOf(date) {
  const folder = `${BASE}/${date.slice(0, 4)}/${date}/`;
  const listing = await fetchOk(folder);
  if (!listing) return null;
  const hrefs = [...(await listing.text()).matchAll(/href="([^"]+\.json\.bz2)"/g)].map((m) => m[1]);
  const last = hrefs.sort().at(-1);
  if (!last) return null;
  const url = new URL(last, folder).href;
  return url.startsWith(BASE) ? url : null;
}

async function loadDay(date) {
  const url = await lastFileOf(date);
  if (!url) return null;
  const file = await fetchOk(url);
  if (!file) return null;
  const run = spawnSync('bzip2', ['-dc'], {
    input: Buffer.from(await file.arrayBuffer()),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`bzip2 failed for ${date}: ${run.stderr}`);
  const indices = parseCostIndices(JSON.parse(run.stdout.toString('utf8')));
  if (Object.keys(indices).length === 0) throw new Error(`no systems parsed for ${date}`);
  return { date, indices };
}

const today = Date.now();
const dates = Array.from({ length: days }, (_, i) =>
  new Date(today - (days - i) * 86_400_000).toISOString().slice(0, 10)
);
const loaded = [];
for (const date of dates) {
  const day = await loadDay(date);
  console.log(`${date}: ${day ? `${Object.keys(day.indices).length} systems` : 'not published'}`);
  if (day) loaded.push(day);
}
if (loaded.length === 0) throw new Error('no days loaded');

const result = await writeCostIndicesToR2(
  loaded,
  { get: createR2Get(config), put: createR2Put(config) },
  Date.now()
);
console.log(result);
if (result.failed > 0) process.exitCode = 1;
