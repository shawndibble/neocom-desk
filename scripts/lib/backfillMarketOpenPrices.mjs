// Orchestration of scripts/backfill-market-open-prices.mjs, with the network
// and Firestore injected so it is unit-tested on fixtures. Deleted together
// with the script once the backfill has run.
//
// Two phases, so each Firestore document is read and written once:
//   1. foldDays: fold each day's final snapshot and keep only the compact
//      result (OpenPriceTable) in memory.
//   2. one writeOpenPrices pass over every document, with all its days.
import {
  OpenPriceFold,
  dateRange,
  implausibleReason,
  isIsoDate,
  pairKey,
} from '../../functions/src/marketOpenPrices.ts';

export const USAGE = `Usage: node scripts/backfill-market-open-prices.mjs --from YYYY-MM-DD --to YYYY-MM-DD [--project <id>] [--write [--yes]] [--dry-run]
Folds every day in memory first, then writes each document once. Nothing is written until every day is folded.
Dry run unless --write is given. --write needs --project and asks you to type the project id before anything else;
--yes skips that prompt when the GOOGLE_APPLICATION_CREDENTIALS file's project_id matches.`;

/** @param {string[]} argv */
export function parseArgs(argv) {
  const out = { from: '', to: '', project: '', write: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === '--from') out.from = value();
    else if (arg === '--to') out.to = value();
    else if (arg === '--project') out.project = value();
    else if (arg === '--write') out.write = true;
    else if (arg === '--yes') out.yes = true;
    else if (arg === '--dry-run') out.write = false;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!isIsoDate(out.from) || !isIsoDate(out.to))
    throw new Error('--from and --to must be YYYY-MM-DD dates');
  if (out.from > out.to) throw new Error('--from is after --to');
  if (out.write && !out.project) throw new Error('--write needs --project <firebase project id>');
  return out;
}

/**
 * Whether a write may go ahead. `credentialProject` is the credential file's
 * `project_id`, or null when there is no readable file (application default
 * credentials from elsewhere): then there is nothing to compare, so only the
 * typed confirmation guards the target and --yes is refused.
 *
 * @param {{ credentialProject: string | null, project: string, yes: boolean }} input
 * @returns {{ refuse: string } | { prompt: boolean }}
 */
export function checkCredentials({ credentialProject, project, yes }) {
  if (credentialProject === null) {
    if (yes)
      return {
        refuse:
          'No readable GOOGLE_APPLICATION_CREDENTIALS file to check the project against, so --yes is refused; run interactively and type the project id.',
      };
    return { prompt: true };
  }
  if (credentialProject !== project)
    return { refuse: 'The credentials are for a different project than --project; refusing.' };
  return { prompt: !yes };
}

/**
 * Every folded day, held compactly. Each region/type pair gets an index the
 * first time a day lists it; each day keeps two Float64Arrays (buy, sell)
 * indexed by pair and sized to the pairs known by then, NaN meaning "no
 * order". The fold only lists a pair with at least one side priced, so both
 * NaN means the day did not list it. 16 bytes per pair per day: 400 days x
 * ~70k pairs is ~450 MB, where the folds' Maps of objects would be several GB.
 * Documents are one per type (`marketOpenPricesByType`), so `documents()`
 * gathers each type's pairs, one per region, into one document.
 */
export class OpenPriceTable {
  #pairIndex = new Map();
  #regionIds = [];
  /** typeId -> its pairs' indexes, in first-seen order: one document each. */
  #pairsByType = new Map();
  #buys = [];
  #sells = [];
  /** Ascending as added. */
  dates = [];

  /** @param {string} date @param {OpenPriceFold} fold */
  addDay(date, fold) {
    const indexes = [];
    for (const e of fold.entries()) {
      const key = pairKey(e.regionId, e.typeId);
      let i = this.#pairIndex.get(key);
      if (i === undefined) {
        i = this.#regionIds.length;
        this.#pairIndex.set(key, i);
        this.#regionIds.push(e.regionId);
        let pairs = this.#pairsByType.get(e.typeId);
        if (!pairs) {
          pairs = [];
          this.#pairsByType.set(e.typeId, pairs);
        }
        pairs.push(i);
      }
      indexes.push(i);
    }
    const buy = new Float64Array(this.#regionIds.length).fill(NaN);
    const sell = new Float64Array(this.#regionIds.length).fill(NaN);
    let n = 0;
    for (const e of fold.entries()) {
      const i = indexes[n++];
      if (e.buy !== null) buy[i] = e.buy;
      if (e.sell !== null) sell[i] = e.sell;
    }
    this.dates.push(date);
    this.#buys.push(buy);
    this.#sells.push(sell);
  }

  /** Documents (types) seen so far. */
  get size() {
    return this.#pairsByType.size;
  }

  /** Bytes held in the price columns. */
  get bytes() {
    return this.#buys.reduce((n, a) => n + a.byteLength * 2, 0);
  }

  /** One `TypeDays` per type document, every region of a day together, days ascending. Built lazily. */
  *documents() {
    const buys = this.#buys;
    const sells = this.#sells;
    for (const [typeId, pairs] of this.#pairsByType) {
      const days = [];
      for (let d = 0; d < this.dates.length; d++) {
        let regions = null;
        for (const p of pairs) {
          if (p >= buys[d].length) continue;
          const b = buys[d][p];
          const s = sells[d][p];
          if (Number.isNaN(b) && Number.isNaN(s)) continue;
          regions ??= {};
          regions[String(this.#regionIds[p])] = {
            buy: Number.isNaN(b) ? null : b,
            sell: Number.isNaN(s) ? null : s,
          };
        }
        if (regions) days.push({ date: this.dates[d], regions });
      }
      yield { typeId, days };
    }
  }
}

/**
 * Phase 1. Folds each day from `from` to `to` into `table`. A day with no
 * final snapshot (`findFinalSnapshot`), or an implausible one, is logged,
 * reported and left out. Each fold is dropped once it is in the table.
 *
 * @param {{
 *   from: string, to: string, table: OpenPriceTable,
 *   snapshotUrlFor: (date: string) => Promise<string | null>,
 *   foldUrl: (url: string, fold: OpenPriceFold) => Promise<number>,
 *   log: (line: string) => void,
 * }} deps
 */
export async function foldDays({ from, to, table, snapshotUrlFor, foldUrl, log }) {
  const skipped = [];
  const dates = dateRange(from, to);
  for (const [i, date] of dates.entries()) {
    const url = await snapshotUrlFor(date);
    if (!url) {
      skipped.push(date);
      log(`${date}: no final snapshot listed, skipped`);
      continue;
    }
    const fold = new OpenPriceFold();
    const rows = await foldUrl(url, fold);
    const reason = implausibleReason(fold);
    if (reason) {
      skipped.push(date);
      log(`${date}: ${reason}, skipped`);
      continue;
    }
    table.addDay(date, fold);
    log(
      `${date} (${i + 1}/${dates.length}): ${rows} orders, ${fold.size} priced region/type pairs, from ${url}; ${mb(table.bytes)} MB held`
    );
  }
  return { skipped };
}

/**
 * Runs both phases: folds every day, then hands every document, with all its
 * days, to `writeDocuments` once (on a dry run it only counts them). Returns
 * how many documents were written and the days that were skipped.
 *
 * @param {{
 *   from: string, to: string, write: boolean,
 *   snapshotUrlFor: (date: string) => Promise<string | null>,
 *   foldUrl: (url: string, fold: OpenPriceFold) => Promise<number>,
 *   writeDocuments: (docs: Iterable<import('../../functions/src/marketOpenPrices.ts').TypeDays>, total: number) => Promise<number>,
 *   log: (line: string) => void,
 * }} deps
 */
export async function runBackfill(deps) {
  const { from, write, writeDocuments, log } = deps;
  const table = new OpenPriceTable();
  log(
    `phase 1: folding each day in memory; nothing is written until every day is folded (if stopped, re-run with --from ${from})`
  );
  let skipped;
  try {
    ({ skipped } = await foldDays({ ...deps, table }));
  } catch (err) {
    log(`download failed: nothing written; re-run with --from ${from}`);
    throw err;
  }
  log(
    `phase 2: ${table.size} documents from ${table.dates.length} days (${mb(table.bytes)} MB of prices in memory)`
  );
  if (table.size === 0) {
    log('nothing to write');
    return { written: 0, skipped };
  }
  if (!write) {
    log(`dry run: would write ${table.size} documents, each once`);
    return { written: 0, skipped };
  }
  try {
    const written = await writeDocuments(
      { [Symbol.iterator]: () => table.documents() },
      table.size
    );
    return { written, skipped };
  } catch (err) {
    log(
      'write failed: the batches already committed are complete and the merge is idempotent, so re-run the same command (it downloads every day again, ~35 s each)'
    );
    throw err;
  }
}

function mb(bytes) {
  return Math.round(bytes / 2 ** 20);
}
