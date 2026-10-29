/**
 * The guest verify page's view model (issue #4066, D27): `readCorpTaxBookStatementCallable`
 * answers with plain JSON, and this turns it into what the page prints. Pure:
 * names (ore, refinery, corporation) and number formatting stay in the page.
 */
import type { TaxPriceSource } from '../miningTax/priceBasis';
import { DAY_MS } from '@/lib/age';
import { utcDay } from '@/engine/localDay';

/** What `readCorpTaxBookStatementCallable` returns (functions/src/corpTaxBookStore.ts). */
export interface VerifyPayload {
  corporationId: number;
  statement: {
    id: string;
    code: string;
    periodStart: string;
    periodEnd: string;
    issuedAt: string;
    amount: number;
    hubId: string;
    oreForm: 'compressed' | 'raw';
    lines: VerifyPayloadLine[];
    /** Names the officer's client stored with the Statement, when it did. */
    corporationName?: string;
    minerName?: string;
    refineryNames?: Record<string, string>;
  };
  terms: {
    startDate?: string;
    overdueDays?: number;
    minimumStatement?: number;
    /** The book's Statement cadence; absent from older servers. */
    cadence?: { kind: 'monthly' } | { kind: 'days'; days: number };
  };
  payments: { id: string; amount: number; at: string; source: 'donation' | 'manual' }[];
  settlement: {
    amount: number;
    credited: number;
    /** What officer write-offs forgave (#4637), part of `credited`; absent from older servers. */
    forgiven?: number;
    writtenOff: number;
    remaining: number;
  } | null;
  declarations: { kind: string; at: string; resolution: string | null }[];
  settled: boolean;
  remindersStopped: boolean;
  accountClosed: boolean;
  /** Characters an officer added by hand that still wait for their own confirmation (D26b). */
  pendingCharacterIds: number[];
}

export interface VerifyPayloadLine {
  kind: 'mined' | 'late-ore' | 'correction';
  date: string;
  structureId?: number;
  oreLines: { typeId: number; quantity: number }[];
  unitPrices?: Record<string, number>;
  priceSources?: Record<string, TaxPriceSource>;
  taxPct?: number;
  rateEffectiveFrom?: string;
  estimatedValue: number;
  tax: number;
  reason?: string;
}

export interface VerifyOre {
  typeId: number;
  quantity: number;
  /** Per unit, as priced on the line's day; undefined when the line carries no price. */
  unitPrice: number | undefined;
  source: TaxPriceSource | undefined;
}

export interface VerifyRow {
  key: string;
  kind: VerifyPayloadLine['kind'];
  /** EVE/UTC day mined (or the corrected day). */
  date: string;
  structureId: number | undefined;
  ores: VerifyOre[];
  taxPct: number | undefined;
  rateEffectiveFrom: string | undefined;
  tax: number;
  reason: string | undefined;
}

export function verifyRows(lines: readonly VerifyPayloadLine[]): VerifyRow[] {
  return lines.map((line, index) => ({
    key: `${index}`,
    kind: line.kind,
    date: line.date,
    structureId: line.structureId,
    ores: line.oreLines.map((o) => ({
      typeId: o.typeId,
      quantity: o.quantity,
      unitPrice: line.unitPrices?.[String(o.typeId)],
      source: line.priceSources?.[String(o.typeId)],
    })),
    taxPct: line.taxPct,
    rateEffectiveFrom: line.rateEffectiveFrom,
    tax: line.tax,
    reason: line.reason,
  }));
}

/** The UTC date a Statement is due: `overdueDays` after it was issued (D19). */
export function dueDate(issuedAt: string, overdueDays: number): string {
  return utcDay(Date.parse(issuedAt) + overdueDays * DAY_MS);
}

/** The distinct rates the lines billed, each with its effective-from date, in line order (D28). */
export function ratesUsed(
  rows: readonly Pick<VerifyRow, 'taxPct' | 'rateEffectiveFrom'>[]
): { pct: number; effectiveFrom: string | undefined }[] {
  const seen = new Map<string, { pct: number; effectiveFrom: string | undefined }>();
  for (const row of rows) {
    if (row.taxPct === undefined) continue;
    seen.set(`${row.taxPct}|${row.rateEffectiveFrom ?? ''}`, {
      pct: row.taxPct,
      effectiveFrom: row.rateEffectiveFrom,
    });
  }
  return [...seen.values()];
}

/** Whether any line carries a per-record rate (no effective-from date): an officer's logged correction. */
export function hasRecordOverride(
  rows: readonly Pick<VerifyRow, 'taxPct' | 'rateEffectiveFrom'>[]
) {
  return rows.some((r) => r.taxPct !== undefined && r.rateEffectiveFrom === undefined);
}
