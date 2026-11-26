import { Readable, pipeline } from 'node:stream';
import { parse } from 'csv-parse';
import unbzip2Stream from 'unbzip2-stream';
import { MARKET_OPEN_PRICES_REGION_IDS, addDays } from './marketOpenPrices.js';
import { DAY_MS } from './timeConstants.js';

const EVEREF_HISTORY_BASE = 'https://data.everef.net/market-history';
export const LP_VOLUME_WINDOW_DAYS = 30;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const REQUIRED_COLUMNS = ['region_id', 'type_id', 'volume'] as const;
const DEMAND_COLUMNS = ['date', 'highest', 'lowest', 'order_count'] as const;
const RECENT_PRICE_DAYS = 7;

export function historyDayUrl(date: string): string {
  return `${EVEREF_HISTORY_BASE}/${date.slice(0, 4)}/market-history-${date}.csv.bz2`;
}

export function historyWindow(now: Date, days: number = LP_VOLUME_WINDOW_DAYS): string[] {
  const yesterday = addDays(now.toISOString().slice(0, 10), -1);
  return Array.from({ length: days }, (_, i) => addDays(yesterday, -i));
}

export type StoredDemand = [
  volume: number,
  daysWithTrades: number,
  orderSum: number,
  recentSalePrice: number | null,
  latestDate: string,
  latestHighest: number,
  latestLowest: number,
];

export interface DemandDay {
  date: string;
  volume: number;
  highest: number;
  lowest: number;
  orderCount: number;
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function volumeWeightedMedian(days: readonly DemandDay[]): number | null {
  const total = days.reduce((sum, d) => sum + d.volume, 0);
  if (total <= 0) return null;
  const byPrice = [...days].sort((a, b) => a.highest - b.highest);
  let cumulative = 0;
  for (const d of byPrice) {
    cumulative += d.volume;
    if (cumulative >= total / 2) return d.highest;
  }
  return byPrice[byPrice.length - 1]!.highest;
}

export class VolumeFold {
  private readonly totals = new Map<number, Map<number, number>>();
  private readonly daysByType = new Map<number, Map<number, DemandDay[]>>();

  constructor(regionIds: readonly number[] = MARKET_OPEN_PRICES_REGION_IDS) {
    for (const id of regionIds) {
      this.totals.set(id, new Map());
      this.daysByType.set(id, new Map());
    }
  }

  addDay(regionId: number, typeId: number, day: DemandDay): void {
    const region = this.daysByType.get(regionId);
    this.add(regionId, typeId, day.volume);
    if (!region || !Number.isInteger(typeId) || !(day.volume > 0)) return;
    if (!Number.isFinite(day.highest) || !Number.isFinite(day.lowest)) return;
    const orderCount = Number.isFinite(day.orderCount) ? day.orderCount : 0;
    const days = region.get(typeId) ?? [];
    days.push({ ...day, orderCount });
    region.set(typeId, days);
  }

  demandFor(regionId: number, asOf: string, windowDays: number): Record<number, StoredDemand> {
    const out: Record<number, StoredDemand> = {};
    const asOfNumber = dayNumber(asOf);
    for (const [typeId, days] of this.daysByType.get(regionId) ?? []) {
      const inWindow = days.filter((d) => {
        const age = asOfNumber - dayNumber(d.date);
        return age >= 0 && age < windowDays;
      });
      if (inWindow.length === 0) continue;
      const recent = inWindow.filter((d) => asOfNumber - dayNumber(d.date) < RECENT_PRICE_DAYS);
      const latest = inWindow.reduce((best, d) => (d.date > best.date ? d : best));
      out[typeId] = [
        inWindow.reduce((sum, d) => sum + d.volume, 0),
        inWindow.length,
        inWindow.reduce((sum, d) => sum + d.orderCount, 0),
        volumeWeightedMedian(recent.length > 0 ? recent : inWindow),
        latest.date,
        latest.highest,
        latest.lowest,
      ];
    }
    return out;
  }

  add(regionId: number, typeId: number, volume: number): void {
    const region = this.totals.get(regionId);
    if (!region || !Number.isInteger(typeId) || !Number.isFinite(volume) || volume <= 0) return;
    region.set(typeId, (region.get(typeId) ?? 0) + volume);
  }

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

export async function foldHistoryCsv(csv: Readable, fold: VolumeFold): Promise<number> {
  const rows = historyCsvParser();
  pipeline(csv, rows, () => {});
  return foldRows(rows, fold);
}

export async function foldHistoryBz2(compressed: Readable, fold: VolumeFold): Promise<number> {
  const rows = historyCsvParser();
  pipeline(compressed, unbzip2Stream(), rows, () => {});
  return foldRows(rows, fold);
}

async function foldRows(rows: ReturnType<typeof historyCsvParser>, fold: VolumeFold) {
  let columns: Record<(typeof REQUIRED_COLUMNS)[number], number> | null = null;
  let demandColumns: Record<(typeof DEMAND_COLUMNS)[number], number> | null = null;
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
      const extra = DEMAND_COLUMNS.map((name) => row.indexOf(name));
      if (extra.every((i) => i >= 0)) {
        demandColumns = {
          date: extra[0],
          highest: extra[1],
          lowest: extra[2],
          order_count: extra[3],
        };
      }
      continue;
    }
    count += 1;
    const regionId = Number(row[columns.region_id]);
    const typeId = Number(row[columns.type_id]);
    const volume = Number(row[columns.volume]);
    if (demandColumns) {
      fold.addDay(regionId, typeId, {
        date: row[demandColumns.date] ?? '',
        volume,
        highest: Number(row[demandColumns.highest]),
        lowest: Number(row[demandColumns.lowest]),
        orderCount: Number(row[demandColumns.order_count]),
      });
    } else {
      fold.add(regionId, typeId, volume);
    }
  }
  return count;
}

export type FoldHistoryDay = (date: string, fold: VolumeFold) => Promise<'folded' | 'missing'>;

export function foldHistoryDayUrl(userAgent: string): FoldHistoryDay {
  return async (date, fold) => {
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
