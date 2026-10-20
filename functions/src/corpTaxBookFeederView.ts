// The feeder view (issue #4512, spec #4504): the read model a moon owner sees, written by the
// server only. Layout, all under `corpTaxBooks/{collector}/feederViews/{feederCorp}`:
//
//   (doc)              FeederViewSummary
//   days/{date}        FeederViewDay: one covered UTC day
//   refineries/{id}    FeederViewRefinery
//   payouts/{id}       FeederViewPayout (a "not a payout" row is left out)
//   viewers/{uid}      FeederViewerAccess: the 24h access record the rules check (never the book's `officers`)
//
// It holds no miner debts, statements, miner rate or margin. `buildFeederView` is pure;
// `rebuildFeederView` reads the book and writes the diff. Rebuilt on every ledger read, rate
// request, leave and dismissal (and later payouts and agreed rates: call
// `rebuildFeederView` / `tryRebuildFeederView` from those writers).

import { isDeepStrictEqual } from 'node:util';
import type { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { FEEDERS, FEEDER_VIEWS, OBSERVED, utcDate } from './corpTaxBook.js';
import {
  BOOK_DEFAULTS,
  accrueValuedDays,
  dayClosesAt,
  effectiveOwnerRatePct,
  feederBalance,
  isDayCovered,
  oreFormTypeId,
  type CoveragePeriod,
  type FeederModeChange,
  type FeederPayout,
  type OwnerRateEntry,
} from './corpTaxBookEngine.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';
import { COMPRESSED_ORE_TYPE_IDS } from './data/compressedOreTypeIds.js';
import { SNAPSHOT_HUBS } from './marketOpenPrices.js';
import { bookRef, type BookDeps, type OpenPricesReader } from './corpTaxBookStore.js';

// --- Stored shapes -----------------------------------------------------------

export interface FeederViewSummary {
  schemaVersion: 1;
  feederCorporationId: number;
  collectorCorporationId: number;
  collectorName: string | null;
  status: FeederRecord['status'];
  mode: 'normal' | 'settled-otherwise';
  note: string | null;
  builtAt: number;
  coverageFrom: string | null;
  coverageTo: string | null;
  leftAt: number | null;
  lastReadWellAt: number | null;
  staleSince: number | null;
  effectiveRatePct: number | null;
  requestedRatePct: number | null;
  agreedRatePct: number | null;
  rateHistory: OwnerRateEntry[];
  minedVolume: number;
  minedValueIsk: number;
  accruedIsk: number;
  paidIsk: number;
  balanceKind: 'owed' | 'credit' | 'even' | 'none';
  balanceIsk: number;
  lastPayout: { date: string; amount: number } | null;
  refineryCount: number;
  unpricedDays: number;
  dismissedAt: number | null;
}

export interface FeederViewDayLine {
  characterId: number;
  structureId: number;
  volume: number;
  valueIsk: number;
}

export interface FeederViewDay {
  date: string;
  billable: boolean;
  pct: number | null;
  dueIsk: number;
  valueIsk: number;
  lines: FeederViewDayLine[];
}

export interface FeederViewRefinery {
  structureId: number;
  label: string | null;
  solarSystemId: number | null;
}

export interface FeederViewPayout {
  id: string;
  date: string;
  amount: number;
  method: 'donation' | 'other';
  status: 'recorded' | 'waiting-for-journal' | 'matched';
}

/** `feederViews/{feeder}/viewers/{uid}`: what firestore.rules reads to let a moon owner in. */
export interface FeederViewerAccess {
  uid: string;
  characterId: number;
  ownerHash: string;
  /** The moon owner's corporation, which must equal the feeder id in the path. */
  corporationId: number;
  canView: true;
  canEdit: boolean;
  checkedAt: number;
  expiresAt: number;
}

/** What a moon owner's officer is told after the access check. */
export interface FeederViewAccessResult {
  collectorCorporationId: number;
  expiresAt: number;
  canEdit: boolean;
}

export const FEEDER_VIEW_DAYS = 'days';
export const FEEDER_VIEW_REFINERIES = 'refineries';
export const FEEDER_VIEW_PAYOUTS = 'payouts';
export const FEEDER_VIEW_VIEWERS = 'viewers';

export const feederViewRef = (db: Firestore, collector: number, feeder: number) =>
  bookRef(db, collector).collection(FEEDER_VIEWS).doc(String(feeder));

// --- Pure pieces -------------------------------------------------------------

export interface SidePrices {
  buy: number | null;
  sell: number | null;
}

/** The Corp Tax Book's hub id as its station (the Trade Hubs mirror), Jita when unknown. */
export function hubStationId(hubId: string): number {
  return (SNAPSHOT_HUBS.find((h) => h.id === hubId) ?? SNAPSHOT_HUBS[0]).stationId;
}

export const priceKey = (typeId: number, date: string) => `${typeId}:${date}`;

const isNumberOrNullArray = (v: unknown): v is (number | null)[] =>
  Array.isArray(v) && v.every((x) => x === null || typeof x === 'number');

/** One R2 open-prices object as the station's end-of-day buy and sell by date; malformed gives nothing. */
export function parseOpenPriceDays(body: unknown, stationId: number): Map<string, SidePrices> {
  const out = new Map<string, SidePrices>();
  if (typeof body !== 'object' || body === null) return out;
  const { dates, stations } = body as { dates?: unknown; stations?: unknown };
  if (!Array.isArray(dates) || typeof stations !== 'object' || stations === null) return out;
  const series = (stations as Record<string, unknown>)[String(stationId)];
  if (typeof series !== 'object' || series === null) return out;
  const { buy, sell } = series as { buy?: unknown; sell?: unknown };
  if (!isNumberOrNullArray(buy) || !isNumberOrNullArray(sell)) return out;
  dates.forEach((date, i) => {
    if (typeof date !== 'string') return;
    const b = buy[i] ?? null;
    const s = sell[i] ?? null;
    if (b !== null || s !== null) out.set(date, { buy: b, sell: s });
  });
  return out;
}

/** What the view reads of a feeder record. */
export type FeederViewRecord = Pick<
  FeederRecord,
  | 'status'
  | 'mode'
  | 'joinedAt'
  | 'coveragePeriods'
  | 'note'
  | 'leftAt'
  | 'lastReadWellAt'
  | 'staleSince'
  | 'requestedRatePct'
  | 'agreedRatePct'
  | 'ownerRateHistory'
  | 'modeChanges'
  | 'viewDismissedAt'
>;

const iso = (ms: number) => new Date(ms).toISOString();

/** The record's rate history, or entries derived from its two rate fields (dated the join day; none invented earlier). */
export function deriveOwnerRateHistory(record: FeederViewRecord): OwnerRateEntry[] {
  if (record.ownerRateHistory) return record.ownerRateHistory;
  const effectiveFrom = utcDate(record.joinedAt);
  const recordedAt = iso(record.joinedAt);
  const out: OwnerRateEntry[] = [];
  if (record.requestedRatePct !== undefined) {
    out.push({ kind: 'requested', pct: record.requestedRatePct, effectiveFrom, recordedAt });
  }
  if (record.agreedRatePct !== undefined) {
    out.push({ kind: 'agreed', pct: record.agreedRatePct, effectiveFrom, recordedAt });
  }
  return out;
}

/** The record's mode switches, or settled-otherwise from the join day when only `mode` says so. */
export function deriveModeChanges(record: FeederViewRecord): FeederModeChange[] {
  if (record.modeChanges) return record.modeChanges;
  return record.mode === 'settled-otherwise'
    ? [{ from: utcDate(record.joinedAt), mode: 'settled-otherwise' }]
    : [];
}

/** The history with a requested rate dated today. A request never changes the effective rate once one is agreed. */
export function appendRequestedRate(
  record: FeederViewRecord,
  pct: number,
  now: number
): OwnerRateEntry[] {
  const history = deriveOwnerRateHistory(record);
  const lastRequest = [...history].reverse().find((e) => e.kind === 'requested');
  // Re-sending the standing request adds nothing to the history.
  if (lastRequest?.pct === pct) return history;
  return [
    ...history,
    { kind: 'requested', pct, effectiveFrom: utcDate(now), recordedAt: iso(now) },
  ];
}

export interface FeederViewRow {
  structureId: number;
  characterId: number;
  typeId: number;
  date: string;
  quantity: number;
  solarSystemId?: number;
}

export interface FeederViewInput {
  now: number;
  feederCorporationId: number;
  collectorCorporationId: number;
  collectorName: string | null;
  record: FeederViewRecord;
  graceHours: number;
  oreForm: 'compressed' | 'raw';
  compressedByRaw: Readonly<Record<string, number>>;
  /** Observed rows the feeder's refineries recorded, every day. */
  rows: readonly FeederViewRow[];
  /** The hub station's end-of-day prices, by `priceKey(oreFormTypeId, date)`. */
  prices: ReadonlyMap<string, SidePrices>;
  payouts: readonly (FeederPayout & { id: string })[];
}

export interface FeederView {
  summary: FeederViewSummary;
  days: FeederViewDay[];
  refineries: FeederViewRefinery[];
  payouts: FeederViewPayout[];
}

/** A day's open buy at the hub, else its open sell, else 0 (unpriced). */
function unitPrice(prices: SidePrices | undefined): number {
  if (prices?.buy != null && prices.buy > 0) return prices.buy;
  if (prices?.sell != null && prices.sell > 0) return prices.sell;
  return 0;
}

const latestPct = (
  history: readonly OwnerRateEntry[],
  kind: OwnerRateEntry['kind'],
  today: string
) =>
  effectiveOwnerRatePct(
    history.filter((h) => h.kind === kind),
    today
  ) ?? null;

export function buildFeederView(input: FeederViewInput): FeederView {
  const { record, now } = input;
  const today = utcDate(now);
  const history = deriveOwnerRateHistory(record);
  const modeChanges = deriveModeChanges(record);
  const compressed = input.oreForm === 'compressed';
  const lastRead = record.lastReadWellAt;
  const isBillable = (day: string) =>
    lastRead !== undefined && lastRead >= Date.parse(dayClosesAt(day, input.graceHours));

  interface DayAcc {
    value: number;
    unpriced: boolean;
    lines: Map<string, FeederViewDayLine>;
  }
  const dayMap = new Map<string, DayAcc>();
  const refineries = new Map<number, FeederViewRefinery>();
  let minedVolume = 0;
  let minedValueIsk = 0;
  for (const r of input.rows) {
    const known = refineries.get(r.structureId);
    if (!known) {
      refineries.set(r.structureId, {
        structureId: r.structureId,
        label: null,
        solarSystemId: r.solarSystemId ?? null,
      });
    } else if (known.solarSystemId === null && r.solarSystemId !== undefined) {
      known.solarSystemId = r.solarSystemId;
    }
    if (!isDayCovered(record.coveragePeriods, r.date)) continue;
    const priced = oreFormTypeId(r.typeId, input.compressedByRaw, compressed);
    const unit = unitPrice(input.prices.get(priceKey(priced, r.date)));
    const value = r.quantity * unit;
    minedVolume += r.quantity;
    minedValueIsk += value;
    let day = dayMap.get(r.date);
    if (!day) dayMap.set(r.date, (day = { value: 0, unpriced: false, lines: new Map() }));
    day.value += value;
    if (unit <= 0) day.unpriced = true;
    const key = `${r.characterId}:${r.structureId}`;
    const line = day.lines.get(key) ?? {
      characterId: r.characterId,
      structureId: r.structureId,
      volume: 0,
      valueIsk: 0,
    };
    line.volume += r.quantity;
    line.valueIsk += value;
    day.lines.set(key, line);
  }

  const accrual = accrueValuedDays(
    [...dayMap].map(([date, d]) => ({ date, value: d.value })),
    { coveragePeriods: record.coveragePeriods, ownerRateHistory: history, modeChanges, isBillable }
  );
  const dueByDay = new Map(accrual.byDay.map((d) => [d.date, d.due]));
  let unpricedDays = 0;
  const days: FeederViewDay[] = [...dayMap]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      const billable = isBillable(date);
      if (billable && d.unpriced) unpricedDays += 1;
      return {
        date,
        billable,
        pct: effectiveOwnerRatePct(history, date) ?? null,
        dueIsk: dueByDay.get(date) ?? 0,
        valueIsk: d.value,
        lines: [...d.lines.values()].sort(
          (a, b) => a.characterId - b.characterId || a.structureId - b.structureId
        ),
      };
    });

  const counted = input.payouts.filter((p) => !p.notAPayout);
  const settledNow = modeChanges
    .filter((c) => c.from <= today)
    .reduce<FeederModeChange | undefined>((l, c) => (!l || c.from >= l.from ? c : l), undefined);
  const { display } = feederBalance(
    accrual.accrued,
    input.payouts,
    settledNow?.mode === 'settled-otherwise'
  );
  const last = [...counted].sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount)[0];
  const periods: readonly CoveragePeriod[] = [...record.coveragePeriods].sort((a, b) =>
    a.from.localeCompare(b.from)
  );
  const lastPeriod = periods[periods.length - 1];

  const summary: FeederViewSummary = {
    schemaVersion: 1,
    feederCorporationId: input.feederCorporationId,
    collectorCorporationId: input.collectorCorporationId,
    collectorName: input.collectorName,
    status: record.status,
    mode: record.mode,
    note: record.mode === 'settled-otherwise' ? (record.note ?? null) : null,
    builtAt: now,
    coverageFrom: periods[0]?.from ?? null,
    coverageTo: lastPeriod?.to ?? null,
    leftAt: record.leftAt ?? null,
    lastReadWellAt: record.lastReadWellAt ?? null,
    staleSince: record.staleSince ?? null,
    effectiveRatePct: effectiveOwnerRatePct(history, today) ?? null,
    requestedRatePct: latestPct(history, 'requested', today),
    agreedRatePct: latestPct(history, 'agreed', today),
    rateHistory: [...history].sort(
      (a, b) =>
        a.effectiveFrom.localeCompare(b.effectiveFrom) || a.recordedAt.localeCompare(b.recordedAt)
    ),
    minedVolume,
    minedValueIsk,
    accruedIsk: accrual.accrued,
    paidIsk: counted.reduce((sum, p) => sum + p.amount, 0),
    balanceKind: display.kind,
    balanceIsk: display.isk,
    lastPayout: last ? { date: last.date, amount: last.amount } : null,
    refineryCount: refineries.size,
    unpricedDays,
    dismissedAt: record.viewDismissedAt ?? null,
  };
  return {
    summary,
    days,
    refineries: [...refineries.values()].sort((a, b) => a.structureId - b.structureId),
    payouts: counted
      .map((p) => ({
        id: p.id,
        date: p.date,
        amount: p.amount,
        method: p.method,
        status: p.status,
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  };
}

// --- Rebuild -----------------------------------------------------------------

/** Most observed rows one rebuild reads. */
export const VIEW_ROW_LIMIT = 100_000;
const PRICE_READ_CONCURRENCY = 16;
const BATCH_SIZE = 400;

/** Make `col` hold exactly `next`, writing only what differs. */
async function syncDocs(
  db: Firestore,
  col: CollectionReference,
  next: ReadonlyMap<string, object>
): Promise<void> {
  const existing = await col.get();
  const ops: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  const seen = new Set<string>();
  for (const d of existing.docs) {
    seen.add(d.id);
    const want = next.get(d.id);
    if (want === undefined) ops.push((b) => b.delete(d.ref));
    else if (!isDeepStrictEqual(d.data(), want)) ops.push((b) => b.set(d.ref, want));
  }
  for (const [id, data] of next) if (!seen.has(id)) ops.push((b) => b.set(col.doc(id), data));
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_SIZE)) op(batch);
    await batch.commit();
  }
}

async function loadPrices(
  read: OpenPricesReader,
  typeIds: readonly number[],
  stationId: number
): Promise<Map<string, SidePrices>> {
  const prices = new Map<string, SidePrices>();
  for (let i = 0; i < typeIds.length; i += PRICE_READ_CONCURRENCY) {
    const chunk = typeIds.slice(i, i + PRICE_READ_CONCURRENCY);
    const bodies = await Promise.all(chunk.map((t) => read(t)));
    chunk.forEach((typeId, n) => {
      for (const [date, p] of parseOpenPriceDays(bodies[n], stationId)) {
        prices.set(priceKey(typeId, date), p);
      }
    });
  }
  return prices;
}

/**
 * Read the book and write the feeder's view. Returns false when there is no feeder record.
 * Throws when a price read fails, leaving the earlier view untouched: a half-priced view would
 * understate what is owed.
 */
export async function rebuildFeederView(
  deps: BookDeps,
  collector: number,
  feeder: number
): Promise<boolean> {
  const book = bookRef(deps.db, collector);
  const [bookSnap, recordSnap, observed, payoutSnap] = await Promise.all([
    book.get(),
    book.collection(FEEDERS).doc(String(feeder)).get(),
    book
      .collection(OBSERVED)
      .where('sourceCorporationId', '==', feeder)
      .select('structureId', 'characterId', 'typeId', 'date', 'quantity', 'solarSystemId')
      .limit(VIEW_ROW_LIMIT)
      .get(),
    book.collection(FEEDERS).doc(String(feeder)).collection(FEEDER_VIEW_PAYOUTS).get(),
  ]);
  const record = recordSnap.data() as FeederRecord | undefined;
  if (!record) return false;

  const oreForm = bookSnap.get('oreForm') === 'raw' ? 'raw' : BOOK_DEFAULTS.oreForm;
  const hubId = bookSnap.get('hubId');
  const graceHours = Number(bookSnap.get('graceHours') ?? BOOK_DEFAULTS.graceHours);
  const name = bookSnap.get('corporationName');
  const rows = observed.docs.map((d) => d.data() as FeederViewRow);

  const pricedTypes = new Set<number>();
  for (const r of rows) {
    if (!isDayCovered(record.coveragePeriods, r.date)) continue;
    pricedTypes.add(oreFormTypeId(r.typeId, COMPRESSED_ORE_TYPE_IDS, oreForm === 'compressed'));
  }
  // No reader would price every day at 0 and overwrite a good view, so refuse instead.
  if (!deps.openPrices) throw new Error('rebuildFeederView needs an open-prices reader');
  const prices = await loadPrices(
    deps.openPrices,
    [...pricedTypes],
    hubStationId(typeof hubId === 'string' ? hubId : BOOK_DEFAULTS.hubId)
  );

  const view = buildFeederView({
    now: deps.now(),
    feederCorporationId: feeder,
    collectorCorporationId: collector,
    collectorName: typeof name === 'string' ? name : null,
    record,
    graceHours: Number.isFinite(graceHours) ? graceHours : BOOK_DEFAULTS.graceHours,
    oreForm,
    compressedByRaw: COMPRESSED_ORE_TYPE_IDS,
    rows,
    prices,
    payouts: payoutSnap.docs.map((d) => ({
      ...(d.data() as FeederPayout),
      notAPayout: d.get('notAPayout') === true,
      id: d.id,
    })),
  });

  const ref = feederViewRef(deps.db, collector, feeder);
  const toDocs = <T extends object>(items: T[], id: (item: T) => string) =>
    new Map(items.map((item) => [id(item), item]));
  await syncDocs(
    deps.db,
    ref.collection(FEEDER_VIEW_DAYS),
    toDocs(view.days, (d) => d.date)
  );
  await syncDocs(
    deps.db,
    ref.collection(FEEDER_VIEW_REFINERIES),
    toDocs(view.refineries, (r) => String(r.structureId))
  );
  await syncDocs(
    deps.db,
    ref.collection(FEEDER_VIEW_PAYOUTS),
    new Map(view.payouts.map(({ id, ...rest }) => [id, rest] as const))
  );
  await ref.set(view.summary);
  return true;
}

/** `rebuildFeederView` for writers that must not fail on it: the earlier view stays and the next trigger retries. */
export async function tryRebuildFeederView(
  deps: BookDeps,
  collector: number,
  feeder: number
): Promise<void> {
  try {
    await rebuildFeederView(deps, collector, feeder);
  } catch (e) {
    console.error('feeder view not rebuilt', e instanceof Error ? e.message : e);
  }
}
