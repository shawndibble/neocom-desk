#!/usr/bin/env node
// ONE-OFF: seeds `marketOpenPrices` with past days from EVE Ref's market-order
// snapshot history. DELETE THIS SCRIPT (and scripts/lib/backfillMarketOpenPrices.*)
// once the backfill has run; the daily `syncMarketOpenPrices` function carries
// it on from there. Decision: docs/context/decisions/20261018-121126-*.md.
//
// Run by the maintainer, with their own service-account credentials. It never
// runs in CI or from an agent. From the repo root, after `npm ci` in both the
// root and functions/:
//
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   # 1. Dry run (the default): downloads and folds each day, writes nothing.
//   node scripts/backfill-market-open-prices.mjs --from 2025-09-14 --to 2026-10-16
//   # 2. For real:
//   node scripts/backfill-market-open-prices.mjs --from 2025-09-14 --to 2026-10-16 \
//     --project neocom-desk --write
//
// Dates are UTC days, inclusive; --to is normally the day before the daily
// function's first run. Days go in ascending order and the merge is idempotent
// (a day already stored is replaced, never duplicated), so after a failure,
// re-run with --from set to the day the log says to resume at. --chunk-days
// (default 30) is how many days are folded in memory before one merge pass of
// reads and writes per document. Each day downloads ~20MB and takes ~45s.
// Runs on Node 24 directly on the TypeScript sources in functions/src.
import { createRequire } from 'node:module';
import {
  MARKET_OPEN_PRICES_COLLECTION,
  dayIndexUrl,
  mergeDays,
  pickLastSnapshotUrl,
} from '../functions/src/marketOpenPrices.ts';
import { writeOpenPrices } from '../functions/src/marketOpenPricesStore.ts';
import { fetchJson, foldSnapshotUrl } from '../functions/src/marketOrdersArchive.ts';
import { USAGE, parseArgs, runBackfill } from './lib/backfillMarketOpenPrices.mjs';

const USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk) backfill';

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`${err.message}\n${USAGE}`);
  process.exit(2);
}

let db = null;
if (args.write) {
  // firebase-admin lives in functions/, not the root package.
  const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp, applicationDefault } = requireFromFunctions('firebase-admin/app');
  const { getFirestore } = requireFromFunctions('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId: args.project });
  db = getFirestore();
  console.log(`WRITING to project ${args.project}`);
} else {
  console.log('DRY RUN: nothing is written (add --write --project <id> to write)');
}

const { lastWritten, skipped } = await runBackfill({
  ...args,
  snapshotUrlFor: async (date) =>
    pickLastSnapshotUrl(await fetchJson(dayIndexUrl(date), USER_AGENT), date),
  foldUrl: (url, fold) => foldSnapshotUrl(url, fold, USER_AGENT),
  writeGroups: (groups) => writeOpenPrices(db, MARKET_OPEN_PRICES_COLLECTION, groups, mergeDays),
  log: (line) => console.log(line),
});
console.log(
  `done. last written through: ${lastWritten ?? '(nothing written)'}; skipped days: ${skipped.join(', ') || 'none'}`
);
