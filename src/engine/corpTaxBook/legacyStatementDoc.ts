/**
 * The wire shape of a legacy `corps/{id}/statements` doc, as the member side (`personal.ts`,
 * `features/miningTax`) still reads it until its own rework (decision 20261120-235011, step 5).
 * Every such doc in production is a late notice (`kind: 'notice'`); the officer side reads them as
 * `LateNotice`s (`lateNoticeFromStatementDoc`). Nothing new reads or writes this shape.
 */
import { shiftDate } from '../miningTax/yieldRange';
import type { TaxPriceSource } from '../miningTax/priceBasis';
import type { OreLine } from './types';

export type LegacyStatementLineKind = 'mined' | 'late-ore' | 'correction';

export interface LegacyStatementLine {
  kind: LegacyStatementLineKind;
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

export interface LegacyStatementDoc {
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
  lines: LegacyStatementLine[];
  /** Σ line tax. */
  amount: number;
  /** What the book recorded about this Statement's mail; absent on a Statement nobody mailed. */
  mailsSent?: number;
  /** When the book last recorded a mail for it (the doc's `lastMailedAt`). */
  lastMailedAt?: string;
  /** The Character who issued it (the doc's `issuedBy`). */
  issuedBy?: number;
  /** The Miner's name as the officer's client stored it with the Statement. */
  minerName?: string;
  /** The Miner chose "Stop reminders" (D27). */
  remindersStopped?: boolean;
  /** Reminders an officer sent by hand; one is allowed after the Miner stopped them. */
  manualRemindersSent?: number;
  /** A running account's late notice (#6294); absent on a calendar Statement. */
  kind?: 'notice';
}

/**
 * The rate an issued day shows (D22). Each of its lines was billed at its own
 * rate (a rate fix lands on later lines only), so the day shows one rate only
 * when its lines share it, else the rate they came to (tax ÷ value) with no
 * effective-from. `fallback` stands in for a line that carries no rate.
 */
export function frozenDayRate(
  lines: readonly Pick<
    LegacyStatementLine,
    'taxPct' | 'rateEffectiveFrom' | 'estimatedValue' | 'tax'
  >[],
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

function dateRange(from: string, through: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= through; d = shiftDate(d, 1)) days.push(d);
  return days;
}

/** Every day a Statement took in: its covered range plus any earlier day one of its lines billed. */
export function statementDays(statement: LegacyStatementDoc): Set<string> {
  const days = new Set(dateRange(statement.coversFrom, statement.coversThrough));
  for (const line of statement.lines) if (line.kind !== 'correction') days.add(line.date);
  return days;
}
