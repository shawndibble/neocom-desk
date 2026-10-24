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
  allocatePayments,
  dismissalCredits,
  isBeforeBook,
  type Allocation,
  type DismissalCredit,
  type RecordedWriteOff,
  type TaxPayment,
} from './allocation';
import { lastBillableDate } from './billable';
import { splitByCoverageAndRead, type FeederReadClock } from './feederHealth';
import { buildDayCharges, type DayCharge, type Miner } from './charges';
import type { FeederCoverage } from './coverage';
import { activeDismissalFor, type Dismissal } from './dismissals';
import {
  chunkRateFor,
  extractionStatus,
  learnChunkRates,
  minedDuringExtraction,
  type ChunkRate,
  type ExtractionState,
  type LearnedChunkRate,
} from './extraction';
import { overdueStatus, type Declaration } from './overdue';
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
import type { ObservedMiningEntry, OreLine } from './types';
import type { DayPrices } from './valuation';
import { DAY_MS } from '@/lib/age';

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
  adjustments: readonly Adjustment[];
  /** Officer write-offs (#4637): each reduces what its Miner owes. */
  writeOffs?: readonly RecordedWriteOff[];
  /**
   * Feeders' last good ledger reads. A feeder's refinery days are withheld until
   * one lands after the day's grace (#4509), and a day outside its coverage owes
   * nothing (#4618); absent means no feeders.
   */
  feeders?: readonly (FeederReadClock & FeederCoverage)[];
  extractions: readonly SyncExtraction[];
  paidStatementIds: ReadonlySet<string>;
  /** The day's prices at the book's hub and Ore Form, by raw type id. */
  pricesOn: (date: string) => Pick<DayPrices, 'prices' | 'sources'>;
  /**
   * A moon owner's prices by raw type id (#4621): the server's rule for the moon owner's own
   * page (`moonOwnerUnitPrice`), so the Moon owners tab, Pay… and that page owe one figure.
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
  /** Unsettled Statements, less nothing: what is still due. */
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
    placeOf: (structureId: number, date: string) => { moonId?: number; extractionId?: string };
    /** Per day charge key on an issued Statement: the lines' frozen quantities, value and tax. */
    frozenByKey: ReadonlyMap<string, { oreLines: OreLine[]; estimatedValue: number; tax: number }>;
  };
}

interface MinerInternals {
  statements: Statement[];
  payments: TaxPayment[];
  allocation: Allocation;
  draft: StatementDraft;
  days: DayRow[];
}

/** Which Extraction a refinery was working on a date: from fracture through expiry. */
export function placeOfFactory(
  extractions: readonly SyncExtraction[],
  expiryHours: Readonly<Record<string, number>>
): BookView['internals']['placeOf'] {
  const engine = extractions.map(toEngineExtraction);
  return (structureId, date) => {
    for (const ex of engine) {
      if (ex.structureId !== structureId) continue;
      const status = extractionStatus(ex, `${date}T23:59:59Z`, {
        expiryHours: expiryHours[String(structureId)],
      });
      if (
        status.fracturedAt &&
        date >= status.fracturedAt.slice(0, 10) &&
        status.expiresAt &&
        date <= status.expiresAt.slice(0, 10)
      ) {
        return { moonId: ex.moonId, extractionId: ex.id };
      }
    }
    return {};
  };
}

function toTaxPayments(payments: readonly SettlePayment[], minerId: string): TaxPayment[] {
  return payments.filter((p): p is TaxPayment => p.minerId === minerId);
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

export function buildBookView(input: BookViewInput): BookView {
  const placeOf = placeOfFactory(input.extractions, input.structureExpiryHours);
  // Coverage first: a moon owner's day outside it owes nothing, so it never holds a miner's day.
  const { readable: entries, outsideCoverage } = splitByCoverageAndRead(input.entries, {
    now: input.now,
    graceHours: input.graceHours,
    bookCorporationId: input.corporationId,
    feeders: input.feeders ?? [],
  });
  const { charges, beforeBook, unrated } = buildDayCharges(entries, {
    corporationId: input.corporationId,
    startDate: input.startDate,
    miners: input.miners,
    rates: input.rates,
    pricesOn: input.pricesOn,
    placeOf,
  });
  const billableThrough = lastBillableDate({
    now: input.now,
    lastSyncedAt: input.lastSyncedAt,
    graceHours: input.graceHours,
  });

  const minerIds = new Set<string>(input.miners.map((m) => m.id));
  for (const c of charges) minerIds.add(c.minerId);
  for (const s of input.statements) minerIds.add(s.minerId);
  for (const p of input.payments) if (p.minerId) minerIds.add(p.minerId);

  const latestCorp = new Map<number, { date: string; corp: number }>();
  for (const e of input.entries) {
    const held = latestCorp.get(e.characterId);
    if (!held || e.date >= held.date)
      latestCorp.set(e.characterId, { date: e.date, corp: e.recordedCorporationId });
  }

  const byMiner = new Map<string, MinerInternals>();
  const miners: MinerRow[] = [];
  /** Per day charge on an issued Statement: what its lines billed, frozen. */
  const frozenByKey = new Map<string, ReturnType<typeof frozenDay>>();
  const needsYou: NeedsYouItem[] = [];
  const nowMs = Date.parse(input.now);

  for (const id of minerIds) {
    const grouping = input.miners.find((m) => m.id === id);
    const solo = /^solo:(\d+)$/.exec(id);
    const characterIds = grouping?.characterIds ?? (solo ? [Number(solo[1])] : []);
    const mainCharacterId = grouping?.mainCharacterId ?? characterIds[0] ?? 0;
    const statements = input.statements.filter((s) => s.minerId === id);
    // A donation before the book is neither credited nor shown as a payment.
    const payments = toTaxPayments(input.payments, id).filter(
      (p) => p.source !== 'donation' || !isBeforeBook(p.at, input.startDate)
    );
    const mine = charges.filter((c) => c.minerId === id);

    const credits = dismissalCredits(statements, input.dismissals, mine);
    const allocation = allocatePayments({
      statements,
      payments,
      dismissalCredits: credits,
      officerWriteOffs: (input.writeOffs ?? []).filter((w) => w.minerId === id),
      startDate: input.startDate,
    });
    const forgivenKeys = forgivenDayKeys(statements, allocation, credits);
    const draft = draftStatement({
      minerId: id,
      startDate: input.startDate,
      period: { start: input.startDate, end: billableThrough ?? input.startDate },
      charges: mine,
      adjustments: input.adjustments,
      issued: statements,
      paidStatementIds: input.paidStatementIds,
      dismissals: input.dismissals,
      billableThrough,
      final: true,
    });

    const draftLines = draft.kind === 'nothing' ? [] : draft.lines;
    const unbilledKeys = new Set(draftLines.map((l) => l.chargeKey));
    const dismissedKeys = new Map(draft.dismissed.map((d) => [d.charge.key, d.dismissal.id]));
    const writtenOffKeys = new Set(draft.writtenOff.map((w) => w.chargeKey));
    const billedBy = new Map<string, Statement>();
    const linesBy = new Map<string, StatementLine[]>();
    for (const s of statements)
      for (const line of s.lines) {
        if (!line.chargeKey) continue;
        billedBy.set(line.chargeKey, s);
        linesBy.set(line.chargeKey, [...(linesBy.get(line.chargeKey) ?? []), line]);
      }

    const days: DayRow[] = mine
      .map((c): DayRow => {
        const dismissal = activeDismissalFor(c, input.dismissals);
        const statement = billedBy.get(c.key);
        let status: DayStatus;
        if (dismissal || dismissedKeys.has(c.key)) status = 'dismissed';
        else if (writtenOffKeys.has(c.key)) status = 'written-off';
        else if (unbilledKeys.has(c.key)) status = 'unbilled';
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
          ...(statement ? { statementId: statement.id } : {}),
          ...(dismissal ? { dismissalId: dismissal.id } : {}),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));

    let owed = 0;
    for (const s of allocation.byStatement.values()) if (!s.settled) owed += s.remaining;
    let overdueDays: number | null = null;
    let overdueStatementId: string | undefined;
    let paused = false;
    for (const s of statements) {
      if (allocation.byStatement.get(s.id)?.settled) continue;
      const status = overdueStatus({
        issuedAt: s.issuedAt,
        settled: false,
        now: input.now,
        declarations: input.declarations.filter((d) => d.statementId === s.id),
        overdueDays: input.overdueDays,
      });
      if (status.state === 'paused') paused = true;
      if (status.state === 'overdue') {
        const days = Math.max(1, Math.floor((nowMs - Date.parse(status.overdueAt)) / DAY_MS));
        if (overdueDays === null || days > overdueDays) {
          overdueDays = days;
          overdueStatementId = s.id;
        }
      }
    }
    const unbilled = draftLines.reduce((sum, l) => sum + l.tax, 0);
    const pending = mine
      .filter(
        (c) =>
          !activeDismissalFor(c, input.dismissals) &&
          !billedBy.has(c.key) &&
          (billableThrough === undefined || c.date > billableThrough)
      )
      .reduce((sum, c) => sum + c.taxOwed, 0);
    const lastPaid = payments
      .filter((p) => p.amount - (p.notTaxAmount ?? 0) > 0)
      .map((p) => p.at)
      .sort()
      .at(-1);

    const corps = characterIds.map((cid) => latestCorp.get(cid)?.corp);
    const wasMember = corps.some((c) => c === input.corporationId);
    const isMember = input.memberIds
      ? characterIds.some((cid) => input.memberIds!.has(cid))
      : wasMember;
    const standing: MinerStanding = isMember ? 'member' : wasMember ? 'left' : 'guest';

    const row: MinerRow = {
      id,
      mainCharacterId,
      characterIds,
      standing,
      owed,
      overdueDays,
      unbilled,
      pending,
      credit: allocation.credit,
      lastPaidAt: lastPaid ?? null,
      paused,
    };
    miners.push(row);
    byMiner.set(id, { statements, payments, allocation, draft, days });

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
        statementId: statements.find((s) => !allocation.byStatement.get(s.id)?.settled)?.id,
      });
    }
  }
  let donationsBeforeBook = 0;
  for (const p of input.payments) {
    if (p.source === 'donation' && isBeforeBook(p.at, input.startDate)) donationsBeforeBook++;
    else if (!p.minerId) needsYou.push({ kind: 'unmatched', payment: p });
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
    beforeBook,
    outsideCoverage,
    donationsBeforeBook,
    unrated,
    billableThrough,
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
    internals: { byMiner, placeOf, frozenByKey },
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
      const ex = toEngineExtraction(x);
      const expiryHours = input.structureExpiryHours[String(x.structureId)];
      const status = extractionStatus(ex, input.now, { expiryHours });
      // Source order (D13): the ExtractionStarted notification, then a linked Survey.
      const notified = x.oreLines ?? [];
      const surveyed = notified.length === 0 ? (input.surveyOreLines?.get(ex.id) ?? []) : [];
      const oreLines: OreLine[] = [...(notified.length > 0 ? notified : surveyed)];
      const estimatedValue = oreLines.length
        ? oreLines.reduce((sum, l) => sum + l.quantity * (todayPrices.get(l.typeId) ?? 0), 0)
        : null;
      let minedPct: number | null = null;
      if (status.fracturedAt && oreLines.length) {
        const mined = minedDuringExtraction(ex, input.entries, { expiryHours });
        const total = oreLines.reduce((s, l) => s + l.quantity, 0);
        const got = oreLines.reduce(
          (s, l) =>
            s + Math.min(l.quantity, mined.find((m) => m.typeId === l.typeId)?.quantity ?? 0),
          0
        );
        minedPct = total > 0 ? Math.min(100, Math.round((got / total) * 100)) : null;
      }
      const mine = charges.filter((c) => c.extractionId === ex.id);
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
        oreSource:
          notified.length > 0 ? 'notification' : surveyed.length > 0 ? 'survey' : 'unknown',
        oreLines,
        ...(surveyed.length > 0
          ? { chunkRate: chunkRateFor(chunkRates.get(x.structureId), input.chunkM3PerHour) }
          : {}),
        estimatedValue,
        minedPct,
        tax: mine.reduce((s, c) => s + (frozenByKey.get(c.key)?.tax ?? c.taxOwed), 0),
        minerCount: new Set(mine.map((c) => c.minerId)).size,
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
  /** Tolerance write-offs, derived from `allocatePayments` (amounts are not stored). */
  toleranceWriteOffs: { statementId: string; amount: number }[];
  /** Lines recorded after payment, never billed (D22). */
  lateWriteOffs: { chargeKey: string; date: string; tax: number }[];
  /** Officer write-offs (#4637), oldest first; `amount` is what each forgave, 0 when nothing was left. */
  officerWriteOffs: { id: string; amount: number; reason: string; at: string }[];
  dismissals: Dismissal[];
  declarations: Declaration[];
  credit: number;
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
    toleranceWriteOffs: inner.allocation.writeOffs,
    lateWriteOffs: inner.draft.writtenOff.map((w) => ({
      chargeKey: w.chargeKey,
      date: w.date,
      tax: w.tax,
    })),
    officerWriteOffs: (view.input.writeOffs ?? [])
      .filter((w) => w.minerId === minerId)
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
      .map((w) => ({
        id: w.id,
        amount: inner.allocation.writeOffCredits
          .filter((c) => c.writeOffId === w.id)
          .reduce((s, c) => s + c.amount, 0),
        reason: w.reason,
        at: w.at,
      })),
    dismissals,
    declarations: view.input.declarations.filter((d) => statementIds.has(d.statementId)),
    credit: inner.allocation.credit,
  };
}

export interface ExtractionDetail {
  row: ExtractionRow;
  miners: { minerId: string; units: number; value: number; tax: number }[];
  /** Earlier cycles at the same refinery and moon, newest first. */
  past: ExtractionRow[];
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
    past: view.extractions
      .filter(
        (x) =>
          x.id !== id &&
          x.structureId === row.structureId &&
          x.moonId === row.moonId &&
          x.startedAt < row.startedAt
      )
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

/**
 * The period the next run sends: the earliest one that has ended on a Billable
 * day and still has unbilled lines, else undefined. A period that has not
 * fully closed is not offered (Sep is "Ready to send" only once 30 Sep is Billable).
 */
export function nextRunPeriod(view: BookView): StatementPeriod | undefined {
  if (view.billableThrough === undefined) return undefined;
  const dates = [...view.charges.map((c) => c.date)].sort();
  const seen = new Set<string>();
  for (const date of dates) {
    const period = statementPeriod(date, view.input.cadence);
    if (seen.has(period.start)) continue;
    seen.add(period.start);
    if (period.end > view.billableThrough) continue;
    if (planStatementRun(view, period).lines.length > 0) return period;
  }
  return undefined;
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
      charges: view.charges.filter((c) => c.minerId === m.id),
      adjustments: view.input.adjustments,
      issued: inner.statements,
      paidStatementIds: view.input.paidStatementIds,
      dismissals: view.input.dismissals,
      billableThrough: view.billableThrough,
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

/** Periods table rows: every period with a Statement, plus the open and ready ones. */
export interface PeriodRow {
  start: string;
  end: string;
  /** issued: on a Statement but not (all) mailed yet; sent: mailed; overdue: one of its Statements is past due; paid: settled. */
  status: 'issued' | 'sent' | 'overdue' | 'paid' | 'ready' | 'closed' | 'rollover' | 'open';
  miners: number;
  billed: number;
  paid: number;
  outstanding: number;
  issuedAt: string | null;
}

/**
 * What a period's own days bill: its mined days not already on a Statement, not
 * the run-to-date total a Statement for it would carry. `minimum` applies the
 * book's minimum Statement; below it a Miner's amount rolls into a later one.
 */
function ownPeriodBilling(
  view: BookView,
  chargesByMiner: ReadonlyMap<string, BookView['charges']>,
  period: StatementPeriod,
  minimum: number
) {
  let miners = 0;
  let billed = 0;
  let rolled = 0;
  let rolledAmount = 0;
  const closed = new Set(view.input.miners.filter((m) => m.closedAt).map((m) => m.id));
  const adjustments = view.input.adjustments.filter((a) => a.date >= period.start);
  for (const m of view.miners) {
    if (closed.has(m.id)) continue;
    const draft = draftStatement({
      minerId: m.id,
      startDate: view.input.startDate > period.start ? view.input.startDate : period.start,
      period,
      charges: chargesByMiner.get(m.id) ?? [],
      adjustments,
      issued: view.internals.byMiner.get(m.id)!.statements,
      paidStatementIds: view.input.paidStatementIds,
      dismissals: view.input.dismissals,
      billableThrough: view.billableThrough,
      minimumAmount: minimum,
    });
    if (draft.kind === 'rolled-over') {
      rolled += 1;
      rolledAmount += draft.amount;
    }
    if (draft.kind !== 'statement') continue;
    miners += 1;
    billed += draft.amount;
  }
  return { miners, billed, rolled, rolledAmount };
}

export function periodRows(view: BookView): PeriodRow[] {
  const byStart = new Map<string, Statement[]>();
  for (const s of view.input.statements) {
    byStart.set(s.periodStart, [...(byStart.get(s.periodStart) ?? []), s]);
  }
  const rows: PeriodRow[] = [];
  for (const [start, statements] of byStart) {
    let paid = 0;
    let outstanding = 0;
    let overdue = false;
    let unmailed = false;
    for (const s of statements) {
      const settlement = view.internals.byMiner.get(s.minerId)?.allocation.byStatement.get(s.id);
      if (
        !settlement?.settled &&
        overdueStatus({
          issuedAt: s.issuedAt,
          settled: false,
          now: view.input.now,
          declarations: view.input.declarations.filter((d) => d.statementId === s.id),
          overdueDays: view.input.overdueDays,
        }).state === 'overdue'
      )
        overdue = true;
      if (((s as Statement & { mailsSent?: number }).mailsSent ?? 0) === 0) unmailed = true;
      paid += settlement?.credited ?? 0;
      outstanding += settlement && !settlement.settled ? settlement.remaining : 0;
    }
    rows.push({
      start,
      end: statements[0].periodEnd,
      status: overdue ? 'overdue' : outstanding === 0 ? 'paid' : unmailed ? 'issued' : 'sent',
      miners: new Set(statements.map((s) => s.minerId)).size,
      billed: statements.reduce((s, x) => s + x.amount, 0),
      paid,
      outstanding,
      issuedAt: statements.map((s) => s.issuedAt).sort()[0],
    });
  }
  const ready = nextRunPeriod(view);
  const today = statementPeriod(view.input.now.slice(0, 10), view.input.cadence);
  const chargesByMiner = new Map<string, BookView['charges']>();
  for (const c of view.charges) {
    chargesByMiner.set(c.minerId, [...(chargesByMiner.get(c.minerId) ?? []), c]);
  }
  const add = (period: StatementPeriod, status: PeriodRow['status']) => {
    if (rows.some((r) => r.start === period.start)) return;
    let row: Pick<PeriodRow, 'status' | 'miners' | 'billed'>;
    if (status === 'ready') {
      // The Send plan itself, so the row matches what Send will do.
      const plan = planStatementRun(view, period);
      row = {
        status,
        miners: plan.lines.length,
        billed: plan.lines.reduce((s, l) => s + l.draft.amount, 0),
      };
    } else if (status === 'closed') {
      const own = ownPeriodBilling(view, chargesByMiner, period, view.input.minimumStatement);
      if (own.miners === 0 && own.rolled === 0) return;
      row =
        own.miners > 0
          ? { status, miners: own.miners, billed: own.billed }
          : { status: 'rollover', miners: own.rolled, billed: own.rolledAmount };
    } else {
      const own = ownPeriodBilling(view, chargesByMiner, period, 0);
      row = { status, miners: own.miners, billed: own.billed };
    }
    rows.push({
      start: period.start,
      end: period.end,
      ...row,
      paid: 0,
      outstanding: 0,
      issuedAt: null,
    });
  };
  // Every period with unbilled days, not only the next one; a Statement still
  // covers every day since the last, so only the earliest closed one is sendable.
  const seen = new Set<string>();
  for (const date of view.charges.map((c) => c.date).sort()) {
    const period = statementPeriod(date, view.input.cadence);
    if (seen.has(period.start)) continue;
    seen.add(period.start);
    if (period.start === ready?.start) add(period, 'ready');
    else if (view.billableThrough !== undefined && period.end <= view.billableThrough)
      add(period, 'closed');
    else add(period, 'open');
  }
  add(today, 'open');
  return rows.sort((a, b) => b.start.localeCompare(a.start));
}
