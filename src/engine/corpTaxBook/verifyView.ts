import type { OwedDay } from '../../../functions/src/corpTaxBookRunningAccounts';
import type { TaxPriceSource } from '../miningTax/priceBasis';

export interface VerifyPayload {
  corporationId: number;
  statement: {
    id: string;
    code: string;
    issuedAt: string;
    amount: number;
    hubId: string;
    oreForm: 'compressed' | 'raw';
    lines: VerifyPayloadLine[];
    corporationName?: string;
    minerName?: string;
    refineryNames?: Record<string, string>;
  };
  terms: {
    startDate?: string;
    overdueDays?: number;
    divisions: number[];
    divisionNames?: Record<string, string>;
  };
  declarations: { kind: string; at: string; resolution: string | null }[];
  remindersStopped: boolean;
  accountClosed: boolean;
  pendingCharacterIds: number[];
  account?: {
    owed: number;
    days: number;
    oldest: string | null;
    paidThrough: string | null;
    asOf: string;
    unpaidDays?: UnpaidDay[];
  } | null;
  ledger: VerifyLedgerData;
}

export type UnpaidDay = OwedDay;

export interface VerifyLedgerData {
  days: { date: string; tax: number }[];
  payments: { id: string; at: string; amount: number; source: 'donation' | 'manual' }[];
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
  unitPrice: number | undefined;
  source: TaxPriceSource | undefined;
}

export interface VerifyRow {
  key: string;
  kind: VerifyPayloadLine['kind'];
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

export function hasRecordOverride(
  rows: readonly Pick<VerifyRow, 'taxPct' | 'rateEffectiveFrom'>[]
) {
  return rows.some((r) => r.taxPct !== undefined && r.rateEffectiveFrom === undefined);
}
