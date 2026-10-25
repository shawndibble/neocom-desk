/**
 * Daily traded volume per hub region and type (issue #5127), for the LP Store's
 * Sells/day column: EVE Ref's daily market-history files (one `.csv.bz2` per UTC
 * day, every region and type, a few hundred KB each) folded into one
 * units-per-day figure per type over a 30-day window. Reading ~30 small files
 * replaces ~5 hubs x thousands of ESI `/markets/{region}/history` calls, which a
 * daily run cannot afford. The figure matches the hauling engine's
 * `summarizeDemand().dailyVolume`: total over the window, days without a trade
 * counting as zero.
 */
import { Readable, pipeline } from 'node:stream';
import { parse } from 'csv-parse';
import unbzip2Stream from 'unbzip2-stream';
import { MARKET_OPEN_PRICES_REGION_IDS, addDays } from './marketOpenPrices.js';

const EVEREF_HISTORY_BASE = 'https://data.everef.net/market-history';
export const LP_VOLUME_WINDOW_DAYS = 30;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const REQUIRED_COLUMNS = ['region_id', 'type_id', 'volume'] as const;

export function historyDayUrl(date: string): string {
  return `${EVEREF_HISTORY_BASE}/${date.slice(0, 4)}/market-history-${date}.csv.bz2`;
}

/** The `days` UTC dates ending the day before `now`'s, newest first. EVE Ref lists a day about 11:00 UTC the next day, so the first is usually still missing at the 00:30 run. */
export function historyWindow(now: Date, days: number = LP_VOLUME_WINDOW_DAYS): string[] {
  const yesterday = addDays(now.toISOString().slice(0, 10), -1);
  return Array.from({ length: days }, (_, i) => addDays(yesterday, -i));
}

/** Total traded volume per tracked region and type across the days folded in. */
export class VolumeFold {
  private readonly totals = new Map<number, Map<number, number>>();

  constructor(regionIds: readonly number[] = MARKET_OPEN_PRICES_REGION_IDS) {
    for (const id of regionIds) this.totals.set(id, new Map());
  }

  add(regionId: number, typeId: number, volume: number): void {
    const region = this.totals.get(regionId);
    if (!region || !Number.isInteger(typeId) || !Number.isFinite(volume) || volume <= 0) return;
    region.set(typeId, (region.get(typeId) ?? 0) + volume);
  }

  /** Units per day for each type that traded at all, over `days` days; two decimals, never 0. */
  perDay(regionId: number, days: number): Record<number, number> {
    const out: Record<number, number> = {};
    if (days <= 0) return out;
    for (const [typeId, total] of this.totals.get(regionId) ?? []) {
      const rounded = Math.round((total / days) * 100) / 100;
      out[typeId] = rounded > 0 ? rounded : 0.01;
    }
    return out;
  }

  regionIds(): number[] {
    return [...this.totals.keys()];
  }
}

function historyCsvParser() {
  return parse({ skip_empty_lines: true, relax_column_count: true });
}

/** Folds one decompressed market-history CSV into `fold`; returns the data rows read. */
export async function foldHistoryCsv(csv: Readable, fold: VolumeFold): Promise<number> {
  const rows = historyCsvParser();
  pipeline(csv, rows, () => {});
  return foldRows(rows, fold);
}

/** Decompresses a `.csv.bz2` history file and folds it; one pipeline, as in `marketOrdersArchive.ts`. */
export async function foldHistoryBz2(compressed: Readable, fold: VolumeFold): Promise<number> {
  const rows = historyCsvParser();
  pipeline(compressed, unbzip2Stream(), rows, () => {});
  return foldRows(rows, fold);
}

async function foldRows(rows: ReturnType<typeof historyCsvParser>, fold: VolumeFold) {
  let columns: Record<(typeof REQUIRED_COLUMNS)[number], number> | null = null;
  let count = 0;
  for await (const row of rows as AsyncIterable<string[]>) {
    if (!columns) {
      const found = REQUIRED_COLUMNS.map((name) => row.indexOf(name));
      if (found.some((i) => i < 0)) {
        rows.destroy();
        throw new Error(
          `market-history file is missing a column of ${REQUIRED_COLUMNS.join(', ')}`
        );
      }
      columns = { region_id: found[0], type_id: found[1], volume: found[2] };
      continue;
    }
    count += 1;
    fold.add(
      Number(row[columns.region_id]),
      Number(row[columns.type_id]),
      Number(row[columns.volume])
    );
  }
  return count;
}

export type FoldHistoryDay = (date: string, fold: VolumeFold) => Promise<'folded' | 'missing'>;

/** Downloads and folds one day; `missing` for a 404 (not published yet), a throw for anything else. */
export function foldHistoryDayUrl(userAgent: string): FoldHistoryDay {
  return async (date, fold) => {
    // The signal also covers the body read, so a stalled download errors the pipeline.
    const response = await fetch(historyDayUrl(date), {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (response.status === 404) return 'missing';
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`EVE Ref market-history fetch failed: HTTP ${response.status}`);
    }
    await foldHistoryBz2(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>),
      fold
    );
    return 'folded';
  };
}
