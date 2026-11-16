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
const DISPUTE_KINDS: readonly DisputeKind[] = ['payee', 'quantity', 'rate', 'notPaying'];

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
  note?: string;
  resolution?: DisputeResolution;
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
  dispute: Pick<OreDispute, 'at' | 'resolution'>,
  now: string
): { until: string } | undefined {
  if (dispute.resolution) return undefined;
  const until = Date.parse(dispute.at) + DISPUTE_HOLD_DAYS * DAY_MS;
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
    const { id, minerId, date, by, at, note, resolution, kind, reason, claimedPct } = d;
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

/** A Statement line as `heldByStatement` reads it: plain data, so the server mirror reads the same. */
export interface HeldStatementLine {
  kind?: string;
  chargeKey?: string;
  oreLines?: readonly { typeId: number; quantity: number }[];
  unitPrices?: Readonly<Record<number, number>> | Readonly<Record<string, number>>;
  taxPct?: number;
  tax?: number;
}

/**
 * What open disputes hold of each Statement at `now` (resolving in the app): each disputed ore
 * priced as the Statement billed it — only the rate gap for a rate dispute — never more of an
 * ore than the line billed, nor more than its tax. A line a dismissal already credits
 * (`credited`, as `${statementId}|${chargeKey}`) holds nothing: the officer answered it, and
 * holding it too would count it twice. Mirrored in `functions/src/corpTaxBookEngine.ts`.
 */
export function heldByStatement(
  statements: readonly { id: string; lines: readonly HeldStatementLine[] }[],
  disputes: readonly Pick<OreDispute, 'lines' | 'at' | 'resolution' | 'kind' | 'claimedPct'>[],
  credited: ReadonlySet<string>,
  now: string
): Map<string, number> {
  const held = new Map<string, number>();
  for (const d of disputes) {
    if (!disputeHold(d, now)) continue;
    for (const l of d.lines) {
      let left = l.quantity;
      for (const s of statements) {
        for (const line of s.lines) {
          if (left <= 0) break;
          if (line.chargeKey !== l.recordKey) continue;
          if (line.kind !== 'mined' && line.kind !== 'late-ore') continue;
          if (credited.has(`${s.id}|${line.chargeKey}`)) continue;
          const billed = (line.oreLines ?? []).reduce(
            (n, o) => (o.typeId === l.typeId ? n + o.quantity : n),
            0
          );
          const take = Math.min(left, billed);
          const price = (line.unitPrices as Record<string, number> | undefined)?.[String(l.typeId)];
          if (take <= 0 || price === undefined || line.taxPct === undefined) continue;
          const pct =
            d.kind === 'rate' && d.claimedPct !== undefined
              ? Math.max(0, line.taxPct - d.claimedPct)
              : line.taxPct;
          const amount = Math.min(take * price * (pct / 100), line.tax ?? Infinity);
          held.set(s.id, (held.get(s.id) ?? 0) + amount);
          left -= take;
        }
      }
    }
  }
  return held;
}
