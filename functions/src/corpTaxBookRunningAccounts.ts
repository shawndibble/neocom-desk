import { DAY_TOLERANCE_PCT_DEFAULT, daySettleTolerance } from './corpTaxBookKinds.js';

type Data = Record<string, unknown>;

export interface OwedDay {
  date: string;
  owed: number;
  tax: number;
}

export const netPayment = (p: { amount?: unknown; notTaxAmount?: unknown }): number => {
  const amount = Number(p.amount) || 0;
  return Math.max(0, amount - Math.min(Number(p.notTaxAmount) || 0, amount));
};

export function paidSinceRecord(recorded: Data, payments: readonly Data[]): number {
  const paidNow = payments.reduce((sum, p) => sum + netPayment(p), 0);
  return Math.max(0, paidNow - (Number(recorded.paid) || 0));
}

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

function paymentsSinceRecord(recorded: Data, payments: readonly Data[]): number[] {
  let counted = Number(recorded.paid) || 0;
  return [...payments]
    .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')))
    .flatMap((p) => {
      const net = netPayment(p);
      const skip = Math.min(counted, net);
      counted -= skip;
      return net - skip > 0 ? [net - skip] : [];
    });
}

function payEachInTurn<D extends { date: string; owed: number }>(
  days: readonly D[],
  amounts: readonly number[],
  tolerance: (day: D) => number
): D[] {
  return amounts.reduce<D[]>(
    (unpaid, amount) => payOldestFirst(unpaid, amount, tolerance).unpaid,
    [...days]
  );
}

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
  credit: number;
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
    payEachInTurn(recordedDays, paymentsSinceRecord(recorded, payments), (d) =>
      daySettleTolerance(d.tax, tolerancePct)
    );
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

export type LiveRunningAccount = ReturnType<typeof liveRunningAccount>;

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
