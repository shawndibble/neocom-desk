/**
 * The guest verify page's view model (issue #4066, D27): the verify callable answers with plain
 * JSON about one late notice, and this turns it into what the page prints. Pure: names (ore,
 * refinery, corporation) and number formatting stay in the page.
 */
import type { OwedDay } from '../../../functions/src/corpTaxBookAccounts';
import type { TaxPriceSource } from '../miningTax/priceBasis';

/**
 * What the verify callable returns (`readStatementByToken`, functions/src/corpTaxBookStore.ts).
 * Its fields keep the names older servers gave them: `statement` is the late notice.
 */
export interface VerifyPayload {
  corporationId: number;
  statement: {
    id: string;
    /** The Reason code its mail printed: the Miner's own on a notice issued now. */
    code: string;
    issuedAt: string;
    /** What its lines asked for. */
    amount: number;
    hubId: string;
    oreForm: 'compressed' | 'raw';
    lines: VerifyPayloadLine[];
    /** Names the officer's client stored with the notice, when it did. */
    corporationName?: string;
    minerName?: string;
    refineryNames?: Record<string, string>;
  };
  terms: {
    startDate?: string;
    overdueDays?: number;
    /** The wallet divisions the book reads donations from; absent from older servers. */
    divisions?: number[];
    /** The corp's own names for those divisions, when a Director's visit stored them. */
    divisionNames?: Record<string, string>;
  };
  declarations: { kind: string; at: string; resolution: string | null }[];
  remindersStopped: boolean;
  accountClosed: boolean;
  /** Characters an officer added by hand that still wait for their own confirmation (D26b). */
  pendingCharacterIds: number[];
  /**
   * The Miner's Running account now (#6294): what an officer's client last counted, less what the
   * Miner paid since. Absent from older servers, null before any count.
   */
  account?: {
    owed: number;
    days: number;
    oldest: string | null;
    paidThrough: string | null;
    /** When it was counted. */
    asOf: string;
    /**
     * The running days still owed, oldest first, after what was paid since: what the page lists.
     * Absent from a server or officer client that does not send it.
     */
    unpaidDays?: UnpaidDay[];
  } | null;
  /** The Miner's whole history, for the ledger; absent from an older server. */
  ledger?: VerifyLedgerData;
}

/** A running day still owed: what remains of it and its whole tax (the shared `OwedDay`). */
export type UnpaidDay = OwedDay;

/** The Miner's whole history for the verify page's ledger. */
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
