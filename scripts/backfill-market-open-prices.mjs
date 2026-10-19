#!/usr/bin/env node
// ONE-OFF: seeds the R2 `open-prices/<typeId>.json` objects with past days from
// EVE Ref's market-order snapshot history. DELETE THIS SCRIPT (and
// scripts/lib/backfillMarketOpenPrices.*) once the backfill has run; the daily
// `syncMarketOpenPrices` function carries it on from there. Decisions:
// docs/context/decisions/20261018-121126-*.md, 20261018-164126-*.md,
// 20261018-201511-moving-the-daily-snapshots-to-r2.md and the #4279 one (prices
// at the hub stations, not region-wide: a re-run rewrites every day it covers
// in the station shape and drops that day's old region prices).
//
// Run by the maintainer, with their own R2 credentials. It never runs in CI or
// from an agent. From the repo root, after `npm ci` in both the root and
// functions/ (aws4fetch lives in functions/):
//
//   export R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
//   export R2_BUCKET=neocom-snapshots
//   export R2_ACCESS_KEY_ID=...  R2_SECRET_ACCESS_KEY=...
//   # 1. Dry run (the default): downloads and folds each day, writes nothing.
//   node scripts/backfill-market-open-prices.mjs --from 2025-09-14 --to 2026-10-17
//   # 2. For real:
//   node scripts/backfill-market-open-prices.mjs --from 2025-09-14 --to 2026-10-17 \
//     --bucket neocom-snapshots --write
//
// Phase 1 folds every day and keeps only a compact table in memory (two
// Float64Arrays per day, indexed by hub station/type pair: ~450 MB for 400 days).
// Phase 2 then runs one pass over the type objects (one per type, every hub
// station in it: ~20k objects), so each is read and merge-written exactly once,
// with progress lines as it goes. The merge keeps stored days outside
// --from..--to (the daily function's) and the 400-day cap; a stored day inside
// the range is replaced with the same snapshot's prices. Nothing is written
// until every day is folded, so a run stopped during phase 1 is re-run from the
// same --from. The pass costs ~20k Class A (write) operations; R2's free tier
// is 1M a month, shared with the contract publishers.
//
// The script refuses to write without --bucket, refuses when --bucket differs
// from R2_BUCKET, and, when interactive, waits for you to type the bucket name
// before anything else. --yes skips that prompt for unattended runs.
// --dry-run is the default and is also accepted explicitly.
//
// Do not let phase 2 (the write) overlap syncMarketOpenPrices (00:45 to about
// 03:00 UTC, its retries included): both do a non-transactional
// read-modify-write of the same objects. Phase 1 (~5 hours for 400 days)
// is safe any time, so start it so that it ends outside that window.
//
// Dates are UTC days, inclusive; --to is normally the day before the daily
// function's first run. The merge is idempotent (a stored day is replaced,
// never duplicated), so an interrupted write is simply run again. Each day
// downloads ~20MB and takes ~45s. Runs on Node 24 directly on the TypeScript
// sources in functions/src.
import { createInterface } from 'node:readline/promises';
import { findFinalSnapshot, mergeDays } from '../functions/src/marketOpenPrices.ts';
import { writeOpenPricesToR2 } from '../functions/src/r2DailySnapshots.ts';
import { fetchJson, foldSnapshotUrl } from '../functions/src/marketOrdersArchive.ts';
import { USAGE, checkBucket, parseArgs, runBackfill } from './lib/backfillMarketOpenPrices.mjs';

const USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk) backfill';
const PROGRESS_EVERY = 1000;

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`${err.message}\n${USAGE}`);
  process.exit(2);
}

async function confirmWrite() {
  console.log(`Target bucket: ${args.bucket}; R2_BUCKET is: ${process.env.R2_BUCKET ?? '(unset)'}`);
  console.log(
    'About to write open-prices/<typeId>.json objects, each once, after every day is downloaded.'
  );
  const check = checkBucket({
    envBucket: process.env.R2_BUCKET,
    bucket: args.bucket,
    yes: args.yes,
  });
  if ('refuse' in check) {
    console.error(check.refuse);
    process.exit(2);
  }
  if (!check.prompt) return;
  if (!process.stdin.isTTY) {
    console.error('Not interactive: pass --yes to write without the prompt.');
    process.exit(2);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`Type the bucket name (${args.bucket}) to continue: `);
  rl.close();
  if (typed.trim() !== args.bucket) {
    console.error('Bucket name did not match; nothing written.');
    process.exit(2);
  }
}

let io = null;
if (args.write) {
  await confirmWrite();
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ENDPOINT?.startsWith('https://') || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('Set R2_ENDPOINT (https), R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.');
    process.exit(2);
  }
  // aws4fetch lives in functions/, which r2Client.ts resolves from its own folder.
  const { createR2Get, createR2Put } = await import('../functions/src/r2Client.ts');
  const config = {
    endpoint: R2_ENDPOINT,
    bucket: R2_BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  };
  io = { get: createR2Get(config), put: createR2Put(config) };
  console.log(`WRITING to bucket ${args.bucket}`);
} else {
  console.log('DRY RUN: nothing is written (add --write --bucket <name> to write)');
}

const { written, skipped } = await runBackfill({
  ...args,
  // Only a day's final snapshot: a --to of today or yesterday, before EVE Ref
  // lists 23:45, is skipped rather than stored with an earlier price.
  snapshotUrlFor: async (date) => {
    const found = await findFinalSnapshot(date, (url) => fetchJson(url, USER_AGENT));
    return found.final ? found.snapshot.url : null;
  },
  foldUrl: (url, fold, stations) => foldSnapshotUrl(url, fold, USER_AGENT, stations),
  writeDocuments: async (docs, total) => {
    const started = Date.now();
    let logged = 0;
    const result = await writeOpenPricesToR2(docs, mergeDays, io, (n) => {
      if (n - logged < PROGRESS_EVERY && n !== total) return;
      logged = n;
      const minutes = (Date.now() - started) / 60_000;
      const eta = n < total ? `, ~${Math.ceil((minutes / n) * (total - n))} min left` : '';
      console.log(`written ${n} / ${total} objects (${minutes.toFixed(1)} min${eta})`);
    });
    // The merge is idempotent, so a partial run is simply run again.
    if (result.failed > 0)
      throw new Error(
        `${result.failed} objects failed (${result.written} written); first error: ${result.firstError}. Re-run to finish.`
      );
    return result.written;
  },
  log: (line) => console.log(line),
});
console.log(`done. objects written: ${written}; skipped days: ${skipped.join(', ') || 'none'}`);
