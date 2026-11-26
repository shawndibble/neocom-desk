import { stockStatus, type StockStatus } from './stockRows';

export interface StockAlertEntry {
  listId: string;
  listName: string;
  locationId: number;
  typeId: number;
  name: string;
  target: number;
  listed: number | null;
  inHangar: number;
  inJobs?: number;
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
  inJobs: number;
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
      inJobs: entry.inJobs ?? 0,
      status,
    });
  }
  return fires;
}
