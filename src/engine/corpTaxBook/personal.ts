/**
 * The member's side of a Corp Tax Book (issue #4065, D12, D24, D28, D30): how
 * the Mining Ledger Entries on the personal Moon Mining Tax tab meet what the
 * corporation's book observed and decided. Pure — the caller loads the book's
 * own lines (rules let a member read exactly those) and the member's ledger.
 *
 * - Before a day is Billable the member's own allocation applies; the corp only
 *   gets a "Pending corp record" hint, never an amount owed.
 * - Once Billable the book decides quantity, price and rate for exactly what
 *   it observed. The member's own ore is only used to attribute: several books
 *   in one system on one day split it by observed quantity (`splitAcrossBooks`),
 *   the book's share comes from ore the member gave no Payee first, and ore
 *   given to another Payee is a visible conflict, not owed, that resolves to
 *   the corp 14 days after the day closed (`resolveBookShare`).
 * - The free ore a book left of an entry it observed is Unattributed, owed to
 *   no one; ore no book observed at all stays Unassigned.
 * - What is paid is read off each of the member's Miners' Running account
 *   (`MinerRunningAccount`, decision 20261120-235011), the one the book itself
 *   reads, with the donations the member sent that the book has not credited
 *   yet added as payments. The member keeps no marks of their own on a book.
 * - A Late notice only says what was asked: one whose days are still unpaid is
 *   the member's overdue notice.
 */
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
import { HOUR_MS } from '@/lib/age';

/**
 * `settling`: ore the member listed for the corporation's own Payee beyond what the book recorded,
 * while the refinery log may still be catching up on the day (`isSettled`). Never billed or
 * flagged; once the day settles the same ore is an `overListed` Conflict.
 */
/**
 * `estimate`: a day the book has not closed yet, owed by what the member listed for the
 * corporation's own Payee (decision 20261125). Owed and payable, but the book bills it only when
 * the day closes, so its figure may still change.
 */
export type BookRowState =
  'billed' | 'estimate' | 'conflict' | 'settling' | 'dismissed' | 'waived' | 'paid';
/**
 * Why a Conflict clashes. `otherPayee`: the member gave the ore to a Payee that is not this
 * corporation's. `overListed`: the member's entry for the corporation's own Payee lists more ore
 * than the book recorded; the Conflict is that excess only. `ownNeedsReview`: the member's own
 * entry for the corporation needs review, so the book cannot take it yet. `ownerCollected`: a
 * Collector's book recorded the ore at a moon owner's refinery, and the member gave it to that
 * moon owner.
 */
export type ConflictCause = 'otherPayee' | 'overListed' | 'ownNeedsReview' | 'ownerCollected';
/** A relabel of a personal row that has no Payee yet, not a row of its own. */
export type BookLabelState = 'pending' | 'unattributed';

/** What the member gave a Payee of one Mining Ledger Entry. */
export interface PersonalAllocation {
  /** The Assignment's id; an allocation without one is never taken over by a book. */
  id?: string;
  payeeId: string;
  taxPct: number;
  oreLines: OreLine[];
  status: string;
  /**
   * A Default System made this and the member has not touched it: it is ore given to no Payee as far
   * as the book is concerned, so each book takes what it recorded of an unpaid one, by quantity,
   * like a corporation's own Payee's; the rest stays with the default Payee. Never a conflict.
   */
  releasable?: boolean;
}

export interface PersonalEntry {
  characterId: number;
  date: string;
  solarSystemId: number;
  /** The whole Mining Ledger Entry. */
  oreLines: OreLine[];
  /** The part of it the member has given to no Payee. */
  freeOreLines: OreLine[];
  allocations: PersonalAllocation[];
}

export interface PersonalBook {
  corporationId: number;
  corpName: string;
  /** The tracked Characters this book is read for; Unattributed is only said of their ore. */
  characterIds?: number[];
  startDate: string;
  graceHours?: number;
  /** The book's last sync by any officer; absent when never synced. */
  lastSyncedAt?: string;
  /**
   * The last sync that read the corp wallet's donations; null when no sync has. Absent on a book
   * whose syncs predate the record: then `lastSyncedAt` stands in for it.
   */
  donationsCheckedAt?: string | null;
  rates: TaxRate[];
  miners: Miner[];
  observed: ObservedMiningEntry[];
  dismissals: Dismissal[];
  /** The member's own Late notices. */
  notices: LateNotice[];
  payments: TaxPayment[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
  /**
   * The member's stored Payees that are this corporation (their verified entity id is its id). Ore
   * given to one of them is the book's own, not another Payee's: it is no conflict, and the book's
   * row replaces the Payee's (`PersonalOverlay.absorbed`).
   */
  ownPayeeIds?: readonly string[];
  /**
   * The member's stored Payees verified as a corporation, by Payee id: the corporation's id. Tells
   * a Collector's conflict over a moon owner's ore apart (`ConflictCause` `ownerCollected`).
   */
  payeeCorporations?: Readonly<Record<string, number>>;
  /** The day's prices at the book's hub and Ore Form, by raw type id (`priceObservedDay`). */
  pricesOn: (date: string) => Pick<DayPrices, 'prices' | 'sources'>;
  /**
   * Donations the member has sent the corp that the book has not credited yet. Each pays only its
   * sender's Miner, as the book credits it.
   */
  inFlight: InFlightDonation[];
  /**
   * Wallet journal refs of the member's donations the book holds for review without counting them
   * (#6207): the book has spent that ISK on nothing yet.
   */
  inReviewRefs?: readonly number[];
  /** Refinery names by structure id, where ESI let the app read them. */
  structureNames?: Record<number, string>;
  /**
   * Moon owners' coverage and read clock, when the reader can see them (#4618, #4622): a day
   * outside coverage owes nothing; a day not read well after its grace is not Billable yet.
   */
  feeders?: readonly (FeederCoverage & Pick<FeederReadClock, 'lastReadWellAt'>)[];
  /** Declarations on the member's own Late notices the book lets them read (#6206). */
  declarations?: readonly Declaration[];
  /** The member's own Conflict disputes (#6206). */
  disputes?: readonly OreDispute[];
  /** The member's own Adjustments the book lets them read (#4622). */
  adjustments?: readonly Adjustment[];
  /** The member's own officer write-offs the book lets them read (#4637). */
  writeOffs?: readonly RecordedWriteOff[];
  /** Officers' per-day limits on what a shortfall may forgive (`toleranceExemptions`). */
  toleranceExemptions?: readonly ToleranceExemption[];
  /** Each of the member's Miners' paid-through day (`minerPaid`), when the book recorded one. */
  minerPaidThrough?: ReadonlyMap<string, string>;
  /** Each of the member's Miners' snapshot (`accounts/{minerId}.snapshot`), by Miner id. */
  checkpoints?: ReadonlyMap<string, RunningAccountCheckpoint>;
}

/** A donation in the member's own wallet journal that the book does not hold yet. */
export interface InFlightDonation {
  characterId: number;
  amount: number;
  at: string;
  /**
   * The member's own wallet journal id for the transfer. The corporation's journal stamps it
   * under a different id, so this does not match anything in the book — it is what the member
   * hands an officer so they can find the ISK, instead of matching by amount and minute.
   */
  refId?: number;
  /**
   * The member said they sent it (Settle up's "Record payment"), to the day: `at` is the end of that
   * day, not a wallet's timestamp, so it is matched to the book's donation within days
   * (`matchesStatedTransfer`) rather than minutes.
   */
  stated?: true;
}

/** A donation the book no longer counts, with the days it paid while it did: what to dispute. */
export interface UncreditedDonation extends InFlightDonation {
  /**
   * The days (dates, oldest first) that went back to Billed when it stopped counting: the ones
   * the member's pooled money paid with it and cannot pay without it.
   */
  covered: string[];
}

/**
 * A donation stops counting as paid once the book read its wallet this long after it and still had
 * not credited it: the wallet journal is cached for an hour, so it most likely went to a division
 * the book does not read (#6204).
 */
export const UNCREDITED_AFTER_HOURS = 2;

/** The miner's own listing of ore the corporation also bills (issue #4517). */
export interface BookOverlap {
  /** The Payees the miner gave that ore to. */
  payeeIds: string[];
  /** The ore both sides claim: what "Let the corporation bill it" would take off the miner's entry. */
  ore: OreLine[];
  /** Every allocation involved is paid (its day on or before its Payee's paid-through). */
  paid: boolean;
}

/** The corporation changed a number it had billed: the old one stays visible next to the new. */
export interface BookCorrection {
  before: number;
  after: number;
  /** The corporation's own words for each change. */
  reasons: string[];
}

export interface BookDispute {
  quantity: boolean;
  rate: boolean;
  personalQuantity: number;
  bookQuantity: number;
  /** The rate the member allocated the day at, when they allocated it at one rate. */
  personalPct?: number;
  bookPct: number;
}

/**
 * A Late notice's latest declaration as the member reads it (#6206): "I paid this another way"
 * waiting for the corporation, or its answer.
 */
export interface MemberDeclaration {
  state: 'waiting' | 'confirmed' | 'rejected';
  /** When it was declared, or answered. */
  at: string;
  amount?: number;
  /** The officer's reason for a rejection. */
  reason?: string;
  /** A rejection's next step: what the officer says the member should do now. */
  nextStep?: string;
  /** The member's own note, read back to them. */
  note?: string;
  /** The transfers sent as proof, and what checking each against the book found. */
  transfers?: ClaimedTransfer[];
  checks?: ClaimCheck[];
  /** Confirmed by the book itself: every transfer was in the corporation's wallet. */
  byBook?: boolean;
}

/** A day the member disputed (#6206, and resolving in the app), and its answer. */
export interface MemberFlag {
  /** `dismissed`: an officer waived the disputed tax (#6206). */
  state: 'sent' | 'rejected' | 'dismissed';
  /** What the member said; a dispute stored before kinds is a payee dispute. */
  kind: DisputeKind;
  /** When it was sent, or answered. */
  at: string;
  /** The officer's reason, when answered. */
  reason?: string;
  /** A kept bill's next step: what the officer says the member should do now. */
  nextStep?: string;
  /** The member's own reason, read back to them. */
  said?: string;
  /** The ore this record's dispute named: what "say it again" repeats on a quantity dispute. */
  lines?: { typeId: number; quantity: number }[];
  /** The rate a `rate` dispute claimed, in percent. */
  claimedPct?: number;
}

/**
 * A day an open dispute holds (resolving in the app): payments skip it and a Conflict day does
 * not resolve to the corporation, until an officer answers or `until` passes (`disputeHold`).
 */
export interface RowHold {
  until: string;
  kind: DisputeKind;
}

/** Whether the member may declare now: never while one waits, or after the corporation confirmed. */
export const canDeclare = (declaration: MemberDeclaration | undefined) =>
  declaration === undefined || declaration.state === 'rejected';

/** The latest declaration on a Late notice (named by `NOTICE_ID_FIELD`), as the member reads it. */
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
  /** Unique across books and rows. */
  id: string;
  corporationId: number;
  corpName: string;
  characterId: number;
  date: string;
  /** The personal entry's system; 0 when the book row could not be lined up with one. */
  solarSystemId: number;
  state: BookRowState;
  /** What this row is about: the quantity the corp bills (or, for a conflict, the contested ore). */
  oreLines: OreLine[];
  /** The member's own Mining Ledger Entry for the day, when one lines up — what "you" says in the diff. */
  personalOreLines?: OreLine[];
  /** Per-unit price by raw type id the book valued the day at. */
  unitPrices: Record<number, number>;
  priceSources: Record<number, string>;
  taxPct: number;
  rateScope: RateScope;
  rateEffectiveFrom?: string;
  estimatedValue: number;
  /** Still owed; `null` for a conflict (visible, not owed), 0 once paid, dismissed or waived. */
  taxOwed: number | null;
  /** The whole bill of the day, before payments. */
  billed: number;
  /** The newest Late notice that asked for this day. */
  noticeId?: string;
  dismissalReason?: string;
  /** A conflict: when it resolves to the corp. */
  resolvesAt?: string;
  /**
   * A conflict: why the two records clash (`ConflictCause`). An `overListed` one is ore the book
   * never recorded: the book never bills it (`billed` 0) and it never resolves to the corporation.
   */
  conflictCause?: ConflictCause;
  /** An `ownerCollected` conflict: the member's Payee that is the moon owner. */
  ownerPayeeId?: string;
  dispute?: BookDispute;
  /** The latest declaration on the day's Late notice (#6206); absent when none was made. */
  declaration?: MemberDeclaration;
  /** A conflict: the record key (`character:refinery:date`) a dispute names (#6206). */
  recordKey?: string;
  /** A conflict the member sent to the corporation (#6206). */
  flagged?: MemberFlag;
  /** An open dispute holds the day: payments skip it (`RowHold`). */
  held?: RowHold;
  /** The refinery that recorded the line. */
  structureId?: number;
  /** The refinery's name, when known; callers fall back to the system. */
  refineryLabel?: string;
  /** The Miner grouping the line bills. */
  minerId?: string;
  /**
   * The member's donation that paid this day until the book synced past it without crediting it
   * (`UncreditedDonation`): why a day the member saw Paid is Billed again, and what to dispute.
   */
  unlinkedDonation?: { amount: number; at: string };
  /** This line's share of the ore the miner's own entry also gives a Payee. */
  overlap?: BookOverlap;
  /** A day the book has not billed yet: an estimate, or the part of one credit already paid. */
  open?: true;
  correction?: BookCorrection;
  /** What the book forgave of the day: an officer's write-off, or a shortfall within the tolerance. */
  forgivenIsk?: number;
  /** Corrections an officer reversed on the day: they no longer count, and stay visible. */
  reversedCorrections?: { amount: number; reason: string; reversedReason: string }[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
}

/** "Paid through {date}" or "Owes X (N days, oldest D)", over the member's Miners in one book. */
export interface PersonalAccountStatus {
  paidThrough: string | null;
  owes: RunningAccountOwes | null;
}

/** One of the member's Miners in a book: its Running account, in-flight donations included. */
export interface BookMinerRunningAccount {
  minerId: string;
  account: MinerRunningAccount;
  /** What this Miner's open days' estimates still ask, after credit: owed on top of `account.owes`. */
  estimate?: number;
  /** What the account bills: each Billable mined line and Adjustment, oldest first. */
  lines: BillableLine[];
  /** Its Late notices, oldest first. */
  notices: LateNotice[];
  /** The book's Tax Payments to it, and the member's in-flight donations, as the account counts them. */
  payments: TaxPayment[];
  /** The Reason code its donations carry (`minerPaymentCode`). */
  code: string;
}

/** A Late notice whose days are still unpaid: the member's overdue notice. */
export interface MemberNoticeView {
  noticeId: string;
  minerId: string;
  /** The code the notice printed (codes on mailed notices stay recognised). */
  code: string;
  issuedAt: string;
  /** The oldest and the newest day it asked for. */
  from: string;
  through: string;
  /** What is still owed on its days. */
  remaining: number;
  declaration?: MemberDeclaration;
}

export interface BookSummary {
  corporationId: number;
  corpName: string;
  startDate: string;
  lastSyncedAt?: string;
  /** The latest Billable day, or undefined with no sync after the grace. */
  closedThrough?: string;
  /** Money ahead of every billed day, over the member's Miners, after it paid any estimate. */
  credit: number;
  /** What the open days' estimates still ask, after credit: owed on top of `account.owes`. */
  estimate: number;
  /** Paid through a day, or what the member owes now. */
  account: PersonalAccountStatus;
  /** Each of the member's Miners' account in this book. */
  miners: BookMinerRunningAccount[];
  /** The member's Late notices whose days are still unpaid, oldest first. */
  notices: MemberNoticeView[];
  /** Donations the book synced past without crediting (`UNCREDITED_AFTER_HOURS`): not counted as paid. */
  uncredited: UncreditedDonation[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
}

export interface PersonalOverlay {
  /** Rows to add to the tab: everything the book decided. */
  rows: BookRowView[];
  /** Per Mining Ledger Entry key, the free ore the books took — the residual row shrinks by it. */
  takenFromFree: Map<string, OreLine[]>;
  /**
   * Per Mining Ledger Entry key, the ids of the Assignments the book took over whole: the tab
   * hides those rows, the book's row stands in for them.
   */
  absorbed: Map<string, Set<string>>;
  /**
   * Per Mining Ledger Entry key, the Assignments the books took only part of, by id: what stays
   * with their Payee, and the share of the Assignment's value that part keeps (at the books' prices).
   */
  trimmed: Map<string, Map<string, { oreLines: OreLine[]; valueShare: number }>>;
  /**
   * Per Mining Ledger Entry key, the Assignments to another Payee whose ore a book bills too (a
   * Billed day, or a Conflict that ran its 14 days), by id: the share of the Assignment's value, as
   * the tab shows it, that is not owed to that Payee as well.
   */
  alsoBilled: Map<string, Map<string, number>>;
  /**
   * Per Mining Ledger Entry key, the Assignments to another Payee whose ore a book also records
   * while the day is still a Conflict, by id: the share of the Assignment's value (as the tab
   * shows it) the Payee waits on. The corporation's row is the day's one bill until the member
   * resolves it; the Payee bills it as resolved then (`alsoBilled`, or its own again).
   */
  conflicted: Map<string, Map<string, number>>;
  /** Per Mining Ledger Entry key, how its remaining free ore reads. */
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

/**
 * One overlap for several books' lines on the same Mining Ledger Entry: every Payee involved,
 * the ore they contest summed, paid only when every part is. What "let each corporation bill
 * what it recorded" takes off the miner's entry in one go; undefined when no line has one.
 */
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

/** The personal entry an Observed Mining Entry lines up with, or undefined. */
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
  // Several systems that day and the book did not say which: the one sharing the most ore.
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
  /** Ore the corp observed. */
  oreLines: OreLine[];
}

interface Prepared {
  book: PersonalBook;
  charges: PreparedCharge[];
  /** Observations nothing can bill yet: unrated or not Billable, lined up with an entry or not. */
  pending: { observed: ObservedMiningEntry; entry?: PersonalEntry }[];
  /** Of `pending`, the priced charges of days not Billable yet: what an estimate is valued from. */
  open: PreparedCharge[];
  /** Each of the member's Miners: the book's Running account, in-flight donations counted. */
  miners: ReadonlyMap<string, MinerSettlement>;
  /** Donations in flight the book synced past without crediting: they pay nothing now. */
  lost: { donation: InFlightDonation; payment: TaxPayment }[];
  /** The latest Billable day; undefined with no sync after the grace. */
  billableThrough: string | undefined;
}

/** A donation the member sent, as a payment of their Miner on the account (`inFlight:` ids). */
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
  // A donation the book synced past without crediting no longer counts (`UNCREDITED_AFTER_HOURS`).
  const checkedAt = donationsCheckedAt(book);
  const counting = book.inFlight.filter((d) => !isUncredited(d, checkedAt));
  const lost = book.inFlight
    .filter((d) => isUncredited(d, checkedAt))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((donation) => ({ donation, payment: inFlightPayment(donation, book.miners) }));
  // A member cannot read the book's Extractions: days sit on the moon stamped on its own rows.
  // Each Miner's account is the book's own, with the member's donations in flight as payments.
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

/** A day as the book priced it. */
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

/** What is left of each of the miner's allocations for the corporation's lines to overlap. */
type PoolItem = { allocation: PersonalAllocation; left: Map<number, number> };
type OverlapPool = PoolItem[];

const overlapPool = (allocations: readonly PersonalAllocation[]): OverlapPool =>
  allocations.map((allocation) => ({
    allocation,
    left: new Map(sumLines(allocation.oreLines).map((l) => [l.typeId, l.quantity])),
  }));

const linesOfLeft = (left: ReadonlyMap<number, number>): OreLine[] =>
  sumLines([...left].map(([typeId, quantity]) => ({ typeId, quantity })));

/** What both hold of each ore type: the smaller quantity. */
const intersectLines = (a: readonly OreLine[], b: readonly OreLine[]): OreLine[] =>
  minusLines(a, minusLines(a, b));

/**
 * The ore both the miner's allocations and one corporation line claim, capped at what the
 * line observed. Takes it out of `pool`, so each line of the day gets its own share. `touching`
 * is every allocation it took from.
 */
function takeOverlap(
  pool: OverlapPool,
  observed: readonly OreLine[]
):
  | {
      overlap: BookOverlap;
      touching: PersonalAllocation[];
      /** What it took of each allocation. */
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

/** Billed, paid or not: a row needing review is the member's to sort out, not the book's to take. */
const isBilledStatus = (a: PersonalAllocation) => a.status === 'paid' || a.status === 'outstanding';

/**
 * Why a conflict clashes with the book (`ConflictCause`): from the allocations it took the
 * contested ore from, and any that still hold some of those ore types, whatever order the member's
 * entry lists them in.
 */
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

/**
 * Takes, by quantity and per ore type, what the book's share covers of the allocations to the
 * corporation's own Payees, then of the unpaid ones a Default System made. What it takes leaves
 * `pool`, so it overlaps nothing and conflicts with nothing, and joins the free ore the share
 * resolves from; the rest stays in `pool` for the next book in the system. Whether the member
 * already paid it is the book's account's to say, never the member's. An allocation that needs
 * review is the member's to sort out, not the book's to take.
 */
function takeOwnAllocations(
  pool: OverlapPool,
  ownPayeeIds: readonly string[] | undefined,
  share: readonly OreLine[]
): {
  lines: OreLine[];
  /** What this book took of each allocation. */
  taken: Map<PoolItem, OreLine[]>;
} {
  const room = new Map(sumLines(share).map((l) => [l.typeId, l.quantity]));
  const lines: OreLine[][] = [];
  const taken = new Map<PoolItem, OreLine[]>();
  const own = (a: PersonalAllocation) => isOwnPayee(ownPayeeIds, a);
  const takeable = (a: PersonalAllocation) =>
    own(a) ? isBilledStatus(a) : a.releasable === true && a.status === 'outstanding';
  // The corporation's own Payee first: that ore is the book's by the member's own word.
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

/**
 * "Let the corporation bill it": each allocation of the miner's entry before and after the
 * overlapping ore comes off it, in order (`index` is its place in `allocations`). Only the overlap
 * goes; anything else the miner listed stays. A paid one too: what its Payee was paid for it
 * becomes credit there, oldest day first.
 */
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

/**
 * How long after a day closes (its grace included) ore the book lacks may still be the refinery
 * log catching up (decision 20261125-184957).
 */
const SETTLE_MS = 6 * HOUR_MS;

/**
 * Whether the refinery log has caught up on a charge's day, so ore the book lacks is really
 * missing: the book holds the miner's ore on a later day at every refinery they mined at in that
 * system that day (the excess can't be tied to one), or `SETTLE_MS` has passed since the day
 * closed. A sync soon after the day closes can predate the log's last writes.
 */
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
  /** The member's side to compare: the book's share of the entry when several books split it. */
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
  // The book rows behind each `alsoBilled` share: a day an officer writes off bills nobody.
  const alsoBilledRows = new Map<string, Map<string, BookRowView[]>>();
  // The ore each personal entry still has free after the books, per entry key.
  const free = new Map(
    entries.map((e) => [entryKey(e.characterId, e.date, e.solarSystemId), e.freeOreLines])
  );
  const entryByKey = new Map(
    entries.map((e) => [entryKey(e.characterId, e.date, e.solarSystemId), e])
  );

  // Charges grouped per personal entry (and the ones no entry matches), per book.
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

  // What every row of one charge shares.
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

  // Ore the member listed for the corporation's own Payee beyond what any book recorded: visible,
  // never owed, never billed, and it never resolves to the corporation (#6203). Until the day
  // settles it is only Settling: the refinery log may still be catching up on the day.
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
    // An open dispute on the record holds the day: computed here, before any payment covers it.
    const held = holdFor(charge.charge.key, book.disputes ?? [], now);
    const common = commonOf(p, charge, value);
    // With several books the member's entry is split among them: each book is held to its share.
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
      // The record a dispute names: a billed day can be disputed too (resolving in the app).
      recordKey: charge.charge.key,
      oreLines: owedLines,
      estimatedValue: worth.estimatedValue,
      taxOwed: worth.taxOwed,
      billed: worth.taxOwed,
      ...(dispute && !conflict ? { dispute } : {}),
      ...(held ? { held } : {}),
    });
  };

  // 1. Entries with a personal counterpart: attribute across the books that are Billable.
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
    // What the books took of each allocation, and the book whose own Payee it names.
    const takenOf = new Map<PoolItem, OreLine[]>();
    const ownedBy = new Map<PoolItem, { p: Prepared; charge: PreparedCharge }>();
    // What a book bills of an allocation to another Payee that still lists it.
    const alsoBilledOf = new Map<PoolItem, { lines: OreLine[]; rows: BookRowView[] }>();
    // What a book contests of an allocation to another Payee while the day is a Conflict.
    const conflictedOf = new Map<PoolItem, OreLine[]>();
    const shareOf = (p: Prepared) => split.byBook.get(String(p.book.corporationId)) ?? [];
    // What the member listed under each corporation's own Payee is that book's to bill: every book
    // takes its own before any book names the Payees it contests, so book order changes nothing.
    const ownOf = new Map(
      claiming.map((p) => [p, takeOwnAllocations(pool, p.book.ownPayeeIds, shareOf(p))])
    );
    for (const p of claiming) {
      const share = shareOf(p);
      const here = chargesOf(p, key);
      const own = ownOf.get(p)!;
      for (const [item, lines] of own.taken)
        takenOf.set(item, sumLines(takenOf.get(item) ?? [], lines));
      // Ore listed for this corporation beyond what any book took is this book's excess (below).
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
      // Own ore is not free ore: only the free part comes off the residual row.
      const freeTaken = minusLines(resolved.fromFree, own.lines);
      left = minusLines(left, freeTaken);
      addTaken(takenFromFree, key, freeTaken);
      // A conflict that ran its 14 days is the corp's decision, owed in full — unless the member
      // disputed it, which holds the day until an officer answers or the hold's own 14 days run
      // out.
      const heldDay = here
        .map((c) => holdFor(c.charge.key, p.book.disputes ?? [], now))
        .find((h) => h !== undefined);
      const contested =
        resolved.conflict.length === 0 || (resolved.conflictOwed && !heldDay)
          ? undefined
          : { resolvesAt: laterOf(resolved.conflictResolvesAt, heldDay?.until) ?? '' };
      // What the member's Payees and this book both claim, whether or not it is still a
      // conflict (after 14 days the book bills it and it is an overlap).
      let remaining = resolved.conflict;
      const day = {
        lines: sumLines(...here.map((c) => c.oreLines)),
        sameRate: new Set(here.map((c) => dayValue(c).taxPct)).size <= 1,
        // With several books the member's entry is split: each is held to its own share.
        ...(claiming.length > 1 ? { share } : {}),
      };
      for (const charge of here) {
        // Hand the contested ore to the first charges that observed it.
        const mine = sumLines(...[charge.oreLines]);
        const claimed = remaining
          .map((l) => ({
            typeId: l.typeId,
            quantity: Math.min(l.quantity, mine.find((m) => m.typeId === l.typeId)?.quantity ?? 0),
          }))
          .filter((l) => l.quantity > 0);
        remaining = minusLines(remaining, claimed);
        const take = contested ? claimed : [];
        // Only the contested ore overlaps a Payee: ore the book took from free ore is the member's
        // to give, and capping here leaves the rest of the pool for the next book in the system.
        // A dismissed charge leaves the pool alone, so the next book can still name the Payee.
        const overlap = charge.dismissal ? undefined : takeOverlap(pool, claimed);
        const firstRow = rows.length;
        // A dismissed charge owes the corporation nothing, so the Payee's claim on its ore
        // clashes with nothing: no conflict, and no overlap to sort out.
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
    // Each allocation the books took part of: the rest stays with its Payee, except what the member
    // listed for a corporation's own Payee beyond any book's share: that excess is the
    // corporation's over-listed conflict, and the book's rows then stand for the whole allocation.
    // Priced at the books' hub prices of the day, for every type the allocation lists.
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
        // Relative to what the tab shows of the Assignment: what stays after any book took part.
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

  // 1b. A day the book has not closed: what the member listed for the corporation's own Payee is
  // owed to it now, as an estimate from the member's own live entry (the refinery log runs behind
  // it). Each refinery the book saw the miner at that day takes the ore it observed, priced and
  // rated as the book will; the rest is placed type by type (below). When the day closes the book
  // bills it (step 1) and the estimate is gone, so nothing is counted twice.
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
      // An officer already dismissed the day: the book will not bill it, so nothing is estimated.
      if (charges.some((c) => c.dismissal)) continue;
      // Lowest refinery id first, in both passes, so a tie always lands the same way.
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
      // Ore the book has not placed yet goes, type by type, to the refinery that yields it: one
      // that recorded the type today, else the one in the system that last did (a moon's ore tells
      // its refinery apart). A type no refinery ever yielded the miner is a row of its own.
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
      // A refinery with no charge yet takes the member's own rate: one Payee, one rate a day.
      const ownPct = own[0]!.taxPct;
      for (const [structureId, lines] of byStructure) {
        const charge = charges.find((c) => c.observed.structureId === structureId);
        const value = charge ? dayValue(charge) : undefined;
        // The book's own price for what it observed; the day's price for what it has not yet.
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
          oreLines: lines,
          estimatedValue: worth.estimatedValue,
          taxOwed: worth.taxOwed,
          billed: worth.taxOwed,
        });
      }
      absorbed.set(key, new Set([...(done ?? []), ...own.map((a) => a.id!)]));
    }
  }

  // 2. What no personal entry lines up with: the book alone decides.
  for (const p of prepared) {
    for (const charge of p.charges) {
      if (charge.entry) continue;
      buildRows(p, charge, charge.oreLines, undefined);
    }
  }

  // 3. A correction is never silent (spec #4504): an Adjustment shows on its day's first line.
  // 4. What is paid is read off each Miner's Running account, oldest day first, and a donation
  // the book synced past without crediting pays nothing now.
  const uncreditedByBook = new Map<number, UncreditedDonation[]>();
  for (const p of prepared) {
    const mine = rowsByBook.get(p.book.corporationId) ?? [];
    showAdjustments(p, mine);
    uncreditedByBook.set(p.book.corporationId, settleRows(p, mine));
  }

  // A day an officer wrote off in full bills nobody: its ore is the other Payee's again.
  for (const [key, ofEntry] of alsoBilledRows) {
    for (const [id, billedRows] of ofEntry) {
      if (billedRows.every((r) => r.state === 'waived')) alsoBilled.get(key)?.delete(id);
    }
    if (alsoBilled.get(key)?.size === 0) alsoBilled.delete(key);
  }

  // 5. How the free ore the books left reads: pending, or unattributed.
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
    // Unattributed is the unclaimed remainder of an entry some book observed (D12);
    // ore no book observed at all stays plain Unassigned.
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

  // 4b. Money ahead of every billed day pays the estimates, oldest first: an estimate it covers
  // reads Paid, and what it misses (ore mined after the payment, or a later price) stays owed.
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

  // #6206: what the member told the corporation, and its answer, on each row it concerns.
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

/** The hold an open dispute naming `recordKey` puts on it at `now`, if any. */
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

/** The later of two ISO instants; either may be missing. */
const laterOf = (a: string | undefined, b: string | undefined) =>
  a === undefined ? b : b === undefined ? a : a > b ? a : b;

/** The dispute naming `recordKey`, as the member reads it. */
function flagFor(
  row: Pick<BookRowView, 'date' | 'characterId' | 'minerId'>,
  recordKey: string,
  disputes: readonly OreDispute[]
): MemberFlag | undefined {
  // An answered day cannot be disputed again (the server refuses it): every row of it says so,
  // not only the ones the dispute named.
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

/** When the book last read its wallet's donations: the last sync, for a book with no record of it. */
const donationsCheckedAt = (book: Pick<PersonalBook, 'lastSyncedAt' | 'donationsCheckedAt'>) =>
  book.donationsCheckedAt === undefined
    ? book.lastSyncedAt
    : (book.donationsCheckedAt ?? undefined);

/** A sync that read the wallet came `UNCREDITED_AFTER_HOURS` after the donation, without it. */
const isUncredited = (d: InFlightDonation, checkedAt: string | undefined) =>
  checkedAt !== undefined &&
  Date.parse(checkedAt) - Date.parse(d.at) >= UNCREDITED_AFTER_HOURS * HOUR_MS;

// --- What is paid, off each Miner's Running account ----------------------------

const byDateThenId = (a: BookRowView, b: BookRowView) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

/** The member's Miner a row bills. */
const minerOfRow = (p: Prepared, row: Pick<BookRowView, 'minerId' | 'characterId' | 'date'>) =>
  row.minerId ?? minerIdFor(row.characterId, p.book.miners, row.date);

/**
 * Each Adjustment on its day's first billed line, the old figure kept beside the new; one with no
 * mined day of its own stands on the account alone (the Payee ledger lists it). A correction an
 * officer reversed no longer counts, and stays in view on its day, or the nearest after it.
 */
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

/** The reasons of the officer write-offs that forgave each date, poured in the order recorded. */
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

/**
 * What the account says of each billed row: owed (its share of what is left of its date), Paid,
 * or Waived when an officer forgave all of it. A donation that stopped counting is named on the
 * days it paid while it counted (`unlinkedDonation`), and listed for the member to dispute.
 */
function settleRows(p: Prepared, rows: readonly BookRowView[]): UncreditedDonation[] {
  const reasonsBy = new Map<string, Map<string, string[]>>();
  for (const row of rows) {
    if (row.state !== 'billed') continue;
    const minerId = minerOfRow(p, row);
    const account = p.miners.get(minerId)?.account;
    if (!account) continue;
    const day = account.day(row.date);
    if (!day) {
      // Closed in the checkpoint the account starts from, and not owed there: paid.
      const cp = account.input.checkpoint;
      if (cp && row.date <= cp.through && !cp.owed.some((d) => d.date === row.date)) {
        row.state = 'paid';
        row.taxOwed = 0;
      }
      continue;
    }
    // A day an open dispute holds is not due: it stays billed in full.
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
      // Never silent (spec #4504): the old figure stays beside what the write-off left.
      row.correction = {
        before: row.correction?.before ?? row.billed,
        after: Math.max(0, row.billed - officer),
        reasons: [...(row.correction?.reasons ?? []), ...reasons],
      };
    }
    const money = (day.credited - day.forgiven) * share;
    if (!day.settled) {
      // `owedOf` shares by what the row charges: its mined tax before a credit correction, and
      // with an officer's raise (the row carries both).
      const charging = Math.max(row.billed, row.correction?.before ?? 0);
      row.taxOwed = Math.max(0, account.owedOf(row.date, charging));
      continue;
    }
    row.taxOwed = 0;
    // An officer's credit that took the whole day (a waived dispute, #6307) closes it too.
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

/**
 * Each donation that stopped counting, with the days that went back to Billed without it: paid on
 * the account with it, unpaid without. A Miner's older such donation takes the oldest of those
 * days its amount reaches; its last one takes what is left, as their money was pooled.
 */
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

/** The member's Miners in a book, each with its account: one that bills, was paid or was asked. */
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

/** Where the member stands over their Miners in one book. */
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

/** The member's Late notices whose days are still unpaid on their Miner's account, oldest first. */
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

/** The newest Late notice of the row's Miner that asked for this record, if any did. */
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

// --- Payments in flight ------------------------------------------------------

/** A donation as the member's own wallet journal shows it (`MadePayment`). */
export interface MadeDonation {
  characterId: number;
  counterpartyId?: number;
  amount: number | null;
  date: string;
  method: string;
  /** The wallet journal id, carried through as the evidence an officer can search on. */
  refId?: number;
  /** Recorded by hand in Settle up, dated to the day (`InFlightDonation.stated`). */
  stated?: true;
}

export type { HeldPayment };

/**
 * Donations the member sent to the corp (their own journal) that the book does not hold yet; the
 * account counts them as the Miner's payments. The corp's journal ids differ from the member's,
 * so a held payment is recognised as the same transfer by the shared rule: a donation the book
 * read from its wallet within minutes (`isSameJournalTransfer`), an officer's hand record within
 * the days a stated transfer may be off (`matchesStatedTransfer`). One held payment is one
 * donation: two equal donations are never both taken for one held payment, the closest pairs are
 * matched first, and the wallet's own records before an officer's hand records.
 */
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
  // A stated donation the member's own wallet now shows is that donation: one counts, not both.
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
  // One to one, the closest pairs first. The donations the book read from its wallet are matched
  // before an officer's hand records: those are the same journal transfer, to the minute, while a
  // hand record is dated by a person and may sit nearer a different donation.
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
