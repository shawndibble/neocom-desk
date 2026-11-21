/**
 * Disputes (#6206): a Miner flags a Conflict day to the Corp Tax Book, "I gave this ore to
 * {payee}". One record per Miner and day (`corps/{id}/disputes/{minerId_date}`), written by the
 * `disputeCorpTaxBookConflictCallable` action. Officers answer it in Needs you: waive the
 * disputed ore (a credit Adjustment of its tax, `dismissDispute`) or reject it with a note. A
 * dispute answered before that by dismissing its whole records still counts as answered. The
 * Payee is the name the Miner sent; officers never see a Miner's own Payee list.
 */
import { isPlainRecord } from '@/engine/guards';
import { DAY_MS } from '@/lib/age';
import type { DayCharge } from './charges';
import { activeDismissalFor, type Dismissal } from './dismissals';

export interface OreDisputeLine {
  /** `character:refinery:date`, the same key a record dismissal targets. */
  recordKey: string;
  typeId: number;
  quantity: number;
  payeeName: string;
}

/**
 * What the member says about the day (resolving in the app). `payee`: the ore went to another
 * Payee (#6206). `quantity`: the book recorded more ore than they mined. `rate`: the book's rate
 * is higher than the one that applies. `notPaying`: they will not pay it, and say why.
 */
export type DisputeKind = 'payee' | 'quantity' | 'rate' | 'notPaying';
export const DISPUTE_KINDS: readonly DisputeKind[] = ['payee', 'quantity', 'rate', 'notPaying'];

export interface OreDispute {
  id: string;
  /** Absent on a dispute stored before kinds existed: a payee dispute (`disputeKindOf`). */
  kind?: DisputeKind;
  /** The member's own words: why. Every kind but `payee` carries one. */
  reason?: string;
  /** A `rate` dispute: the rate, in percent, the member says applies. */
  claimedPct?: number;
  minerId: string;
  /** The UTC day disputed. */
  date: string;
  lines: OreDisputeLine[];
  /** The character that first flagged it. */
  by: number;
  /** ISO instant it was first flagged. */
  at: string;
  /**
   * A dispute filed again after an officer kept the bill keeps the first one's hold window:
   * the ISO instant that hold started. Absent on a first dispute (`at` then).
   */
  holdFrom?: string;
  note?: string;
  resolution?: DisputeResolution;
  /** Earlier disputes of this day an officer answered, oldest first (a kept bill, then filed again). */
  history?: DisputeHistoryEntry[];
}

export interface DisputeHistoryEntry {
  kind: DisputeKind;
  reason?: string;
  resolution: DisputeResolution;
}

export type DisputeResolution =
  /**
   * The officer kept the bill. `nextStep`: what the member should do now, shown to them word for
   * word; the app requires it, the server accepts its absence until every client sends it.
   */
  | { kind: 'rejected'; at: string; by: number; reason: string; nextStep?: string }
  /** The disputed ore's tax was credited back on the day (`dismissDispute`). */
  | { kind: 'dismissed'; at: string; by: number; reason: string; amountIsk: number };

/**
 * The tax on the disputed ore only, at each day charge's own prices and rate: what waiving the
 * dispute credits. A line never counts more of an ore than its charge holds. Undefined while a
 * disputed record has no charge in view, so it is never waived at a guessed zero.
 */
export function disputedTax(
  dispute: Pick<OreDispute, 'lines' | 'kind' | 'claimedPct'>,
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
    const price = charge.unitPrices[typeId];
    if (price === undefined && held > 0) return undefined;
    // A rate dispute is about the rate, not the ore: waiving it credits only the gap.
    const pct =
      dispute.kind === 'rate' && dispute.claimedPct !== undefined
        ? Math.max(0, charge.taxPct - dispute.claimedPct)
        : charge.taxPct;
    tax += Math.min(quantity, held) * (price ?? 0) * (pct / 100);
  }
  return tax;
}

/** A stored dispute's kind; one stored before kinds existed is a payee dispute. */
export const disputeKindOf = (d: Pick<OreDispute, 'kind'>): DisputeKind => d.kind ?? 'payee';

/**
 * How long an unanswered dispute holds its day: payments skip the disputed amount and a Conflict
 * day does not resolve to the corporation meanwhile. The Overdue flow's 14-day pause, reused, so
 * a dispute nobody answers cannot stall a bill for ever.
 */
export const DISPUTE_HOLD_DAYS = 14;

/** The hold an open dispute puts on its day at `now`; none once answered or lapsed. */
export function disputeHold(
  dispute: Pick<OreDispute, 'at' | 'resolution' | 'holdFrom'>,
  now: string
): { until: string } | undefined {
  if (dispute.resolution) return undefined;
  const until = Date.parse(dispute.holdFrom ?? dispute.at) + DISPUTE_HOLD_DAYS * DAY_MS;
  return Date.parse(now) < until ? { until: new Date(until).toISOString() } : undefined;
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
    const { id, minerId, date, by, at, note, resolution, kind, reason, claimedPct, holdFrom } = d;
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
      ...(DISPUTE_KINDS.includes(kind as DisputeKind) && kind !== 'payee'
        ? { kind: kind as DisputeKind }
        : {}),
      ...(typeof reason === 'string' ? { reason } : {}),
      ...(typeof claimedPct === 'number' && Number.isFinite(claimedPct) ? { claimedPct } : {}),
      ...(typeof holdFrom === 'string' && Number.isFinite(Date.parse(holdFrom))
        ? { holdFrom }
        : {}),
      ...readResolution(resolution),
      ...readHistory(d.history),
    });
  }
  return out;
}

function readHistory(raw: unknown): { history?: DisputeHistoryEntry[] } {
  if (!Array.isArray(raw)) return {};
  const history = raw.flatMap((e): DisputeHistoryEntry[] => {
    if (!isPlainRecord(e)) return [];
    const { resolution } = readResolution(e.resolution);
    if (!resolution) return [];
    const kind = DISPUTE_KINDS.includes(e.kind as DisputeKind) ? (e.kind as DisputeKind) : 'payee';
    return [{ kind, ...(typeof e.reason === 'string' ? { reason: e.reason } : {}), resolution }];
  });
  return history.length > 0 ? { history } : {};
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
  if (raw.kind === 'rejected')
    return {
      resolution: {
        kind: 'rejected',
        at,
        by,
        reason,
        ...(typeof raw.nextStep === 'string' ? { nextStep: raw.nextStep } : {}),
      },
    };
  if (raw.kind === 'dismissed' && typeof raw.amountIsk === 'number')
    return { resolution: { kind: 'dismissed', at, by, reason, amountIsk: raw.amountIsk } };
  return {};
}
