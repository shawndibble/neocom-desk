/**
 * What a stored Appraisal **Share Link** holds: the priced items exactly as the
 * sharer saw them, so the link shows the quote *at the time of the appraisal*
 * rather than whatever the market says when it is opened. Rebuilding the rows
 * and totals is `buildAppraisal`'s job, the same engine the live tab runs, so
 * only its inputs are stored — never derived figures that could drift from it.
 *
 * Pure: the Firestore read/write around it lives in `features/share`.
 */
import type { AppraisalItem } from './appraisal';

export const APPRAISAL_SNAPSHOT_VERSION = 1;

/**
 * Far past any real hauling paste, and far under Firestore's 1 MiB doc limit
 * (~100 bytes an item). `firestore.rules` enforces the same cap.
 */
export const MAX_SNAPSHOT_ITEMS = 1000;

export interface AppraisalSnapshotItem {
  typeId: number;
  name: string;
  quantity: number;
  /** Per unit, at 100% — the `AppraisalItem` convention. */
  buy: number | null;
  sell: number | null;
  /** Null, never absent: Firestore refuses `undefined`. */
  unitVolume: number | null;
}

export interface AppraisalSnapshot {
  v: typeof APPRAISAL_SNAPSHOT_VERSION;
  /** A `TradeHub` id; resolved (and possibly unknown to an older build) by the caller. */
  hub: string;
  pricePercent: number;
  /** Epoch seconds the appraisal was priced at. */
  generatedAt: number;
  items: AppraisalSnapshotItem[];
}

export type BuildAppraisalSnapshotResult =
  { ok: true; value: AppraisalSnapshot } | { ok: false; reason: 'empty' | 'too-large' };

export function buildAppraisalSnapshot(input: {
  hub: string;
  pricePercent: number;
  generatedAt: number;
  items: readonly AppraisalItem[];
}): BuildAppraisalSnapshotResult {
  if (input.items.length === 0) return { ok: false, reason: 'empty' };
  if (input.items.length > MAX_SNAPSHOT_ITEMS) return { ok: false, reason: 'too-large' };
  return {
    ok: true,
    value: {
      v: APPRAISAL_SNAPSHOT_VERSION,
      hub: input.hub,
      pricePercent: input.pricePercent,
      generatedAt: input.generatedAt,
      items: input.items.map((item) => ({
        typeId: item.typeId,
        name: item.name,
        quantity: item.quantity,
        buy: item.buy,
        sell: item.sell,
        unitVolume: item.unitVolume ?? null,
      })),
    },
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPrice(value: unknown): value is number | null {
  return value === null || (isFiniteNumber(value) && value >= 0);
}

function parseItem(raw: unknown): AppraisalSnapshotItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (!Number.isInteger(item.typeId) || (item.typeId as number) <= 0) return null;
  if (typeof item.name !== 'string') return null;
  if (!Number.isInteger(item.quantity) || (item.quantity as number) <= 0) return null;
  if (!isPrice(item.buy) || !isPrice(item.sell) || !isPrice(item.unitVolume)) return null;
  return {
    typeId: item.typeId as number,
    name: item.name,
    quantity: item.quantity as number,
    buy: item.buy,
    sell: item.sell,
    unitVolume: item.unitVolume,
  };
}

/**
 * Validates a snapshot read back from Firestore. Anyone signed in can write a
 * share, so the stored shape is checked here as well as in the rules — a
 * malformed doc reads as an invalid link, never as a crash.
 */
export function parseAppraisalSnapshot(raw: unknown): AppraisalSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.v !== APPRAISAL_SNAPSHOT_VERSION) return null;
  if (typeof data.hub !== 'string') return null;
  if (!isFiniteNumber(data.pricePercent) || !isFiniteNumber(data.generatedAt)) return null;
  if (!Array.isArray(data.items) || data.items.length > MAX_SNAPSHOT_ITEMS) return null;
  const items: AppraisalSnapshotItem[] = [];
  for (const raw of data.items) {
    const item = parseItem(raw);
    if (item === null) return null;
    items.push(item);
  }
  return {
    v: APPRAISAL_SNAPSHOT_VERSION,
    hub: data.hub,
    pricePercent: data.pricePercent,
    generatedAt: data.generatedAt,
    items,
  };
}

/**
 * The snapshot as Appraisal paste text — one `name<TAB>quantity` line per item,
 * the shape EVE's own inventory copy uses — for "Open in Neocom Desk" to fill
 * the live tab with. No thousands separators: the parser reads digits.
 */
export function appraisalSnapshotPasteText(snapshot: AppraisalSnapshot): string {
  return snapshot.items.map((item) => `${item.name}\t${item.quantity}`).join('\n');
}

/**
 * The snapshot's content, minus when it was priced: equal for the same
 * appraisal shared twice, so the second press reuses the first link
 * (`features/share/shareStore.ts`). Any change of hub, percent, item,
 * quantity or price gives a new key, and so a new link.
 */
export function appraisalSnapshotReuseKey(snapshot: AppraisalSnapshot): string {
  return JSON.stringify([snapshot.hub, snapshot.pricePercent, snapshot.items]);
}
