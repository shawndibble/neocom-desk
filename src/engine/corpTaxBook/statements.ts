/**
 * Forward-only Statements (D4, D19, D20, D22; epic #4055 "Never 'you still owe
 * more'"). A Statement is one Miner's bill for one period, monthly by default.
 * Once issued it never changes: late ore on a day not yet paid, and officer
 * corrections, go on the next Statement as labelled lines; late ore on a day
 * a paid Statement covered is written off ("Recorded after payment — written
 * off") and never billed. A period whose total is under the minimum (5M by
 * default) is not issued; its days roll into the next period.
 */
import { shiftDate } from '../miningTax/yieldRange';
import { computeAssignmentValue } from '../miningTax/valuation';
import { activeDismissalFor, type Dismissal } from './dismissals';
import type { DayCharge } from './charges';
import type { OreLine } from './types';

export const DEFAULT_MINIMUM_STATEMENT = 5_000_000;

export type StatementCadence =
  | { kind: 'monthly' }
  /** Back-to-back periods of `days` days, one of which starts on `anchor`. */
  | { kind: 'days'; days: number; anchor: string };

export interface StatementPeriod {
  start: string;
  /** Inclusive. */
  end: string;
}

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The billing period `date` falls in. */
export function statementPeriod(
  date: string,
  cadence: StatementCadence = { kind: 'monthly' }
): StatementPeriod {
  if (cadence.kind === 'monthly') {
    const start = `${date.slice(0, 7)}-01`;
    const [y, m] = start.split('-').map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { start, end };
  }
  const offset = Math.floor(daysBetween(cadence.anchor, date) / cadence.days) * cadence.days;
  const start = shiftDate(cadence.anchor, offset);
  return { start, end: shiftDate(start, cadence.days - 1) };
}

/** An officer's logged correction to a Miner's bill; negative credits them. */
export interface Adjustment {
  id: string;
  minerId: string;
  /** The mined day it corrects. */
  date: string;
  amount: number;
  reason: string;
  by: number;
  at: string;
}

export type StatementLineKind = 'mined' | 'late-ore' | 'correction';

export interface StatementLine {
  kind: StatementLineKind;
  date: string;
  /** The day charge a mined or late-ore line bills. */
  chargeKey?: string;
  /** The Adjustment a correction line bills. */
  adjustmentId?: string;
  characterId?: number;
  structureId?: number;
  /** The quantities this line bills — for late ore, only the growth. */
  oreLines: OreLine[];
  unitPrices?: Record<number, number>;
  taxPct?: number;
  estimatedValue: number;
  tax: number;
  reason?: string;
}

export interface Statement {
  id: string;
  minerId: string;
  /** The payment code that pins a donation to this Statement (D15). */
  code: string;
  periodStart: string;
  periodEnd: string;
  /** First day this Statement took in: the day after the previous one's last, or the book's start. */
  coversFrom: string;
  /** Last day this Statement took in: the period end, or the last Billable day if earlier. */
  coversThrough: string;
  issuedAt: string;
  lines: StatementLine[];
  /** Σ line tax. */
  amount: number;
}

/** Late ore on a paid Statement's day — logged, never billed (D22). */
export interface WrittenOffOre {
  reason: 'recorded-after-payment';
  /** The paid Statement whose day it was. */
  statementId: string;
  chargeKey: string;
  date: string;
  oreLines: OreLine[];
  estimatedValue: number;
  tax: number;
}

export interface StatementDraftInput {
  minerId: string;
  /** The book's start date. */
  startDate: string;
  period: StatementPeriod;
  /** Day charges; only this Miner's are used. */
  charges: readonly DayCharge[];
  adjustments: readonly Adjustment[];
  /** This Miner's issued Statements. */
  issued: readonly Statement[];
  /** Issued Statements that are settled (`allocatePayments`). */
  paidStatementIds: ReadonlySet<string>;
  dismissals: readonly Dismissal[];
  /** `lastBillableDate`; undefined when the book has no sync after the grace. */
  billableThrough: string | undefined;
  minimumAmount?: number;
  /** A closing account's final Statement ignores the minimum. */
  final?: boolean;
}

interface DraftCommon {
  writtenOff: WrittenOffOre[];
  dismissed: { charge: DayCharge; dismissal: Dismissal }[];
}

export type StatementDraft =
  | (DraftCommon & {
      kind: 'statement';
      lines: StatementLine[];
      amount: number;
      coversFrom: string;
      coversThrough: string;
    })
  | (DraftCommon & { kind: 'rolled-over'; lines: StatementLine[]; amount: number })
  | (DraftCommon & { kind: 'nothing' });

function dateRange(from: string, through: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= through; d = shiftDate(d, 1)) days.push(d);
  return days;
}

/** Every day a Statement took in: its covered range plus any earlier day one of its lines billed. */
export function statementDays(statement: Statement): Set<string> {
  const days = new Set(dateRange(statement.coversFrom, statement.coversThrough));
  for (const line of statement.lines) days.add(line.date);
  return days;
}

/** Every day on any of `statements` — where a per-record rate override is no longer allowed. */
export function daysOnStatements(statements: readonly Statement[]): Set<string> {
  const days = new Set<string>();
  for (const s of statements) for (const d of statementDays(s)) days.add(d);
  return days;
}

/** "Rebill from date" can never reach a day a paid Statement covered (D22). */
export function canRebillFrom(
  date: string,
  statements: readonly Statement[],
  paidStatementIds: ReadonlySet<string>
): boolean {
  // Every day a Statement billed is on or before its `coversThrough`.
  return statements.every((s) => !paidStatementIds.has(s.id) || date > s.coversThrough);
}

function priceMap(unitPrices: Record<number, number>): Map<number, number> {
  return new Map(Object.entries(unitPrices).map(([typeId, price]) => [Number(typeId), price]));
}

function growth(current: readonly OreLine[], billed: ReadonlyMap<number, number>): OreLine[] {
  return current
    .map((line) => ({
      typeId: line.typeId,
      quantity: line.quantity - (billed.get(line.typeId) ?? 0),
    }))
    .filter((line) => line.quantity > 0);
}

export function draftStatement(input: StatementDraftInput): StatementDraft {
  const writtenOff: WrittenOffOre[] = [];
  const dismissed: DraftCommon['dismissed'] = [];
  if (input.billableThrough === undefined) return { kind: 'nothing', writtenOff, dismissed };

  const coversThrough =
    input.billableThrough < input.period.end ? input.billableThrough : input.period.end;
  const lastCovered = input.issued.reduce<string | undefined>(
    (max, s) => (max === undefined || s.coversThrough > max ? s.coversThrough : max),
    undefined
  );
  const coversFrom = lastCovered ? shiftDate(lastCovered, 1) : input.startDate;

  const billedQty = new Map<string, Map<number, number>>();
  const billedAdjustments = new Set<string>();
  const paidDay = new Map<string, string>();
  for (const s of input.issued) {
    for (const line of s.lines) {
      if (line.adjustmentId) billedAdjustments.add(line.adjustmentId);
      if (!line.chargeKey) continue;
      const qty = billedQty.get(line.chargeKey) ?? new Map<number, number>();
      for (const ore of line.oreLines)
        qty.set(ore.typeId, (qty.get(ore.typeId) ?? 0) + ore.quantity);
      billedQty.set(line.chargeKey, qty);
    }
    if (input.paidStatementIds.has(s.id))
      for (const day of statementDays(s)) paidDay.set(day, s.id);
  }

  const lines: StatementLine[] = [];
  for (const charge of input.charges) {
    if (charge.minerId !== input.minerId || charge.date > coversThrough) continue;
    if (charge.date < input.startDate) continue;
    const billed = billedQty.get(charge.key);
    const extra = billed ? growth(charge.oreLines, billed) : charge.oreLines;
    if (extra.length === 0) continue;
    const { estimatedValue, taxOwed } = computeAssignmentValue(
      extra,
      priceMap(charge.unitPrices),
      charge.taxPct
    );
    const paidStatementId = paidDay.get(charge.date);
    if (paidStatementId) {
      writtenOff.push({
        reason: 'recorded-after-payment',
        statementId: paidStatementId,
        chargeKey: charge.key,
        date: charge.date,
        oreLines: extra,
        estimatedValue,
        tax: taxOwed,
      });
      continue;
    }
    if (!billed) {
      const dismissal = activeDismissalFor(charge, input.dismissals);
      if (dismissal) {
        dismissed.push({ charge, dismissal });
        continue;
      }
    }
    const late = billed !== undefined || (lastCovered !== undefined && charge.date <= lastCovered);
    lines.push({
      kind: late ? 'late-ore' : 'mined',
      date: charge.date,
      chargeKey: charge.key,
      characterId: charge.characterId,
      structureId: charge.structureId,
      oreLines: extra,
      unitPrices: charge.unitPrices,
      taxPct: charge.taxPct,
      estimatedValue,
      tax: taxOwed,
    });
  }
  for (const adj of input.adjustments) {
    if (adj.minerId !== input.minerId || billedAdjustments.has(adj.id)) continue;
    lines.push({
      kind: 'correction',
      date: adj.date,
      adjustmentId: adj.id,
      oreLines: [],
      estimatedValue: 0,
      tax: adj.amount,
      reason: adj.reason,
    });
  }
  lines.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.chargeKey ?? a.adjustmentId ?? '').localeCompare(b.chargeKey ?? b.adjustmentId ?? '')
  );

  if (lines.length === 0) return { kind: 'nothing', writtenOff, dismissed };
  const amount = lines.reduce((sum, line) => sum + line.tax, 0);
  if (!input.final && amount < (input.minimumAmount ?? DEFAULT_MINIMUM_STATEMENT)) {
    return { kind: 'rolled-over', lines, amount, writtenOff, dismissed };
  }
  return { kind: 'statement', lines, amount, coversFrom, coversThrough, writtenOff, dismissed };
}

/** Freezes a draft into an issued Statement. */
export function issueStatement(
  draft: Extract<StatementDraft, { kind: 'statement' }>,
  meta: { id: string; code: string; minerId: string; period: StatementPeriod; issuedAt: string }
): Statement {
  return {
    id: meta.id,
    minerId: meta.minerId,
    code: meta.code,
    periodStart: meta.period.start,
    periodEnd: meta.period.end,
    coversFrom: draft.coversFrom,
    coversThrough: draft.coversThrough,
    issuedAt: meta.issuedAt,
    lines: draft.lines,
    amount: draft.amount,
  };
}
