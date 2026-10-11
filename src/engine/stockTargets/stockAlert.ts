/**
 * The below-target alert: fires when an item's listed amount at a market drops
 * into Low, or from Low to Out, between two foreground polls, usually because
 * the pilot's orders sold.
 *
 * Edge-triggered like `diffPriceAlertTriggered`: a Low item stays Low for many
 * polls, so only the crossing reports. The identity is (list, type, Stock
 * Target) — an item the pilot just added or whose Stock Target they just
 * changed has no counterpart in the previous poll and stays quiet, because the
 * pilot is looking at that number as they set it.
 */
import { stockStatus, type StockStatus } from './stockRows';

export interface StockAlertEntry {
  listId: string;
  listName: string;
  /** The market's station or structure: what the alert opens. */
  locationId: number;
  typeId: number;
  name: string;
  target: number;
  /** Units listed at the market. Null when nothing is cached yet: never guessed as zero. */
  listed: number | null;
  /** Units in the hangar at the market's station, for the alert to point at. */
  inHangar: number;
}

export interface StockAlertSnapshot {
  entries: readonly StockAlertEntry[];
  nowMs: number;
}

export interface StockBelowTargetFire {
  eventId: 'stockBelowTarget';
  characterId: number;
  listId: string;
  listName: string;
  locationId: number;
  typeId: number;
  name: string;
  target: number;
  listed: number;
  inHangar: number;
  status: Extract<StockStatus, 'low' | 'out'>;
}

const SEVERITY: Record<StockStatus, number> = { over: 0, ok: 0, low: 1, out: 2 };

const key = (entry: StockAlertEntry) => `${entry.listId}:${entry.typeId}:${entry.target}`;

export function diffStockBelowTarget(
  characterId: number,
  prev: StockAlertSnapshot | undefined,
  next: StockAlertSnapshot
): StockBelowTargetFire[] {
  if (!prev) return [];
  const prevByKey = new Map(prev.entries.map((entry) => [key(entry), entry]));
  const fires: StockBelowTargetFire[] = [];
  for (const entry of next.entries) {
    if (entry.listed === null) continue;
    const status = stockStatus(entry.listed, entry.target);
    if (status !== 'low' && status !== 'out') continue;
    const before = prevByKey.get(key(entry));
    if (before === undefined || before.listed === null) continue;
    if (SEVERITY[stockStatus(before.listed, before.target)] >= SEVERITY[status]) continue;
    fires.push({
      eventId: 'stockBelowTarget',
      characterId,
      listId: entry.listId,
      listName: entry.listName,
      locationId: entry.locationId,
      typeId: entry.typeId,
      name: entry.name,
      target: entry.target,
      listed: entry.listed,
      inHangar: entry.inHangar,
      status,
    });
  }
  return fires;
}
