/**
 * The member's side of a Corp Tax Book (issue #4065, D12, D24, D28, D30): how
 * the Mining Ledger Entries on the personal Moon Mining Tax tab meet what the
 * corporation's book observed and decided. Pure — the caller loads the book's
 * own lines (rules let a member read exactly those) and the member's ledger.
 *
 * - Before a day is Billable the member's own allocation applies; the corp only
 *   gets a "Pending corp record" hint, never an amount owed.
 * - Once Billable the book decides quantity, price and rate for exactly what
 *   it observed (an issued Statement's line is that decision, frozen). The
 *   member's own ore is only used to attribute: several books in one system on
 *   one day split it by observed quantity (`splitAcrossBooks`), the book's
 *   share comes from ore the member gave no Payee first, and ore given to
 *   another Payee is a visible conflict, not owed, that resolves to the corp 14
 *   days after the day closed (`resolveBookShare`).
 * - The free ore a book left of an entry it observed is Unattributed, owed to
 *   no one; ore no book observed at all stays Unassigned.
 * - Payments credit the Miner oldest Statement first (`allocatePayments`), and
 *   a Statement's settled days are Paid for good.
 * - An officer's write-off (#4637) reduces a Statement after its payments: the
 *   days it forgives keep the old figure beside the new, and a day it forgives
 *   in full reads Waived.
 */
import { computeAssignmentValue } from '../miningTax/valuation';
import { entryKey, type OreLine } from '../miningTax/types';
import { minusLines, priceMap } from '../miningTax/oreLines';
import { type RecordedWriteOff, type TaxPayment } from './allocation';
import {
  creditSources,
  hasMoney,
  inFlightSources,
  mergePaidBy,
  moneyQueue,
  type MoneySource,
  type PaidBy,
} from './paidBy';
import { isSameTransfer } from './transferMatch';
import { daySettleTolerance } from './runningAccount';
import { exemptionsOf, type ToleranceExemption } from './toleranceExemptions';
import { splitAcrossBooks, resolveBookShare, type BookObservation } from './attribution';
import { dayClosesAt, isDayBillable } from './billable';
import { minerIdFor, type DayCharge, type Miner } from './charges';
import type { FeederCoverage } from './coverage';
import { activeDismissalFor, type Dismissal } from './dismissals';
import type { FeederReadClock } from './feederHealth';
import { settleOpenSet } from './openSet';
import { observedEntryKey } from './observed';
import type { TaxRate, RateScope } from './rates';
import {
  frozenDayRate,
  statementDays,
  type Adjustment,
  type Statement,
  type StatementLine,
} from './statements';
import type { DayPrices } from './valuation';
import type { ObservedMiningEntry } from './types';
import type { ClaimCheck, ClaimedTransfer, Declaration, OverdueStatus } from './overdue';
import { disputeHold, disputeKindOf, type DisputeKind, type OreDispute } from './disputes';
import { DAY_MS } from '@/lib/age';

/** What made a day Paid: the member's own mark, the corporation's settled Statement, or a donation. */
export type BookSettledBy = 'yourMark' | 'statement' | 'donation' | 'credit';

export type BookRowState = 'billed' | 'conflict' | 'dismissed' | 'waived' | 'paid';
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
  /**
   * The member's wallet journal ids of the payment a paid one records: whether the book already
   * holds that payment (it is no longer a donation in flight) decides what a mark can say.
   */
  paymentRefs?: readonly number[];
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
  statements: Statement[];
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
  /** Days after issue an unsettled Statement goes Overdue (the book's setting; 14 by default). */
  overdueDays?: number;
  /** The instant the book switched to a running account (#6294); every book has one (`RUNNING_ACCOUNTS_FROM` when none was stored). */
  runningAccountFrom?: string;
  /** Refinery names by structure id, where ESI let the app read them. */
  structureNames?: Record<number, string>;
  /**
   * Moon owners' coverage and read clock, when the reader can see them (#4618, #4622): a day
   * outside coverage owes nothing; a day not read well after its grace is not Billable yet.
   */
  feeders?: readonly (FeederCoverage & Pick<FeederReadClock, 'lastReadWellAt'>)[];
  /** Declarations on the member's own Statements the book lets them read (#6206). */
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
 * A donation stops counting as paid once the book synced this long after it and still had not
 * credited it: it most likely went to a wallet division the book does not read (#6204).
 */
export const UNCREDITED_AFTER_DAYS = 3;

/** The miner's own listing of ore the corporation also bills (issue #4517). */
export interface BookOverlap {
  /** The Payees the miner gave that ore to. */
  payeeIds: string[];
  /** The ore both sides claim: what "Let the corporation bill it" would take off the miner's entry. */
  ore: OreLine[];
  /** Every allocation involved is marked paid. */
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
 * A Statement's latest declaration as the member reads it (#6206): "I paid this another way"
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

/** The latest declaration on `statementId`, as the member reads it. */
export function declarationFor(
  statementId: string,
  declarations: readonly Declaration[]
): MemberDeclaration | undefined {
  const latest = declarations
    .filter((d) => d.statementId === statementId)
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
  /** How a Paid day was settled; absent while it is owed, dismissed or waived. */
  settledBy?: BookSettledBy;
  /** Whose money paid the day, where the overlay settled it from the book's credit or a donation in flight. Absent while no money reached it. */
  paidBy?: PaidBy;
  /**
   * Paid by the member's own mark while the day's Statement is still unsettled in the book: what
   * the book still shows owed for the day. The corporation has not credited the payment yet.
   */
  bookOwed?: number;
  /**
   * Paid by the member's own mark, not on a Statement, while the book already holds the payment
   * and spent it on these older days first (it pays a Miner's oldest days): why it still bills
   * this one (`bookOwed`).
   */
  bookSpentOn?: string[];
  /** The member's own paid Assignments this row stands in for, so the member can unmark them. */
  markedPaidIds?: string[];
  statementId?: string;
  dismissalReason?: string;
  /** A conflict: when it resolves to the corp. */
  resolvesAt?: string;
  /**
   * A conflict: why the two records clash (`ConflictCause`). An `overListed` one is ore the book
   * never recorded: no Statement bills it (`billed` 0) and it never resolves to the corporation.
   */
  conflictCause?: ConflictCause;
  /** An `ownerCollected` conflict: the member's Payee that is the moon owner. */
  ownerPayeeId?: string;
  dispute?: BookDispute;
  /** The day's Statement's latest declaration (#6206); absent when none was made. */
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
  correction?: BookCorrection;
  /** Of what the day owes, the part officers' corrections charged: a recorded-paid day never forgives it. */
  officerCharge?: number;
  /** What the book's money paid of the day while it still owes the rest (a part-paid day). */
  paidIsk?: number;
  /** What the book forgave of the day's shortfall (a Market adjustment, or a day recorded paid). */
  forgivenIsk?: number;
  /** Corrections an officer reversed on the day: they no longer count, and stay visible. */
  reversedCorrections?: { amount: number; reason: string; reversedReason: string }[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
}

/** "Paid through {date}" or "Owes X (N days, oldest D)", from the member's own book rows. */
export interface PersonalAccountStatus {
  paidThrough: string | null;
  owes: { amount: number; days: number; oldest: string } | null;
}

/** A running account's status from one book's rows: the days still owed, and the last paid one before them. */
export function personalAccountStatus(
  rows: readonly Pick<BookRowView, 'date' | 'state' | 'taxOwed' | 'held'>[]
): PersonalAccountStatus {
  // A day an open dispute holds is not owed now, and neither stops nor advances "paid through".
  const owed = rows.filter((r) => r.state === 'billed' && !r.held && (r.taxOwed ?? 0) > 0);
  const dates = [...new Set(owed.map((r) => r.date))].sort();
  const oldest = dates[0];
  const paid = rows
    .filter((r) => (r.state === 'paid' || r.state === 'waived') && (!oldest || r.date < oldest))
    .map((r) => r.date)
    .sort();
  return {
    paidThrough: paid.at(-1) ?? null,
    owes: oldest
      ? { amount: owed.reduce((s, r) => s + (r.taxOwed ?? 0), 0), days: dates.length, oldest }
      : null,
  };
}

export interface BookSummary {
  corporationId: number;
  corpName: string;
  startDate: string;
  lastSyncedAt?: string;
  /** The latest Billable day, or undefined with no sync after the grace. */
  closedThrough?: string;
  /**
   * Payment the book holds beyond what its Statements bill — printed on the next Statement. On a
   * running account, only what is left once every billed day is paid: the member is that far ahead.
   */
  credit: number;
  /** On a running account (#6294): paid through a day, or what the member owes now. */
  account?: PersonalAccountStatus;
  /** The member's unsettled Statements, oldest first: payments settle them in this order. */
  openStatements: OpenStatementView[];
  /** The member's unsettled Statements past their Overdue days, oldest first. */
  overdue: OverdueStatementView[];
  /** Donations the book synced past without crediting (`UNCREDITED_AFTER_DAYS`): not counted as paid. */
  uncredited: UncreditedDonation[];
  hubId: string;
  oreForm: 'compressed' | 'raw';
}

/** An Overdue Statement as the member reads it, with its latest declaration (#6206). */
export interface OverdueStatementView {
  statementId: string;
  minerId: string;
  code: string;
  periodStart: string;
  periodEnd: string;
  overdueAt: string;
  declaration?: MemberDeclaration;
}

/** A Statement the book has not settled yet. */
export interface OpenStatementView extends Omit<OverdueStatementView, 'overdueAt'> {
  issuedAt: string;
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
   * Per Mining Ledger Entry key, the Assignments to another Payee whose ore a book bills too (on a
   * Statement, or a Conflict that ran its 14 days), by id: the share of the Assignment's value, as
   * the tab shows it, that is not owed to that Payee as well.
   */
  alsoBilled: Map<string, Map<string, number>>;
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
  statement?: { id: string; lines: StatementLine[] };
  /** Whether the day is Billable (always true once on a Statement). */
  billable: boolean;
  /** Ore the corp observed. */
  oreLines: OreLine[];
}

interface Prepared {
  book: PersonalBook;
  charges: PreparedCharge[];
  /** Observations nothing can bill yet: unrated or not Billable, lined up with an entry or not. */
  pending: { observed: ObservedMiningEntry; entry?: PersonalEntry }[];
  /**
   * Per Statement id: settled; what payments credited towards its non-dismissed days; what
   * officer write-offs forgave of it, and their reasons; its Overdue clock while unsettled.
   */
  settlement: Map<
    string,
    {
      settled: boolean;
      pool: number;
      /** The payments that credited the Statement, in the order they were applied. */
      payments: MoneySource[];
      forgiven: number;
      forgivenReasons: string[];
      overdue: OverdueStatus | undefined;
    }
  >;
  /** Credit the book holds per Miner: it pays only that Miner's days. */
  credit: Map<string, number>;
  /** The same credit per Miner as its sources, in the order it is spent. */
  creditSources: Map<string, MoneySource[]>;
  /** The latest Billable day; undefined with no sync after the grace. */
  billableThrough: string | undefined;
}

function prepare(book: PersonalBook, entries: readonly PersonalEntry[], now: string): Prepared {
  // A member cannot read the book's Extractions: days sit on the moon stamped on its own rows.
  const open = settleOpenSet({
    corporationId: book.corporationId,
    now,
    startDate: book.startDate,
    ...(book.graceHours !== undefined ? { graceHours: book.graceHours } : {}),
    ...(book.lastSyncedAt !== undefined ? { lastSyncedAt: book.lastSyncedAt } : {}),
    rates: book.rates,
    entries: book.observed,
    miners: book.miners,
    statements: book.statements,
    payments: book.payments,
    dismissals: book.dismissals,
    ...(book.writeOffs ? { writeOffs: book.writeOffs } : {}),
    ...(book.declarations ? { declarations: book.declarations } : {}),
    ...(book.disputes ? { disputes: book.disputes } : {}),
    ...(book.overdueDays !== undefined ? { overdueDays: book.overdueDays } : {}),
    ...(book.feeders ? { feeders: book.feeders } : {}),
    pricesOn: book.pricesOn,
    placement: { kind: 'observed-rows' },
    // A running account's notices bill no days of their own (#6294): they stay running days.
    ...(book.runningAccountFrom ? { runningAccount: true } : {}),
  });
  const observedByKey = new Map(book.observed.map((o) => [observedEntryKey(o), o]));
  const lineIndex = new Map<string, { id: string; lines: StatementLine[] }>();
  for (const statement of book.statements) {
    if (book.runningAccountFrom && statement.kind === 'notice') continue;
    for (const line of statement.lines) {
      if (!line.chargeKey) continue;
      const held = lineIndex.get(line.chargeKey) ?? { id: statement.id, lines: [] };
      held.lines.push(line);
      lineIndex.set(line.chargeKey, held);
    }
  }
  const prepared: PreparedCharge[] = [];
  const pending: Prepared['pending'] = [];
  for (const charge of open.charges) {
    const observed = observedByKey.get(charge.key)!;
    const statement = lineIndex.get(charge.key);
    const dismissal = activeDismissalFor(charge, book.dismissals);
    const billable =
      statement !== undefined ||
      (open.billableThrough !== undefined && charge.date <= open.billableThrough);
    const entry = matchEntry(observed, entries);
    if (!billable) {
      pending.push({ observed, ...(entry ? { entry } : {}) });
      continue;
    }
    prepared.push({
      charge,
      observed,
      ...(entry ? { entry } : {}),
      ...(dismissal ? { dismissal } : {}),
      ...(statement ? { statement } : {}),
      billable,
      oreLines: charge.oreLines,
    });
  }
  for (const observed of [...open.unrated, ...open.unread]) {
    const entry = matchEntry(observed, entries);
    pending.push({ observed, ...(entry ? { entry } : {}) });
  }

  // Payments credit each Miner's Statements, oldest first (D5/D15).
  const settlement: Prepared['settlement'] = new Map();
  const credit = new Map<string, number>();
  const sources = new Map<string, MoneySource[]>();
  for (const [minerId, miner] of open.miners) {
    const { allocation } = miner;
    if (allocation.credit > 0) {
      credit.set(minerId, allocation.credit);
      sources.set(minerId, creditSources(miner.payments, allocation, book.startDate));
    }
    const writeOffs = (book.writeOffs ?? []).filter((w) => w.minerId === minerId);
    for (const s of miner.statements) {
      const result = allocation.byStatement.get(s.id);
      const dismissed = miner.dismissalCredits
        .filter((c) => c.statementId === s.id)
        .reduce((sum, c) => sum + c.amount, 0);
      const forgiven = result?.forgiven ?? 0;
      const forgivenReasons = [
        ...new Set(
          allocation.writeOffCredits
            .filter((c) => c.statementId === s.id)
            .map((c) => writeOffs.find((w) => w.id === c.writeOffId)?.reason ?? '')
            .filter((r) => r !== '')
        ),
      ];
      settlement.set(s.id, {
        settled: result?.settled ?? false,
        pool: Math.max(0, (result?.credited ?? 0) - dismissed - forgiven),
        payments: allocation.paymentCredits
          .filter((c) => c.statementId === s.id)
          .map((c): MoneySource => ({ kind: 'payment', paymentId: c.paymentId, amount: c.amount })),
        forgiven,
        forgivenReasons,
        overdue: miner.overdue.get(s.id),
      });
    }
  }
  return {
    book,
    charges: prepared,
    pending,
    settlement,
    credit,
    creditSources: sources,
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
  const { charge, statement } = p;
  if (!statement) {
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
  // What the Statement billed, frozen: every line of this day (late ore adds lines).
  const lines = sumLines(...statement.lines.map((l) => l.oreLines));
  const first = statement.lines[0];
  const estimatedValue = statement.lines.reduce((sum, l) => sum + l.estimatedValue, 0);
  const tax = statement.lines.reduce((sum, l) => sum + l.tax, 0);
  const { taxPct, rateEffectiveFrom } = frozenDayRate(statement.lines, charge);
  return {
    lines,
    unitPrices: first.unitPrices ?? charge.unitPrices,
    priceSources: (first.priceSources as Record<number, string> | undefined) ?? charge.priceSources,
    taxPct,
    ...(rateEffectiveFrom !== undefined ? { rateEffectiveFrom } : {}),
    estimatedValue,
    tax,
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

/** Paid or owed: a row needing review is the member's to sort out, not the book's to take. */
const isSettledStatus = (a: PersonalAllocation) =>
  a.status === 'paid' || a.status === 'outstanding';

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
  if (listing.some((a) => isOwnPayee(book.ownPayeeIds, a) && !isSettledStatus(a))) {
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
 * resolves from; the rest stays in `pool` for the next book in the system. `paidLines` is the part
 * the member already paid: their side is done, and the corporation confirms it against its wallet.
 * An allocation that needs review is the member's to sort out, not the book's to take.
 */
function takeOwnAllocations(
  pool: OverlapPool,
  ownPayeeIds: readonly string[] | undefined,
  share: readonly OreLine[]
): {
  lines: OreLine[];
  paidLines: OreLine[];
  paidIds: string[];
  /** The journal ids of the payments those paid allocations record. */
  paidRefs: number[];
  /** What this book took of each allocation. */
  taken: Map<PoolItem, OreLine[]>;
} {
  const room = new Map(sumLines(share).map((l) => [l.typeId, l.quantity]));
  const lines: OreLine[][] = [];
  const paid: OreLine[][] = [];
  const paidIds: string[] = [];
  const paidRefs: number[] = [];
  const taken = new Map<PoolItem, OreLine[]>();
  const own = (a: PersonalAllocation) => isOwnPayee(ownPayeeIds, a);
  const takeable = (a: PersonalAllocation) =>
    own(a) ? isSettledStatus(a) : a.releasable === true && a.status === 'outstanding';
  // The corporation's own Payee first: that ore is the book's by the member's own word.
  const order = [
    ...pool.filter((item) => own(item.allocation)),
    ...pool.filter((item) => !own(item.allocation)),
  ];
  for (const item of order) {
    const { allocation } = item;
    const { id } = allocation;
    if (id === undefined || !takeable(allocation)) continue;
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
    if (allocation.status === 'paid') {
      paid.push(listed);
      paidIds.push(id);
      paidRefs.push(...(allocation.paymentRefs ?? []));
    }
  }
  return { lines: sumLines(...lines), paidLines: sumLines(...paid), paidIds, paidRefs, taken };
}

/**
 * "Let the corporation bill it": each unpaid allocation of the miner's entry
 * before and after the overlapping ore comes off it, in order (`index` is its place in `allocations`). Only the
 * overlap goes; anything else the miner listed stays.
 */
export function previewTakeover(
  allocations: readonly PersonalAllocation[],
  overlap: readonly OreLine[]
): { index: number; payeeId: string; before: OreLine[]; after: OreLine[] }[] {
  let left = sumLines(overlap);
  const out: { index: number; payeeId: string; before: OreLine[]; after: OreLine[] }[] = [];
  for (const [index, allocation] of allocations.entries()) {
    if (allocation.status === 'paid') continue;
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
  // The book rows behind each `alsoBilled` share: a day an officer writes off bills nobody.
  const alsoBilledRows = new Map<string, Map<string, BookRowView[]>>();
  // Per book, per entry key: the ore the member already paid under the corporation's own Payee.
  const memberPaid = new Map<number, Map<string, OreLine[]>>();
  // The ids of those paid Assignments, kept so a row they paid can offer to unmark them.
  const memberPaidIds = new Map<number, Map<string, string[]>>();
  // And the journal ids of the payments those marks record.
  const memberPaidRefs = new Map<number, Map<string, number[]>>();

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
  // never owed, never billed, and it never resolves to the corporation (#6203).
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
      state: 'conflict',
      oreLines: excess,
      estimatedValue: worth.estimatedValue,
      taxOwed: null,
      billed: 0,
      conflictCause: 'overListed',
      overlap: { payeeIds: [allocation.payeeId], ore: excess, paid: allocation.status === 'paid' },
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
        ...(charge.statement ? { statementId: charge.statement.id } : {}),
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
      ...(charge.statement ? { statementId: charge.statement.id } : {}),
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
    const shareOf = (p: Prepared) => split.byBook.get(String(p.book.corporationId)) ?? [];
    // What the member listed under each corporation's own Payee is that book's to bill: every book
    // takes its own before any book names the Payees it contests, so book order changes nothing.
    const ownOf = new Map(
      claiming.map((p) => [p, takeOwnAllocations(pool, p.book.ownPayeeIds, shareOf(p))])
    );
    for (const p of claiming) {
      const share = shareOf(p);
      const here = chargesOf(p, key);
      const onStatement = here.every((c) => c.statement !== undefined);
      const own = ownOf.get(p)!;
      for (const [item, lines] of own.taken)
        takenOf.set(item, sumLines(takenOf.get(item) ?? [], lines));
      // Ore listed for this corporation beyond what any book took is this book's excess (below).
      const anchor = here.find((c) => !c.dismissal);
      if (!onStatement && anchor) {
        for (const item of pool) {
          const a = item.allocation;
          if (
            !ownedBy.has(item) &&
            a.id !== undefined &&
            isSettledStatus(a) &&
            isOwnPayee(p.book.ownPayeeIds, a)
          )
            ownedBy.set(item, { p, charge: anchor });
        }
      }
      if (own.paidLines.length > 0) {
        const paidOf = memberPaid.get(p.book.corporationId) ?? new Map<string, OreLine[]>();
        paidOf.set(key, sumLines(paidOf.get(key) ?? [], own.paidLines));
        memberPaid.set(p.book.corporationId, paidOf);
        const idsOf = memberPaidIds.get(p.book.corporationId) ?? new Map<string, string[]>();
        idsOf.set(key, [...(idsOf.get(key) ?? []), ...own.paidIds]);
        memberPaidIds.set(p.book.corporationId, idsOf);
        const refsOf = memberPaidRefs.get(p.book.corporationId) ?? new Map<string, number[]>();
        refsOf.set(key, [...(refsOf.get(key) ?? []), ...own.paidRefs]);
        memberPaidRefs.set(p.book.corporationId, refsOf);
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
      // A day on a Statement is the corp's decision, owed in full; so is a conflict that ran its
      // 14 days — unless the member disputed it, which holds the day until an officer answers or
      // the hold's own 14 days run out.
      const heldDay = here
        .map((c) => holdFor(c.charge.key, p.book.disputes ?? [], now))
        .find((h) => h !== undefined);
      const contested =
        onStatement || resolved.conflict.length === 0 || (resolved.conflictOwed && !heldDay)
          ? undefined
          : { resolvesAt: laterOf(resolved.conflictResolvesAt, heldDay?.until) ?? '' };
      // What the member's Payees and this book both claim, whether or not it is still a
      // conflict (on a Statement, or after 14 days, the book bills it and it is an overlap).
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

  // 2. What no personal entry lines up with: the book alone decides.
  for (const p of prepared) {
    for (const charge of p.charges) {
      if (charge.entry) continue;
      buildRows(p, charge, charge.oreLines, undefined);
    }
  }

  // 3. A correction is never silent (spec #4504): an Adjustment shows on its day's first line.
  const extras = new Map<BookRowView, OwedPart[]>();
  for (const p of prepared) applyAdjustments(p, rowsByBook.get(p.book.corporationId) ?? [], extras);

  // 4. Payments: a Statement's days are Paid oldest first; part payments land on the oldest days.
  // A raise billed on another Statement than its day's (or not billed yet) is owed on its own.
  // An officer write-off then forgives the next open days of its Statement (#4637).
  const uncreditedByBook = new Map<number, UncreditedDonation[]>();
  /** Per book: the book's credit no open day took, summed over Miners (a running account's "ahead"). */
  const aheadByBook = new Map<number, number>();
  for (const p of prepared) {
    const mine = rowsByBook.get(p.book.corporationId) ?? [];
    const partsOf = new Map<BookRowView, OwedPart[]>();
    const byStatement = new Map<string, { row: BookRowView; part: OwedPart }[]>();
    for (const row of mine) {
      if (row.state !== 'billed') continue;
      const extra = extras.get(row) ?? [];
      if (!row.statementId && extra.every((e) => e.statementId === undefined)) continue;
      const own = (row.taxOwed ?? 0) - extra.reduce((sum, e) => sum + e.owed, 0);
      const parts = [
        { ...(row.statementId ? { statementId: row.statementId } : {}), owed: own },
        ...extra.map((e) => ({ ...e })),
      ];
      partsOf.set(row, parts);
      for (const part of parts) {
        if (part.statementId === undefined) continue;
        byStatement.set(part.statementId, [
          ...(byStatement.get(part.statementId) ?? []),
          { row, part },
        ]);
      }
    }
    const settledParts = new Set<OwedPart>();
    const billedOf = new Map(
      [...partsOf].map(([row, parts]) => [row, parts.reduce((sum, part) => sum + part.owed, 0)])
    );
    const forgivenOf = new Map<BookRowView, { amount: number; reasons: string[] }>();
    for (const [statementId, list] of byStatement) {
      const state = p.settlement.get(statementId);
      if (!state) continue;
      let pool = state.pool;
      let forgive = state.forgiven;
      const payers = moneyQueue(state.payments);
      for (const { row, part } of list.sort(
        (a, b) => a.row.date.localeCompare(b.row.date) || a.row.id.localeCompare(b.row.id)
      )) {
        const owed = part.owed;
        settledParts.add(part);
        const fromPool = Math.min(pool, owed);
        pool = Math.max(0, pool - fromPool);
        if (fromPool > 0) row.paidBy = mergePaidBy(row.paidBy, payers.draw(fromPool));
        const fromForgiven = Math.min(forgive, owed - fromPool);
        if (fromForgiven > 0) {
          forgive -= fromForgiven;
          const held = forgivenOf.get(row) ?? { amount: 0, reasons: [] };
          held.amount += fromForgiven;
          for (const r of state.forgivenReasons)
            if (!held.reasons.includes(r)) held.reasons.push(r);
          forgivenOf.set(row, held);
        }
        // A settled Statement owes nothing more: the tolerance wrote off any shortfall.
        part.owed = state.settled ? 0 : owed - fromPool - fromForgiven;
      }
    }
    for (const [row, parts] of partsOf) {
      const forgiven = forgivenOf.get(row);
      // What the officer forgave is listed beside the payments that paid the rest of the day.
      if (forgiven && row.paidBy)
        row.paidBy = mergePaidBy(row.paidBy, {
          payments: [],
          inFlight: [],
          writtenOff: forgiven.amount,
        });
      if (forgiven) {
        // Never silent (spec #4504): the old figure stays beside what the write-off left.
        const before = row.correction?.before ?? row.billed;
        const after = (row.correction?.after ?? row.billed) - forgiven.amount;
        row.correction = {
          before,
          after: Math.max(0, after),
          reasons: [...(row.correction?.reasons ?? []), ...forgiven.reasons],
        };
      }
      // Paid once every part was billed on a Statement and nothing of it is left;
      // Waived when a write-off forgave all of it.
      if (parts.every((part) => settledParts.has(part) && part.owed === 0)) {
        const writtenOff =
          forgiven !== undefined && (billedOf.get(row) ?? 0) - forgiven.amount < 0.01;
        // An officer's credit that took the whole day (a waived dispute, #6307) closes it too.
        const credited =
          row.correction !== undefined &&
          row.correction.before >= 0.01 &&
          row.correction.after < 0.01;
        const waived = writtenOff || credited;
        row.state = waived ? 'waived' : 'paid';
        if (!waived) row.settledBy = 'statement';
        row.taxOwed = 0;
        if (waived) {
          row.dismissalReason = (
            writtenOff ? forgiven.reasons : (row.correction?.reasons ?? [])
          ).join(' · ');
          // Amount forgiven, as a write-off leaves it.
          if (row.correction) row.billed = row.correction.before;
        }
      } else {
        row.taxOwed = parts.reduce((sum, part) => sum + part.owed, 0);
      }
    }
    // What the member paid under the corporation's own Payee is paid on their side, on the days
    // they marked: their record governs which days *they* consider paid. The corporation still
    // confirms it against its wallet. Money they sent beyond those days (a donation in flight, or
    // credit the book holds) pays the other open days below, oldest first, as the book will.
    const paidOf = memberPaid.get(p.book.corporationId);
    const refsOf = memberPaidRefs.get(p.book.corporationId);
    // The same payment may also be a donation in flight or credit the book holds: count it once,
    // per Miner.
    const creditedByMark = new Map<string, number>();
    const minerOf = (row: BookRowView) => row.minerId ?? minerIdFor(row.characterId, p.book.miners);
    // A day an open dispute holds is skipped: the money pays the next oldest instead.
    const openNow = () =>
      mine.filter((r) => r.state === 'billed' && (r.taxOwed ?? 0) > 0 && !r.held);
    // The book's own picture before any mark: its credit pays each Miner's oldest open days first.
    const bookCovered = spendOldestFirst(openNow(), minerOf, p.credit);
    const inFlightRefs = new Set(
      p.book.inFlight.flatMap((d) => (d.refId === undefined ? [] : [d.refId]))
    );
    const inReviewRefs = new Set(p.book.inReviewRefs ?? []);
    if (paidOf) {
      for (const row of mine) {
        if (row.state !== 'billed' || (row.taxOwed ?? 0) <= 0) continue;
        const key = entryKey(row.characterId, row.date, row.solarSystemId);
        const left = paidOf.get(key);
        if (!left) continue;
        const covered = row.oreLines
          .map((l) => ({
            typeId: l.typeId,
            quantity: Math.min(l.quantity, left.find((x) => x.typeId === l.typeId)?.quantity ?? 0),
          }))
          .filter((l) => l.quantity > 0);
        if (covered.length === 0) continue;
        paidOf.set(key, minusLines(left, covered));
        const { taxOwed } = computeAssignmentValue(covered, priceMap(row.unitPrices), row.taxPct);
        const before = row.taxOwed ?? 0;
        const worth = Math.min(before, taxOwed);
        creditedByMark.set(minerOf(row), (creditedByMark.get(minerOf(row)) ?? 0) + worth);
        if (worth < before - daySettleTolerance(before)) {
          // Part of the day: it owes less.
          row.taxOwed = before - worth;
          continue;
        }
        row.taxOwed = 0;
        row.state = 'paid';
        row.settledBy = 'yourMark';
        if (row.statementId !== undefined) {
          // The member's side is done; the book's Statement still bills the day until it credits it.
          if (p.settlement.get(row.statementId)?.settled !== true) row.bookOwed = before;
          continue;
        }
        // The book already holds the payment the mark names, yet its credit went to older days
        // it still bills (it pays the oldest first): the book still bills this one. Said, not hidden.
        const refs = refsOf?.get(key) ?? [];
        const held =
          refs.length > 0 && refs.every((ref) => !inFlightRefs.has(ref) && !inReviewRefs.has(ref));
        const reached = bookCovered.get(row) ?? 0;
        if (!held || reached >= before - daySettleTolerance(before)) continue;
        const spentOn = mine
          .filter(
            (r) =>
              r !== row &&
              minerOf(r) === minerOf(row) &&
              (bookCovered.get(r) ?? 0) > 0 &&
              (r.date < row.date || (r.date === row.date && r.id < row.id))
          )
          .map((r) => r.date)
          .sort();
        // No older day took the credit: nothing to say beyond the mark.
        if (spentOn.length === 0) continue;
        row.bookOwed = before - reached;
        row.bookSpentOn = [...new Set(spentOn)];
      }
    }
    // Donations sent and not yet credited, and credit the book holds for no
    // Statement yet, pay the oldest Billed days: the member's side is done,
    // and a corp that disagrees bills them again. Counting the credit keeps a
    // day Paid once the book credits the donation that paid it.
    // Each Miner's money pays only that Miner's days, as the book credits it. A donation the
    // book synced past without crediting no longer counts (`UNCREDITED_AFTER_DAYS`).
    const checkedAt = donationsCheckedAt(p.book);
    const counting = p.book.inFlight.filter((d) => !isUncredited(d, checkedAt));
    // Oldest first: the oldest takes the oldest days it unlinked.
    const lost = p.book.inFlight
      .filter((d) => isUncredited(d, checkedAt))
      .sort((a, b) => a.at.localeCompare(b.at));
    const ahead = new Map(p.credit);
    for (const d of counting) {
      const minerId = minerIdFor(d.characterId, p.book.miners);
      ahead.set(minerId, (ahead.get(minerId) ?? 0) + d.amount);
    }
    const lostBy = new Map<string, number>();
    for (const d of lost) {
      const minerId = minerIdFor(d.characterId, p.book.miners);
      lostBy.set(minerId, (lostBy.get(minerId) ?? 0) + d.amount);
    }
    const open = openNow();
    const reductions: [BookRowView, number, number | undefined][] = [];
    // A day an officer set a limit on forgives up to that, not the book's tolerance.
    const toleranceOf = (minerId: string, r: BookRowView) => {
      const limits = exemptionsOf(p.book.toleranceExemptions, minerId);
      return limits.has(r.date) ? { tolerance: limits.get(r.date)! } : {};
    };
    /** Per Miner: the days the uncredited money paid while it counted, oldest first. */
    const unlinked = new Map<string, BookRowView[]>();
    for (const minerId of new Set([...ahead.keys(), ...lostBy.keys()])) {
      const amount = ahead.get(minerId) ?? 0;
      const mark = creditedByMark.get(minerId) ?? 0;
      const own = open.filter((r) => minerOf(r) === minerId);
      const limits = exemptionsOf(p.book.toleranceExemptions, minerId);
      const days = own.map((r) => ({
        id: r.id,
        date: r.date,
        taxOwed: r.taxOwed ?? 0,
        ...toleranceOf(minerId, r),
      }));
      const paid = coverInFlight(days, Math.max(0, amount - mark));
      // Whose money paid each day: the pool as a queue of its sources, the mark spending the front.
      const queue = moneyQueue([
        ...(p.creditSources.get(minerId) ?? []),
        ...inFlightSources(
          counting.filter((d) => minerIdFor(d.characterId, p.book.miners) === minerId)
        ),
      ]);
      queue.skip(mark);
      let toSpend = Math.max(0, amount - mark);
      for (const row of [...own].sort(byDateThenId)) {
        if (!paid.has(row.id)) continue;
        // `coverInFlight` pays a day whole, or within the tolerance: what reached it is what was left.
        const applied = Math.min(toSpend, row.taxOwed ?? 0);
        // What the money fell short of, within the tolerance, is forgiven (a Market adjustment).
        if ((row.taxOwed ?? 0) - applied >= 1) row.forgivenIsk = (row.taxOwed ?? 0) - applied;
        toSpend -= applied;
        const drawn = queue.draw(applied);
        if (hasMoney(drawn)) row.paidBy = mergePaidBy(row.paidBy, drawn);
      }
      // The same pooled allocation with the uncredited money still in it: the days it adds are
      // exactly the ones that went back to Billed when it stopped counting.
      const withLost = lostBy.has(minerId)
        ? coverInFlight(days, Math.max(0, amount + (lostBy.get(minerId) ?? 0) - mark))
        : paid;
      // What the money left once the days it paid were paid: only the book's own credit counts.
      const spent = own.filter((r) => paid.has(r.id)).reduce((s, r) => s + (r.taxOwed ?? 0), 0);
      const left = Math.max(0, amount - mark - spent);
      let spare = Math.min(p.credit.get(minerId) ?? 0, left);
      // On a running account the book's money reduces the oldest unpaid day, as its allocator
      // does, so only a true overpayment is left as credit.
      // Applied after the uncredited donations below, which read the days' original amounts.
      if (p.book.runningAccountFrom !== undefined) {
        for (const row of [...own].sort(byDateThenId)) {
          if (spare <= 0) break;
          if (paid.has(row.id) || row.held) continue;
          const take = Math.min(spare, row.taxOwed ?? 0);
          if (take <= 0) continue;
          reductions.push([row, take, limits.get(row.date)]);
          spare -= take;
        }
      }
      aheadByBook.set(p.book.corporationId, (aheadByBook.get(p.book.corporationId) ?? 0) + spare);
      // Days the book's own credit reaches are settled by that credit; only the rest is a
      // donation the member sent that the book has not credited yet.
      const byCredit = coverInFlight(days, Math.max(0, (p.credit.get(minerId) ?? 0) - mark));
      for (const row of own) {
        if (paid.has(row.id)) {
          row.state = 'paid';
          row.settledBy = byCredit.has(row.id) ? 'credit' : 'donation';
          row.taxOwed = 0;
        }
      }
      unlinked.set(
        minerId,
        own
          .filter((r) => withLost.has(r.id) && !paid.has(r.id))
          .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      );
    }
    // An uncredited donation pays nothing now; the member disputes it by the days it paid.
    const uncredited: UncreditedDonation[] = lost.map((d, i) => {
      const minerId = minerIdFor(d.characterId, p.book.miners);
      const left = unlinked.get(minerId) ?? [];
      const lastOfMiner = !lost
        .slice(i + 1)
        .some((x) => minerIdFor(x.characterId, p.book.miners) === minerId);
      // The Miner's last such donation takes what is left: its money was pooled with the rest.
      const ids = lastOfMiner
        ? new Set(left.map((r) => r.id))
        : coverInFlight(
            left.map((r) => ({
              id: r.id,
              date: r.date,
              taxOwed: r.taxOwed ?? 0,
              ...toleranceOf(minerId, r),
            })),
            d.amount
          );
      const rows = left.filter((r) => ids.has(r.id));
      unlinked.set(
        minerId,
        left.filter((r) => !ids.has(r.id))
      );
      for (const row of rows) row.unlinkedDonation = { amount: d.amount, at: d.at };
      return { ...d, covered: rows.map((r) => r.date) };
    });
    uncreditedByBook.set(p.book.corporationId, uncredited);
    for (const [row, take, limit] of reductions) {
      row.taxOwed = (row.taxOwed ?? 0) - take;
      row.paidIsk = (row.paidIsk ?? 0) + take;
      // A day an officer let forgive up to an amount: money reached it, so it forgives what it names.
      if (limit && row.taxOwed > 0) {
        const forgiven = Math.min(limit, row.taxOwed);
        row.taxOwed -= forgiven;
        row.forgivenIsk = (row.forgivenIsk ?? 0) + forgiven;
      }
      // A day the book's money covers to the last ISK is Paid, not a Billed row owing nothing.
      if (row.taxOwed < 0.01) {
        row.taxOwed = 0;
        row.state = 'paid';
        row.settledBy = 'credit';
      }
    }
    // A day the book recorded paid stays closed (D22): what it still shows owed, but for officers'
    // charges, is forgiven. A day an officer set a limit on keeps that limit instead.
    const recordedThrough = p.book.minerPaidThrough;
    if (recordedThrough && p.book.runningAccountFrom !== undefined) {
      for (const [minerId, through] of recordedThrough) {
        const limits = exemptionsOf(p.book.toleranceExemptions, minerId);
        const pinned = mine
          .filter(
            (r) =>
              minerOf(r) === minerId &&
              r.state === 'billed' &&
              !r.held &&
              r.date <= through &&
              !limits.has(r.date)
          )
          .sort(byDateThenId);
        let charges = pinned.reduce(
          (sum, r) => sum + Math.min(r.officerCharge ?? 0, Math.max(0, r.billed)),
          0
        );
        for (const row of pinned) {
          const owed = row.taxOwed ?? 0;
          if (owed <= 0) continue;
          const stays = Math.min(charges, owed);
          charges -= stays;
          if (owed - stays >= 0.01) row.forgivenIsk = (row.forgivenIsk ?? 0) + (owed - stays);
          row.taxOwed = stays;
          if (stays < 0.01) {
            row.taxOwed = 0;
            row.state = 'paid';
            row.settledBy = 'credit';
          }
        }
      }
    }
    // Whatever settled the day, the member's own paid mark under the corporation's Payee stays
    // theirs to undo: the book row hides it, so the row has to carry it.
    const markedIds = memberPaidIds.get(p.book.corporationId);
    if (markedIds) {
      for (const row of mine) {
        const ids = markedIds.get(entryKey(row.characterId, row.date, row.solarSystemId));
        if (ids?.length && row.state !== 'conflict') row.markedPaidIds = [...ids];
      }
    }
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

  const summaries: BookSummary[] = prepared.map((p) => {
    const closedThrough = p.billableThrough;
    return {
      corporationId: p.book.corporationId,
      corpName: p.book.corpName,
      startDate: p.book.startDate,
      ...(p.book.lastSyncedAt !== undefined ? { lastSyncedAt: p.book.lastSyncedAt } : {}),
      ...(closedThrough !== undefined ? { closedThrough } : {}),
      credit: p.book.runningAccountFrom
        ? (aheadByBook.get(p.book.corporationId) ?? 0)
        : [...p.credit.values()].reduce((sum, c) => sum + c, 0),
      ...accountAndOpen(p, rowsByBook.get(p.book.corporationId) ?? []),
      uncredited: uncreditedByBook.get(p.book.corporationId) ?? [],
      hubId: p.book.hubId,
      oreForm: p.book.oreForm,
    };
  });

  // #6206: what the member told the corporation, and its answer, on each row it concerns.
  for (const row of rows) {
    const book = books.find((b) => b.corporationId === row.corporationId);
    if (row.statementId !== undefined) {
      const declaration = declarationFor(row.statementId, book?.declarations ?? []);
      if (declaration) row.declaration = declaration;
    }
    if (row.recordKey !== undefined) {
      const flagged = flagFor(row, row.recordKey, book?.disputes ?? []);
      if (flagged) row.flagged = flagged;
    }
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { rows, takenFromFree, absorbed, trimmed, alsoBilled, labels, books: summaries };
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

/**
 * What each Miner's `amounts` pay of `rows`, oldest first, as the book spends credit: whole days,
 * then what is left lowers the next one.
 */
function spendOldestFirst(
  rows: readonly BookRowView[],
  minerOf: (row: BookRowView) => string,
  amounts: ReadonlyMap<string, number>
): Map<BookRowView, number> {
  const paid = new Map<BookRowView, number>();
  for (const [minerId, amount] of amounts) {
    let left = amount;
    for (const row of rows
      .filter((r) => minerOf(r) === minerId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
      if (left <= 0) break;
      const take = Math.min(left, row.taxOwed ?? 0);
      paid.set(row, take);
      left -= take;
    }
  }
  return paid;
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

/** A sync that read the wallet came `UNCREDITED_AFTER_DAYS` after the donation, without it. */
const isUncredited = (d: InFlightDonation, checkedAt: string | undefined) =>
  checkedAt !== undefined &&
  Date.parse(checkedAt) - Date.parse(d.at) >= UNCREDITED_AFTER_DAYS * DAY_MS;

/** The member's unsettled Statements, and those past their Overdue days, oldest first. */
/**
 * The open Statements and Overdue, and on a running account (#6294) where the member stands. A
 * late notice is not a bill of its own: only the newest stays open, for its code, while the member
 * owes, and it is never Overdue here (its days are the account's).
 */
function accountAndOpen(p: Prepared, rows: readonly BookRowView[]) {
  const all = openAndOverdue(p);
  // A Statement every day of which an officer wrote off or waived is done: nothing to pay or
  // chase (#6307), though its credit may only reach the book with the next Statement.
  const closed = new Set(
    all.openStatements
      .map((s) => s.statementId)
      .filter((id) => {
        const days = rows.filter((r) => r.statementId === id);
        return days.length > 0 && days.every((r) => r.state === 'waived');
      })
  );
  const openStatements = all.openStatements.filter((s) => !closed.has(s.statementId));
  const overdue = all.overdue.filter((s) => !closed.has(s.statementId));
  if (!p.book.runningAccountFrom) return { openStatements, overdue };
  const account = personalAccountStatus(rows);
  const isNotice = (id: string) =>
    p.book.statements.some((s) => s.id === id && s.kind === 'notice');
  const notices = openStatements.filter((s) => isNotice(s.statementId));
  const newest = notices.at(-1);
  return {
    account,
    openStatements: [
      ...openStatements.filter((s) => !isNotice(s.statementId)),
      ...(account.owes && newest ? [newest] : []),
    ],
    overdue: overdue.filter((s) => !isNotice(s.statementId)),
  };
}

function openAndOverdue(p: Prepared): {
  openStatements: OpenStatementView[];
  overdue: OverdueStatementView[];
} {
  const open = p.book.statements
    .filter((s) => p.settlement.has(s.id) && p.settlement.get(s.id)?.settled !== true)
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id));
  const declarations = p.book.declarations ?? [];
  const view = (s: Statement) => {
    const declaration = declarationFor(s.id, declarations);
    return {
      statementId: s.id,
      minerId: s.minerId,
      code: s.code,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      ...(declaration ? { declaration } : {}),
    };
  };
  const overdue: OverdueStatementView[] = [];
  for (const s of open) {
    // Settled with the member's own declarations (#6206), so a pause counts for them too.
    const status = p.settlement.get(s.id)?.overdue;
    if (status?.state === 'overdue') overdue.push({ ...view(s), overdueAt: status.overdueAt });
  }
  return { openStatements: open.map((s) => ({ ...view(s), issuedAt: s.issuedAt })), overdue };
}

// --- Corrections -------------------------------------------------------------

const byDateThenId = (a: BookRowView, b: BookRowView) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

/** Part of a day's tax and the Statement that bills it; none when not billed yet. */
interface OwedPart {
  statementId?: string;
  owed: number;
}

/**
 * Each Adjustment of a Miner's day, from the Statement that billed it (frozen) or, not billed
 * yet, from the book's own record. Counted once, on the first billed line of that day. A raise
 * dated on a paid Statement's day is never billed (D22), so it never shows. A raise billed on
 * another Statement than the day's own, or not billed yet, goes in `extras`: it is paid with
 * that Statement, not marked paid with the day's.
 */
function applyAdjustments(
  p: Prepared,
  rows: readonly BookRowView[],
  extras: Map<BookRowView, OwedPart[]>
): void {
  const paidDays = new Set<string>();
  for (const s of p.book.statements) {
    if (p.settlement.get(s.id)?.settled)
      for (const day of statementDays(s)) paidDays.add(`${s.minerId}|${day}`);
  }
  const byDay = new Map<
    string,
    {
      minerId: string;
      date: string;
      amount: number;
      charge: number;
      reasons: string[];
      parts: OwedPart[];
    }
  >();
  const seen = new Set<string>();
  const add = (
    id: string,
    minerId: string,
    date: string,
    amount: number,
    reason: string | undefined,
    statementId: string | undefined
  ) => {
    if (seen.has(id)) return;
    seen.add(id);
    const key = `${minerId}|${date}`;
    if (statementId === undefined && amount > 0 && paidDays.has(key)) return;
    const held = byDay.get(key) ?? { minerId, date, amount: 0, charge: 0, reasons: [], parts: [] };
    held.amount += amount;
    if (amount > 0) held.charge += amount;
    if (reason) held.reasons.push(reason);
    held.parts.push({ ...(statementId !== undefined ? { statementId } : {}), owed: amount });
    byDay.set(key, held);
  };
  for (const s of p.book.statements) {
    for (const line of s.lines) {
      if (line.kind === 'correction' && line.adjustmentId) {
        add(line.adjustmentId, s.minerId, line.date, line.tax, line.reason, s.id);
      }
    }
  }
  for (const a of p.book.adjustments ?? [])
    if (!a.reversed) add(a.id, a.minerId, a.date, a.amount, a.reason, undefined);
  // Corrections an officer reversed no longer count; the day keeps them in view, struck through.
  for (const a of p.book.adjustments ?? []) {
    if (!a.reversed) continue;
    const own = rows.filter((r) => r.minerId === a.minerId).sort(byDateThenId);
    const row =
      own.find((r) => r.date === a.date) ??
      (p.book.runningAccountFrom !== undefined
        ? (own.find((r) => r.date >= a.date) ?? own.at(-1))
        : undefined);
    if (!row) continue;
    row.reversedCorrections = [
      ...(row.reversedCorrections ?? []),
      { amount: a.amount, reason: a.reason, reversedReason: a.reversed.reason },
    ];
  }
  if (byDay.size === 0) return;
  const billed = rows.filter((r) => r.state === 'billed').sort(byDateThenId);
  // A running account owes every correction, whatever day it is dated: one with no mined day to
  // sit on is placed on the nearest billed day, and a credit no day can absorb pays the oldest
  // days (as the book's allocator does) and then stays as credit.
  const running = p.book.runningAccountFrom !== undefined;
  const unplaced: {
    minerId: string;
    date: string;
    amount: number;
    reasons: string[];
  }[] = [];
  const credit = new Map<string, { amount: number; reasons: string[] }>();
  const addCredit = (minerId: string, amount: number, reasons: readonly string[]) => {
    const held = credit.get(minerId) ?? { amount: 0, reasons: [] };
    held.amount += amount;
    held.reasons.push(...reasons);
    credit.set(minerId, held);
  };
  for (const [key, adjustment] of byDay) {
    const row = billed.find((r) => `${r.minerId}|${r.date}` === key);
    if (!row) {
      if (running) unplaced.push(adjustment);
      continue;
    }
    const before = row.taxOwed ?? 0;
    const after = Math.max(0, before + adjustment.amount);
    if (running && before + adjustment.amount < 0)
      addCredit(adjustment.minerId, -(before + adjustment.amount), adjustment.reasons);
    row.correction = { before, after, reasons: adjustment.reasons };
    row.taxOwed = after;
    row.billed = after;
    if (adjustment.charge > 0) row.officerCharge = (row.officerCharge ?? 0) + adjustment.charge;
    // A credit lowers the day as a whole; only a raise is owed apart from the day's Statement.
    const apart = adjustment.parts.filter(
      (part) => part.owed > 0 && part.statementId !== row.statementId
    );
    if (apart.length > 0) extras.set(row, apart);
  }
  if (!running) return;
  const shift = (row: BookRowView, by: number, reasons: readonly string[]) => {
    const now = row.taxOwed ?? 0;
    row.correction = {
      before: row.correction?.before ?? now,
      after: now + by,
      reasons: [...(row.correction?.reasons ?? []), ...reasons],
    };
    row.taxOwed = now + by;
    row.billed = now + by;
  };
  const daysOf = (minerId: string) => billed.filter((r) => r.minerId === minerId && !r.held);
  for (const o of unplaced) {
    const days = daysOf(o.minerId);
    if (o.amount < 0 || days.length === 0) {
      if (o.amount < 0) addCredit(o.minerId, -o.amount, o.reasons);
      continue;
    }
    const target = days.find((r) => r.date >= o.date) ?? days.at(-1)!;
    shift(target, o.amount, o.reasons);
    target.officerCharge = (target.officerCharge ?? 0) + o.amount;
  }
  for (const [minerId, { amount, reasons }] of credit) {
    let left = amount;
    for (const row of daysOf(minerId)) {
      const take = Math.min(left, row.taxOwed ?? 0);
      if (take <= 0) continue;
      shift(row, -take, reasons);
      left -= take;
    }
    if (left > 0) p.credit.set(minerId, (p.credit.get(minerId) ?? 0) + left);
  }
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
}

/** A Tax Payment the book already holds. */
export interface HeldPayment {
  characterId: number;
  amount: number;
  at: string;
  notTaxAmount?: number;
}

/**
 * Donations the member sent to the corp (their own journal) that the book does
 * not hold yet; the days they cover read as paid. The corp's journal ids differ
 * from the member's, so a held payment is recognised by sender, amount and time.
 */
export function inFlightDonations(
  made: readonly MadeDonation[],
  held: readonly HeldPayment[],
  corporationId: number,
  startDate: string
): InFlightDonation[] {
  return made
    .filter(
      (m) =>
        m.method === 'donation' &&
        m.counterpartyId === corporationId &&
        m.amount !== null &&
        m.amount > 0 &&
        m.date.slice(0, 10) >= startDate
    )
    .filter(
      (m) =>
        !held.some((h) =>
          isSameTransfer(h, { characterId: m.characterId, amount: m.amount ?? 0, date: m.date })
        )
    )
    .map((m) => ({
      characterId: m.characterId,
      amount: m.amount as number,
      at: m.date,
      ...(m.refId !== undefined ? { refId: m.refId } : {}),
    }));
}

/** Which rows an in-flight sum covers: whole days, oldest first, within the settle tolerance. */
export function coverInFlight(
  rows: readonly { id: string; date: string; taxOwed: number; tolerance?: number }[],
  total: number
): Set<string> {
  const covered = new Set<string>();
  let left = total;
  for (const row of [...rows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  )) {
    // A day smaller than the tolerance is still not covered by nothing.
    if (left <= 0 || left < row.taxOwed - (row.tolerance ?? daySettleTolerance(row.taxOwed))) break;
    covered.add(row.id);
    left = Math.max(0, left - row.taxOwed);
  }
  return covered;
}
