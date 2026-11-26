import { utcDayOf } from '../../../functions/src/timeConstants';
import { computeAssignmentValue } from '../miningTax/valuation';
import { entryKey, type OreLine } from '../miningTax/types';
import { minusLines, priceMap } from '../miningTax/oreLines';
import type { RecordedWriteOff, TaxPayment } from './payments';
import {
  minerPaymentCode,
  paymentCode,
  type LateNotice,
} from '../../../functions/src/corpTaxBookLateNotice';
import type { RunningAccountCheckpoint } from '../../../functions/src/corpTaxBookCheckpoint';
import {
  isSameJournalTransfer,
  matchesStatedTransfer,
} from '../../../functions/src/corpTaxBookTransferMatch';
import { MinerRunningAccount, RESIDUE_ISK, type RunningAccountOwes } from './minerRunningAccount';
import type { ToleranceExemption } from './toleranceExemptions';
import type { BillableLine } from './billableLines';
import { splitAcrossBooks, resolveBookShare, type BookObservation } from './attribution';
import { dayClosesAt, isDayBillable } from './billable';
import { minerIdFor, type DayCharge, type Miner } from './charges';
import type { FeederCoverage } from './coverage';
import { activeDismissalFor, type Dismissal } from './dismissals';
import type { FeederReadClock } from './feederHealth';
import { settleOpenSet, type MinerSettlement } from './openSet';
import { observedEntryKey } from './observed';
import type { TaxRate, RateScope } from './rates';
import type { Adjustment } from './adjustments';
import type { DayPrices } from './valuation';
import type { ObservedMiningEntry } from './types';
import type { HeldPayment } from './docShapes';
import type { ClaimCheck, ClaimedTransfer, Declaration } from './overdue';
import { disputeHold, disputeKindOf, type DisputeKind, type OreDispute } from './disputes';
import { HOUR_MS, MINUTE_MS } from '@/lib/age';

export type BookRowState =
  'billed' | 'estimate' | 'conflict' | 'settling' | 'dismissed' | 'waived' | 'paid';
export type ConflictCause = 'otherPayee' | 'overListed' | 'ownNeedsReview' | 'ownerCollected';
export type BookLabelState = 'pending' | 'unattributed';

export interface PersonalAllocation {
  id?: string;
  payeeId: string;
  taxPct: number;
  oreLines: OreLine[];
  status: string;
  releasable?: boolean;
}

export interface PersonalEntry {
  characterId: number;
  date: string;
  solarSystemId: number;
  oreLines: OreLine[];
  freeOreLines: OreLine[];
  allocations: PersonalAllocation[];
}

export interface PersonalBook {
  corporationId: number;
  corpName: string;
  characterIds?: number[];
  startDate: string;
  graceHours?: number;
  lastSyncedAt?: string;
  donationsCheckedAt?: string | null;
  rates: TaxRate[];
  miners: Miner[];
  observed: ObservedMiningEntry[];
  dismissals: Dismissal[];
  notices: LateNotice[];
  payments: TaxPayment[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
  ownPayeeIds?: readonly string[];
  payeeCorporations?: Readonly<Record<string, number>>;
  pricesOn: (date: string) => Pick<DayPrices, 'prices' | 'sources'>;
  inFlight: InFlightDonation[];
  inReviewRefs?: readonly number[];
  structureNames?: Record<number, string>;
  feeders?: readonly (FeederCoverage & Pick<FeederReadClock, 'lastReadWellAt'>)[];
  declarations?: readonly Declaration[];
  disputes?: readonly OreDispute[];
  adjustments?: readonly Adjustment[];
  writeOffs?: readonly RecordedWriteOff[];
  toleranceExemptions?: readonly ToleranceExemption[];
  minerPaidThrough?: ReadonlyMap<string, string>;
  checkpoints?: ReadonlyMap<string, RunningAccountCheckpoint>;
}

export interface InFlightDonation {
  characterId: number;
  amount: number;
  at: string;
  refId?: number;
  stated?: true;
}

export interface UncreditedDonation extends InFlightDonation {
  covered: string[];
}

export const UNCREDITED_AFTER_HOURS = 2;

export interface BookOverlap {
  payeeIds: string[];
  ore: OreLine[];
  paid: boolean;
}

export interface BookCorrection {
  before: number;
  after: number;
  reasons: string[];
}

export interface BookDispute {
  quantity: boolean;
  rate: boolean;
  personalQuantity: number;
  bookQuantity: number;
  personalPct?: number;
  bookPct: number;
}

export interface MemberDeclaration {
  state: 'waiting' | 'confirmed' | 'rejected';
  at: string;
  amount?: number;
  reason?: string;
  nextStep?: string;
  note?: string;
  transfers?: ClaimedTransfer[];
  checks?: ClaimCheck[];
  byBook?: boolean;
}

export interface MemberFlag {
  state: 'sent' | 'rejected' | 'dismissed';
  kind: DisputeKind;
  at: string;
  reason?: string;
  nextStep?: string;
  said?: string;
  lines?: { typeId: number; quantity: number }[];
  claimedPct?: number;
}

export interface RowHold {
  until: string;
  kind: DisputeKind;
}

export const canDeclare = (declaration: MemberDeclaration | undefined) =>
  declaration === undefined || declaration.state === 'rejected';

export function declarationFor(
  noticeId: string,
  declarations: readonly Declaration[]
): MemberDeclaration | undefined {
  const latest = declarations
    .filter((d) => d.noticeId === noticeId)
    .reduce<Declaration | undefined>((a, d) => (a === undefined || d.at > a.at ? d : a), undefined);
  if (!latest) return undefined;
  const shared = {
    ...(latest.amount !== undefined ? { amount: latest.amount } : {}),
    ...(latest.note !== undefined ? { note: latest.note } : {}),
    ...(latest.transfers ? { transfers: latest.transfers } : {}),
    ...(latest.checks ? { checks: latest.checks } : {}),
  };
  if (!latest.resolution) return { state: 'waiting', at: latest.at, ...shared };
  const r = latest.resolution;
  return {
    state: r.kind,
    at: r.at,
    ...shared,
    ...(r.reason !== undefined ? { reason: r.reason } : {}),
    ...(r.nextStep !== undefined ? { nextStep: r.nextStep } : {}),
    ...(r.kind === 'confirmed' && r.by === 0 ? { byBook: true } : {}),
  };
}

export interface BookRowView {
  id: string;
  corporationId: number;
  corpName: string;
  characterId: number;
  date: string;
  solarSystemId: number;
  state: BookRowState;
  oreLines: OreLine[];
  personalOreLines?: OreLine[];
  unitPrices: Record<number, number>;
  priceSources: Record<number, string>;
  taxPct: number;
  rateScope: RateScope;
  rateEffectiveFrom?: string;
  estimatedValue: number;
  taxOwed: number | null;
  billed: number;
  noticeId?: string;
  dismissalReason?: string;
  resolvesAt?: string;
  conflictCause?: ConflictCause;
  ownerPayeeId?: string;
  dispute?: BookDispute;
  declaration?: MemberDeclaration;
  recordKey?: string;
  flagged?: MemberFlag;
  held?: RowHold;
  structureId?: number;
  refineryLabel?: string;
  minerId?: string;
  unlinkedDonation?: { amount: number; at: string };
  overlap?: BookOverlap;
  open?: true;
  final?: true;
  correction?: BookCorrection;
  forgivenIsk?: number;
  reversedCorrections?: { amount: number; reason: string; reversedReason: string }[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
}

export interface PersonalAccountStatus {
  paidThrough: string | null;
  owes: RunningAccountOwes | null;
}

export interface BookMinerRunningAccount {
  minerId: string;
  account: MinerRunningAccount;
  estimate?: number;
  lines: BillableLine[];
  notices: LateNotice[];
  payments: TaxPayment[];
  code: string;
}

export interface MemberNoticeView {
  noticeId: string;
  minerId: string;
  code: string;
  issuedAt: string;
  from: string;
  through: string;
  remaining: number;
  declaration?: MemberDeclaration;
}

export interface BookSummary {
  corporationId: number;
  corpName: string;
  startDate: string;
  lastSyncedAt?: string;
  closedThrough?: string;
  credit: number;
  estimate: number;
  account: PersonalAccountStatus;
  miners: BookMinerRunningAccount[];
  notices: MemberNoticeView[];
  uncredited: UncreditedDonation[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
}

export interface PersonalOverlay {
  rows: BookRowView[];
  takenFromFree: Map<string, OreLine[]>;
  absorbed: Map<string, Set<string>>;
  trimmed: Map<string, Map<string, { oreLines: OreLine[]; valueShare: number }>>;
  alsoBilled: Map<string, Map<string, number>>;
  conflicted: Map<string, Map<string, number>>;
  labels: Map<string, { state: BookLabelState; corporationId: number; corpName: string }>;
  books: BookSummary[];
}

function sumLines(...lists: readonly (readonly OreLine[])[]): OreLine[] {
  const byType = new Map<number, number>();
  for (const list of lists) {
    for (const line of list)
      byType.set(line.typeId, (byType.get(line.typeId) ?? 0) + line.quantity);
  }
  return [...byType]
    .map(([typeId, quantity]) => ({ typeId, quantity }))
    .filter((l) => l.quantity > 0)
    .sort((a, b) => a.typeId - b.typeId);
}

export function combineOverlaps(
  overlaps: readonly (BookOverlap | undefined)[]
): BookOverlap | undefined {
  const present = overlaps.filter((o): o is BookOverlap => o !== undefined);
  if (present.length === 0) return undefined;
  return {
    payeeIds: [...new Set(present.flatMap((o) => o.payeeIds))],
    ore: sumLines(...present.map((o) => o.ore)),
    paid: present.every((o) => o.paid),
  };
}

const quantityOf = (lines: readonly OreLine[]) => lines.reduce((sum, l) => sum + l.quantity, 0);

function quantityOfTypes(lines: readonly OreLine[], typeIds: ReadonlySet<number>): number {
  return lines.filter((l) => typeIds.has(l.typeId)).reduce((sum, l) => sum + l.quantity, 0);
}

function matchEntry(
  observed: ObservedMiningEntry,
  entries: readonly PersonalEntry[]
): PersonalEntry | undefined {
  const day = entries.filter(
    (e) => e.characterId === observed.characterId && e.date === observed.date
  );
  if (observed.solarSystemId !== undefined) {
    return day.find((e) => e.solarSystemId === observed.solarSystemId);
  }
  if (day.length <= 1) return day[0];
  const types = new Set(observed.oreLines.map((l) => l.typeId));
  const scored = day
    .map((e) => ({ e, shared: quantityOfTypes(e.oreLines, types) }))
    .sort((a, b) => b.shared - a.shared);
  return scored[0].shared > 0 ? scored[0].e : undefined;
}

interface PreparedCharge {
  charge: DayCharge;
  observed: ObservedMiningEntry;
  entry?: PersonalEntry;
  dismissal?: Dismissal;
  oreLines: OreLine[];
}

interface Prepared {
  book: PersonalBook;
  charges: PreparedCharge[];
  pending: { observed: ObservedMiningEntry; entry?: PersonalEntry }[];
  open: PreparedCharge[];
  miners: ReadonlyMap<string, MinerSettlement>;
  lost: { donation: InFlightDonation; payment: TaxPayment }[];
  billableThrough: string | undefined;
}

function inFlightPayment(d: InFlightDonation, miners: readonly Miner[]): TaxPayment {
  return {
    id: `inFlight:${d.refId ?? `${d.characterId}@${d.at}`}`,
    minerId: minerIdFor(d.characterId, miners, d.at.slice(0, 10)),
    characterId: d.characterId,
    amount: d.amount,
    at: d.at,
    source: 'donation',
  };
}

function prepare(book: PersonalBook, entries: readonly PersonalEntry[], now: string): Prepared {
  const checkedAt = donationsCheckedAt(book);
  const counting = book.inFlight.filter((d) => !isUncredited(d, checkedAt));
  const lost = book.inFlight
    .filter((d) => isUncredited(d, checkedAt))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((donation) => ({ donation, payment: inFlightPayment(donation, book.miners) }));
  const open = settleOpenSet({
    corporationId: book.corporationId,
    now,
    startDate: book.startDate,
    ...(book.graceHours !== undefined ? { graceHours: book.graceHours } : {}),
    ...(book.lastSyncedAt !== undefined ? { lastSyncedAt: book.lastSyncedAt } : {}),
    rates: book.rates,
    entries: book.observed,
    miners: book.miners,
    notices: book.notices,
    payments: [...book.payments, ...counting.map((d) => inFlightPayment(d, book.miners))],
    dismissals: book.dismissals,
    ...(book.adjustments ? { adjustments: book.adjustments } : {}),
    ...(book.writeOffs ? { writeOffs: book.writeOffs } : {}),
    ...(book.disputes ? { disputes: book.disputes } : {}),
    ...(book.toleranceExemptions ? { toleranceExemptions: book.toleranceExemptions } : {}),
    ...(book.minerPaidThrough ? { minerPaidThrough: book.minerPaidThrough } : {}),
    ...(book.checkpoints ? { checkpoints: book.checkpoints } : {}),
    ...(book.feeders ? { feeders: book.feeders } : {}),
    pricesOn: book.pricesOn,
    placement: { kind: 'observed-rows' },
  });
  const observedByKey = new Map(book.observed.map((o) => [observedEntryKey(o), o]));
  const prepared: PreparedCharge[] = [];
  const pending: Prepared['pending'] = [];
  const openCharges: PreparedCharge[] = [];
  for (const charge of open.charges) {
    const observed = observedByKey.get(charge.key)!;
    const dismissal = activeDismissalFor(charge, book.dismissals);
    const billable = open.billableThrough !== undefined && charge.date <= open.billableThrough;
    const entry = matchEntry(observed, entries);
    if (!billable) {
      pending.push({ observed, ...(entry ? { entry } : {}) });
      openCharges.push({
        charge,
        observed,
        ...(entry ? { entry } : {}),
        ...(dismissal ? { dismissal } : {}),
        oreLines: charge.oreLines,
      });
      continue;
    }
    prepared.push({
      charge,
      observed,
      ...(entry ? { entry } : {}),
      ...(dismissal ? { dismissal } : {}),
      oreLines: charge.oreLines,
    });
  }
  for (const observed of [...open.unrated, ...open.unread]) {
    const entry = matchEntry(observed, entries);
    pending.push({ observed, ...(entry ? { entry } : {}) });
  }
  return {
    book,
    charges: prepared,
    pending,
    open: openCharges,
    miners: open.miners,
    lost,
    billableThrough: open.billableThrough,
  };
}

function dayValue(p: PreparedCharge): {
  lines: OreLine[];
  unitPrices: Record<number, number>;
  priceSources: Record<number, string>;
  taxPct: number;
  rateEffectiveFrom?: string;
  estimatedValue: number;
  tax: number;
} {
  const { charge } = p;
  const { estimatedValue, taxOwed } = computeAssignmentValue(
    charge.oreLines,
    priceMap(charge.unitPrices),
    charge.taxPct
  );
  return {
    lines: charge.oreLines,
    unitPrices: charge.unitPrices,
    priceSources: charge.priceSources,
    taxPct: charge.taxPct,
    ...(charge.rateEffectiveFrom !== undefined
      ? { rateEffectiveFrom: charge.rateEffectiveFrom }
      : {}),
    estimatedValue,
    tax: taxOwed,
  };
}

type PoolItem = { allocation: PersonalAllocation; left: Map<number, number> };
type OverlapPool = PoolItem[];

const overlapPool = (allocations: readonly PersonalAllocation[]): OverlapPool =>
  allocations.map((allocation) => ({
    allocation,
    left: new Map(sumLines(allocation.oreLines).map((l) => [l.typeId, l.quantity])),
  }));

const linesOfLeft = (left: ReadonlyMap<number, number>): OreLine[] =>
  sumLines([...left].map(([typeId, quantity]) => ({ typeId, quantity })));

const intersectLines = (a: readonly OreLine[], b: readonly OreLine[]): OreLine[] =>
  minusLines(a, minusLines(a, b));

function takeOverlap(
  pool: OverlapPool,
  observed: readonly OreLine[]
):
  | {
      overlap: BookOverlap;
      touching: PersonalAllocation[];
      byItem: Map<PoolItem, OreLine[]>;
    }
  | undefined {
  const want = new Map(sumLines(observed).map((l) => [l.typeId, l.quantity]));
  const taken: OreLine[] = [];
  const touching: PersonalAllocation[] = [];
  const byItem = new Map<PoolItem, OreLine[]>();
  for (const item of pool) {
    const took: OreLine[] = [];
    for (const [typeId, quantity] of item.left) {
      const take = Math.min(quantity, want.get(typeId) ?? 0);
      if (take <= 0) continue;
      item.left.set(typeId, quantity - take);
      want.set(typeId, (want.get(typeId) ?? 0) - take);
      took.push({ typeId, quantity: take });
    }
    if (took.length === 0) continue;
    taken.push(...took);
    touching.push(item.allocation);
    byItem.set(item, sumLines(took));
  }
  if (touching.length === 0) return undefined;
  return {
    overlap: {
      payeeIds: [...new Set(touching.map((a) => a.payeeId))],
      ore: sumLines(taken),
      paid: touching.every((a) => a.status === 'paid'),
    },
    touching,
    byItem,
  };
}

const isOwnPayee = (ownPayeeIds: readonly string[] | undefined, a: PersonalAllocation) =>
  ownPayeeIds?.includes(a.payeeId) === true;

const isBilledStatus = (a: PersonalAllocation) => a.status === 'paid' || a.status === 'outstanding';

function causeOf(
  pool: OverlapPool,
  touching: readonly PersonalAllocation[],
  contested: readonly OreLine[],
  book: PersonalBook,
  observed: ObservedMiningEntry
): { cause: ConflictCause; ownerPayeeId?: string } {
  const types = new Set(contested.map((l) => l.typeId));
  const holding = pool
    .filter((item) => [...types].some((typeId) => (item.left.get(typeId) ?? 0) > 0))
    .map((item) => item.allocation);
  const listing = [...new Set([...touching, ...holding])];
  if (listing.some((a) => isOwnPayee(book.ownPayeeIds, a) && !isBilledStatus(a))) {
    return { cause: 'ownNeedsReview' };
  }
  const owner = observed.sourceCorporationId;
  const ownerPayee =
    owner === undefined || owner === book.corporationId
      ? undefined
      : listing.find((a) => book.payeeCorporations?.[a.payeeId] === owner);
  if (ownerPayee) return { cause: 'ownerCollected', ownerPayeeId: ownerPayee.payeeId };
  return { cause: 'otherPayee' };
}

function takeOwnAllocations(
  pool: OverlapPool,
  ownPayeeIds: readonly string[] | undefined,
  share: readonly OreLine[]
): {
  lines: OreLine[];
  taken: Map<PoolItem, OreLine[]>;
} {
  const room = new Map(sumLines(share).map((l) => [l.typeId, l.quantity]));
  const lines: OreLine[][] = [];
  const taken = new Map<PoolItem, OreLine[]>();
  const own = (a: PersonalAllocation) => isOwnPayee(ownPayeeIds, a);
  const takeable = (a: PersonalAllocation) =>
    own(a) ? isBilledStatus(a) : a.releasable === true && a.status === 'outstanding';
  const order = [
    ...pool.filter((item) => own(item.allocation)),
    ...pool.filter((item) => !own(item.allocation)),
  ];
  for (const item of order) {
    const { allocation } = item;
    if (allocation.id === undefined || !takeable(allocation)) continue;
    const took: OreLine[] = [];
    for (const [typeId, quantity] of item.left) {
      const take = Math.min(quantity, room.get(typeId) ?? 0);
      if (take <= 0) continue;
      item.left.set(typeId, quantity - take);
      room.set(typeId, (room.get(typeId) ?? 0) - take);
      took.push({ typeId, quantity: take });
    }
    if (took.length === 0) continue;
    const listed = sumLines(took);
    taken.set(item, listed);
    lines.push(listed);
  }
  return { lines: sumLines(...lines), taken };
}

export function previewTakeover(
  allocations: readonly PersonalAllocation[],
  overlap: readonly OreLine[]
): { index: number; payeeId: string; before: OreLine[]; after: OreLine[] }[] {
  let left = sumLines(overlap);
  const out: { index: number; payeeId: string; before: OreLine[]; after: OreLine[] }[] = [];
  for (const [index, allocation] of allocations.entries()) {
    const take = allocation.oreLines
      .map((l) => ({
        typeId: l.typeId,
        quantity: Math.min(l.quantity, left.find((x) => x.typeId === l.typeId)?.quantity ?? 0),
      }))
      .filter((l) => l.quantity > 0);
    if (take.length === 0) continue;
    left = minusLines(left, take);
    out.push({
      index,
      payeeId: allocation.payeeId,
      before: [...allocation.oreLines],
      after: minusLines(allocation.oreLines, take),
    });
  }
  return out;
}

const SETTLE_MS = 20 * MINUTE_MS;

function isSettled(book: PersonalBook, charge: PreparedCharge, now: string): boolean {
  const { characterId, solarSystemId, date } = charge.observed;
  if (Date.parse(now) >= Date.parse(dayClosesAt(date, book.graceHours)) + SETTLE_MS) return true;
  const mine = book.observed.filter((o) => o.characterId === characterId);
  const refineries = new Set(
    mine
      .filter((o) => o.date === date && o.solarSystemId === solarSystemId)
      .map((o) => o.structureId)
  );
  refineries.add(charge.observed.structureId);
  return [...refineries].every((structureId) =>
    mine.some((o) => o.structureId === structureId && o.date > date)
  );
}

function disputeOf(
  entry: PersonalEntry | undefined,
  bookLines: readonly OreLine[],
  bookPct: number,
  sameRate = true,
  personalLines: readonly OreLine[] | undefined = entry?.oreLines
): BookDispute | undefined {
  if (!entry || !personalLines) return undefined;
  const types = new Set(bookLines.map((l) => l.typeId));
  const personalQuantity = quantityOfTypes(personalLines, types);
  const bookQuantity = quantityOf(bookLines);
  const pcts = new Set(entry.allocations.map((a) => a.taxPct));
  const personalPct = pcts.size === 1 ? [...pcts][0] : undefined;
  const quantity = personalQuantity !== bookQuantity;
  const rate = sameRate && personalPct !== undefined && personalPct !== bookPct;
  if (!quantity && !rate) return undefined;
  return {
    quantity,
    rate,
    personalQuantity,
    bookQuantity,
    ...(personalPct !== undefined ? { personalPct } : {}),
    bookPct,
  };
}

const addTaken = (map: Map<string, OreLine[]>, key: string, lines: readonly OreLine[]) => {
  if (lines.length > 0) map.set(key, sumLines(map.get(key) ?? [], lines));
};

export function overlayCorpBooks(input: {
  entries: readonly PersonalEntry[];
  books: readonly PersonalBook[];
  now: string;
}): PersonalOverlay {
  const { entries, now } = input;
  const books = [...input.books].sort((a, b) => a.corporationId - b.corporationId);
  const prepared = books.map((book) => prepare(book, entries, now));
  const rows: BookRowView[] = [];
  const takenFromFree = new Map<string, OreLine[]>();
  const labels: PersonalOverlay['labels'] = new Map();
  const absorbed: PersonalOverlay['absorbed'] = new Map();
  const trimmed: PersonalOverlay['trimmed'] = new Map();
  const alsoBilled: PersonalOverlay['alsoBilled'] = new Map();
  const conflicted: PersonalOverlay['conflicted'] = new Map();
  const alsoBilledRows = new Map<string, Map<string, BookRowView[]>>();
  const free = new Map(
    entries.map((e) => [entryKey(e.characterId, e.date, e.solarSystemId), e.freeOreLines])
  );
  const entryByKey = new Map(
    entries.map((e) => [entryKey(e.characterId, e.date, e.solarSystemId), e])
  );

  const chargesOf = (p: Prepared, key: string) =>
    p.charges.filter(
      (c) =>
        c.entry !== undefined &&
        entryKey(c.entry.characterId, c.entry.date, c.entry.solarSystemId) === key
    );

  const rowsByBook = new Map<number, BookRowView[]>();
  const pushRow = (row: BookRowView) => {
    rows.push(row);
    const list = rowsByBook.get(row.corporationId) ?? [];
    list.push(row);
    rowsByBook.set(row.corporationId, list);
  };

  const commonOf = (p: Prepared, charge: PreparedCharge, value: ReturnType<typeof dayValue>) => {
    const { book } = p;
    const solarSystemId = charge.entry?.solarSystemId ?? charge.observed.solarSystemId ?? 0;
    return {
      corporationId: book.corporationId,
      corpName: book.corpName,
      characterId: charge.charge.characterId,
      date: charge.charge.date,
      solarSystemId,
      unitPrices: value.unitPrices,
      priceSources: value.priceSources,
      taxPct: value.taxPct,
      rateScope: charge.charge.rateScope,
      ...(value.rateEffectiveFrom !== undefined
        ? { rateEffectiveFrom: value.rateEffectiveFrom }
        : {}),
      ...(charge.entry ? { personalOreLines: charge.entry.oreLines } : {}),
      structureId: charge.observed.structureId,
      ...(book.structureNames?.[charge.observed.structureId] !== undefined
        ? { refineryLabel: book.structureNames[charge.observed.structureId] }
        : {}),
      minerId: charge.charge.minerId,
      hubId: book.hubId,
      oreForm: book.oreForm,
    };
  };

  const pushExcess = (
    p: Prepared,
    charge: PreparedCharge,
    allocation: PersonalAllocation,
    excess: OreLine[]
  ) => {
    const value = dayValue(charge);
    const worth = computeAssignmentValue(excess, priceMap(value.unitPrices), value.taxPct);
    pushRow({
      ...commonOf(p, charge, value),
      id: `${p.book.corporationId}:${charge.charge.key}:overListed:${allocation.id ?? ''}`,
      oreLines: excess,
      estimatedValue: worth.estimatedValue,
      taxOwed: null,
      billed: 0,
      ...(isSettled(p.book, charge, now)
        ? {
            state: 'conflict' as const,
            conflictCause: 'overListed' as const,
            overlap: {
              payeeIds: [allocation.payeeId],
              ore: excess,
              paid: allocation.status === 'paid',
            },
          }
        : { state: 'settling' as const }),
    });
  };

  const buildRows = (
    p: Prepared,
    charge: PreparedCharge,
    lines: readonly OreLine[],
    conflict:
      | { lines: OreLine[]; resolvesAt: string; cause: ConflictCause; ownerPayeeId?: string }
      | undefined,
    day?: { lines: OreLine[]; sameRate: boolean; share?: OreLine[] }
  ) => {
    const { book } = p;
    const value = dayValue(charge);
    const owedLines = conflict ? minusLines(value.lines, conflict.lines) : value.lines;
    const held = holdFor(charge.charge.key, book.disputes ?? [], now);
    const common = commonOf(p, charge, value);
    const dispute = disputeOf(
      charge.entry,
      day?.lines ?? lines,
      value.taxPct,
      day?.sameRate ?? true,
      day?.share ?? charge.entry?.oreLines
    );
    if (conflict) {
      const worth = computeAssignmentValue(
        conflict.lines,
        priceMap(value.unitPrices),
        value.taxPct
      );
      pushRow({
        ...common,
        id: `${book.corporationId}:${charge.charge.key}:conflict`,
        state: 'conflict',
        recordKey: charge.charge.key,
        oreLines: conflict.lines,
        estimatedValue: worth.estimatedValue,
        taxOwed: null,
        billed: worth.taxOwed,
        resolvesAt: conflict.resolvesAt,
        conflictCause: conflict.cause,
        ...(conflict.ownerPayeeId !== undefined ? { ownerPayeeId: conflict.ownerPayeeId } : {}),
        ...(dispute ? { dispute } : {}),
        ...(held ? { held } : {}),
      });
      if (owedLines.length === 0) return;
    }
    const worth = conflict
      ? computeAssignmentValue(owedLines, priceMap(value.unitPrices), value.taxPct)
      : { estimatedValue: value.estimatedValue, taxOwed: value.tax };
    const id = `${book.corporationId}:${charge.charge.key}`;
    if (charge.dismissal) {
      pushRow({
        ...common,
        id,
        state: 'dismissed',
        oreLines: owedLines,
        estimatedValue: worth.estimatedValue,
        taxOwed: 0,
        billed: worth.taxOwed,
        dismissalReason: charge.dismissal.reason,
      });
      return;
    }
    pushRow({
      ...common,
      id,
      state: 'billed',
      recordKey: charge.charge.key,
      oreLines: owedLines,
      estimatedValue: worth.estimatedValue,
      taxOwed: worth.taxOwed,
      billed: worth.taxOwed,
      ...(dispute && !conflict ? { dispute } : {}),
      ...(held ? { held } : {}),
    });
  };

  for (const [key, entry] of entryByKey) {
    const claiming = prepared.filter((p) => chargesOf(p, key).length > 0);
    if (claiming.length === 0) continue;
    const observations: BookObservation[] = claiming.map((p) => ({
      bookId: String(p.book.corporationId),
      oreLines: sumLines(...chargesOf(p, key).map((c) => c.oreLines)),
    }));
    const split = splitAcrossBooks(entry.oreLines, observations);
    let left = free.get(key) ?? [];
    const pool = overlapPool(entry.allocations);
    const takenOf = new Map<PoolItem, OreLine[]>();
    const ownedBy = new Map<PoolItem, { p: Prepared; charge: PreparedCharge }>();
    const alsoBilledOf = new Map<PoolItem, { lines: OreLine[]; rows: BookRowView[] }>();
    const conflictedOf = new Map<PoolItem, OreLine[]>();
    const shareOf = (p: Prepared) => split.byBook.get(String(p.book.corporationId)) ?? [];
    const ownOf = new Map(
      claiming.map((p) => [p, takeOwnAllocations(pool, p.book.ownPayeeIds, shareOf(p))])
    );
    for (const p of claiming) {
      const share = shareOf(p);
      const here = chargesOf(p, key);
      const own = ownOf.get(p)!;
      for (const [item, lines] of own.taken)
        takenOf.set(item, sumLines(takenOf.get(item) ?? [], lines));
      const anchor = here.find((c) => !c.dismissal);
      if (anchor) {
        for (const item of pool) {
          const a = item.allocation;
          if (
            !ownedBy.has(item) &&
            a.id !== undefined &&
            isBilledStatus(a) &&
            isOwnPayee(p.book.ownPayeeIds, a)
          )
            ownedBy.set(item, { p, charge: anchor });
        }
      }
      const resolved = resolveBookShare({
        share,
        free: sumLines(left, own.lines),
        conflictSince: dayClosesAt(entry.date, p.book.graceHours),
        now,
      });
      const freeTaken = minusLines(resolved.fromFree, own.lines);
      left = minusLines(left, freeTaken);
      addTaken(takenFromFree, key, freeTaken);
      const heldDay = here
        .map((c) => holdFor(c.charge.key, p.book.disputes ?? [], now))
        .find((h) => h !== undefined);
      const contested =
        resolved.conflict.length === 0 || (resolved.conflictOwed && !heldDay)
          ? undefined
          : { resolvesAt: laterOf(resolved.conflictResolvesAt, heldDay?.until) ?? '' };
      let remaining = resolved.conflict;
      const day = {
        lines: sumLines(...here.map((c) => c.oreLines)),
        sameRate: new Set(here.map((c) => dayValue(c).taxPct)).size <= 1,
        ...(claiming.length > 1 ? { share } : {}),
      };
      for (const charge of here) {
        const mine = sumLines(...[charge.oreLines]);
        const claimed = remaining
          .map((l) => ({
            typeId: l.typeId,
            quantity: Math.min(l.quantity, mine.find((m) => m.typeId === l.typeId)?.quantity ?? 0),
          }))
          .filter((l) => l.quantity > 0);
        remaining = minusLines(remaining, claimed);
        const take = contested ? claimed : [];
        const overlap = charge.dismissal ? undefined : takeOverlap(pool, claimed);
        const firstRow = rows.length;
        buildRows(
          p,
          charge,
          charge.oreLines,
          contested && take.length > 0 && !charge.dismissal
            ? {
                lines: take,
                resolvesAt: contested.resolvesAt,
                ...causeOf(pool, overlap?.touching ?? [], take, p.book, charge.observed),
              }
            : undefined,
          day
        );
        if (overlap && rows[firstRow]) rows[firstRow].overlap = overlap.overlap;
        if (overlap && !contested) {
          for (const [item, lines] of overlap.byItem) {
            if (isOwnPayee(p.book.ownPayeeIds, item.allocation)) continue;
            const held = alsoBilledOf.get(item) ?? { lines: [], rows: [] };
            alsoBilledOf.set(item, {
              lines: sumLines(held.lines, lines),
              rows: [...held.rows, ...rows.slice(firstRow)],
            });
          }
        }
        if (overlap && contested) {
          for (const [item, lines] of overlap.byItem) {
            if (isOwnPayee(p.book.ownPayeeIds, item.allocation)) continue;
            conflictedOf.set(item, sumLines(conflictedOf.get(item) ?? [], lines));
          }
        }
      }
    }
    const prices = new Map<number, number>();
    for (const p of claiming)
      for (const [typeId, price] of p.book.pricesOn(entry.date).prices)
        if (!prices.has(typeId)) prices.set(typeId, price);
    const worth = (lines: readonly OreLine[]) =>
      lines.reduce((sum, l) => sum + l.quantity * (prices.get(l.typeId) ?? 0), 0);
    for (const item of pool) {
      const { allocation } = item;
      if (allocation.id === undefined) continue;
      const owner = ownedBy.get(item);
      const excess = owner ? linesOfLeft(item.left) : [];
      if (owner && excess.length > 0) pushExcess(owner.p, owner.charge, allocation, excess);
      const gone = sumLines(takenOf.get(item) ?? [], excess);
      const listed = sumLines(allocation.oreLines);
      const kept = minusLines(listed, gone);
      const billedToo = alsoBilledOf.get(item);
      if (billedToo && quantityOf(kept) > 0) {
        const base = worth(kept);
        const share =
          base > 0 ? worth(billedToo.lines) / base : quantityOf(billedToo.lines) / quantityOf(kept);
        const ofEntry = alsoBilled.get(key) ?? new Map<string, number>();
        ofEntry.set(allocation.id, Math.min(1, share));
        alsoBilled.set(key, ofEntry);
        const rowsOf = alsoBilledRows.get(key) ?? new Map<string, BookRowView[]>();
        rowsOf.set(allocation.id, billedToo.rows);
        alsoBilledRows.set(key, rowsOf);
      }
      const contestedToo = conflictedOf.get(item);
      if (contestedToo && quantityOf(kept) > 0) {
        const base = worth(kept);
        const share =
          base > 0 ? worth(contestedToo) / base : quantityOf(contestedToo) / quantityOf(kept);
        const ofEntry = conflicted.get(key) ?? new Map<string, number>();
        ofEntry.set(allocation.id, Math.min(1, share));
        conflicted.set(key, ofEntry);
      }
      if (gone.length === 0) continue;
      if (kept.length === 0) {
        absorbed.set(key, new Set([...(absorbed.get(key) ?? []), allocation.id]));
        continue;
      }
      const whole = worth(listed);
      const valueShare =
        whole > 0 ? worth(kept) / whole : quantityOf(kept) / Math.max(1, quantityOf(listed));
      const ofEntry = trimmed.get(key) ?? new Map();
      ofEntry.set(allocation.id, { oreLines: kept, valueShare });
      trimmed.set(key, ofEntry);
    }
    free.set(key, left);
  }

  for (const [key, entry] of entryByKey) {
    for (const p of prepared) {
      const { book } = p;
      if (chargesOf(p, key).length > 0) continue;
      if (p.billableThrough !== undefined && entry.date <= p.billableThrough) continue;
      if (entry.date < book.startDate) continue;
      if (book.characterIds !== undefined && !book.characterIds.includes(entry.characterId))
        continue;
      const done = absorbed.get(key);
      const own = entry.allocations.filter(
        (a) =>
          a.id !== undefined &&
          !done?.has(a.id) &&
          isOwnPayee(book.ownPayeeIds, a) &&
          isBilledStatus(a)
      );
      if (own.length === 0) continue;
      const ofEntry = (e: PersonalEntry | undefined) =>
        e !== undefined && entryKey(e.characterId, e.date, e.solarSystemId) === key;
      const charges = p.open.filter((c) => ofEntry(c.entry));
      if (charges.some((c) => c.dismissal)) continue;
      const seen = p.pending
        .filter((x) => ofEntry(x.entry))
        .map((x) => x.observed)
        .sort((a, b) => a.structureId - b.structureId);
      const byStructure = new Map<number | undefined, OreLine[]>();
      let left = sumLines(...own.map((a) => a.oreLines));
      for (const o of seen) {
        const lines = intersectLines(left, o.oreLines);
        if (lines.length === 0) continue;
        left = minusLines(left, lines);
        byStructure.set(o.structureId, sumLines(byStructure.get(o.structureId) ?? [], lines));
      }
      const dayOver = Date.parse(dayClosesAt(entry.date, 0));
      const final =
        left.length === 0 &&
        Date.parse(now) >= dayOver &&
        book.lastSyncedAt !== undefined &&
        Date.parse(book.lastSyncedAt) >= dayOver;
      if (left.length > 0) {
        const history = book.observed
          .filter(
            (o) =>
              o.characterId === entry.characterId &&
              o.solarSystemId === entry.solarSystemId &&
              o.date < entry.date
          )
          .sort((a, b) => b.date.localeCompare(a.date));
        const yields = (o: ObservedMiningEntry, typeId: number) =>
          o.oreLines.some((l) => l.typeId === typeId);
        for (const line of left) {
          const to =
            seen.find((o) => yields(o, line.typeId))?.structureId ??
            history.find((o) => yields(o, line.typeId))?.structureId;
          byStructure.set(to, sumLines(byStructure.get(to) ?? [], [line]));
        }
      }
      const { prices, sources } = book.pricesOn(entry.date);
      const ownPct = own[0]!.taxPct;
      for (const [structureId, lines] of byStructure) {
        const charge = charges.find((c) => c.observed.structureId === structureId);
        const value = charge ? dayValue(charge) : undefined;
        const unitPrices = new Map(lines.map((l) => [l.typeId, prices.get(l.typeId) ?? 0]));
        if (value) for (const [t, price] of priceMap(value.unitPrices)) unitPrices.set(t, price);
        const taxPct = value?.taxPct ?? ownPct;
        const worth = computeAssignmentValue(lines, unitPrices, taxPct);
        const types = lines.map((l) => l.typeId);
        const label = structureId === undefined ? undefined : book.structureNames?.[structureId];
        pushRow({
          ...(charge && value
            ? commonOf(p, charge, value)
            : {
                corporationId: book.corporationId,
                corpName: book.corpName,
                characterId: entry.characterId,
                date: entry.date,
                solarSystemId: entry.solarSystemId,
                personalOreLines: entry.oreLines,
                unitPrices: Object.fromEntries(types.map((t) => [t, unitPrices.get(t) ?? 0])),
                priceSources: Object.fromEntries(
                  types.flatMap((t) => (sources.has(t) ? [[t, sources.get(t)!]] : []))
                ),
                taxPct,
                rateScope: 'corp' as const,
                minerId: minerIdFor(entry.characterId, book.miners, entry.date),
                ...(structureId !== undefined ? { structureId } : {}),
                ...(label !== undefined ? { refineryLabel: label } : {}),
                hubId: book.hubId,
                oreForm: book.oreForm,
              }),
          unitPrices: Object.fromEntries(types.map((t) => [t, unitPrices.get(t) ?? 0])),
          priceSources: Object.fromEntries(
            types.flatMap((t) => {
              const source = value?.priceSources[t] ?? sources.get(t);
              return source !== undefined ? [[t, source]] : [];
            })
          ),
          id: `${book.corporationId}:${key}:estimate:${structureId ?? 'system'}`,
          state: 'estimate',
          open: true,
          ...(final ? { final: true as const } : {}),
          oreLines: lines,
          estimatedValue: worth.estimatedValue,
          taxOwed: worth.taxOwed,
          billed: worth.taxOwed,
        });
      }
      absorbed.set(key, new Set([...(done ?? []), ...own.map((a) => a.id!)]));
    }
  }

  for (const p of prepared) {
    for (const charge of p.charges) {
      if (charge.entry) continue;
      buildRows(p, charge, charge.oreLines, undefined);
    }
  }

  const uncreditedByBook = new Map<number, UncreditedDonation[]>();
  for (const p of prepared) {
    const mine = rowsByBook.get(p.book.corporationId) ?? [];
    showAdjustments(p, mine);
    uncreditedByBook.set(p.book.corporationId, settleRows(p, mine));
  }

  for (const [key, ofEntry] of alsoBilledRows) {
    for (const [id, billedRows] of ofEntry) {
      if (billedRows.every((r) => r.state === 'waived')) alsoBilled.get(key)?.delete(id);
    }
    if (alsoBilled.get(key)?.size === 0) alsoBilled.delete(key);
  }

  for (const [key, entry] of entryByKey) {
    if (quantityOf(free.get(key) ?? []) === 0) continue;
    const pendingBook = prepared.find((p) =>
      p.pending.some(
        (x) =>
          x.entry !== undefined &&
          entryKey(x.entry.characterId, x.entry.date, x.entry.solarSystemId) === key
      )
    );
    if (pendingBook) {
      labels.set(key, {
        state: 'pending',
        corporationId: pendingBook.book.corporationId,
        corpName: pendingBook.book.corpName,
      });
      continue;
    }
    const closed = prepared.find(
      (p) =>
        chargesOf(p, key).length > 0 &&
        (p.book.characterIds === undefined || p.book.characterIds.includes(entry.characterId)) &&
        entry.date >= p.book.startDate &&
        isDayBillable(entry.date, {
          now,
          ...(p.book.lastSyncedAt !== undefined ? { lastSyncedAt: p.book.lastSyncedAt } : {}),
          ...(p.book.graceHours !== undefined ? { graceHours: p.book.graceHours } : {}),
        })
    );
    if (closed) {
      labels.set(key, {
        state: 'unattributed',
        corporationId: closed.book.corporationId,
        corpName: closed.book.corpName,
      });
    }
  }

  const creditLeft = new Map<number, number>();
  for (const p of prepared) {
    const credit = new Map([...p.miners].map(([id, m]) => [id, m.account.credit]));
    const estimates = (rowsByBook.get(p.book.corporationId) ?? [])
      .filter((r) => r.state === 'estimate')
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const row of estimates) {
      const minerId = minerOfRow(p, row) ?? '';
      const have = credit.get(minerId) ?? 0;
      const tax = row.taxOwed ?? 0;
      if (have < RESIDUE_ISK || tax <= 0) continue;
      const pay = Math.min(have, tax);
      credit.set(minerId, have - pay);
      if (tax - pay < RESIDUE_ISK) {
        Object.assign(row, { state: 'paid', taxOwed: 0 });
        continue;
      }
      const share = pay / tax;
      const paidLines = row.oreLines
        .map((l) => ({ typeId: l.typeId, quantity: Math.floor(l.quantity * share) }))
        .filter((l) => l.quantity > 0);
      pushRow({
        ...row,
        id: `${row.id}:paid`,
        state: 'paid',
        oreLines: paidLines,
        estimatedValue: row.estimatedValue * share,
        taxOwed: 0,
        billed: pay,
      });
      Object.assign(row, {
        oreLines: minusLines(row.oreLines, paidLines),
        estimatedValue: row.estimatedValue * (1 - share),
        taxOwed: tax - pay,
        billed: tax - pay,
      });
    }
    creditLeft.set(
      p.book.corporationId,
      [...credit.values()].reduce((sum, c) => sum + c, 0)
    );
  }

  const summaries: BookSummary[] = prepared.map((p) => {
    const miners = minerRunningAccountsOf(p);
    const closedThrough = p.billableThrough;
    const estimates = (rowsByBook.get(p.book.corporationId) ?? []).filter(
      (r) => r.state === 'estimate'
    );
    const estimate = estimates.reduce((sum, r) => sum + (r.taxOwed ?? 0), 0);
    for (const m of miners)
      m.estimate = estimates
        .filter((r) => minerOfRow(p, r) === m.minerId)
        .reduce((sum, r) => sum + (r.taxOwed ?? 0), 0);
    return {
      corporationId: p.book.corporationId,
      corpName: p.book.corpName,
      startDate: p.book.startDate,
      ...(p.book.lastSyncedAt !== undefined ? { lastSyncedAt: p.book.lastSyncedAt } : {}),
      ...(closedThrough !== undefined ? { closedThrough } : {}),
      credit: creditLeft.get(p.book.corporationId) ?? 0,
      estimate,
      account: runningAccountStatusOf(miners),
      miners,
      notices: unpaidNotices(miners, p.book.declarations ?? []),
      uncredited: uncreditedByBook.get(p.book.corporationId) ?? [],
      hubId: p.book.hubId,
      oreForm: p.book.oreForm,
    };
  });

  for (const row of rows) {
    const p = prepared.find((x) => x.book.corporationId === row.corporationId);
    const book = p?.book;
    if (row.recordKey !== undefined) {
      const noticeId = p ? noticeListing(p, row.minerId, row.recordKey) : undefined;
      if (noticeId !== undefined) {
        row.noticeId = noticeId;
        const declaration = declarationFor(noticeId, book?.declarations ?? []);
        if (declaration) row.declaration = declaration;
      }
      const flagged = flagFor(row, row.recordKey, book?.disputes ?? []);
      if (flagged) row.flagged = flagged;
    }
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return {
    rows,
    takenFromFree,
    absorbed,
    trimmed,
    alsoBilled,
    conflicted,
    labels,
    books: summaries,
  };
}

function holdFor(
  recordKey: string,
  disputes: readonly OreDispute[],
  now: string
): RowHold | undefined {
  for (const d of disputes) {
    if (!d.lines.some((l) => l.recordKey === recordKey)) continue;
    const hold = disputeHold(d, now);
    if (hold) return { ...hold, kind: disputeKindOf(d) };
  }
  return undefined;
}

const laterOf = (a: string | undefined, b: string | undefined) =>
  a === undefined ? b : b === undefined ? a : a > b ? a : b;

function flagFor(
  row: Pick<BookRowView, 'date' | 'characterId' | 'minerId'>,
  recordKey: string,
  disputes: readonly OreDispute[]
): MemberFlag | undefined {
  const d =
    disputes.find((x) => x.lines.some((l) => l.recordKey === recordKey)) ??
    disputes.find(
      (x) =>
        x.resolution !== undefined &&
        x.date === row.date &&
        (x.minerId === row.minerId ||
          x.lines.some((l) => l.recordKey.startsWith(`${row.characterId}:`)))
    );
  if (!d) return undefined;
  const own = d.lines
    .filter((l) => l.recordKey === recordKey)
    .map(({ typeId, quantity }) => ({ typeId, quantity }));
  const kind = disputeKindOf(d);
  const said = {
    kind,
    ...(d.reason !== undefined ? { said: d.reason } : {}),
    ...(kind === 'quantity' && own.length > 0 ? { lines: own } : {}),
    ...(d.claimedPct !== undefined ? { claimedPct: d.claimedPct } : {}),
  };
  if (!d.resolution) return { state: 'sent', at: d.at, ...said };
  const r = d.resolution;
  return {
    state: r.kind,
    at: r.at,
    reason: r.reason,
    ...said,
    ...(r.kind === 'rejected' && r.nextStep !== undefined ? { nextStep: r.nextStep } : {}),
  };
}

const donationsCheckedAt = (book: Pick<PersonalBook, 'lastSyncedAt' | 'donationsCheckedAt'>) =>
  book.donationsCheckedAt === undefined
    ? book.lastSyncedAt
    : (book.donationsCheckedAt ?? undefined);

const isUncredited = (d: InFlightDonation, checkedAt: string | undefined) =>
  checkedAt !== undefined &&
  Date.parse(checkedAt) - Date.parse(d.at) >= UNCREDITED_AFTER_HOURS * HOUR_MS;

const byDateThenId = (a: BookRowView, b: BookRowView) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

const minerOfRow = (p: Prepared, row: Pick<BookRowView, 'minerId' | 'characterId' | 'date'>) =>
  row.minerId ?? minerIdFor(row.characterId, p.book.miners, row.date);

function showAdjustments(p: Prepared, rows: readonly BookRowView[]): void {
  const billed = rows.filter((r) => r.state === 'billed').sort(byDateThenId);
  for (const a of p.book.adjustments ?? []) {
    const own = billed.filter((r) => minerOfRow(p, r) === a.minerId);
    if (a.reversed) {
      const row =
        own.find((r) => r.date === a.date) ?? own.find((r) => r.date >= a.date) ?? own.at(-1);
      if (!row) continue;
      row.reversedCorrections = [
        ...(row.reversedCorrections ?? []),
        { amount: a.amount, reason: a.reason, reversedReason: a.reversed.reason },
      ];
      continue;
    }
    const row = own.find((r) => r.date === a.date);
    if (!row) continue;
    row.correction = {
      before: row.correction?.before ?? row.billed,
      after: row.billed + a.amount,
      reasons: [...(row.correction?.reasons ?? []), a.reason],
    };
    row.billed += a.amount;
    row.taxOwed = row.billed;
  }
}

function writeOffReasons(p: Prepared, minerId: string, account: MinerRunningAccount) {
  const out = new Map<string, string[]>();
  const reasonOf = new Map(
    (p.book.writeOffs ?? []).filter((w) => w.minerId === minerId).map((w) => [w.id, w.reason])
  );
  for (const [id, days] of account.writeOffDays()) {
    const reason = reasonOf.get(id);
    if (reason === undefined) continue;
    for (const day of days) {
      const reasons = out.get(day.date) ?? [];
      if (!reasons.includes(reason)) out.set(day.date, [...reasons, reason]);
    }
  }
  return out;
}

function settleRows(p: Prepared, rows: readonly BookRowView[]): UncreditedDonation[] {
  const reasonsBy = new Map<string, Map<string, string[]>>();
  for (const row of rows) {
    if (row.state !== 'billed') continue;
    const minerId = minerOfRow(p, row);
    const account = p.miners.get(minerId)?.account;
    if (!account) continue;
    const day = account.day(row.date);
    if (!day) {
      const cp = account.input.checkpoint;
      if (cp && row.date <= cp.through && !cp.owed.some((d) => d.date === row.date)) {
        row.state = 'paid';
        row.taxOwed = 0;
      }
      continue;
    }
    if (day.held) continue;
    const share = day.tax > 0 ? Math.max(0, row.billed) / day.tax : 0;
    const officer = day.forgiven * share;
    const forgiven = officer + day.writtenOff * share;
    if (forgiven >= 1) row.forgivenIsk = forgiven;
    const reasons =
      officer >= 1
        ? ((
            reasonsBy.get(minerId) ??
            reasonsBy.set(minerId, writeOffReasons(p, minerId, account)).get(minerId)!
          ).get(row.date) ?? [])
        : [];
    if (officer >= 1) {
      row.correction = {
        before: row.correction?.before ?? row.billed,
        after: Math.max(0, row.billed - officer),
        reasons: [...(row.correction?.reasons ?? []), ...reasons],
      };
    }
    const money = (day.credited - day.forgiven) * share;
    if (!day.settled) {
      const charging = Math.max(row.billed, row.correction?.before ?? 0);
      row.taxOwed = Math.max(0, account.owedOf(row.date, charging));
      continue;
    }
    row.taxOwed = 0;
    const credited =
      row.correction !== undefined && row.correction.before >= 0.01 && row.billed < 0.01;
    if (credited && money < 0.01) {
      row.state = 'waived';
      row.dismissalReason = row.correction!.reasons.join(' · ');
      row.billed = row.correction!.before;
      continue;
    }
    if (money < 0.01 && officer >= 0.01) {
      row.state = 'waived';
      row.dismissalReason = reasons.join(' · ');
      row.billed = row.correction?.before ?? row.billed;
      continue;
    }
    row.state = 'paid';
  }
  return uncreditedOf(p, rows);
}

function uncreditedOf(p: Prepared, rows: readonly BookRowView[]): UncreditedDonation[] {
  const left = new Map<string, string[]>();
  const wentBack = (minerId: string, miner: MinerSettlement) => {
    const held = left.get(minerId);
    if (held) return held;
    const withLost = MinerRunningAccount.build({
      ...miner.account.input,
      payments: [
        ...miner.account.input.payments,
        ...p.lost.filter((l) => l.payment.minerId === minerId).map((l) => l.payment),
      ],
    });
    const dates = [...withLost.byDay]
      .filter(([date, d]) => d.settled && miner.account.day(date)?.settled !== true)
      .map(([date]) => date)
      .sort();
    left.set(minerId, dates);
    return dates;
  };
  return p.lost.map(({ donation, payment }, i) => {
    const miner = p.miners.get(payment.minerId);
    if (!miner) return { ...donation, covered: [] };
    const dates = wentBack(payment.minerId, miner);
    const last = !p.lost.slice(i + 1).some((l) => l.payment.minerId === payment.minerId);
    let budget = donation.amount;
    const covered = last
      ? [...dates]
      : dates.filter((date) => {
          const owed = miner.account.day(date)?.remaining ?? 0;
          if (owed > budget) return false;
          budget -= owed;
          return true;
        });
    left.set(
      payment.minerId,
      dates.filter((d) => !covered.includes(d))
    );
    for (const row of rows)
      if (
        row.state === 'billed' &&
        !row.unlinkedDonation &&
        minerOfRow(p, row) === payment.minerId &&
        covered.includes(row.date)
      )
        row.unlinkedDonation = { amount: donation.amount, at: donation.at };
    return { ...donation, covered };
  });
}

function minerRunningAccountsOf(p: Prepared): BookMinerRunningAccount[] {
  return [...p.miners]
    .filter(([, m]) => m.account.byDay.size > 0 || m.payments.length > 0 || m.notices.length > 0)
    .map(([minerId, m]) => ({
      minerId,
      account: m.account,
      lines: m.billable.lines,
      notices: m.notices,
      payments: m.payments,
      code: minerPaymentCode(minerId),
    }));
}

function runningAccountStatusOf(miners: readonly BookMinerRunningAccount[]): PersonalAccountStatus {
  const owing = miners.flatMap((m) => (m.account.owes ? [m.account.owes] : []));
  const paid = miners.flatMap((m) => (m.account.paidThrough ? [m.account.paidThrough] : []));
  const owes: RunningAccountOwes | null =
    owing.length === 0
      ? null
      : {
          amount: owing.reduce((sum, o) => sum + o.amount, 0),
          days: new Set(miners.flatMap((m) => m.account.owedDates())).size,
          oldest: owing.map((o) => o.oldest).sort()[0]!,
        };
  return { paidThrough: paid.sort()[0] ?? null, owes };
}

function unpaidNotices(
  miners: readonly BookMinerRunningAccount[],
  declarations: readonly Declaration[]
): MemberNoticeView[] {
  return miners
    .flatMap((m) =>
      m.notices.flatMap((n): MemberNoticeView[] => {
        const standing = m.account.standingOf(n);
        if (standing.settled) return [];
        const declaration = declarationFor(n.id, declarations);
        const days = n.lines.map((l) => l.date).sort();
        return [
          {
            noticeId: n.id,
            minerId: m.minerId,
            code: n.code ?? paymentCode(n.id),
            issuedAt: n.issuedAt,
            from: days[0] ?? utcDayOf(n.issuedAt),
            through: days.at(-1) ?? utcDayOf(n.issuedAt),
            remaining: standing.remaining,
            ...(declaration ? { declaration } : {}),
          },
        ];
      })
    )
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.noticeId.localeCompare(b.noticeId));
}

function noticeListing(
  p: Prepared,
  minerId: string | undefined,
  recordKey: string
): string | undefined {
  const miners = minerId !== undefined ? [p.miners.get(minerId)] : [...p.miners.values()];
  let found: LateNotice | undefined;
  for (const m of miners)
    for (const n of m?.notices ?? [])
      if (n.lines.some((l) => l.key === recordKey) && (!found || n.issuedAt >= found.issuedAt))
        found = n;
  return found?.id;
}

export interface MadeDonation {
  characterId: number;
  counterpartyId?: number;
  amount: number | null;
  date: string;
  method: string;
  refId?: number;
  stated?: true;
}

export type { HeldPayment };

export function inFlightDonations(
  made: readonly MadeDonation[],
  held: readonly HeldPayment[],
  corporationId: number,
  startDate: string
): InFlightDonation[] {
  const sent = made
    .filter(
      (m): m is MadeDonation & { amount: number } =>
        m.method === 'donation' &&
        m.counterpartyId === corporationId &&
        m.amount !== null &&
        m.amount > 0 &&
        utcDayOf(m.date) >= startDate
    )
    .map((m) => ({
      characterId: m.characterId,
      amount: m.amount,
      at: m.date,
      ...(m.refId !== undefined ? { refId: m.refId } : {}),
      ...(m.stated ? { stated: true as const } : {}),
    }))
    .sort((a, b) => a.at.localeCompare(b.at) || (a.refId ?? 0) - (b.refId ?? 0));
  const taken = new Set<InFlightDonation>();
  const seen = new Set<InFlightDonation>();
  for (const stated of sent.filter((d) => d.stated)) {
    const real = sent.find((d) => !d.stated && !seen.has(d) && matchesStatedTransfer(stated, d));
    if (real) {
      seen.add(real);
      taken.add(stated);
    }
  }
  const gap = (a: { at: string }, b: { at: string }) =>
    Math.abs(Date.parse(a.at) - Date.parse(b.at));
  const pairOff = (
    records: readonly HeldPayment[],
    same: (held: HeldPayment, d: InFlightDonation) => boolean
  ) => {
    const pairs = records
      .flatMap((h, i) => sent.filter((d) => same(h, d)).map((d) => ({ i, d, gap: gap(h, d) })))
      .sort((a, b) => a.gap - b.gap || a.d.at.localeCompare(b.d.at) || a.i - b.i);
    const used = new Set<number>();
    for (const { i, d } of pairs) {
      if (used.has(i) || taken.has(d)) continue;
      used.add(i);
      taken.add(d);
    }
  };
  pairOff(
    held.filter((h) => h.source !== 'manual'),
    (h, d) => (d.stated ? matchesStatedTransfer(d, h) : isSameJournalTransfer(h, d))
  );
  pairOff(
    held.filter((h) => h.source === 'manual'),
    matchesStatedTransfer
  );
  return sent.filter((d) => !taken.has(d));
}
