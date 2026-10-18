// Orchestration of scripts/backfill-market-open-prices.mjs, with every effect
// (network, Firestore, clock output) injected so it is unit-tested on fixtures.
// Deleted together with the script once the backfill has run.
import {
  OpenPriceFold,
  dateRange,
  groupByDocument,
  implausibleReason,
  isIsoDate,
} from '../../functions/src/marketOpenPrices.ts';

export const DEFAULT_CHUNK_DAYS = 30;

export const USAGE = `Usage: node scripts/backfill-market-open-prices.mjs --from YYYY-MM-DD --to YYYY-MM-DD [--project <id>] [--chunk-days 30] [--write]
Dry run unless --write is given. --write also needs --project and GOOGLE_APPLICATION_CREDENTIALS.`;

/** @param {string[]} argv */
export function parseArgs(argv) {
  const out = { from: '', to: '', project: '', chunkDays: DEFAULT_CHUNK_DAYS, write: false };
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
    else if (arg === '--chunk-days') out.chunkDays = Number(value());
    else if (arg === '--write') out.write = true;
    else if (arg === '--dry-run') out.write = false;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!isIsoDate(out.from) || !isIsoDate(out.to))
    throw new Error('--from and --to must be YYYY-MM-DD dates');
  if (out.from > out.to) throw new Error('--from is after --to');
  if (!Number.isInteger(out.chunkDays) || out.chunkDays < 1)
    throw new Error('--chunk-days must be a positive integer');
  if (out.write && !out.project) throw new Error('--write needs --project <firebase project id>');
  return out;
}

/**
 * Folds each day in order and, every `chunkDays` days, merges the chunk into
 * Firestore in one pass (one read and one write per document per chunk, not
 * per day). A day with no snapshot, or an implausible one, is skipped and
 * reported, never written. Returns the last date whose chunk is fully written
 * (null on a dry run or if nothing was written) so a failed run resumes at the
 * day after it.
 *
 * @param {{
 *   from: string, to: string, chunkDays: number, write: boolean,
 *   snapshotUrlFor: (date: string) => Promise<string | null>,
 *   foldUrl: (url: string, fold: OpenPriceFold) => Promise<number>,
 *   writeGroups: (groups: ReturnType<typeof groupByDocument>) => Promise<number>,
 *   log: (line: string) => void,
 * }} deps
 */
export async function runBackfill(deps) {
  const { from, to, chunkDays, write, snapshotUrlFor, foldUrl, writeGroups, log } = deps;
  const skipped = [];
  let lastWritten = null;
  let chunk = new Map();

  const flush = async (throughDate) => {
    if (chunk.size === 0) return;
    const groups = groupByDocument(chunk);
    if (write) {
      const written = await writeGroups(groups);
      lastWritten = throughDate;
      log(
        `wrote ${written} documents; completed through ${throughDate} (resume with --from ${nextDay(throughDate)})`
      );
    } else {
      log(
        `dry run: would write ${groups.length} documents for ${chunk.size} days through ${throughDate}`
      );
    }
    chunk = new Map();
  };

  const dates = dateRange(from, to);
  for (const [i, date] of dates.entries()) {
    const url = await snapshotUrlFor(date);
    if (!url) {
      skipped.push(date);
      log(`${date}: no snapshot listed, skipped`);
    } else {
      const fold = new OpenPriceFold();
      const rows = await foldUrl(url, fold);
      const reason = implausibleReason(fold);
      if (reason) {
        skipped.push(date);
        log(`${date}: ${reason}, skipped`);
      } else {
        chunk.set(date, fold);
        log(`${date}: ${rows} orders, ${fold.size} priced region/type pairs`);
      }
    }
    if ((i + 1) % chunkDays === 0 || i === dates.length - 1) await flush(date);
  }
  return { lastWritten, skipped };
}

function nextDay(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
