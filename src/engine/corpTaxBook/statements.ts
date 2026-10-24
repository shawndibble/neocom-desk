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
import type { TaxPriceSource } from '../miningTax/priceBasis';
import type { OreLine } from './types';
import { DAY_MS } from '@/lib/age';

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

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * The billing period `date` falls in. A day before an N-day anchor, from the book's `startDate`,
 * falls in a stub period that runs from the start date to the day before the anchor.
 */
export function statementPeriod(
  date: string,
  cadence: StatementCadence = { kind: 'monthly' },
  startDate?: string
): StatementPeriod {
  if (cadence.kind === 'monthly') {
    const start = `${date.slice(0, 7)}-01`;
    const [y, m] = start.split('-').map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { start, end };
  }
  if (startDate !== undefined && startDate < cadence.anchor && date < cadence.anchor)
    return { start: startDate, end: shiftDate(cadence.anchor, -1) };
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
  /** Per-unit price by raw type id, as first billed for the day. */
  unitPrices?: Record<number, number>;
  /** Which price tier priced each type — printed on the mail. */
  priceSources?: Record<number, TaxPriceSource>;
  taxPct?: number;
  /** The rate's effective-from date (D28); absent for a per-record override. */
  rateEffectiveFrom?: string;
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
  /** The book's trade hub and Ore Form when issued — printed on every Statement (D11). */
  hubId: string;
  oreForm: 'compressed' | 'raw';
  lines: StatementLine[];
  /** Σ line tax. */
  amount: number;
  /** What the book recorded about this Statement's mail; absent on a Statement nobody mailed. */
  mailsSent?: number;
  /** The Miner chose "Stop reminders" (D27). */
  remindersStopped?: boolean;
  /** Reminders an officer sent by hand; one is allowed after the Miner stopped them. */
  manualRemindersSent?: number;
}

/**
 * The rate an issued day shows (D22). Each of its lines was billed at its own
 * rate (a rate fix lands on later lines only), so the day shows one rate only
 * when its lines share it, else the rate they came to (tax ÷ value) with no
 * effective-from. `fallback` stands in for a line that carries no rate.
 */
export function frozenDayRate(
  lines: readonly Pick<StatementLine, 'taxPct' | 'rateEffectiveFrom' | 'estimatedValue' | 'tax'>[],
  fallback: { taxPct: number; rateEffectiveFrom?: string }
): { taxPct: number; rateEffectiveFrom?: string } {
  const first = lines[0];
  const pcts = new Set(lines.map((l) => l.taxPct ?? fallback.taxPct));
  if (pcts.size <= 1) {
    const rateEffectiveFrom = first?.rateEffectiveFrom ?? fallback.rateEffectiveFrom;
    return {
      taxPct: first?.taxPct ?? fallback.taxPct,
      ...(rateEffectiveFrom !== undefined ? { rateEffectiveFrom } : {}),
    };
  }
  const value = lines.reduce((sum, l) => sum + l.estimatedValue, 0);
  const tax = lines.reduce((sum, l) => sum + l.tax, 0);
  return {
    taxPct: value > 0 ? Math.round((tax / value) * 100 * 1e4) / 1e4 : fallback.taxPct,
  };
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
  /**
   * Statements ever settled. The caller persists a Statement here once
   * `allocatePayments` first settles it, so its days stay closed for good
   * (D22) even if a later "not tax" mark reopens its debt.
   */
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
  /** Positive corrections dated on a paid Statement's day — never billed (D22). */
  blockedCorrections: Adjustment[];
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
  for (const line of statement.lines) if (line.kind !== 'correction') days.add(line.date);
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
  const common: DraftCommon = { writtenOff: [], dismissed: [], blockedCorrections: [] };
  const { writtenOff, dismissed, blockedCorrections } = common;
  if (input.billableThrough === undefined) return { kind: 'nothing', ...common };
  const issued = input.issued.filter((s) => s.minerId === input.minerId);

  const coversThrough =
    input.billableThrough < input.period.end ? input.billableThrough : input.period.end;
  const lastCovered = issued.reduce<string | undefined>(
    (max, s) => (max === undefined || s.coversThrough > max ? s.coversThrough : max),
    undefined
  );
  const coversFrom = lastCovered ? shiftDate(lastCovered, 1) : input.startDate;

  const billedQty = new Map<string, Map<number, number>>();
  const billedPrices = new Map<string, Record<number, number>>();
  const billedAdjustments = new Set<string>();
  const paidDay = new Map<string, string>();
  for (const s of issued) {
    for (const line of s.lines) {
      if (line.adjustmentId) billedAdjustments.add(line.adjustmentId);
      if (!line.chargeKey) continue;
      if (line.unitPrices && !billedPrices.has(line.chargeKey)) {
        billedPrices.set(line.chargeKey, line.unitPrices);
      }
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
    // Late ore keeps the unit prices its day was first billed at.
    const unitPrices = { ...charge.unitPrices, ...billedPrices.get(charge.key) };
    const { estimatedValue, taxOwed } = computeAssignmentValue(
      extra,
      priceMap(unitPrices),
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
    const dismissal = activeDismissalFor(charge, input.dismissals);
    if (dismissal) {
      dismissed.push({ charge, dismissal });
      continue;
    }
    const late = billed !== undefined || (lastCovered !== undefined && charge.date <= lastCovered);
    lines.push({
      kind: late ? 'late-ore' : 'mined',
      date: charge.date,
      chargeKey: charge.key,
      characterId: charge.characterId,
      structureId: charge.structureId,
      oreLines: extra,
      unitPrices,
      priceSources: charge.priceSources,
      taxPct: charge.taxPct,
      ...(charge.rateEffectiveFrom !== undefined
        ? { rateEffectiveFrom: charge.rateEffectiveFrom }
        : {}),
      estimatedValue,
      tax: taxOwed,
    });
  }
  for (const adj of input.adjustments) {
    if (adj.minerId !== input.minerId || billedAdjustments.has(adj.id)) continue;
    if (adj.date > coversThrough) continue;
    if (adj.amount > 0 && paidDay.has(adj.date)) {
      blockedCorrections.push(adj);
      continue;
    }
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

  if (lines.length === 0) return { kind: 'nothing', ...common };
  const amount = lines.reduce((sum, line) => sum + line.tax, 0);
  if (!input.final && amount < (input.minimumAmount ?? DEFAULT_MINIMUM_STATEMENT)) {
    return { kind: 'rolled-over', lines, amount, ...common };
  }
  return { kind: 'statement', lines, amount, coversFrom, coversThrough, ...common };
}

/** Freezes a draft into an issued Statement. */
export function issueStatement(
  draft: Extract<StatementDraft, { kind: 'statement' }>,
  meta: {
    id: string;
    code: string;
    minerId: string;
    period: StatementPeriod;
    issuedAt: string;
    hubId: string;
    oreForm: 'compressed' | 'raw';
  }
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
    hubId: meta.hubId,
    oreForm: meta.oreForm,
    lines: draft.lines,
    amount: draft.amount,
  };
}
