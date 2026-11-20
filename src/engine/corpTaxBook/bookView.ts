/**
 * The Corp Tax Book as `/corp/moons` reads it (issue #4063): everything the
 * three tabs and the two drill-down pages print, derived in one pass from the
 * book's stored records with the engine's own functions. Nothing here decides
 * a figure the engine does not already decide — rates, valuation, Billable
 * days, Statements, allocation, Overdue and the Extraction lifecycle are
 * `charges`, `statements`, `allocation`, `overdue` and `extraction`; this
 * module only joins them per Miner, per day and per Extraction.
 */
import {
  isBeforeBook,
  type Allocation,
  type AllocationInput,
  type DismissalCredit,
  type PaymentCredit,
  type RecordedWriteOff,
  type StatementSettlement,
  type TaxPayment,
} from './allocation';
import type { FeederReadClock } from './feederHealth';
import type { DayCharge, Miner } from './charges';
import type { FeederCoverage } from './coverage';
import { activeDismissalFor, type Dismissal } from './dismissals';
import {
  chunkRateFor,
  extractionStatus,
  fractureAndExpiry,
  learnChunkRates,
  minedDuringExtraction,
  type ChunkRate,
  type ExtractionState,
  type LearnedChunkRate,
} from './extraction';
import { overdueStatus, type Declaration, type OverdueState } from './overdue';
import { netOf } from './paymentPreview';
import {
  draftStatement,
  frozenDayRate,
  issueStatement,
  statementPeriod,
  type Adjustment,
  type Statement,
  type StatementLine,
  type StatementCadence,
  type StatementDraft,
  type StatementPeriod,
} from './statements';
import { toEngineExtraction, type SettlePayment, type SyncExtraction } from './sync';
import type { TaxRate } from './rates';
import { latestRecordedCorp } from './bookDocs';
import type { ObservedMiningEntry, OreLine } from './types';
import type { DayPrices } from './valuation';
import { DAY_MS } from '@/lib/age';
import { wholeIsk } from './wholeIsk';
import { disputeHold, disputesToShow, type OreDispute } from './disputes';
import { utcDay } from '../localDay';
import {
  allocateRunningAccount,
  closableThrough,
  runningDaysFromLines,
  type RunningAccount,
} from './runningAccount';
import { exemptionsOf, type ToleranceExemption } from './toleranceExemptions';
import { settleOpenSet, type OpenSet, type OpenSetInput } from './openSet';

export interface BookViewInput {
  corporationId: number;
  /** ISO instant the view is read at. */
  now: string;
  startDate: string;
  graceHours: number;
  minimumStatement: number;
  overdueDays: number;
  cadence: StatementCadence;
  hubId: string;
  oreForm: 'compressed' | 'raw';
  structureExpiryHours: Readonly<Record<string, number>>;
  /** The book's manual chunk rate (m³/h); the fallback behind a refinery's measured one. */
  chunkM3PerHour?: number;
  /** ISO instant of the book's last sync by anyone. */
  lastSyncedAt?: string;
  rates: readonly TaxRate[];
  entries: readonly ObservedMiningEntry[];
  miners: readonly Miner[];
  statements: readonly Statement[];
  payments: readonly SettlePayment[];
  dismissals: readonly Dismissal[];
  declarations: readonly Declaration[];
  /** Members' disputes: an open one holds its amount out of what is due (resolving in the app). */
  disputes?: readonly OreDispute[];
  adjustments: readonly Adjustment[];
  /** Officer write-offs (#4637): each reduces what its Miner owes. */
  writeOffs?: readonly RecordedWriteOff[];
  /** Officers' per-day limits on what a shortfall may forgive (`toleranceExemptions`). */
  toleranceExemptions?: readonly ToleranceExemption[];
  /**
   * Feeders' last good ledger reads. A feeder's refinery days are withheld until
   * one lands after the day's grace (#4509), and a day outside its coverage owes
   * nothing (#4618); absent means no feeders.
   */
  feeders?: readonly (FeederReadClock & FeederCoverage)[];
  extractions: readonly SyncExtraction[];
  paidStatementIds: ReadonlySet<string>;
  /** The instant the book switched to a running account (#6294); every book has one (`RUNNING_ACCOUNTS_FROM` when none was stored). */
  runningAccountFrom?: string;
  /** A running account's per-day tolerance, in percent. */
  dayTolerancePct?: number;
  /** Each Miner's stored paid-through day (`meta/paid`): it and every day before it stay paid for good (D22). */
  minerPaidThrough?: ReadonlyMap<string, string>;
  /** The day's prices at the book's hub and Ore Form, by raw type id. */
  pricesOn: (date: string) => Pick<DayPrices, 'prices' | 'sources'>;
  /**
   * A moon owner's prices by raw type id (#4621): the server's rule for the moon owner's own
   * page (`moonOwnerUnitPrice`), so the Moon owners tab, Pay and that page owe one figure.
   * Absent: `pricesOn`.
   */
  moonOwnerPricesOn?: (date: string) => ReadonlyMap<number, number>;
  /** Ore of chunks with no notification, estimated from a linked Moon Ore Survey (D13), by extraction id. */
  surveyOreLines?: ReadonlyMap<string, readonly OreLine[]>;
  /** Current members, when the viewer can read the roster; else standing comes from the ledger. */
  memberIds?: ReadonlySet<number>;
}

export type MinerStanding = 'member' | 'guest' | 'left';

export interface MinerRow {
  id: string;
  mainCharacterId: number;
  characterIds: number[];
  standing: MinerStanding;
  /** Unsettled Statements, less nothing: what is still due (on a running account, unpaid days too). */
  owed: number;
  /** Whole days past the oldest overdue Statement's due date; null when none is overdue. */
  overdueDays: number | null;
  /** Billable days not yet on a Statement. */
  unbilled: number;
  /** Days that are not Billable yet. */
  pending: number;
  credit: number;
  lastPaidAt: string | null;
  /** An unsettled Statement is paused by a declaration. */
  paused: boolean;
  /** On a book switched to a running account (#6294): paid through, or what is owed. */
  account?: RunningAccountStatus;
}

/**
 * A Miner's running days, each with whether every ore line was priced at the hub's saved
 * close-of-day price (never a live one, which is a guess that moves).
 */
function savedPriceDays(
  lines: readonly Pick<StatementLine, 'kind' | 'date' | 'tax' | 'priceSources'>[]
): { date: string; tax: number; savedPrices: boolean }[] {
  const saved = (l: Pick<StatementLine, 'kind' | 'priceSources'>) =>
    l.kind === 'correction' ||
    (l.priceSources !== undefined && Object.values(l.priceSources).every((x) => x === 'saved'));
  const unsaved = new Set(lines.filter((l) => !saved(l)).map((l) => l.date));
  return runningDaysFromLines(lines).map((d) => ({ ...d, savedPrices: !unsaved.has(d.date) }));
}

/** A Miner's running account status: "Paid through {date}" or "Owes X (N days, oldest D)". */
export interface RunningAccountStatus {
  paidThrough: string | null;
  owes: RunningAccount['owes'];
  /** The newest day an officer's client may store as paid for good; see `closableThrough`. */
  closableThrough?: string | null;
}

export type DayStatus =
  'paid' | 'on-statement' | 'unbilled' | 'not-billable' | 'dismissed' | 'written-off';

export interface DayRow {
  key: string;
  date: string;
  structureId: number;
  characterId: number;
  moonId?: number;
  extractionId?: string;
  oreLines: OreLine[];
  unitPrices: Record<number, number>;
  estimatedValue: number;
  taxPct: number;
  rateEffectiveFrom?: string;
  tax: number;
  status: DayStatus;
  /**
   * On a running account, what is still owed of an `unbilled` day: its share of the date's
   * remainder, 0 while an open dispute holds the date (#6294).
   */
  owed?: number;
  /** A `not-billable` day held while this moon owner's ledger cannot be read (#6210). */
  heldBy?: number;
  statementId?: string;
  dismissalId?: string;
}

export interface ExtractionRow {
  id: string;
  structureId: number;
  moonId: number;
  state: ExtractionState;
  startedAt: string;
  chunkArrivalAt: string;
  fracturedAt?: string;
  fracturedBy?: 'laser' | 'auto';
  expiresAt?: string;
  /** Fracture and Expired as the engine plans them, set in every state, so a chunk not yet fractured still has a span to draw. */
  plannedFractureAt: string;
  plannedExpiresAt: string;
  oreSource: 'notification' | 'survey' | 'unknown';
  oreLines: OreLine[];
  /** The chunk rate a survey estimate was made at (D13); absent for the other sources. */
  chunkRate?: ChunkRate;
  estimatedValue: number | null;
  /** Share of the estimate already mined, 0-100; null when the make-up is unknown or it has not fractured. */
  minedPct: number | null;
  /** Tax recorded against this Extraction's days. */
  tax: number;
  minerCount: number;
  /** Who flagged the chunk Fully Mined and when (#5257); absent when not flagged. */
  fullyMined?: { by: number; byName: string; at: string };
  /** The moon owner whose refinery it is (#6097); absent means the book's own corporation. */
  sourceCorporationId?: number;
}

export interface NeedsYouDeclaration {
  kind: 'declaration';
  declaration: Declaration;
  minerId: string;
  owed: number;
}
export interface NeedsYouOverdue {
  kind: 'overdue';
  minerId: string;
  days: number;
  owed: number;
  statementId: string;
}
export interface NeedsYouUnmatched {
  kind: 'unmatched';
  payment: SettlePayment;
}
export interface NeedsYouLeaver {
  kind: 'leaver';
  minerId: string;
  owed: number;
  statementId: string | undefined;
}
export type NeedsYouItem =
  NeedsYouDeclaration | NeedsYouOverdue | NeedsYouUnmatched | NeedsYouLeaver;

export interface BookView {
  input: BookViewInput;
  charges: DayCharge[];
  beforeBook: ObservedMiningEntry[];
  /** Moon owner rows outside their coverage: kept, owe nothing, like "Before the book". */
  outsideCoverage: ObservedMiningEntry[];
  /** Donations dated before the start date: counted for officers, never credited or listed. */
  donationsBeforeBook: number;
  unrated: ObservedMiningEntry[];
  billableThrough: string | undefined;
  miners: MinerRow[];
  extractions: ExtractionRow[];
  /** Each refinery's measured chunk rate, learned from its ExtractionStarted notifications. */
  chunkRates: ReadonlyMap<number, LearnedChunkRate>;
  needsYou: NeedsYouItem[];
  totals: { owed: number; overdue: number; overdueCount: number; unbilled: number; credit: number };
  /** Everything the per-Miner and per-Extraction pages read. */
  internals: {
    byMiner: Map<string, MinerInternals>;
    placeOf: OpenSet['placeOf'];
    /** Per day charge key on an issued Statement: the lines' frozen quantities, value and tax. */
    frozenByKey: ReadonlyMap<string, { oreLines: OreLine[]; estimatedValue: number; tax: number }>;
  };
}

interface MinerInternals {
  /** Every Statement of its, late notices included. */
  statements: Statement[];
  payments: TaxPayment[];
  /**
   * Payments against its Statements. On a running account a late notice is not Statement debt:
   * its settlement here is read off its days (`noticeSettlement`), and it takes no payment.
   */
  allocation: Allocation;
  /** What `allocation` was computed from, so a payment can be previewed against it. */
  allocationInput: AllocationInput;
  draft: StatementDraft;
  days: DayRow[];
  /** The book's `billableThrough`, stopped before a day of this miner's that is held (#6209). */
  billableThrough: string | undefined;
  /** Its running account, on a book switched to one (#6294). */
  running?: RunningAccount;
}

/**
 * A late notice's standing, read off its days on the running account (#6294): what its lines
 * billed of each date, that date's share of what was credited, written off and is still owed.
 * Settled once every date it lists is (a date an open dispute holds is not due); a date no longer
 * on the account (dismissed since) owes nothing.
 */
export function noticeSettlement(
  notice: Pick<Statement, 'lines'>,
  running: Pick<RunningAccount, 'byDay'>
): StatementSettlement {
  const byDate = new Map<string, number>();
  for (const l of notice.lines) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.tax);
  const out = { amount: 0, held: 0, credited: 0, forgiven: 0, writtenOff: 0, remaining: 0 };
  let settled = true;
  for (const [date, tax] of byDate) {
    if (tax <= 0) continue;
    const day = running.byDay.get(date);
    if (!day || day.tax <= 0) {
      out.amount += tax;
      out.credited += tax;
      continue;
    }
    const share = Math.min(1, tax / day.tax);
    if (day.held) {
      out.held += tax;
      continue;
    }
    out.amount += tax;
    out.credited += day.credited * share;
    out.forgiven += day.forgiven * share;
    out.writtenOff += day.writtenOff * share;
    out.remaining += day.remaining * share;
    if (!day.settled) settled = false;
  }
  const { held, ...rest } = out;
  return { ...rest, ...(held > 0 ? { held } : {}), settled };
}

/**
 * What the Statement lines billed for one day, as issued: summed quantities and
 * tax, the first line's prices, and the rate the lines came to (`frozenDayRate`).
 */
function frozenDay(lines: readonly StatementLine[], charge: DayCharge) {
  const first = lines[0];
  const byType = new Map<number, number>();
  for (const l of lines)
    for (const o of l.oreLines) byType.set(o.typeId, (byType.get(o.typeId) ?? 0) + o.quantity);
  // A line with no effective-from was a per-record override: never borrow today's.
  const rate = frozenDayRate(lines, { taxPct: charge.taxPct });
  return {
    oreLines: [...byType].map(([typeId, quantity]) => ({ typeId, quantity })),
    unitPrices: first?.unitPrices ?? {},
    estimatedValue: lines.reduce((sum, l) => sum + l.estimatedValue, 0),
    taxPct: rate.taxPct,
    rateEffectiveFrom: rate.rateEffectiveFrom,
    tax: lines.reduce((sum, l) => sum + l.tax, 0),
  };
}

/** A running day's share of what its date still owes: none while a dispute holds the date. */
function runningOwed(running: RunningAccount, date: string, tax: number): number {
  const day = running.byDay.get(date);
  if (!day || day.held || day.tax <= 0) return 0;
  return (day.remaining * tax) / day.tax;
}

/** What the next Statement would bill one Miner, in full: the draft every figure below it reads. */
export function minerDraft(
  input: BookViewInput,
  minerId: string,
  statements: readonly Statement[],
  charges: readonly DayCharge[],
  billableThrough: string | undefined
): StatementDraft {
  return draftStatement({
    minerId,
    startDate: input.startDate,
    period: { start: input.startDate, end: billableThrough ?? input.startDate },
    charges,
    adjustments: input.adjustments,
    issued: statements,
    paidStatementIds: input.paidStatementIds,
    dismissals: input.dismissals,
    billableThrough,
    final: true,
  });
}

/** Tax on days that are not Billable yet: not dismissed, not on a Statement, after the last Billable day. */
export function pendingTax(
  input: BookViewInput,
  charges: readonly DayCharge[],
  billedKeys: ReadonlySet<string>,
  billableThrough: string | undefined
): number {
  return charges
    .filter(
      (c) =>
        !activeDismissalFor(c, input.dismissals) &&
        !billedKeys.has(c.key) &&
        (billableThrough === undefined || c.date > billableThrough)
    )
    .reduce((sum, c) => sum + c.taxOwed, 0);
}

/** What the open set of a whole book is settled from, as an officer reads it. */
export function openSetInputOf(input: BookViewInput): OpenSetInput {
  return {
    ...(input.runningAccountFrom ? { runningAccount: true } : {}),
    corporationId: input.corporationId,
    now: input.now,
    startDate: input.startDate,
    graceHours: input.graceHours,
    lastSyncedAt: input.lastSyncedAt,
    rates: input.rates,
    entries: input.entries,
    miners: input.miners,
    statements: input.statements,
    payments: input.payments,
    dismissals: input.dismissals,
    writeOffs: input.writeOffs,
    declarations: input.declarations,
    ...(input.disputes ? { disputes: input.disputes } : {}),
    overdueDays: input.overdueDays,
    feeders: input.feeders,
    pricesOn: input.pricesOn,
    placement: {
      kind: 'extractions',
      extractions: input.extractions,
      structureExpiryHours: input.structureExpiryHours,
    },
  };
}

/** Member while a character is in the corporation now; left if it was; else a guest. */
export function standingOf(
  characterIds: readonly number[],
  latestCorp: ReadonlyMap<number, { corp: number }>,
  input: Pick<BookViewInput, 'corporationId' | 'memberIds'>
): MinerStanding {
  const corps = characterIds.map((cid) => latestCorp.get(cid)?.corp);
  const wasMember = corps.some((c) => c === input.corporationId);
  const isMember = input.memberIds
    ? characterIds.some((cid) => input.memberIds!.has(cid))
    : wasMember;
  return isMember ? 'member' : wasMember ? 'left' : 'guest';
}

export function buildBookView(input: BookViewInput): BookView {
  const open = settleOpenSet(openSetInputOf(input));
  const { charges } = open;
  const latestCorp = latestRecordedCorp(input.entries);

  const byMiner = new Map<string, MinerInternals>();
  const miners: MinerRow[] = [];
  /** Per day charge on an issued Statement: what its lines billed, frozen. */
  const frozenByKey = new Map<string, ReturnType<typeof frozenDay>>();
  const needsYou: NeedsYouItem[] = [];
  const nowMs = Date.parse(input.now);

  for (const id of open.minerIds) {
    const settled = open.miners.get(id)!;
    const {
      characterIds,
      statements,
      payments,
      allocation,
      allocationInput,
      dismissalCredits,
      billableThrough,
      hold,
    } = settled;
    const mainCharacterId =
      input.miners.find((m) => m.id === id)?.mainCharacterId ?? characterIds[0] ?? 0;
    const mine = charges.filter((c) => c.minerId === id);
    // On a running account a late notice's days stay running days (#6294): only the other
    // Statements are Statement debt whose days are billed, frozen and closed once paid.
    const notices = input.runningAccountFrom ? statements.filter((s) => s.kind === 'notice') : [];
    const legacy = notices.length > 0 ? statements.filter((s) => s.kind !== 'notice') : statements;
    const forgivenKeys = forgivenDayKeys(legacy, allocation, dismissalCredits);
    // `billableThrough` is the Miner's own; `hold` set it, and its moon owner is why a held day
    // waits (#6210) from the hold's first day through the book's billable-through.
    const heldByOf = (date: string) =>
      hold &&
      open.billableThrough !== undefined &&
      date >= hold.from &&
      date <= open.billableThrough
        ? hold.ownerCorporationId
        : undefined;
    const draft = minerDraft(input, id, legacy, mine, billableThrough);

    const draftLines = draft.kind === 'nothing' ? [] : draft.lines;
    const unbilledKeys = new Set(draftLines.map((l) => l.chargeKey));
    // A running account (#6294): every Billable day on no Statement is owed now, oldest paid first.
    // An open dispute nobody has dismissed yet holds its date (`disputesToShow`).
    const heldDays = new Set(
      disputesToShow(input.disputes ?? [], input.dismissals)
        .filter((d) => d.minerId === id && disputeHold(d, input.now))
        .map((d) => d.date)
    );
    const running = input.runningAccountFrom
      ? allocateRunningAccount({
          ...allocationInput,
          days: draftLines,
          heldDays,
          dayTolerancePct: input.dayTolerancePct,
          storedPaidThrough: input.minerPaidThrough?.get(id),
          toleranceExemptions: exemptionsOf(input.toleranceExemptions, id),
        })
      : undefined;
    // A notice takes no payment: what its days were credited is its standing.
    const shown: Allocation =
      running && notices.length > 0
        ? {
            ...allocation,
            byStatement: new Map([
              ...allocation.byStatement,
              ...notices.map((n) => [n.id, noticeSettlement(n, running)] as const),
            ]),
          }
        : allocation;
    const dismissedKeys = new Map(draft.dismissed.map((d) => [d.charge.key, d.dismissal.id]));
    const writtenOffKeys = new Set(draft.writtenOff.map((w) => w.chargeKey));
    const billedBy = new Map<string, Statement>();
    const linesBy = new Map<string, StatementLine[]>();
    for (const s of legacy)
      for (const line of s.lines) {
        if (!line.chargeKey) continue;
        billedBy.set(line.chargeKey, s);
        linesBy.set(line.chargeKey, [...(linesBy.get(line.chargeKey) ?? []), line]);
      }
    /** The newest late notice that listed each day: a running day still, only named. */
    const noticeBy = new Map<string, Statement>();
    for (const n of [...notices].sort(
      (a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id)
    ))
      for (const line of n.lines) if (line.chargeKey) noticeBy.set(line.chargeKey, n);

    const days: DayRow[] = mine
      .map((c): DayRow => {
        const dismissal = activeDismissalFor(c, input.dismissals);
        const statement = billedBy.get(c.key);
        let status: DayStatus;
        if (dismissal || dismissedKeys.has(c.key)) status = 'dismissed';
        else if (writtenOffKeys.has(c.key)) status = 'written-off';
        else if (unbilledKeys.has(c.key))
          status = running?.byDay.get(c.date)?.settled ? 'paid' : 'unbilled';
        else if (statement && forgivenKeys.has(c.key)) status = 'written-off';
        else if (statement)
          status = allocation.byStatement.get(statement.id)?.settled ? 'paid' : 'on-statement';
        else status = 'not-billable';
        // A day on an issued Statement is frozen (D22): its lines, never today's prices.
        const frozen =
          statement && (status === 'on-statement' || status === 'paid' || forgivenKeys.has(c.key))
            ? frozenDay(linesBy.get(c.key) ?? [], c)
            : undefined;
        if (frozen) frozenByKey.set(c.key, frozen);
        const heldBy = status === 'not-billable' ? heldByOf(c.date) : undefined;
        const value = frozen ?? {
          oreLines: c.oreLines,
          unitPrices: c.unitPrices,
          estimatedValue: c.estimatedValue,
          taxPct: c.taxPct,
          rateEffectiveFrom: c.rateEffectiveFrom,
          tax: c.taxOwed,
        };
        return {
          key: c.key,
          date: c.date,
          structureId: c.structureId,
          characterId: c.characterId,
          ...(c.moonId !== undefined ? { moonId: c.moonId } : {}),
          ...(c.extractionId !== undefined ? { extractionId: c.extractionId } : {}),
          oreLines: value.oreLines,
          unitPrices: value.unitPrices,
          estimatedValue: value.estimatedValue,
          taxPct: value.taxPct,
          ...(value.rateEffectiveFrom !== undefined
            ? { rateEffectiveFrom: value.rateEffectiveFrom }
            : {}),
          tax: value.tax,
          status,
          ...(running && status === 'unbilled'
            ? { owed: runningOwed(running, c.date, value.tax) }
            : {}),
          ...(heldBy !== undefined ? { heldBy } : {}),
          ...(statement
            ? { statementId: statement.id }
            : noticeBy.has(c.key)
              ? { statementId: noticeBy.get(c.key)!.id }
              : {}),
          ...(dismissal ? { dismissalId: dismissal.id } : {}),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));

    let owed = 0;
    for (const s of allocation.byStatement.values()) if (!s.settled) owed += s.remaining;
    if (running) owed = running.owes?.amount ?? 0;
    let overdueDays: number | null = null;
    let overdueStatementId: string | undefined;
    let paused = false;
    // A late notice's Overdue clock starts at its issue, as a Statement's does, until its days are paid.
    const overdue = new Map(settled.overdue);
    for (const n of notices) {
      if (shown.byStatement.get(n.id)?.settled) continue;
      overdue.set(
        n.id,
        overdueStatus({
          issuedAt: n.issuedAt,
          settled: false,
          now: input.now,
          declarations: input.declarations.filter((d) => d.statementId === n.id),
          overdueDays: input.overdueDays,
        })
      );
    }
    for (const [statementId, status] of overdue) {
      if (status.state === 'paused') paused = true;
      if (status.state === 'overdue') {
        const days = Math.max(1, Math.floor((nowMs - Date.parse(status.overdueAt)) / DAY_MS));
        if (overdueDays === null || days > overdueDays) {
          overdueDays = days;
          overdueStatementId = statementId;
        }
      }
    }
    // On a running account nothing waits for a Statement: those days are owed (or paid) already.
    const unbilled = running ? 0 : draftLines.reduce((sum, l) => sum + l.tax, 0);
    const pending = pendingTax(input, mine, new Set(billedBy.keys()), open.billableThrough);
    const lastPaid = payments
      .filter((p) => p.amount - (p.notTaxAmount ?? 0) > 0)
      .map((p) => p.at)
      .sort()
      .at(-1);

    const standing = standingOf(characterIds, latestCorp, input);

    const row: MinerRow = {
      id,
      mainCharacterId,
      characterIds,
      standing,
      owed,
      overdueDays,
      unbilled,
      pending,
      credit: running ? running.credit : allocation.credit,
      lastPaidAt: lastPaid ?? null,
      paused,
      ...(running
        ? {
            account: {
              paidThrough: running.paidThrough,
              owes: running.owes,
              closableThrough: closableThrough({
                account: running,
                days: savedPriceDays(draftLines),
                heldDays,
                today: utcDay(Date.parse(input.now)),
              }),
            },
          }
        : {}),
    };
    miners.push(row);
    byMiner.set(id, {
      statements,
      payments,
      allocation: shown,
      allocationInput,
      draft,
      days,
      billableThrough,
      ...(running ? { running } : {}),
    });

    for (const d of input.declarations) {
      if (d.resolution || !statements.some((s) => s.id === d.statementId)) continue;
      needsYou.push({ kind: 'declaration', declaration: d, minerId: id, owed });
    }
    if (overdueDays !== null && overdueStatementId && standing !== 'left') {
      needsYou.push({
        kind: 'overdue',
        minerId: id,
        days: overdueDays,
        owed,
        statementId: overdueStatementId,
      });
    }
    if (standing === 'left' && owed > 0) {
      needsYou.push({
        kind: 'leaver',
        minerId: id,
        owed,
        // On a running account the days may be on no Statement: the newest notice stands for them.
        statementId:
          statements.find((s) => !shown.byStatement.get(s.id)?.settled)?.id ?? newest(notices)?.id,
      });
    }
  }
  let donationsBeforeBook = 0;
  for (const p of input.payments) {
    if (p.source === 'donation' && isBeforeBook(p.at, input.startDate)) donationsBeforeBook++;
    // A donation wholly marked not tax needs nothing more; a partly marked one still does.
    else if (!p.minerId && netOf(p) > 0) needsYou.push({ kind: 'unmatched', payment: p });
  }
  // The same ordering the cards read in: declarations, then the oldest debt.
  const rank: Record<NeedsYouItem['kind'], number> = {
    declaration: 0,
    overdue: 1,
    unmatched: 2,
    leaver: 3,
  };
  needsYou.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      (a.kind === 'overdue' && b.kind === 'overdue' ? b.days - a.days : 0)
  );

  const chunkRates = learnChunkRates(input.extractions.map(measurable));
  const extractions = buildExtractionRows(input, charges, frozenByKey, chunkRates);
  const overdueRows = miners.filter((m) => m.overdueDays !== null);
  return {
    input,
    charges,
    beforeBook: open.beforeBook,
    outsideCoverage: open.outsideCoverage,
    donationsBeforeBook,
    unrated: open.unrated,
    billableThrough: open.billableThrough,
    miners,
    extractions,
    chunkRates,
    needsYou,
    totals: {
      owed: miners.reduce((s, m) => s + m.owed, 0),
      overdue: overdueRows.reduce((s, m) => s + m.owed, 0),
      overdueCount: overdueRows.length,
      unbilled: miners.reduce((s, m) => s + m.unbilled, 0),
      credit: miners.reduce((s, m) => s + m.credit, 0),
    },
    internals: { byMiner, placeOf: open.placeOf, frozenByKey },
  };
}

/** A stored Extraction as `learnChunkRates` reads it. */
export function measurable(x: SyncExtraction) {
  return {
    structureId: x.structureId,
    startedAt: x.extractionStartTime,
    chunkArrivalAt: x.chunkArrivalTime,
    ...(x.oreLines ? { oreLines: x.oreLines } : {}),
  };
}

/** The fields of an Extraction's row that need no ledger day: its state, dates, make-up and estimate. */
export type ExtractionRowBase = Omit<ExtractionRow, 'minedPct' | 'tax' | 'minerCount'>;

type ExtractionRowInput = Pick<
  BookViewInput,
  'now' | 'structureExpiryHours' | 'chunkM3PerHour' | 'surveyOreLines'
>;

/** One Extraction's row without the ledger-derived fields; the same rows the Overview schedule reads. */
export function extractionRowBase(
  x: SyncExtraction,
  input: ExtractionRowInput,
  todayPrices: ReadonlyMap<number, number>,
  chunkRates: ReadonlyMap<number, LearnedChunkRate>
): ExtractionRowBase & { fracturedAt?: string } {
  const ex = toEngineExtraction(x);
  const expiryHours = input.structureExpiryHours[String(x.structureId)];
  const status = extractionStatus(ex, input.now, {
    expiryHours,
    ...(x.fullyMined ? { fullyMinedAt: x.fullyMined.at } : {}),
  });
  const planned = fractureAndExpiry(ex, expiryHours);
  // Source order (D13): the ExtractionStarted notification, then a linked Survey.
  const notified = x.oreLines ?? [];
  const surveyed = notified.length === 0 ? (input.surveyOreLines?.get(ex.id) ?? []) : [];
  const oreLines: OreLine[] = [...(notified.length > 0 ? notified : surveyed)];
  const estimatedValue = oreLines.length
    ? oreLines.reduce((sum, l) => sum + l.quantity * (todayPrices.get(l.typeId) ?? 0), 0)
    : null;
  return {
    id: ex.id,
    structureId: x.structureId,
    moonId: x.moonId,
    state: status.state,
    startedAt: ex.startedAt,
    chunkArrivalAt: ex.chunkArrivalAt,
    ...(status.fracturedAt ? { fracturedAt: status.fracturedAt } : {}),
    ...(status.fracturedBy ? { fracturedBy: status.fracturedBy } : {}),
    ...(status.expiresAt ? { expiresAt: status.expiresAt } : {}),
    plannedFractureAt: new Date(planned.fracturedAt).toISOString(),
    plannedExpiresAt: new Date(planned.expiresAt).toISOString(),
    oreSource: notified.length > 0 ? 'notification' : surveyed.length > 0 ? 'survey' : 'unknown',
    oreLines,
    ...(surveyed.length > 0
      ? { chunkRate: chunkRateFor(chunkRates.get(x.structureId), input.chunkM3PerHour) }
      : {}),
    estimatedValue,
  };
}

function buildExtractionRows(
  input: BookViewInput,
  charges: readonly DayCharge[],
  frozenByKey: ReadonlyMap<string, { tax: number }>,
  chunkRates: ReadonlyMap<number, LearnedChunkRate>
): ExtractionRow[] {
  const today = input.now.slice(0, 10);
  const todayPrices = input.pricesOn(today).prices;
  return input.extractions
    .map((x): ExtractionRow => {
      const base = extractionRowBase(x, input, todayPrices, chunkRates);
      const ex = toEngineExtraction(x);
      const expiryHours = input.structureExpiryHours[String(x.structureId)];
      let minedPct: number | null = null;
      if (base.fracturedAt && base.oreLines.length) {
        const mined = minedDuringExtraction(ex, input.entries, { expiryHours });
        const total = base.oreLines.reduce((s, l) => s + l.quantity, 0);
        const got = base.oreLines.reduce(
          (s, l) =>
            s + Math.min(l.quantity, mined.find((m) => m.typeId === l.typeId)?.quantity ?? 0),
          0
        );
        minedPct = total > 0 ? Math.min(100, Math.round((got / total) * 100)) : null;
      }
      const mine = charges.filter((c) => c.extractionId === ex.id);
      return {
        ...base,
        minedPct,
        tax: mine.reduce((s, c) => s + (frozenByKey.get(c.key)?.tax ?? c.taxOwed), 0),
        minerCount: new Set(mine.map((c) => c.minerId)).size,
        ...(x.fullyMined ? { fullyMined: x.fullyMined } : {}),
        ...(x.sourceCorporationId !== undefined
          ? { sourceCorporationId: x.sourceCorporationId }
          : {}),
      };
    })
    .sort((a, b) => a.chunkArrivalAt.localeCompare(b.chunkArrivalAt));
}

/**
 * The Statement days an officer write-off forgave in full (#4637). Mirrors the order the
 * allocation credits a Statement in: payments cover its oldest days, the write-off the next.
 */
function forgivenDayKeys(
  statements: readonly Statement[],
  allocation: Allocation,
  credits: readonly DismissalCredit[]
): Set<string> {
  const keys = new Set<string>();
  for (const s of statements) {
    const settlement = allocation.byStatement.get(s.id);
    if (!settlement || settlement.forgiven <= 0) continue;
    const dismissed = credits.filter((c) => c.statementId === s.id);
    const dismissedKeys = new Set(dismissed.map((c) => c.chargeKey));
    let paid = Math.max(
      0,
      settlement.credited - settlement.forgiven - dismissed.reduce((sum, c) => sum + c.amount, 0)
    );
    let forgiven = settlement.forgiven;
    const days = new Map<string, { date: string; tax: number }>();
    for (const line of s.lines) {
      if (!line.chargeKey || dismissedKeys.has(line.chargeKey)) continue;
      const held = days.get(line.chargeKey) ?? { date: line.date, tax: 0 };
      held.tax += line.tax;
      days.set(line.chargeKey, held);
    }
    const oldestFirst = [...days].sort(
      ([ka, a], [kb, b]) => a.date.localeCompare(b.date) || ka.localeCompare(kb)
    );
    for (const [key, day] of oldestFirst) {
      if (day.tax <= 0) continue;
      const fromPaid = Math.min(paid, day.tax);
      paid -= fromPaid;
      const fromForgiven = Math.min(forgiven, day.tax - fromPaid);
      forgiven -= fromForgiven;
      if (fromPaid === 0 && day.tax - fromForgiven < 0.01) keys.add(key);
    }
  }
  return keys;
}

// --- Drill-downs -----------------------------------------------------------

export interface MinerDetail {
  row: MinerRow;
  days: DayRow[];
  payments: (TaxPayment & { credited: number })[];
  statements: Statement[];
  /** Which Statement each payment's money went to (#5288), one entry per payment and Statement. */
  paymentCredits: PaymentCredit[];
  /** Tolerance write-offs, derived from `allocatePayments` (amounts are not stored). */
  toleranceWriteOffs: { statementId: string; amount: number }[];
  /**
   * A running account's days a tolerance (or money taken back from a day recorded paid) wrote off,
   * each dated by the last payment that reached the day, oldest first.
   */
  dayWriteOffs: { date: string; amount: number; at: string }[];
  /** A running account's dates an open dispute holds: not billed yet, so not in the balance. */
  heldDays: string[];
  /** Lines recorded after payment, never billed (D22). */
  lateWriteOffs: { chargeKey: string; date: string; tax: number }[];
  /** Officer write-offs (#4637), oldest first; `amount` is what each forgave, 0 when nothing was left. */
  officerWriteOffs: {
    id: string;
    amount: number;
    reason: string;
    at: string;
    /** Undone by an officer: `amount` is what it forgave while it stood. */
    reversed?: { by: number; at: string; reason: string };
  }[];
  dismissals: Dismissal[];
  declarations: Declaration[];
  credit: number;
}

function dayWriteOffsOf(inner: MinerInternals): MinerDetail['dayWriteOffs'] {
  if (!inner.running) return [];
  const paidAt = new Map(inner.payments.map((p) => [p.id, p.at]));
  const closedAt = new Map<string, string>();
  for (const p of inner.running.applications.payments) {
    const at = paidAt.get(p.paymentId);
    if (at) for (const d of p.days) closedAt.set(d.date, at);
  }
  const out: MinerDetail['dayWriteOffs'] = [];
  for (const [date, d] of inner.running.byDay)
    if (d.writtenOff >= 1) out.push({ date, amount: d.writtenOff, at: closedAt.get(date) ?? date });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Each officer write-off with what it forgave: of Statements (`writeOffCredits`), then, on a running
 * account, of days when it names no Statement. The days' total is shared out oldest write-off first,
 * each up to what it had left, as the allocator draws on them.
 */
function officerWriteOffsOf(
  view: BookView,
  minerId: string,
  inner: MinerInternals
): MinerDetail['officerWriteOffs'] {
  const mine = (view.input.writeOffs ?? [])
    .filter((w) => w.minerId === minerId)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  let onDays = (inner.running?.applications.writeOffs ?? []).reduce((s, d) => s + d.amount, 0);
  return mine.map((w) => {
    // A reversed write-off forgave nothing: it takes no share of the days' forgiveness.
    if (w.reversed)
      return { id: w.id, amount: w.amount, reason: w.reason, at: w.at, reversed: w.reversed };
    const onStatements = inner.allocation.writeOffCredits
      .filter((c) => c.writeOffId === w.id)
      .reduce((s, c) => s + c.amount, 0);
    const forDays = w.statementId ? 0 : Math.min(onDays, Math.max(0, w.amount - onStatements));
    onDays -= forDays;
    return { id: w.id, amount: onStatements + forDays, reason: w.reason, at: w.at };
  });
}

export function minerDetail(view: BookView, minerId: string): MinerDetail | undefined {
  const row = view.miners.find((m) => m.id === minerId);
  const inner = view.internals.byMiner.get(minerId);
  if (!row || !inner) return undefined;
  const mineKeys = new Set(inner.days.map((d) => d.key));
  const dismissals = view.input.dismissals.filter((d) => {
    if (d.scope === 'miner') return d.targetId === minerId;
    if (d.scope === 'record') return mineKeys.has(d.targetId);
    return inner.days.some((day) =>
      d.scope === 'moon' ? String(day.moonId) === d.targetId : day.extractionId === d.targetId
    );
  });
  const statementIds = new Set(inner.statements.map((s) => s.id));
  return {
    row,
    days: inner.days,
    payments: inner.payments
      .map((p) => ({ ...p, credited: p.amount - Math.min(p.notTaxAmount ?? 0, p.amount) }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    statements: [...inner.statements].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    paymentCredits: inner.allocation.paymentCredits,
    toleranceWriteOffs: inner.allocation.writeOffs,
    dayWriteOffs: dayWriteOffsOf(inner),
    heldDays: [...(inner.running?.byDay ?? [])].filter(([, d]) => d.held).map(([date]) => date),
    lateWriteOffs: inner.draft.writtenOff.map((w) => ({
      chargeKey: w.chargeKey,
      date: w.date,
      tax: w.tax,
    })),
    officerWriteOffs: officerWriteOffsOf(view, minerId, inner),
    dismissals,
    declarations: view.input.declarations.filter((d) => statementIds.has(d.statementId)),
    credit: inner.allocation.credit,
  };
}

export interface ExtractionDetail {
  row: ExtractionRow;
  miners: { minerId: string; units: number; value: number; tax: number }[];
  /** The moon's other cycles, newer and older, newest first. */
  otherCycles: ExtractionRow[];
}

export function extractionDetail(view: BookView, id: string): ExtractionDetail | undefined {
  const row = view.extractions.find((x) => x.id === id);
  if (!row) return undefined;
  const byMiner = new Map<string, { units: number; value: number; tax: number }>();
  for (const c of view.charges) {
    if (c.extractionId !== id) continue;
    const held = byMiner.get(c.minerId) ?? { units: 0, value: 0, tax: 0 };
    const frozen = view.internals.frozenByKey.get(c.key);
    held.units += (frozen?.oreLines ?? c.oreLines).reduce((s, l) => s + l.quantity, 0);
    held.value += frozen?.estimatedValue ?? c.estimatedValue;
    held.tax += frozen?.tax ?? c.taxOwed;
    byMiner.set(c.minerId, held);
  }
  return {
    row,
    miners: [...byMiner].map(([minerId, v]) => ({ minerId, ...v })).sort((a, b) => b.tax - a.tax),
    otherCycles: view.extractions
      .filter((x) => x.id !== id && x.structureId === row.structureId && x.moonId === row.moonId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  };
}

// --- Statement run ---------------------------------------------------------

export interface RunLine {
  minerId: string;
  draft: Extract<StatementDraft, { kind: 'statement' }>;
  /** Earlier Statements' unpaid balance carried into this one. */
  carried: number;
  credit: number;
  /** What the miner is asked to pay: this Statement plus what is still owed, less credit. */
  balanceDue: number;
}

export interface StatementRunPlan {
  period: StatementPeriod;
  lines: RunLine[];
  /** Miners whose period total is under the minimum and rolls into the next. */
  belowMinimum: number;
  totalDue: number;
  creditApplied: number;
}

/** Each Miner's charges, grouped once per view: a run plans every Miner on several periods. */
const chargesByMiner = new WeakMap<BookView, Map<string, BookView['charges']>>();

function chargesOf(view: BookView, minerId: string): BookView['charges'] {
  let byMiner = chargesByMiner.get(view);
  if (!byMiner) {
    byMiner = new Map();
    for (const c of view.charges) {
      const list = byMiner.get(c.minerId);
      if (list) list.push(c);
      else byMiner.set(c.minerId, [c]);
    }
    chargesByMiner.set(view, byMiner);
  }
  return byMiner.get(minerId) ?? [];
}

/** The periods with a charge that have ended on a Billable day, oldest first, starting after `after`. */
function closedPeriods(view: BookView, after?: string): StatementPeriod[] {
  const { billableThrough } = view;
  if (billableThrough === undefined) return [];
  const periods: StatementPeriod[] = [];
  const seen = new Set<string>();
  for (const date of view.charges.map((c) => c.date).sort()) {
    const period = statementPeriod(date, view.input.cadence, view.input.startDate);
    if (seen.has(period.start)) continue;
    seen.add(period.start);
    if (period.end > billableThrough) continue;
    if (after !== undefined && period.start <= after) continue;
    periods.push(period);
  }
  return periods;
}

/** The first of `closedPeriods` that still has unbilled lines, with its plan. */
function firstRun(view: BookView, after?: string): StatementRunPlan | undefined {
  // A running account issues late notices instead (#6294, `planNotices`).
  if (view.input.runningAccountFrom) return undefined;
  for (const period of closedPeriods(view, after)) {
    const plan = planStatementRun(view, period);
    if (plan.lines.length > 0) return plan;
  }
  return undefined;
}

/**
 * The period the next run sends: the earliest one that has ended on a Billable
 * day and still has unbilled lines, else undefined. A period that has not
 * fully closed is not offered (Sep is "Ready to send" only once 30 Sep is Billable).
 */
export function nextRunPeriod(view: BookView): StatementPeriod | undefined {
  return firstRun(view)?.period;
}

export function planStatementRun(view: BookView, period: StatementPeriod): StatementRunPlan {
  const lines: RunLine[] = [];
  let belowMinimum = 0;
  const closed = new Set(view.input.miners.filter((m) => m.closedAt).map((m) => m.id));
  for (const m of view.miners) {
    if (closed.has(m.id)) continue; // a closed guest's Statement mail has stopped (#4184)
    const inner = view.internals.byMiner.get(m.id)!;
    const draft = draftStatement({
      minerId: m.id,
      startDate: view.input.startDate,
      period,
      charges: chargesOf(view, m.id),
      adjustments: view.input.adjustments,
      issued: inner.statements,
      paidStatementIds: view.input.paidStatementIds,
      dismissals: view.input.dismissals,
      billableThrough: inner.billableThrough,
      minimumAmount: view.input.minimumStatement,
    });
    if (draft.kind === 'rolled-over') belowMinimum += 1;
    if (draft.kind !== 'statement') continue;
    const balanceDue = Math.max(0, m.owed + draft.amount - m.credit);
    lines.push({ minerId: m.id, draft, carried: m.owed, credit: m.credit, balanceDue });
  }
  return {
    period,
    lines,
    belowMinimum,
    totalDue: lines.reduce((s, l) => s + l.balanceDue, 0),
    creditApplied: lines.reduce((s, l) => s + Math.min(l.credit, l.carried + l.draft.amount), 0),
  };
}

/** One period of a run, with the view it was planned on (its Statements are issued from that view). */
export interface PlannedRun {
  plan: StatementRunPlan;
  view: BookView;
}

/**
 * Every period a run sends, oldest first (#6208): `nextRunPeriod`, then the
 * next one on a view that already holds the earlier period's Statements, so a
 * later period's carried balance includes the one before it. A forgotten month
 * is billed in the same run as the next, never left for a second one.
 */
export function planStatementRuns(view: BookView): PlannedRun[] {
  const runs: PlannedRun[] = [];
  let current = view;
  let plan = firstRun(view);
  while (plan) {
    runs.push({ plan, view: current });
    const { start } = plan.period;
    // Nothing closed after it: no next view to build.
    if (closedPeriods(current, start).length === 0) return runs;
    const done = plan;
    const issued = done.lines.map((line) => statementForLine(current, done, line));
    current = buildBookView({
      ...current.input,
      statements: [...current.input.statements, ...issued],
    });
    // Issuing a period only bills more, so no earlier one can gain lines: search after it.
    plan = firstRun(current, start);
  }
  return runs;
}

/** The periods the next run bills, oldest first; empty when no run is due. */
export function duePeriods(view: BookView): StatementPeriod[] {
  return planStatementRuns(view).map((run) => run.plan.period);
}

/** A short code the miner can put in a donation's reason to pin it to a Statement (D15). */
export function paymentCode(statementId: string): string {
  let h = 2166136261;
  for (const ch of statementId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `MT${h.toString(36).toUpperCase().padStart(7, '0').slice(-6)}`;
}

/** Freezes one run line into the Statement document the `issueStatement` edit stores. */
export function statementForLine(
  view: BookView,
  plan: StatementRunPlan,
  line: RunLine
): Statement & { characterIds: number[] } {
  const id = `${plan.period.start}_${line.minerId}`.replace(/[^A-Za-z0-9_:-]/g, '_');
  const statement = issueStatement(line.draft, {
    id,
    code: paymentCode(id),
    minerId: line.minerId,
    period: plan.period,
    issuedAt: view.input.now,
    hubId: view.input.hubId,
    oreForm: view.input.oreForm,
  });
  const row = view.miners.find((m) => m.id === line.minerId);
  return { ...statement, characterIds: row?.characterIds ?? [] };
}

/** What the book recorded about a Statement's mail; `stopped` wins over the sent count. */
export interface StatementMail {
  kind: 'sent' | 'not-mailed' | 'stopped';
  count: number;
}

/** One miner's Statement on a period page. */
export interface PeriodStatementRow {
  statement: Statement;
  billed: number;
  paid: number;
  outstanding: number;
  settled: boolean;
  overdue: boolean;
  /** When it goes (or went) overdue; null once settled. */
  dueAt: string | null;
  /** Where its Overdue clock stands; a declaration pauses it. */
  state: OverdueState;
  /** While paused: when the pause ends on its own. */
  pausedUntil?: string;
  mail: StatementMail;
}

/**
 * Billed, paid and outstanding as whole ISK, where Billed - Paid - Outstanding is always 0 (#5247).
 * Less than 1 ISK credited is not a payment: the whole amount stays outstanding.
 */
function shownFigures(amount: number, remaining: number, credited: number) {
  const billed = wholeIsk(amount);
  const outstanding = wholeIsk(credited) === 0 ? billed : Math.min(billed, wholeIsk(remaining));
  return { billed, outstanding, paid: billed - outstanding };
}

function statementStanding(view: BookView, s: Statement): PeriodStatementRow {
  const settlement = view.internals.byMiner.get(s.minerId)?.allocation.byStatement.get(s.id);
  const settled = settlement?.settled ?? false;
  const status = settled
    ? undefined
    : overdueStatus({
        issuedAt: s.issuedAt,
        settled: false,
        now: view.input.now,
        declarations: view.input.declarations.filter((d) => d.statementId === s.id),
        overdueDays: view.input.overdueDays,
      });
  const count = s.mailsSent ?? 0;
  const shown = settled
    ? shownFigures(s.amount, 0, s.amount)
    : shownFigures(s.amount, settlement?.remaining ?? s.amount, settlement?.credited ?? 0);
  return {
    statement: s,
    ...shown,
    settled,
    overdue: status?.state === 'overdue',
    dueAt: status?.overdueAt ?? null,
    state: status?.state ?? 'settled',
    ...(status?.pausedUntil ? { pausedUntil: status.pausedUntil } : {}),
    mail: {
      kind: s.remindersStopped ? 'stopped' : count > 0 ? 'sent' : 'not-mailed',
      count,
    },
  };
}

/** The Statements of one issued period, one per miner; undefined when the period has none. */
export function periodStatements(
  view: BookView,
  periodStart: string
): PeriodStatementRow[] | undefined {
  const statements = view.input.statements.filter((s) => s.periodStart === periodStart);
  return statements.length === 0 ? undefined : statements.map((s) => statementStanding(view, s));
}

/** One Statement's panel (#5286): its standing plus every payment credited to it. */
export interface StatementDetail extends PeriodStatementRow {
  /** Payments, dismissals and officer write-offs credited to it. */
  credited: number;
  /** What officer write-offs forgave of it (part of `credited`). */
  forgiven: number;
  /** The shortfall the tolerance wrote off. */
  writtenOff: number;
  remaining: number;
  /** The part of each Tax Payment that went to this Statement, oldest first. */
  payments: { id: string; amount: number; at: string; source: 'donation' | 'manual' }[];
}

/** One Statement with its figures and payments; undefined when the book holds no such Statement. */
export function statementDetail(view: BookView, statementId: string): StatementDetail | undefined {
  const statement = view.input.statements.find((s) => s.id === statementId);
  if (!statement) return undefined;
  const miner = view.internals.byMiner.get(statement.minerId);
  const settlement = miner?.allocation.byStatement.get(statement.id);
  const payments = (miner?.allocation.paymentCredits ?? [])
    .filter((c) => c.statementId === statement.id && wholeIsk(c.amount) >= 1)
    .flatMap((c) => {
      const p = miner?.payments.find((x) => x.id === c.paymentId);
      return p ? [{ id: p.id, amount: wholeIsk(c.amount), at: p.at, source: p.source }] : [];
    })
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const standing = statementStanding(view, statement);
  const writtenOff = wholeIsk(settlement?.writtenOff ?? 0);
  return {
    ...standing,
    // Billed − Outstanding, as the Statements table shows, so the panel never differs by 1 ISK.
    credited: Math.max(0, standing.paid - writtenOff),
    forgiven: wholeIsk(settlement?.forgiven ?? 0),
    writtenOff,
    remaining: standing.outstanding,
    payments,
  };
}

/** The Statement issued last, if any. */
export const newest = <T extends Pick<Statement, 'issuedAt' | 'id'>>(statements: readonly T[]) =>
  [...statements]
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id))
    .at(-1);
