import { utcDay } from './timeConstants.js';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { commitInBatches } from './commitInBatches.js';
import { FEEDER_VIEWS } from './corpTaxBook.js';
import { dbReader, readNotices } from './corpTaxBookLateNoticeStore.js';
import {
  BOOK_DEFAULTS,
  accrueValuedDays,
  deriveModeChanges,
  deriveOwnerRateHistory,
  effectiveOwnerRatePct,
  feederBalance,
  feederBillableRule,
  isDayCovered,
  oreFormTypeId,
  type CoveragePeriod,
  type FeederModeChange,
  type FeederPayout,
  type OwnerRateEntry,
  type Payee,
  moonOwnerUnitPrice,
  FEEDER_VIEW_RULES,
  latestOwnerRate,
} from './corpTaxBookEngine.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';
import { COMPRESSED_ORE_TYPE_IDS } from './data/compressedOreTypeIds.js';
import { SNAPSHOT_HUBS } from './marketOpenPrices.js';
import { readFeederRows } from './corpTaxBookFeederRollup.js';
import { bookRef, feederRef, type BookDeps, type OpenPricesReader } from './corpTaxBookStore.js';

export const FEEDER_COVERAGE = 'feederCoverage';

export interface MemberCoverageDoc {
  coveragePeriods: CoveragePeriod[];
  lastReadWellAt?: number;
}

export function memberCoverageOf(
  record: Pick<FeederRecord, 'coveragePeriods' | 'lastReadWellAt'>
): MemberCoverageDoc {
  return {
    coveragePeriods: record.coveragePeriods.map((p) => ({
      from: p.from,
      ...(p.to !== undefined ? { to: p.to } : {}),
    })),
    ...(typeof record.lastReadWellAt === 'number' ? { lastReadWellAt: record.lastReadWellAt } : {}),
  };
}

export async function writeMemberCoverage(
  db: Firestore,
  collector: number,
  feeder: number,
  record: FeederRecord | undefined
): Promise<void> {
  const ref = bookRef(db, collector).collection(FEEDER_COVERAGE).doc(String(feeder));
  if (record) await ref.set(memberCoverageOf(record));
  else await ref.delete();
}

export async function refreshMemberCoverage(
  db: Firestore,
  collector: number,
  feeder: number
): Promise<void> {
  try {
    const snap = await feederRef(db, collector, feeder).get();
    await writeMemberCoverage(db, collector, feeder, snap.data() as FeederRecord | undefined);
  } catch (e) {
    console.error('member coverage not written', e instanceof Error ? e.message : e);
  }
}

export interface FeederViewSummary {
  schemaVersion: 1;
  rulesVersion?: number;
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
  pendingValueIsk?: number;
  paidIsk: number;
  balanceKind: 'owed' | 'credit' | 'even' | 'none';
  balanceIsk: number;
  lastPayout: { date: string; amount: number } | null;
  refineryCount: number;
  refineryIds: number[];
  unpricedDays: number;
  dismissedAt: number | null;
  removalStartedAt?: number | null;
  removalEffectiveAt?: number | null;
  payee?: Payee | null;
  payeeSetBy?: { side: 'accounting' | 'moon-owner'; at: number } | null;
  refineryNamesGranted?: boolean;
  chunkOreGranted?: boolean;
  popSharingOptedOut?: boolean;
  contentHash?: string;
}

export interface FeederViewDayLine {
  characterId: number;
  structureId: number;
  typeId: number;
  volume: number;
  quantity: number;
}

export interface FeederViewDay {
  date: string;
  lines: FeederViewDayLine[];
}

export interface FeederViewRefinery {
  structureId: number;
  label: string | null;
  labelSetAt: string | null;
  solarSystemId: number | null;
  structureName: null | string;
}

export interface FeederViewPayout {
  id: string;
  date: string;
  amount: number;
  method: 'donation' | 'other';
  status: 'recorded' | 'waiting-for-journal' | 'matched';
  disputed?: true;
}

export interface FeederViewerAccess {
  uid: string;
  characterId: number;
  ownerHash: string;
  corporationId: number;
  canView: true;
  canEdit: boolean;
  checkedAt: number;
  expiresAt: number;
}

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

export interface SidePrices {
  buy: number | null;
  sell: number | null;
}

export function hubStationId(hubId: string): number {
  return (SNAPSHOT_HUBS.find((h) => h.id === hubId) ?? SNAPSHOT_HUBS[0]).stationId;
}

export const priceKey = (typeId: number, date: string) => `${typeId}:${date}`;

const isNumberOrNullArray = (v: unknown): v is (number | null)[] =>
  Array.isArray(v) && v.every((x) => x === null || typeof x === 'number');

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
  | 'removal'
  | 'payee'
  | 'payeeSetBy'
  | 'refineryLabels'
  | 'refinerySystems'
  | 'refineryStructures'
  | 'readsStructureNames'
  | 'readsNotifications'
  | 'popSharingOptOut'
>;

const iso = (ms: number) => new Date(ms).toISOString();

export { deriveModeChanges, deriveOwnerRateHistory };

export function appendRequestedRate(
  record: FeederViewRecord,
  pct: number,
  now: number
): OwnerRateEntry[] {
  const history = deriveOwnerRateHistory(record);
  const lastRequest = [...history].reverse().find((e) => e.kind === 'requested');
  if (lastRequest?.pct === pct) return history;
  return [...history, { kind: 'requested', pct, effectiveFrom: utcDay(now), recordedAt: iso(now) }];
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
  rows: readonly FeederViewRow[];
  prices: ReadonlyMap<string, SidePrices>;
  billedPrices?: ReadonlyMap<string, Readonly<Record<string, number>>>;
  payouts: readonly (FeederPayout & { id: string })[];
}

export interface FeederView {
  summary: FeederViewSummary;
  days: FeederViewDay[];
  refineries: FeederViewRefinery[];
  payouts: FeederViewPayout[];
}

const latestPct = (
  history: readonly OwnerRateEntry[],
  kind: OwnerRateEntry['kind'],
  today: string
) => latestOwnerRate(history, kind, today)?.pct ?? null;

const chargeKeyOf = (r: Pick<FeederViewRow, 'characterId' | 'structureId' | 'date'>) =>
  `${r.characterId}:${r.structureId}:${r.date}`;

export function buildFeederView(input: FeederViewInput): FeederView {
  const { record, now } = input;
  const today = utcDay(now);
  const history = deriveOwnerRateHistory(record);
  const modeChanges = deriveModeChanges(record);
  const compressed = input.oreForm === 'compressed';
  const isBillable = feederBillableRule(record.lastReadWellAt, input.graceHours);

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
      const set = record.refineryLabels?.[String(r.structureId)];
      refineries.set(r.structureId, {
        structureId: r.structureId,
        label: set?.label ?? null,
        labelSetAt: set?.setAt ?? null,
        solarSystemId: r.solarSystemId ?? null,
        structureName: null,
      });
    } else if (known.solarSystemId === null && r.solarSystemId !== undefined) {
      known.solarSystemId = r.solarSystemId;
    }
    if (!isDayCovered(record.coveragePeriods, r.date)) continue;
    const priced = oreFormTypeId(r.typeId, input.compressedByRaw, compressed);
    const billed = input.billedPrices?.get(chargeKeyOf(r))?.[String(r.typeId)];
    const unit = moonOwnerUnitPrice(input.prices.get(priceKey(priced, r.date)), billed);
    const value = r.quantity * unit;
    minedVolume += r.quantity;
    minedValueIsk += value;
    let day = dayMap.get(r.date);
    if (!day) dayMap.set(r.date, (day = { value: 0, unpriced: false, lines: new Map() }));
    day.value += value;
    if (unit <= 0) day.unpriced = true;
    const key = `${r.characterId}:${r.structureId}:${r.typeId}`;
    const line = day.lines.get(key) ?? {
      characterId: r.characterId,
      structureId: r.structureId,
      typeId: r.typeId,
      volume: 0,
      quantity: 0,
    };
    line.volume += r.quantity;
    line.quantity += r.quantity;
    day.lines.set(key, line);
  }

  const accrual = accrueValuedDays(
    [...dayMap].map(([date, d]) => ({ date, value: d.value })),
    { coveragePeriods: record.coveragePeriods, ownerRateHistory: history, modeChanges, isBillable }
  );
  let unpricedDays = 0;
  const days: FeederViewDay[] = [...dayMap]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      const billable = isBillable(date);
      if (billable && d.unpriced) unpricedDays += 1;
      return {
        date,
        lines: [...d.lines.values()].sort(
          (a, b) =>
            a.characterId - b.characterId || a.structureId - b.structureId || a.typeId - b.typeId
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
    rulesVersion: FEEDER_VIEW_RULES,
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
    pendingValueIsk: accrual.pending.reduce((sum, d) => sum + d.value, 0),
    paidIsk: counted.reduce((sum, p) => sum + p.amount, 0),
    balanceKind: display.kind,
    balanceIsk: display.isk,
    lastPayout: last ? { date: last.date, amount: last.amount } : null,
    refineryCount: refineries.size,
    refineryIds: [...refineries.keys()].sort((a, b) => a - b),
    unpricedDays,
    dismissedAt: record.viewDismissedAt ?? null,
    removalStartedAt:
      record.status === 'pending-removal' ? (record.removal?.startedAt ?? null) : null,
    removalEffectiveAt:
      record.status === 'pending-removal' ? (record.removal?.effectiveAt ?? null) : null,
    payee: record.payee ?? null,
    payeeSetBy: record.payeeSetBy
      ? { side: record.payeeSetBy.side, at: record.payeeSetBy.at }
      : null,
    refineryNamesGranted: record.readsStructureNames === true,
    ...(record.readsNotifications !== undefined
      ? { chunkOreGranted: record.readsNotifications }
      : {}),
    ...(record.popSharingOptOut ? { popSharingOptedOut: true } : {}),
  };
  return {
    summary,
    days,
    refineries: [...refineries.values()]
      .map((r) => {
        const looked = record.refineryStructures?.[String(r.structureId)];
        return {
          ...r,
          solarSystemId:
            r.solarSystemId ??
            looked?.solarSystemId ??
            record.refinerySystems?.[String(r.structureId)] ??
            null,
          structureName: looked?.name ?? null,
        };
      })
      .sort((a, b) => a.structureId - b.structureId),
    payouts: counted
      .map((p) => ({
        id: p.id,
        date: p.date,
        amount: p.amount,
        method: p.method,
        status: p.status,
        ...(p.disputedAt !== undefined ? { disputed: true as const } : {}),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  };
}

export function feederViewHash(view: FeederView): string {
  const summary: Partial<FeederViewSummary> = { ...view.summary };
  delete summary.builtAt;
  delete summary.contentHash;
  return createHash('sha256')
    .update(
      JSON.stringify([summary, view.days, view.refineries, view.payouts], (_k, v: unknown) =>
        v === undefined ? null : v
      )
    )
    .digest('hex');
}

const PRICE_READ_CONCURRENCY = 16;

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
  await commitInBatches(db, ops);
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

async function readBilledPrices(
  book: FirebaseFirestore.DocumentReference,
  rows: readonly FeederViewRow[],
  record: FeederRecord,
  prices: ReadonlyMap<string, SidePrices>,
  oreForm: 'compressed' | 'raw'
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  const keys = new Set<string>();
  let earliest: string | undefined;
  for (const r of rows) {
    if (!isDayCovered(record.coveragePeriods, r.date)) continue;
    const priced = oreFormTypeId(r.typeId, COMPRESSED_ORE_TYPE_IDS, oreForm === 'compressed');
    if (moonOwnerUnitPrice(prices.get(priceKey(priced, r.date))) > 0) continue;
    keys.add(chargeKeyOf(r));
    if (earliest === undefined || r.date < earliest) earliest = r.date;
  }
  if (earliest === undefined) return out;
  const since = earliest;
  const notices = await readNotices(dbReader(book.firestore), book, (collection) =>
    collection.where('issuedAt', '>=', since)
  );
  for (const notice of notices) {
    for (const line of notice.lines) {
      if (!keys.has(line.key) || out.has(line.key) || !line.unitPrices) continue;
      out.set(line.key, line.unitPrices);
    }
  }
  return out;
}

export async function rebuildFeederView(
  deps: BookDeps,
  collector: number,
  feeder: number
): Promise<boolean> {
  const book = bookRef(deps.db, collector);
  const recordRef = feederRef(deps.db, collector, feeder);
  const [bookSnap, recordSnap, rows, payoutSnap] = await Promise.all([
    book.get(),
    recordRef.get(),
    readFeederRows(deps.db, book, feeder),
    recordRef.collection(FEEDER_VIEW_PAYOUTS).get(),
  ]);
  const record = recordSnap.data() as FeederRecord | undefined;
  await writeMemberCoverage(deps.db, collector, feeder, record);
  if (!record) return false;

  const oreForm = bookSnap.get('oreForm') === 'raw' ? 'raw' : BOOK_DEFAULTS.oreForm;
  const hubId = bookSnap.get('hubId');
  const graceHours = Number(bookSnap.get('graceHours') ?? BOOK_DEFAULTS.graceHours);
  const name = bookSnap.get('corporationName');

  const pricedTypes = new Set<number>();
  for (const r of rows) {
    if (!isDayCovered(record.coveragePeriods, r.date)) continue;
    pricedTypes.add(oreFormTypeId(r.typeId, COMPRESSED_ORE_TYPE_IDS, oreForm === 'compressed'));
  }
  if (!deps.openPrices) throw new Error('rebuildFeederView needs an open-prices reader');
  const prices = await loadPrices(
    deps.openPrices,
    [...pricedTypes],
    hubStationId(typeof hubId === 'string' ? hubId : BOOK_DEFAULTS.hubId)
  );

  const billedPrices = await readBilledPrices(book, rows, record, prices, oreForm);
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
    ...(billedPrices.size > 0 ? { billedPrices } : {}),
    payouts: payoutSnap.docs.map((d) => ({
      ...(d.data() as FeederPayout),
      notAPayout: d.get('notAPayout') === true,
      id: d.id,
    })),
  });

  const ref = feederViewRef(deps.db, collector, feeder);
  const contentHash = feederViewHash(view);
  if ((await ref.get()).get('contentHash') === contentHash) return true;
  const toDocs = <T extends object>(items: T[], id: (item: T) => string) =>
    new Map(items.map((item) => [id(item), item]));
  const synced = await Promise.allSettled([
    syncDocs(
      deps.db,
      ref.collection(FEEDER_VIEW_DAYS),
      toDocs(view.days, (d) => d.date)
    ),
    syncDocs(
      deps.db,
      ref.collection(FEEDER_VIEW_REFINERIES),
      toDocs(view.refineries, (r) => String(r.structureId))
    ),
    syncDocs(
      deps.db,
      ref.collection(FEEDER_VIEW_PAYOUTS),
      new Map(view.payouts.map(({ id, ...rest }) => [id, rest] as const))
    ),
  ]);
  const failed = synced.find((s) => s.status === 'rejected');
  if (failed) throw failed.reason;
  await ref.set({ ...view.summary, contentHash });
  return true;
}

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
