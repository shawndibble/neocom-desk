/**
 * What a stored Appraisal **Share Link** holds: the priced items exactly as the
 * sharer saw them, so the link shows the quote *at the time of the appraisal*
 * rather than whatever the market says when it is opened. Rebuilding the rows
 * and totals is `buildAppraisal`'s job, the same engine the live tab runs, so
 * only its inputs are stored — never derived figures that could drift from it.
 * The one resolved figure is each refinable item's `efficiency`: the sharer's
 * skills are not stored, so their outcome has to be, and the recipe and mineral
 * prices ride along so the refine figure is rebuilt by the same
 * `refineFromDetail` the live tab uses.
 *
 * Pure: the Firestore read/write around it lives in `features/share`.
 */
import { isFiniteNumber } from '../guards';
import { refineFromDetail, type AppraisalItem } from './appraisal';

export const APPRAISAL_SNAPSHOT_VERSION = 1;

/**
 * Far past any real hauling paste, and far under Firestore's 1 MiB doc limit
 * (~100 bytes an item). `firestore.rules` enforces the same cap.
 */
export const MAX_SNAPSHOT_ITEMS = 1000;

/**
 * Far past any item's reprocessing recipe (an ore returns three to nine
 * materials). With the items cap this keeps a share under Firestore's 1 MiB:
 * 1000 items x 16 x ~30 bytes is under 0.5 MB on top of the ~100 bytes an item.
 */
const MAX_REFINE_MATERIALS = 16;
/** Every mineral the whole paste refines into; the game has well under this many. */
const MAX_REFINE_MINERALS = 200;

/**
 * One item's refine inputs: the recipe and the yield already applied to it.
 * The sharer's skills are not here and are never needed: the yield is the
 * sharer's own skills, facility and implant folded into one number.
 */
export interface AppraisalSnapshotRefineItem {
  portionSize: number;
  materials: { typeId: number; quantity: number }[];
  efficiency: number;
}

/** The refine setup behind the items' refine inputs, and the minerals' prices as quoted. */
export interface AppraisalSnapshotRefine {
  /** The facility's own yield, a fraction, before skills. */
  yieldRate: number;
  /** The facility's fee, a fraction of the refined value. */
  taxRate: number;
  /** Every mineral the items refine into, priced at 100% of the hub's buy side. */
  minerals: { typeId: number; name: string; price: number | null }[];
}

export interface AppraisalSnapshotItem {
  typeId: number;
  name: string;
  quantity: number;
  /** Per unit, at 100% — the `AppraisalItem` convention. */
  buy: number | null;
  sell: number | null;
  /** Null, never absent: Firestore refuses `undefined`. */
  unitVolume: number | null;
  /** Absent (not null) where the item has no reprocessing data; added later, so an older link has none. */
  refine?: AppraisalSnapshotRefineItem;
}

export interface AppraisalSnapshot {
  v: typeof APPRAISAL_SNAPSHOT_VERSION;
  /** A `TradeHub` id; resolved (and possibly unknown to an older build) by the caller. */
  hub: string;
  pricePercent: number;
  /** Epoch seconds the appraisal was priced at. */
  generatedAt: number;
  items: AppraisalSnapshotItem[];
  /** Absent on a link made before refine travelled with it, or where nothing refines. */
  refine?: AppraisalSnapshotRefine;
}

export type BuildAppraisalSnapshotResult =
  { ok: true; value: AppraisalSnapshot } | { ok: false; reason: 'empty' | 'too-large' };

export function buildAppraisalSnapshot(input: {
  hub: string;
  pricePercent: number;
  generatedAt: number;
  items: readonly AppraisalItem[];
  /** The Refining Setup the items' refine figures were worked out at. */
  refining?: { yieldRate: number; taxRate: number };
  /** Mineral type id -> name, for the minerals the refine breakdown lists. */
  mineralNames?: ReadonlyMap<number, string>;
}): BuildAppraisalSnapshotResult {
  if (input.items.length === 0) return { ok: false, reason: 'empty' };
  if (input.items.length > MAX_SNAPSHOT_ITEMS) return { ok: false, reason: 'too-large' };
  const mineralPrices = new Map<number, number | null>();
  const items = input.items.map((item): AppraisalSnapshotItem => {
    const base: AppraisalSnapshotItem = {
      typeId: item.typeId,
      name: item.name,
      quantity: item.quantity,
      buy: item.buy,
      sell: item.sell,
      unitVolume: item.unitVolume ?? null,
    };
    const detail = item.refine?.detail;
    if (!detail) return base;
    for (const material of detail.materials) {
      const price = detail.materialPrices[material.typeId] ?? null;
      if (!mineralPrices.has(material.typeId) || mineralPrices.get(material.typeId) === null) {
        mineralPrices.set(material.typeId, price);
      }
    }
    return {
      ...base,
      refine: {
        portionSize: detail.portionSize,
        materials: detail.materials.map((m) => ({ typeId: m.typeId, quantity: m.quantity })),
        efficiency: detail.efficiency,
      },
    };
  });
  const value: AppraisalSnapshot = {
    v: APPRAISAL_SNAPSHOT_VERSION,
    hub: input.hub,
    pricePercent: input.pricePercent,
    generatedAt: input.generatedAt,
    items,
  };
  if (input.refining && mineralPrices.size > 0) {
    value.refine = {
      yieldRate: input.refining.yieldRate,
      taxRate: input.refining.taxRate,
      minerals: [...mineralPrices].map(([typeId, price]) => ({
        typeId,
        name: input.mineralNames?.get(typeId) ?? '',
        price,
      })),
    };
  }
  return { ok: true, value };
}

function isPrice(value: unknown): value is number | null {
  return value === null || (isFiniteNumber(value) && value >= 0);
}

function parseRefineItem(raw: unknown): AppraisalSnapshotRefineItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const refine = raw as Record<string, unknown>;
  if (!Number.isInteger(refine.portionSize) || (refine.portionSize as number) <= 0) return null;
  if (!isFiniteNumber(refine.efficiency) || refine.efficiency < 0) return null;
  if (!Array.isArray(refine.materials) || refine.materials.length > MAX_REFINE_MATERIALS) {
    return null;
  }
  const materials: AppraisalSnapshotRefineItem['materials'] = [];
  for (const material of refine.materials as unknown[]) {
    if (typeof material !== 'object' || material === null) return null;
    const { typeId, quantity } = material as Record<string, unknown>;
    if (!Number.isInteger(typeId) || (typeId as number) <= 0) return null;
    if (!Number.isInteger(quantity) || (quantity as number) <= 0) return null;
    materials.push({ typeId: typeId as number, quantity: quantity as number });
  }
  return { portionSize: refine.portionSize as number, materials, efficiency: refine.efficiency };
}

function parseRefine(raw: unknown): AppraisalSnapshotRefine | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const refine = raw as Record<string, unknown>;
  if (!isFiniteNumber(refine.yieldRate) || refine.yieldRate < 0) return null;
  if (!isFiniteNumber(refine.taxRate) || refine.taxRate < 0 || refine.taxRate > 1) return null;
  if (!Array.isArray(refine.minerals) || refine.minerals.length > MAX_REFINE_MINERALS) return null;
  const minerals: AppraisalSnapshotRefine['minerals'] = [];
  for (const mineral of refine.minerals as unknown[]) {
    if (typeof mineral !== 'object' || mineral === null) return null;
    const { typeId, name, price } = mineral as Record<string, unknown>;
    if (!Number.isInteger(typeId) || (typeId as number) <= 0) return null;
    if (typeof name !== 'string' || !isPrice(price)) return null;
    minerals.push({ typeId: typeId as number, name, price });
  }
  return { yieldRate: refine.yieldRate, taxRate: refine.taxRate, minerals };
}

function parseItem(raw: unknown): AppraisalSnapshotItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (!Number.isInteger(item.typeId) || (item.typeId as number) <= 0) return null;
  if (typeof item.name !== 'string') return null;
  if (!Number.isInteger(item.quantity) || (item.quantity as number) <= 0) return null;
  if (!isPrice(item.buy) || !isPrice(item.sell) || !isPrice(item.unitVolume)) return null;
  const parsed: AppraisalSnapshotItem = {
    typeId: item.typeId as number,
    name: item.name,
    quantity: item.quantity as number,
    buy: item.buy,
    sell: item.sell,
    unitVolume: item.unitVolume,
  };
  const refine = item.refine === undefined ? null : parseRefineItem(item.refine);
  if (refine) parsed.refine = refine;
  return parsed;
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
  const snapshot: AppraisalSnapshot = {
    v: APPRAISAL_SNAPSHOT_VERSION,
    hub: data.hub,
    pricePercent: data.pricePercent,
    generatedAt: data.generatedAt,
    items,
  };
  // The refine figures are an extra: a malformed set reads as none, never as a bad link,
  // since the prices above are still right. Both halves or neither: an item's recipe
  // is no use without the setup and the mineral prices.
  const refine = data.refine === undefined ? null : parseRefine(data.refine);
  if (refine) snapshot.refine = refine;
  else for (const item of snapshot.items) delete item.refine;
  return snapshot;
}

/**
 * The snapshot's items as the engine's `AppraisalItem`s, each with the refine
 * figure the sharer saw rebuilt from the stored recipe, yield and prices. An
 * item without a stored recipe, or a snapshot without its refine setup, has
 * none.
 */
export function appraisalItemsFromSnapshot(snapshot: AppraisalSnapshot): AppraisalItem[] {
  const refine = snapshot.refine;
  const priceOf = new Map<number, number>();
  for (const mineral of refine?.minerals ?? []) {
    if (mineral.price !== null) priceOf.set(mineral.typeId, mineral.price);
  }
  return snapshot.items.map((item) => {
    const { refine: stored, ...rest } = item;
    if (!refine || !stored) return rest;
    const materialPrices: Record<number, number> = {};
    for (const material of stored.materials) {
      const price = priceOf.get(material.typeId);
      if (price !== undefined) materialPrices[material.typeId] = price;
    }
    return {
      ...rest,
      refine: refineFromDetail(
        item.quantity,
        {
          portionSize: stored.portionSize,
          materials: stored.materials,
          efficiency: stored.efficiency,
          materialPrices,
        },
        refine.taxRate
      ),
    };
  });
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
  return JSON.stringify([
    snapshot.hub,
    snapshot.pricePercent,
    snapshot.items,
    snapshot.refine ?? null,
  ]);
}
