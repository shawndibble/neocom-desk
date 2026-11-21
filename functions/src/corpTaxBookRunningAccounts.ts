/**
 * A running account's figures on the verify link (#6294). Pure and dependency-free: the client
 * imports `netPayment` (`src/engine/corpTaxBook/payments.ts`), and the root parity test
 * (`functionsMirror.test.ts`) checks `liveRunningAccount` against it.
 */
import { DAY_TOLERANCE_PCT_DEFAULT, daySettleTolerance } from './corpTaxBookKinds.js';

type Data = Record<string, unknown>;

/**
 * A day a Running account still owes, as an officer's tab records it (`RecordedRunningAccount.unpaidDays`)
 * and the verify page lists it: the one shape of an owed day on both sides.
 */
export interface OwedDay {
  date: string;
  /** What is still owed of the day. */
  owed: number;
  /** The day's whole tax. */
  tax: number;
}

/** A payment's tax: its amount less what an officer marked not tax, never below zero. */
export const netPayment = (p: { amount?: unknown; notTaxAmount?: unknown }): number => {
  const amount = Number(p.amount) || 0;
  return Math.max(0, amount - Math.min(Number(p.notTaxAmount) || 0, amount));
};

/**
 * What a Miner paid since an officer's tab recorded their account: their net payments now beyond
 * the ones it counted (`paid`), whenever each was synced.
 */
export function paidSinceRecord(recorded: Data, payments: readonly Data[]): number {
  const paidNow = payments.reduce((sum, p) => sum + netPayment(p), 0);
  return Math.max(0, paidNow - (Number(recorded.paid) || 0));
}

/**
 * Pays `amount` into `days` (oldest first) the way a Running account does: the oldest day first,
 * then part of the next. What each still owes after, and the dates paid in full; a day left owing
 * no more than `tolerance` (an amount, or one read off each day) reads as paid.
 */
export function payOldestFirst<D extends { date: string; owed: number }>(
  days: readonly D[],
  amount: number,
  tolerance: number | ((day: D) => number) = 0
): { unpaid: D[]; paid: string[] } {
  const unpaid: D[] = [];
  const paid: string[] = [];
  let left = Math.max(0, amount);
  for (const d of days) {
    const take = Math.min(d.owed, left);
    left -= take;
    if (d.owed - take <= (typeof tolerance === 'function' ? tolerance(d) : tolerance))
      paid.push(d.date);
    else unpaid.push(take > 0 ? { ...d, owed: d.owed - take } : d);
  }
  return { unpaid, paid };
}

/**
 * A recorded running account less what the Miner paid since: their net payments now (less "not
 * tax") beyond the ones the officer's client counted, whenever each was synced, paying the
 * recorded days oldest first (`payOldestFirst`). A day left short by no more than the book's day
 * tolerance (`tolerancePct`, percent of the day's tax) reads as paid, as on the client.
 */
export function liveRunningAccount(
  recorded: Data,
  payments: readonly Data[],
  tolerancePct: number = DAY_TOLERANCE_PCT_DEFAULT
): {
  owed: number;
  days: number;
  oldest: string | null;
  paidThrough: string | null;
  asOf: string;
  /** The credit the record counted, and what the Miner paid since beyond what it said they owed. */
  credit: number;
  /** The running days still owed after those payments; absent when the client recorded none. */
  unpaidDays?: OwedDay[];
} {
  const since = paidSinceRecord(recorded, payments);
  const recordedOwed = Number(recorded.owed) || 0;
  const owed = Math.max(0, recordedOwed - since);
  const recordedDays = Array.isArray(recorded.unpaidDays)
    ? (recorded.unpaidDays as OwedDay[])
    : undefined;
  const unpaidDays =
    recordedDays &&
    payOldestFirst(recordedDays, since, (d) => daySettleTolerance(d.tax, tolerancePct)).unpaid;
  const recordedCount = Number(recorded.days) || 0;
  const days = recordedDays
    ? Math.max(0, recordedCount - (recordedDays.length - unpaidDays!.length))
    : recordedCount;
  const oldest =
    unpaidDays && unpaidDays.length > 0
      ? unpaidDays[0].date
      : ((recorded.oldest as string | undefined) ?? null);
  return {
    owed,
    days: owed > 0 ? days : 0,
    oldest: owed > 0 ? oldest : null,
    paidThrough: (recorded.paidThrough as string | undefined) ?? null,
    asOf: recorded.at as string,
    credit: (Number(recorded.credit) || 0) + Math.max(0, since - recordedOwed),
    ...(unpaidDays ? { unpaidDays } : {}),
  };
}

/** A Running account as the verify page shows it (`VerifyPayload.account`). */
export type LiveRunningAccount = ReturnType<typeof liveRunningAccount>;

/**
 * The Miner's mined days for the verify page's ledger: each date once, from the newest Late notice
 * that lists it (an older notice may list it too), with that notice's tax for the date. Oldest
 * first.
 */
export function ledgerDays(
  statements: readonly { issuedAt?: unknown; lines?: unknown }[]
): { date: string; tax: number }[] {
  const newestFirst = [...statements].sort((a, b) =>
    String(b.issuedAt ?? '').localeCompare(String(a.issuedAt ?? ''))
  );
  const byDate = new Map<string, number>();
  const taken = new Map<string, string>();
  for (const s of newestFirst) {
    const issued = String(s.issuedAt ?? '');
    const lines = Array.isArray(s.lines) ? (s.lines as Data[]) : [];
    for (const line of lines) {
      const date = typeof line.date === 'string' ? line.date : undefined;
      if (!date) continue;
      const owner = taken.get(date);
      if (owner !== undefined && owner !== issued) continue;
      taken.set(date, issued);
      byDate.set(date, (byDate.get(date) ?? 0) + (Number(line.tax) || 0));
    }
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, tax]) => ({ date, tax }));
}

/** The Miner's payments for the ledger: net of "not tax", dated on or after the book's start, oldest first. */
export function ledgerPayments(
  payments: readonly { id: string; data: Data }[],
  startDate: string | undefined
): { id: string; at: string; amount: number; source: 'donation' | 'manual' }[] {
  return payments
    .flatMap(({ id, data }) => {
      const net = netPayment(data);
      const at = typeof data.at === 'string' ? data.at : '';
      if (net <= 0 || !at || (startDate && at.slice(0, 10) < startDate)) return [];
      return [
        {
          id,
          at,
          amount: net,
          source: data.source === 'manual' ? ('manual' as const) : ('donation' as const),
        },
      ];
    })
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
