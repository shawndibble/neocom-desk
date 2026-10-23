/**
 * One-off: fills the per-system cost index history (`cost-indices/<systemId>.json`)
 * from EVE Ref's industry-systems dataset, so the Build Plan's trend shows from day
 * one instead of after the daily job has run for a week. Safe to re-run: the merge
 * replaces a date's column. Needs the `bzip2` binary (EVE Ref ships .json.bz2).
 * Do not run it within an hour of 00:30 UTC: the daily job read-merge-writes the
 * same objects, and two overlapping runs can drop one side's column.
 *
 *   cd functions
 *   R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com R2_BUCKET=<bucket> \
 *   R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *   node scripts/backfill-cost-indices.mjs [days=90]
 */
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

/** The day's last hourly file, the closest to "end of day". Null when the day is not published. */
async function lastFileOf(date) {
  const folder = `${BASE}/${date.slice(0, 4)}/${date}/`;
  const listing = await fetchOk(folder);
  if (!listing) return null;
  const hrefs = [...(await listing.text()).matchAll(/href="([^"]+\.json\.bz2)"/g)].map((m) => m[1]);
  const last = hrefs.sort().at(-1);
  if (!last) return null;
  const url = new URL(last, folder).href;
  // A listing pointing off EVE Ref is not a file we asked for.
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
