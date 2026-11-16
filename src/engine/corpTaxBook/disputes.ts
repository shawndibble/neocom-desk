/**
 * Disputes (#6206): a Miner flags a Conflict day to the Corp Tax Book, "I gave this ore to
 * {payee}". One record per Miner and day (`corps/{id}/disputes/{minerId_date}`), written by the
 * `disputeCorpTaxBookConflictCallable` action. Officers answer it in Needs you: waive the
 * disputed ore (a credit Adjustment of its tax, `dismissDispute`) or reject it with a note. A
 * dispute answered before that by dismissing its whole records still counts as answered. The
 * Payee is the name the Miner sent; officers never see a Miner's own Payee list.
 */
import { isPlainRecord } from '@/engine/guards';
import type { DayCharge } from './charges';
import { activeDismissalFor, type Dismissal } from './dismissals';

export interface OreDisputeLine {
  /** `character:refinery:date`, the same key a record dismissal targets. */
  recordKey: string;
  typeId: number;
  quantity: number;
  payeeName: string;
}

export interface OreDispute {
  id: string;
  minerId: string;
  /** The UTC day disputed. */
  date: string;
  lines: OreDisputeLine[];
  /** The character that first flagged it. */
  by: number;
  /** ISO instant it was first flagged. */
  at: string;
  note?: string;
  resolution?: DisputeResolution;
}

export type DisputeResolution =
  | { kind: 'rejected'; at: string; by: number; reason: string }
  /** The disputed ore's tax was credited back on the day (`dismissDispute`). */
  | { kind: 'dismissed'; at: string; by: number; reason: string; amountIsk: number };

/**
 * The tax on the disputed ore only, at each day charge's own prices and rate: what waiving the
 * dispute credits. A line never counts more of an ore than its charge holds. Undefined while a
 * disputed record has no charge in view, so it is never waived at a guessed zero.
 */
export function disputedTax(
  dispute: Pick<OreDispute, 'lines'>,
  charges: readonly Pick<DayCharge, 'key' | 'oreLines' | 'unitPrices' | 'taxPct'>[]
): number | undefined {
  const disputed = new Map<string, number>();
  for (const l of dispute.lines) {
    const k = `${l.recordKey}|${l.typeId}`;
    disputed.set(k, (disputed.get(k) ?? 0) + l.quantity);
  }
  let tax = 0;
  for (const [k, quantity] of disputed) {
    const [recordKey, type] = k.split('|');
    const typeId = Number(type);
    const charge = charges.find((c) => c.key === recordKey);
    if (!charge) return undefined;
    const held = charge.oreLines.reduce((n, l) => (l.typeId === typeId ? n + l.quantity : n), 0);
    tax += Math.min(quantity, held) * (charge.unitPrices[typeId] ?? 0) * (charge.taxPct / 100);
  }
  return tax;
}

/** The disputes Needs you still lists: unanswered, with a line no active dismissal covers. Oldest day first. */
export function disputesToShow(
  disputes: readonly OreDispute[],
  dismissals: readonly Dismissal[]
): OreDispute[] {
  return disputes
    .filter(
      (d) =>
        !d.resolution &&
        d.lines.some(
          (l) =>
            !activeDismissalFor({ key: l.recordKey, minerId: d.minerId, date: d.date }, dismissals)
        )
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.minerId.localeCompare(b.minerId));
}

function readLine(raw: unknown): OreDisputeLine | null {
  if (!isPlainRecord(raw)) return null;
  const { recordKey, typeId, quantity, payeeName } = raw;
  return typeof recordKey === 'string' &&
    typeof typeId === 'number' &&
    typeof quantity === 'number' &&
    typeof payeeName === 'string'
    ? { recordKey, typeId, quantity, payeeName }
    : null;
}

/** Stored dispute docs, the malformed ones dropped. */
export function readDisputes(raw: readonly unknown[]): OreDispute[] {
  const out: OreDispute[] = [];
  for (const d of raw) {
    if (!isPlainRecord(d)) continue;
    const { id, minerId, date, by, at, note, resolution } = d;
    const lines = Array.isArray(d.lines) ? d.lines.map(readLine) : [];
    if (
      typeof id !== 'string' ||
      typeof minerId !== 'string' ||
      typeof date !== 'string' ||
      typeof by !== 'number' ||
      typeof at !== 'string' ||
      lines.length === 0 ||
      lines.some((l) => l === null)
    )
      continue;
    out.push({
      id,
      minerId,
      date,
      lines: lines as OreDisputeLine[],
      by,
      at,
      ...(typeof note === 'string' ? { note } : {}),
      ...readResolution(resolution),
    });
  }
  return out;
}

function readResolution(raw: unknown): { resolution?: DisputeResolution } {
  if (
    !isPlainRecord(raw) ||
    typeof raw.at !== 'string' ||
    typeof raw.by !== 'number' ||
    typeof raw.reason !== 'string'
  )
    return {};
  const { at, by, reason } = raw;
  if (raw.kind === 'rejected') return { resolution: { kind: 'rejected', at, by, reason } };
  if (raw.kind === 'dismissed' && typeof raw.amountIsk === 'number')
    return { resolution: { kind: 'dismissed', at, by, reason, amountIsk: raw.amountIsk } };
  return {};
}
