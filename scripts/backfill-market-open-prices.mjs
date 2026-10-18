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
//   node scripts/backfill-market-open-prices.mjs --from 2025-09-14 --to 2026-10-17
//   # 2. For real:
//   node scripts/backfill-market-open-prices.mjs --from 2025-09-14 --to 2026-10-17 \
//     --project neocom-desk --write
//
// Phase 1 folds every day and keeps only a compact table in memory (two
// Float64Arrays per day, indexed by region/type pair: ~450 MB for 400 days).
// Phase 2 then runs one writeOpenPrices pass, so each document is read and
// merge-written exactly once, with progress lines as it goes. The merge keeps
// days the daily function already stored and the 400-day cap. Nothing is
// written until every day is folded, so a run stopped during phase 1 is
// re-run from the same --from.
//
// Step 2 against the PRODUCTION project is exactly what the maintainer is
// expected to run, with the service-account credentials they provide. The
// script refuses to write without --project, shows the target and the
// credential file's own project_id, refuses a mismatch, and, when interactive,
// waits for you to type the project id before anything else. --yes skips that
// prompt for unattended runs, but only when the credential file is readable
// and matches: with application default credentials from elsewhere there is
// nothing to compare, so the typed confirmation is the only check.
// --dry-run is the default and is also accepted explicitly.
//
// Do not let phase 2 (the write) overlap syncMarketOpenPrices (00:45 to about
// 03:00 UTC, its retries included): both do a non-transactional
// read-modify-write of the same documents. Phase 1 (~5 hours for 400 days)
// is safe any time, so start it so that it ends outside that window.
//
// Dates are UTC days, inclusive; --to is normally the day before the daily
// function's first run. The merge is idempotent (a stored day is replaced,
// never duplicated) and every batch of 500 commits atomically, so an
// interrupted write is simply run again. Each day downloads ~20MB and takes
// ~45s. Runs on Node 24 directly on the TypeScript sources in functions/src.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import {
  MARKET_OPEN_PRICES_COLLECTION,
  findFinalSnapshot,
  mergeDays,
} from '../functions/src/marketOpenPrices.ts';
import { writeOpenPrices } from '../functions/src/marketOpenPricesStore.ts';
import { fetchJson, foldSnapshotUrl } from '../functions/src/marketOrdersArchive.ts';
import {
  USAGE,
  checkCredentials,
  parseArgs,
  runBackfill,
} from './lib/backfillMarketOpenPrices.mjs';

const USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk) backfill';
const PROGRESS_EVERY = 2000;

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`${err.message}\n${USAGE}`);
  process.exit(2);
}

async function confirmWrite() {
  let credentialProject = null;
  try {
    credentialProject =
      JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')).project_id ??
      null;
  } catch {
    // Application default credentials from elsewhere; nothing to compare.
  }
  console.log(
    `Target project: ${args.project}; credentials belong to: ${credentialProject ?? '(no readable GOOGLE_APPLICATION_CREDENTIALS file, so nothing to compare: only the typed project id below guards the target)'}`
  );
  console.log(
    `About to write to ${MARKET_OPEN_PRICES_COLLECTION}, each document once, after every day is downloaded.`
  );
  const check = checkCredentials({ credentialProject, project: args.project, yes: args.yes });
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
  const typed = await rl.question(`Type the project id (${args.project}) to continue: `);
  rl.close();
  if (typed.trim() !== args.project) {
    console.error('Project id did not match; nothing written.');
    process.exit(2);
  }
}

let db = null;
if (args.write) {
  await confirmWrite();
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

const { written, skipped } = await runBackfill({
  ...args,
  // Only a day's final snapshot: a --to of today or yesterday, before EVE Ref
  // lists 23:45, is skipped rather than stored with an earlier price.
  snapshotUrlFor: async (date) => {
    const found = await findFinalSnapshot(date, (url) => fetchJson(url, USER_AGENT));
    return found.final ? found.snapshot.url : null;
  },
  foldUrl: (url, fold) => foldSnapshotUrl(url, fold, USER_AGENT),
  writeDocuments: (docs, total) => {
    const started = Date.now();
    let logged = 0;
    return writeOpenPrices(db, MARKET_OPEN_PRICES_COLLECTION, docs, mergeDays, (n) => {
      if (n - logged < PROGRESS_EVERY && n !== total) return;
      logged = n;
      const minutes = (Date.now() - started) / 60_000;
      const eta = n < total ? `, ~${Math.ceil((minutes / n) * (total - n))} min left` : '';
      console.log(`written ${n} / ${total} documents (${minutes.toFixed(1)} min${eta})`);
    });
  },
  log: (line) => console.log(line),
});
console.log(`done. documents written: ${written}; skipped days: ${skipped.join(', ') || 'none'}`);
