/**
 * The Corp Tax Book as `/corp/moons` reads it (issue #4063): everything the
 * three tabs and the two drill-down pages print, derived in one pass from the
 * book's stored records with the engine's own functions. Nothing here decides
 * a figure the engine does not already decide — rates, valuation, Billable
 * days, each Miner's Running account, Overdue and the Extraction lifecycle are
 * `charges`, `openSet`, `minerRunningAccount`, `overdue` and `extraction`; this
 * module only joins them per Miner, per day and per Extraction.
 */
import { NOTICE_ID_FIELD, type LateNotice } from '../../../functions/src/corpTaxBookLateNotice';
import type { RunningAccountCheckpoint } from '../../../functions/src/corpTaxBookCheckpoint';
import type { Adjustment } from './adjustments';
import { savedPrice } from './billableLines';
import type { FeederReadClock } from './feederHealth';
import type { DayCharge, Miner } from './charges';
import type { FeederCoverage } from './coverage';
import { activeDismissalFor, type Dismissal } from './dismissals';
import { disputeHold, isMinersDispute, type OreDispute } from './disputes';
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
import { isBeforeBook, paymentNet, type RecordedWriteOff, type TaxPayment } from './payments';
import { toEngineExtraction, type SettlePayment, type SyncExtraction } from './sync';
import type { TaxRate } from './rates';
import { latestRecordedCorp } from './bookDocs';
import type { ObservedMiningEntry, OreLine } from './types';
import type { DayPrices } from './valuation';
import { DAY_MS } from '@/lib/age';
import { wholeIsk } from './wholeIsk';
import { utcDayOf } from '../localDay';
import { runningDaysFromLines, type RunningAccountOwes } from './minerRunningAccount';
import type { ToleranceExemption } from './toleranceExemptions';
import { settleOpenSet, type MinerSettlement, type OpenSet, type OpenSetInput } from './openSet';

export interface BookViewInput {
  corporationId: number;
  /** ISO instant the view is read at. */
  now: string;
  startDate: string;
  graceHours: number;
  overdueDays: number;
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
  /** The book's late notices: what was asked of a Miner, never money owed of its own. */
  notices: readonly LateNotice[];
  payments: readonly SettlePayment[];
  dismissals: readonly Dismissal[];
  declarations: readonly Declaration[];
  /** Members' disputes: an open one holds its day out of what is due (resolving in the app). */
  disputes?: readonly OreDispute[];
  adjustments: readonly Adjustment[];
  /** Officer write-offs (#4637): each forgives the Miner's oldest unpaid days. */
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
  /** A Running account's per-day tolerance, in percent. */
  dayTolerancePct?: number;
  /** Each Miner's stored paid-through day (`meta/paid`): it and every day before it stay paid for good (D22). */
  minerPaidThrough?: ReadonlyMap<string, string>;
  /** Each Miner's closed-through checkpoint (`accountCheckpoints`), by Miner id. */
  checkpoints?: ReadonlyMap<string, RunningAccountCheckpoint>;
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
  /** What the Miner's Running account still owes: its unpaid days. */
  owed: number;
  /** Whole days past the oldest overdue late notice's due date; null when none is overdue. */
  overdueDays: number | null;
  /** Days that are not Billable yet. */
  pending: number;
  credit: number;
  lastPaidAt: string | null;
  /** An overdue clock is paused by a declaration. */
  paused: boolean;
  /** Paid through, or what is owed. */
  account: RunningAccountStatus;
}

/** A Running account's status: "Paid through {date}" or "Owes X (N days, oldest D)". */
export interface RunningAccountStatus {
  paidThrough: string | null;
  owes: RunningAccountOwes | null;
  /** The newest day an officer's client may store as paid for good (`closableThrough`). */
  closableThrough: string | null;
}

/** `owed`: billed, not paid yet. `not-billable`: not Billable yet. */
export type DayStatus = 'paid' | 'owed' | 'not-billable' | 'dismissed';

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
  /** What is still owed of an `owed` day: its share of the date's remainder, 0 while a dispute holds it. */
  owed?: number;
  /** A `not-billable` day held while this moon owner's ledger cannot be read (#6210). */
  heldBy?: number;
  /** An `owed` day an open dispute holds: nothing pays it or bills it until the dispute ends. */
  disputed?: { disputeId: string; until: string };
  /** The newest late notice that listed the day. */
  noticeId?: string;
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
  /** The late notice whose Overdue clock ran out. */
  noticeId: string;
}
export interface NeedsYouUnmatched {
  kind: 'unmatched';
  payment: SettlePayment;
}
export interface NeedsYouLeaver {
  kind: 'leaver';
  minerId: string;
  owed: number;
  /** The newest late notice, which stands for the days owed. */
  noticeId: string | undefined;
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
  totals: { owed: number; overdue: number; overdueCount: number; credit: number };
  /** Everything the per-Miner and per-Extraction pages read. */
  internals: {
    byMiner: Map<string, MinerInternals>;
    placeOf: OpenSet['placeOf'];
  };
}

/** One Miner's settlement with its day rows. */
export interface MinerInternals extends MinerSettlement {
  days: DayRow[];
}

/** Tax on days that are not Billable yet: not dismissed, after the Miner's last Billable day. */
export function pendingTax(
  input: Pick<BookViewInput, 'dismissals'>,
  charges: readonly DayCharge[],
  billableThrough: string | undefined
): number {
  return charges
    .filter(
      (c) =>
        !activeDismissalFor(c, input.dismissals) &&
        (billableThrough === undefined || c.date > billableThrough)
    )
    .reduce((sum, c) => sum + c.taxOwed, 0);
}

/** What the open set of a whole book is settled from, as an officer reads it. */
export function openSetInputOf(input: BookViewInput): OpenSetInput {
  return {
    corporationId: input.corporationId,
    now: input.now,
    startDate: input.startDate,
    graceHours: input.graceHours,
    lastSyncedAt: input.lastSyncedAt,
    rates: input.rates,
    entries: input.entries,
    miners: input.miners,
    notices: input.notices,
    payments: input.payments,
    dismissals: input.dismissals,
    adjustments: input.adjustments,
    writeOffs: input.writeOffs,
    ...(input.disputes ? { disputes: input.disputes } : {}),
    ...(input.toleranceExemptions ? { toleranceExemptions: input.toleranceExemptions } : {}),
    ...(input.dayTolerancePct !== undefined ? { dayTolerancePct: input.dayTolerancePct } : {}),
    ...(input.minerPaidThrough ? { minerPaidThrough: input.minerPaidThrough } : {}),
    ...(input.checkpoints ? { checkpoints: input.checkpoints } : {}),
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

/** The late notice issued last, if any. */
export const newest = <T extends Pick<LateNotice, 'issuedAt' | 'id'>>(notices: readonly T[]) =>
  [...notices]
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id))
    .at(-1);

/** A late notice's Overdue clock: it starts at its issue and runs until every day it listed is paid. */
export function noticeOverdue(
  view: Pick<BookView, 'input'>,
  notice: Pick<LateNotice, 'id' | 'issuedAt'>
) {
  return overdueStatus({
    issuedAt: notice.issuedAt,
    settled: false,
    now: view.input.now,
    declarations: view.input.declarations.filter((d) => d[NOTICE_ID_FIELD] === notice.id),
    overdueDays: view.input.overdueDays,
  });
}

export function buildBookView(input: BookViewInput): BookView {
  const open = settleOpenSet(openSetInputOf(input));
  const { charges } = open;
  const latestCorp = latestRecordedCorp(input.entries);
  const today = utcDayOf(input.now);

  const byMiner = new Map<string, MinerInternals>();
  const miners: MinerRow[] = [];
  const needsYou: NeedsYouItem[] = [];
  const nowMs = Date.parse(input.now);

  for (const id of open.minerIds) {
    const settled = open.miners.get(id)!;
    const { characterIds, notices, payments, billable, account, hold } = settled;
    const mainCharacterId =
      input.miners.find((m) => m.id === id)?.mainCharacterId ?? characterIds[0] ?? 0;
    const mine = charges.filter((c) => c.minerId === id);
    // `billableThrough` is the Miner's own; `hold` set it, and its moon owner is why a held day
    // waits (#6210) from the hold's first day through the book's billable-through.
    const heldByOf = (date: string) =>
      hold &&
      open.billableThrough !== undefined &&
      date >= hold.from &&
      date <= open.billableThrough
        ? hold.ownerCorporationId
        : undefined;
    const billed = new Set(billable.lines.map((l) => l.key));
    const dismissedKeys = new Map(billable.dismissed.map((d) => [d.charge.key, d.dismissal.id]));
    /** The newest late notice that listed each day. */
    const noticeBy = new Map<string, string>();
    for (const n of notices) for (const line of n.lines) noticeBy.set(line.key, n.id);
    const through = account.input.checkpoint?.through;
    /** The open dispute that holds a date, and until when. */
    const disputeOf = (date: string) => {
      for (const d of input.disputes ?? []) {
        if (d.date !== date || !isMinersDispute(d, id, characterIds)) continue;
        const hold = disputeHold(d, input.now);
        if (hold) return { disputeId: d.id, until: hold.until };
      }
      return undefined;
    };

    const days: DayRow[] = mine
      .map((c): DayRow => {
        const dismissal = activeDismissalFor(c, input.dismissals);
        const day = account.day(c.date);
        let status: DayStatus;
        if (dismissal || dismissedKeys.has(c.key)) status = 'dismissed';
        else if (!billed.has(c.key)) status = 'not-billable';
        // A day the account closed through and no longer owes is paid.
        else if (day ? day.settled : through !== undefined && c.date <= through) status = 'paid';
        else status = 'owed';
        const heldBy = status === 'not-billable' ? heldByOf(c.date) : undefined;
        const disputed = status === 'owed' && day?.held ? disputeOf(c.date) : undefined;
        const noticeId = noticeBy.get(c.key);
        return {
          key: c.key,
          date: c.date,
          structureId: c.structureId,
          characterId: c.characterId,
          ...(c.moonId !== undefined ? { moonId: c.moonId } : {}),
          ...(c.extractionId !== undefined ? { extractionId: c.extractionId } : {}),
          oreLines: c.oreLines,
          unitPrices: c.unitPrices,
          estimatedValue: c.estimatedValue,
          taxPct: c.taxPct,
          ...(c.rateEffectiveFrom !== undefined ? { rateEffectiveFrom: c.rateEffectiveFrom } : {}),
          tax: c.taxOwed,
          status,
          ...(status === 'owed' ? { owed: account.owedOf(c.date, c.taxOwed) } : {}),
          ...(heldBy !== undefined ? { heldBy } : {}),
          ...(disputed ? { disputed } : {}),
          ...(noticeId ? { noticeId } : {}),
          ...(dismissal ? { dismissalId: dismissal.id } : {}),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));

    const owed = account.owes?.amount ?? 0;
    let overdueDays: number | null = null;
    let overdueNoticeId: string | undefined;
    let paused = false;
    // A late notice's Overdue clock starts at its issue, until its days are paid.
    for (const n of notices) {
      if (account.standingOf(n).settled) continue;
      const status = noticeOverdue({ input }, n);
      if (status.state === 'paused') paused = true;
      if (status.state === 'overdue') {
        const days = Math.max(1, Math.floor((nowMs - Date.parse(status.overdueAt)) / DAY_MS));
        if (overdueDays === null || days > overdueDays) {
          overdueDays = days;
          overdueNoticeId = n.id;
        }
      }
    }
    const lastPaid = payments
      .filter((p) => paymentNet(p) > 0)
      .map((p) => p.at)
      .sort()
      .at(-1);
    const standing = standingOf(characterIds, latestCorp, input);
    const savedDays = runningDaysFromLines(billable.lines).map((d) => ({
      date: d.date,
      savedPrices: billable.lines.every((l) => l.date !== d.date || savedPrice(l)),
    }));

    const row: MinerRow = {
      id,
      mainCharacterId,
      characterIds,
      standing,
      owed,
      overdueDays,
      pending: pendingTax(input, mine, settled.billableThrough),
      credit: account.credit,
      lastPaidAt: lastPaid ?? null,
      paused,
      account: {
        paidThrough: account.paidThrough,
        owes: account.owes,
        closableThrough: account.closableThrough(savedDays, today),
      },
    };
    miners.push(row);
    byMiner.set(id, { ...settled, days });

    for (const d of input.declarations) {
      if (d.resolution || !notices.some((n) => n.id === d[NOTICE_ID_FIELD])) continue;
      needsYou.push({ kind: 'declaration', declaration: d, minerId: id, owed });
    }
    if (overdueDays !== null && overdueNoticeId && standing !== 'left') {
      needsYou.push({
        kind: 'overdue',
        minerId: id,
        days: overdueDays,
        owed,
        noticeId: overdueNoticeId,
      });
    }
    if (standing === 'left' && owed > 0) {
      needsYou.push({ kind: 'leaver', minerId: id, owed, noticeId: newest(notices)?.id });
    }
  }
  let donationsBeforeBook = 0;
  for (const p of input.payments) {
    if (p.source === 'donation' && isBeforeBook(p.at, input.startDate)) donationsBeforeBook++;
    // A donation wholly marked not tax needs nothing more; a partly marked one still does.
    else if (!p.minerId && paymentNet(p) > 0) needsYou.push({ kind: 'unmatched', payment: p });
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
  const extractions = buildExtractionRows(input, charges, chunkRates);
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
      credit: miners.reduce((s, m) => s + m.credit, 0),
    },
    internals: { byMiner, placeOf: open.placeOf },
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
  chunkRates: ReadonlyMap<number, LearnedChunkRate>
): ExtractionRow[] {
  const today = utcDayOf(input.now);
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
        tax: mine.reduce((s, c) => s + c.taxOwed, 0),
        minerCount: new Set(mine.map((c) => c.minerId)).size,
        ...(x.fullyMined ? { fullyMined: x.fullyMined } : {}),
        ...(x.sourceCorporationId !== undefined
          ? { sourceCorporationId: x.sourceCorporationId }
          : {}),
      };
    })
    .sort((a, b) => a.chunkArrivalAt.localeCompare(b.chunkArrivalAt));
}

// --- Drill-downs -----------------------------------------------------------

export interface MinerDetail {
  row: MinerRow;
  days: DayRow[];
  payments: (TaxPayment & { credited: number })[];
  /** The Miner's late notices, newest first. */
  notices: LateNotice[];
  /** Which days each payment paid, oldest payment first. */
  paymentDays: MinerSettlement['account']['applications']['payments'];
  /**
   * The days a tolerance (or money taken back from a day recorded paid) wrote off, each dated by
   * the last payment that reached the day, oldest first.
   */
  dayWriteOffs: { date: string; amount: number; at: string }[];
  /** Dates an open dispute holds: not billed yet, so not in the balance. */
  heldDays: string[];
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
  /** The Miner's disputes, answered or not. */
  disputes: OreDispute[];
  credit: number;
  /** The checkpoint the account is built from: what came before it is summed up in it. */
  checkpoint?: RunningAccountCheckpoint;
}

function dayWriteOffsOf(inner: MinerInternals): MinerDetail['dayWriteOffs'] {
  const paidAt = new Map(inner.payments.map((p) => [p.id, p.at]));
  const closedAt = new Map<string, string>();
  for (const p of inner.account.applications.payments) {
    const at = paidAt.get(p.paymentId);
    if (at) for (const d of p.days) closedAt.set(d.date, at);
  }
  const out: MinerDetail['dayWriteOffs'] = [];
  for (const [date, d] of inner.account.byDay)
    if (d.writtenOff >= 1) out.push({ date, amount: d.writtenOff, at: closedAt.get(date) ?? date });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Each officer write-off with what it forgave of the days. The days' total is shared out oldest
 * write-off first, each up to its amount, as the account draws on them.
 */
function officerWriteOffsOf(
  view: BookView,
  minerId: string,
  inner: MinerInternals
): MinerDetail['officerWriteOffs'] {
  const mine = (view.input.writeOffs ?? [])
    .filter((w) => w.minerId === minerId)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  let onDays = inner.account.applications.writeOffs.reduce((s, d) => s + d.amount, 0);
  const through = inner.account.input.checkpoint?.through;
  return mine.map((w) => {
    // A reversed write-off forgave nothing, and one the checkpoint holds is summed up in it:
    // neither takes a share of the days' forgiveness.
    if (w.reversed || (through !== undefined && utcDayOf(w.at) <= through))
      return {
        id: w.id,
        amount: w.amount,
        reason: w.reason,
        at: w.at,
        ...(w.reversed ? { reversed: w.reversed } : {}),
      };
    const amount = Math.min(onDays, Math.max(0, w.amount));
    onDays -= amount;
    return { id: w.id, amount, reason: w.reason, at: w.at };
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
  const noticeIds = new Set(inner.notices.map((n) => n.id));
  return {
    row,
    days: inner.days,
    payments: inner.payments
      .map((p) => ({ ...p, credited: paymentNet(p) }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    notices: [...inner.notices].reverse(),
    paymentDays: inner.account.applications.payments,
    dayWriteOffs: dayWriteOffsOf(inner),
    heldDays: [...inner.account.byDay].filter(([, d]) => d.held).map(([date]) => date),
    officerWriteOffs: officerWriteOffsOf(view, minerId, inner),
    dismissals,
    declarations: view.input.declarations.filter((d) => noticeIds.has(d[NOTICE_ID_FIELD])),
    disputes: (view.input.disputes ?? []).filter((d) =>
      isMinersDispute(d, minerId, inner.characterIds)
    ),
    credit: inner.account.credit,
    ...(inner.account.input.checkpoint ? { checkpoint: inner.account.input.checkpoint } : {}),
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
    held.units += c.oreLines.reduce((s, l) => s + l.quantity, 0);
    held.value += c.estimatedValue;
    held.tax += c.taxOwed;
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

// --- Late notices ----------------------------------------------------------

/** One late notice as its panel reads it, its figures read off the Miner's Running account. */
export interface NoticeDetail {
  notice: LateNotice;
  /** What its lines billed, as whole ISK. */
  billed: number;
  paid: number;
  outstanding: number;
  /** What officer write-offs forgave of its days (part of `paid`). */
  forgiven: number;
  /** The shortfall a tolerance wrote off (part of `paid`). */
  writtenOff: number;
  /** What open disputes hold of its days. */
  held: number;
  settled: boolean;
  overdue: boolean;
  /** When it goes (or went) overdue; null once settled. */
  dueAt: string | null;
  /** Where its Overdue clock stands; a declaration pauses it. */
  state: OverdueState;
  /** While paused: when the pause ends on its own. */
  pausedUntil?: string;
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

/** One late notice with its standing; undefined when the book holds no such notice. */
export function noticeDetail(view: BookView, noticeId: string): NoticeDetail | undefined {
  const notice = view.input.notices.find((n) => n.id === noticeId);
  if (!notice) return undefined;
  const account = view.internals.byMiner.get(notice.minerId)?.account;
  const standing = account?.standingOf(notice);
  const settled = standing?.settled ?? false;
  const status = settled ? undefined : noticeOverdue(view, notice);
  const shown = settled
    ? shownFigures(standing!.due, 0, standing!.due)
    : shownFigures(
        standing?.due ?? notice.listed,
        standing?.remaining ?? notice.listed,
        standing?.credited ?? 0
      );
  return {
    notice,
    ...shown,
    forgiven: wholeIsk(standing?.forgiven ?? 0),
    writtenOff: wholeIsk(standing?.writtenOff ?? 0),
    held: wholeIsk(standing?.held ?? 0),
    settled,
    overdue: status?.state === 'overdue',
    dueAt: status?.overdueAt ?? null,
    state: status?.state ?? 'settled',
    ...(status?.pausedUntil ? { pausedUntil: status.pausedUntil } : {}),
  };
}
