/**
 * What the Corp Tax Book's section pages (#5247) group, over the rows
 * `buildBookView` already decided: no figure here is new. Days split by phase,
 * the Overview's moon schedule, ore lines per Miner and moon, the place line,
 * and the merged Payments and Activity ledgers.
 */
import type { BookView, DayRow, ExtractionRow } from './bookView';
import type { OreLine } from './types';

const DAY_MS = 86_400_000;
/** How far ahead the Overview looks for an Extracting moon's chunk to arrive. */
export const POPS_WINDOW_DAYS = 7;

// --- Days ------------------------------------------------------------------

/**
 * A Miner's days by where they stand: Next Statement (Billable, not on a Statement yet),
 * Still accruing (not Billable yet), and every earlier one (on a Statement, paid, dismissed,
 * written off). Order within each is the input's.
 */
export function daysByPhase(days: readonly DayRow[]) {
  const nextStatement: DayRow[] = [];
  const stillAccruing: DayRow[] = [];
  const earlier: DayRow[] = [];
  for (const d of days) {
    if (d.status === 'unbilled') nextStatement.push(d);
    else if (d.status === 'not-billable') stillAccruing.push(d);
    else earlier.push(d);
  }
  return { nextStatement, stillAccruing, earlier };
}

// --- Overview schedule -----------------------------------------------------

type Schedulable = Pick<ExtractionRow, 'id' | 'state' | 'chunkArrivalAt' | 'expiresAt'>;

/**
 * The moons worth a look now: Fractured (mineable, soonest field-gone first), Ready (mineable
 * now, earliest chunk first) and Extracting ones whose chunk arrives within the window. Expired
 * and cancelled ones are left out, as are Extracting ones further off: the Extractions tab lists them.
 */
export function moonSchedule<T extends Schedulable>(
  rows: readonly T[],
  now: string,
  windowDays = POPS_WINDOW_DAYS
) {
  const nowMs = Date.parse(now);
  const horizon = nowMs + windowDays * DAY_MS;
  const byArrival = (a: T, b: T) => a.chunkArrivalAt.localeCompare(b.chunkArrivalAt);
  return {
    fractured: rows
      .filter((r) => r.state === 'fractured')
      .sort((a, b) => (a.expiresAt ?? '9').localeCompare(b.expiresAt ?? '9') || byArrival(a, b)),
    ready: rows.filter((r) => r.state === 'ready').sort(byArrival),
    pops: rows
      .filter((r) => r.state === 'extracting' && Date.parse(r.chunkArrivalAt) <= horizon)
      .sort(byArrival),
  };
}

// --- Ore lines -------------------------------------------------------------

export interface OreTaxLine {
  typeId: number;
  quantity: number;
  /** Estimated value of the quantity. */
  value: number;
  tax: number;
}

/**
 * Days' ore as one line per ore: quantity, value and tax summed. A day carries one tax, so it
 * is split across that day's ores by value share (by quantity when no price is known); the
 * last ore of a day takes the remainder, so the lines add up to the days exactly.
 */
export function oreTaxLines(days: readonly DayRow[]): OreTaxLine[] {
  const byType = new Map<number, OreTaxLine>();
  for (const d of days) {
    const lines: readonly OreLine[] = d.oreLines;
    const weights = lines.map((l) => l.quantity * (d.unitPrices[l.typeId] ?? 0));
    const useQuantity = weights.every((w) => w === 0);
    const shares = useQuantity ? lines.map((l) => l.quantity) : weights;
    const total = shares.reduce((s, w) => s + w, 0);
    let valueLeft = d.estimatedValue;
    let taxLeft = d.tax;
    lines.forEach((l, i) => {
      const last = i === lines.length - 1;
      const share = total > 0 ? shares[i] / total : 1 / lines.length;
      const value = last ? valueLeft : d.estimatedValue * share;
      const tax = last ? taxLeft : d.tax * share;
      valueLeft -= value;
      taxLeft -= tax;
      const held = byType.get(l.typeId) ?? { typeId: l.typeId, quantity: 0, value: 0, tax: 0 };
      held.quantity += l.quantity;
      held.value += value;
      held.tax += tax;
      byType.set(l.typeId, held);
    });
  }
  return [...byType.values()].sort((a, b) => b.tax - a.tax || a.typeId - b.typeId);
}

const sum = (lines: readonly OreTaxLine[]) => ({
  units: lines.reduce((s, l) => s + l.quantity, 0),
  value: lines.reduce((s, l) => s + l.value, 0),
  tax: lines.reduce((s, l) => s + l.tax, 0),
});

export interface MinerOnMoon {
  minerId: string;
  lines: OreTaxLine[];
  units: number;
  value: number;
  tax: number;
}

/** Who mined an Extraction, each with their ore lines; the same totals as `extractionDetail`'s rows. */
export function minersOnMoon(view: BookView, extractionId: string): MinerOnMoon[] {
  const rows: MinerOnMoon[] = [];
  for (const [minerId, inner] of view.internals.byMiner) {
    const days = inner.days.filter((d) => d.extractionId === extractionId);
    if (days.length === 0) continue;
    const lines = oreTaxLines(days);
    rows.push({ minerId, lines, ...sum(lines) });
  }
  return rows.sort((a, b) => b.tax - a.tax || a.minerId.localeCompare(b.minerId));
}

export interface MinerMoon {
  /** The moon id, else the refinery: a day mined outside any Extraction still has a place. */
  key: string;
  moonId?: number;
  structureId: number;
  /** The latest Extraction this Miner mined at the moon; what the moon link opens. */
  extractionId?: string;
  days: number;
  lastDate: string;
  lines: OreTaxLine[];
  units: number;
  value: number;
  tax: number;
}

/** The moons one Miner mined at, newest first, each with that Miner's ore lines there. */
export function minerMoons(view: BookView, minerId: string): MinerMoon[] {
  const days = view.internals.byMiner.get(minerId)?.days ?? [];
  const groups = new Map<string, DayRow[]>();
  for (const d of days) {
    const key = d.moonId !== undefined ? `m${d.moonId}` : `s${d.structureId}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups]
    .map(([key, rows]): MinerMoon => {
      const newest = [...rows].sort((a, b) => b.date.localeCompare(a.date))[0];
      const lines = oreTaxLines(rows);
      const extractionId = [...rows]
        .sort((a, b) => b.date.localeCompare(a.date))
        .find((d) => d.extractionId !== undefined)?.extractionId;
      return {
        key,
        ...(newest.moonId !== undefined ? { moonId: newest.moonId } : {}),
        structureId: newest.structureId,
        ...(extractionId !== undefined ? { extractionId } : {}),
        days: rows.length,
        lastDate: newest.date,
        lines,
        ...sum(lines),
      };
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.key.localeCompare(b.key));
}

// --- The place line --------------------------------------------------------

/**
 * A refinery's name as two lines: the moon once, then only the station. Refinery names
 * usually open with the moon ("Efa VII - Moon 1 - Brass Anvil") or its system ("Efa - Brass
 * Anvil"), so repeating either under the moon line says it twice. An officer label or a
 * placeholder carries neither and stays whole.
 */
export function splitPlace(
  refinery: string,
  moon: string | undefined
): { moon: string | undefined; station: string } {
  if (!moon || refinery === moon || moon.startsWith(`${refinery} - `))
    return { moon, station: refinery };
  const strip = (rest: string) => (rest.trim() === '' ? refinery : rest.trim());
  if (refinery.startsWith(`${moon} - `))
    return { moon, station: strip(refinery.slice(moon.length + 3)) };
  const cut = refinery.indexOf(' - ');
  if (cut > 0 && moon.startsWith(`${refinery.slice(0, cut)} `))
    return { moon, station: strip(refinery.slice(cut + 3)) };
  return { moon, station: refinery };
}

// --- Merged ledgers --------------------------------------------------------

export type LedgerRow<P extends { id: string; at: string }, A extends { id: string; at: string }> =
  | { kind: 'payment'; id: string; at: string; payment: P }
  | { kind: 'correction'; id: string; at: string; correction: A };

/** A Miner's Payments ledger: payments and the correction lines given, newest first. */
export function paymentLedger<
  P extends { id: string; at: string },
  A extends { id: string; at: string },
>(payments: readonly P[], corrections: readonly A[]): LedgerRow<P, A>[] {
  const rows: LedgerRow<P, A>[] = [
    ...payments.map((payment): LedgerRow<P, A> => ({
      kind: 'payment',
      id: payment.id,
      at: payment.at,
      payment,
    })),
    ...corrections.map((correction): LedgerRow<P, A> => ({
      kind: 'correction',
      id: correction.id,
      at: correction.at,
      correction,
    })),
  ];
  return rows.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

export type ActivityKind = 'mail' | 'dismissed' | 'audit';

export interface ActivityItem<T> {
  kind: ActivityKind;
  id: string;
  /** Epoch ms. */
  at: number;
  item: T;
}

/** A Miner's Activity: queued mail, dismissals and the audit log in one feed, newest first. */
export function activityFeed<
  M extends { id: string; at: number },
  D extends { id: string; at: number },
  A extends { id: string; at: number },
>(sources: {
  mail: readonly M[];
  dismissed: readonly D[];
  audit: readonly A[];
}): (ActivityItem<M> | ActivityItem<D> | ActivityItem<A>)[] {
  const rows: (ActivityItem<M> | ActivityItem<D> | ActivityItem<A>)[] = [
    ...sources.mail.map((item) => ({ kind: 'mail' as const, id: item.id, at: item.at, item })),
    ...sources.dismissed.map((item) => ({
      kind: 'dismissed' as const,
      id: item.id,
      at: item.at,
      item,
    })),
    ...sources.audit.map((item) => ({ kind: 'audit' as const, id: item.id, at: item.at, item })),
  ];
  return rows.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}
