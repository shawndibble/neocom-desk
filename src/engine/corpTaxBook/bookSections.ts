/**
 * What the Corp Tax Book's section pages group, over the rows
 * `buildBookView` already decided: no figure here is new. Days split by phase,
 * the Overview's moon schedule, ore lines per Miner and moon, the place line,
 * and the merged Payments and Activity ledgers.
 */
import type { BookView, DayRow, ExtractionRow, RunningAccountStatus } from './bookView';
import type { OreLine } from './types';
import { DAY_MS } from '@/lib/age';
import { shiftUtcDate, utcDay } from '../localDay';
import { netPayment } from './payments';

/** How far ahead the Overview looks for an Extracting moon's chunk to arrive. */
export const POPS_WINDOW_DAYS = 7;

// --- Days ------------------------------------------------------------------

/**
 * A Miner's days by where they stand: owed (Billable, not paid yet), Today's mining (not
 * Billable yet), and every earlier one (paid, dismissed). Order within each is the input's.
 */
export function daysByPhase(days: readonly DayRow[]) {
  const owed: DayRow[] = [];
  const stillAccruing: DayRow[] = [];
  const earlier: DayRow[] = [];
  for (const d of days) {
    if (d.status === 'owed') owed.push(d);
    else if (d.status === 'not-billable') stillAccruing.push(d);
    else earlier.push(d);
  }
  return { owed, stillAccruing, earlier };
}

/** The ranges a Miner's page reads its days and payments in: every day, or the last N UTC days. */
export const DAY_RANGES = ['all', '7', '30'] as const;
export type DayRange = (typeof DAY_RANGES)[number];

/** The first UTC day a range takes in (today counts as one), or undefined for every day. */
export function rangeStart(range: DayRange, now: string): string | undefined {
  return range === 'all' ? undefined : shiftUtcDate(utcDay(Date.parse(now)), 1 - Number(range));
}

/** Whether a date or ISO instant falls in a range that starts on `from` (undefined: every day). */
export const inRange = (dateOrInstant: string, from: string | undefined): boolean =>
  from === undefined || dateOrInstant.slice(0, 10) >= from;

/**
 * A range's figures on a Miner's page: the tax of the Billable days mined in it that were billed
 * to the Miner (not dismissed), and the tax payments received in it.
 */
export function rangeFigures(
  days: readonly Pick<DayRow, 'date' | 'status' | 'tax'>[],
  payments: readonly { at: string; amount: number; notTaxAmount?: number }[],
  from: string | undefined
): { tax: number; paid: number } {
  const billed = new Set<DayRow['status']>(['owed', 'paid']);
  return {
    tax: days
      .filter((d) => billed.has(d.status) && inRange(d.date, from))
      .reduce((s, d) => s + d.tax, 0),
    paid: payments.filter((p) => inRange(p.at, from)).reduce((s, p) => s + netPayment(p), 0),
  };
}

/** Sorts Miners by how far behind they are: the oldest unpaid day first, the paid-up after. */
export const accountSortValue = (account: RunningAccountStatus | undefined): string =>
  account?.owes ? account.owes.oldest : `~${account?.paidThrough ?? ''}`;

// --- Overview schedule -----------------------------------------------------

type Schedulable = Pick<ExtractionRow, 'id' | 'state' | 'chunkArrivalAt' | 'expiresAt'>;

/**
 * The moons worth a look now: Fractured (mineable, soonest field-gone first), Ready (mineable
 * now, earliest chunk first) and Extracting ones whose chunk arrives within the window. Expired
 * and cancelled ones are left out, as are Extracting ones further off or already past arrival:
 * the Extractions tab lists them.
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
    // An Extracting row already past its arrival is stale (the next sync flips it), not a pop.
    pops: rows
      .filter((r) => {
        const at = Date.parse(r.chunkArrivalAt);
        return r.state === 'extracting' && at >= nowMs && at <= horizon;
      })
      .sort(byArrival),
  };
}

// --- Ore lines -------------------------------------------------------------

/** The line for tax on a day that recorded no ore. */
export const OTHER_ORE_TYPE_ID = 0;

export interface OreTaxLine {
  typeId: number;
  quantity: number;
  /** Estimated value of the quantity. */
  value: number;
  tax: number;
}

/**
 * Days' ore as one line per ore: quantity, value and tax summed. A day carries one tax, so it
 * is split across that day's ores by value share (by quantity when no price is known). A day
 * with no ore lines keeps its tax on an "other" line. Lines are whole ISK and the smallest
 * takes the rounding remainder, so they add up to the days' total exactly.
 */
export function oreTaxLines(days: readonly DayRow[]): OreTaxLine[] {
  const byType = new Map<number, OreTaxLine>();
  const hold = (typeId: number) => {
    const held = byType.get(typeId) ?? { typeId, quantity: 0, value: 0, tax: 0 };
    byType.set(typeId, held);
    return held;
  };
  let totalValue = 0;
  let totalTax = 0;
  for (const d of days) {
    totalValue += d.estimatedValue;
    totalTax += d.tax;
    const lines: readonly OreLine[] = d.oreLines;
    if (lines.length === 0) {
      if (d.tax > 0 || d.estimatedValue > 0) {
        const other = hold(OTHER_ORE_TYPE_ID);
        other.value += d.estimatedValue;
        other.tax += d.tax;
      }
      continue;
    }
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
      const held = hold(l.typeId);
      held.quantity += l.quantity;
      held.value += value;
      held.tax += tax;
    });
  }
  const sorted = [...byType.values()].sort((a, b) => b.tax - a.tax || a.typeId - b.typeId);
  let valueLeft = Math.round(totalValue);
  let taxLeft = Math.round(totalTax);
  sorted.forEach((l, i) => {
    if (i < sorted.length - 1) {
      l.value = Math.round(l.value);
      l.tax = Math.round(l.tax);
    } else {
      l.value = valueLeft;
      l.tax = taxLeft;
    }
    valueLeft -= l.value;
    taxLeft -= l.tax;
  });
  return sorted;
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

/**
 * Whether an Extraction's tax is all paid: it has days, at least one paid, and none still owed or
 * not Billable yet.
 */
export function extractionBilling(view: BookView, extractionId: string): { paid: boolean } {
  const days = [...view.internals.byMiner.values()].flatMap((inner) =>
    inner.days.filter((d) => d.extractionId === extractionId)
  );
  const open = days.some((d) => d.status === 'owed' || d.status === 'not-billable');
  return { paid: !open && days.some((d) => d.status === 'paid') };
}

/**
 * The moon each refinery sits at. A day mined while no Extraction ran carries no moon id, but
 * its refinery's moon is known from the Extractions and the days that do.
 */
export function moonByStructure(view: BookView): Map<number, number> {
  const moons = new Map<number, number>();
  for (const x of view.extractions) moons.set(x.structureId, x.moonId);
  for (const inner of view.internals.byMiner.values())
    for (const d of inner.days)
      if (d.moonId !== undefined && !moons.has(d.structureId)) moons.set(d.structureId, d.moonId);
  return moons;
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

export type ActivityKind = 'mail' | 'dismissed' | 'audit';

/** Audit actions that are mail going out: the Mail chip counts them, not Audit. */
const MAIL_AUDIT_ACTIONS: ReadonlySet<string> = new Set([
  'recordLateNoticeMail',
  'recordMail',
  'recordReminder',
]);

export interface ActivityItem<K extends ActivityKind, T> {
  kind: K;
  /** The filter chip the row is counted under; a mail's audit row is Mail, not Audit. */
  chip: ActivityKind;
  id: string;
  /** Epoch ms. */
  at: number;
  item: T;
}

type Timed = { id: string; at: number };

/**
 * A Miner's Activity: queued mail, dismissals and the audit log in one feed, newest first. A
 * queued mail and the audit row logged for it (same mail id) are one event, shown as the queue
 * row (its subject and status); once the queue is cleared the audit row stands alone.
 */
export function activityFeed<
  M extends Timed & { mailId?: string },
  D extends Timed,
  A extends Timed & { action?: string; detail?: Record<string, unknown> },
>(sources: {
  mail: readonly M[];
  dismissed: readonly D[];
  audit: readonly A[];
}): (ActivityItem<'mail', M> | ActivityItem<'dismissed', D> | ActivityItem<'audit', A>)[] {
  const queued = new Set(sources.mail.flatMap((m) => (m.mailId ? [String(m.mailId)] : [])));
  const isMail = (a: A) => a.action !== undefined && MAIL_AUDIT_ACTIONS.has(a.action);
  const rows = [
    ...sources.mail.map((item) => ({
      kind: 'mail' as const,
      chip: 'mail' as const,
      id: item.id,
      at: item.at,
      item,
    })),
    ...sources.dismissed.map((item) => ({
      kind: 'dismissed' as const,
      chip: 'dismissed' as const,
      id: item.id,
      at: item.at,
      item,
    })),
    ...sources.audit
      .filter(
        (a) => !(isMail(a) && a.detail?.mailId !== undefined && queued.has(String(a.detail.mailId)))
      )
      .map((item) => ({
        kind: 'audit' as const,
        chip: (isMail(item) ? 'mail' : 'audit') as ActivityKind,
        id: item.id,
        at: item.at,
        item,
      })),
  ];
  return rows.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}
