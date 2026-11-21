/**
 * A running account's figures on the verify link (#6294). Pure and dependency-free, so the root
 * parity test (`functionsMirror.test.ts`) can check its payment sum against the client's `netOf`.
 */
type Data = Record<string, unknown>;

export interface OwedDay {
  date: string;
  /** What is still owed of the day. */
  owed: number;
  /** The day's whole tax. */
  tax: number;
}

/** A payment's tax: its amount less what an officer marked not tax. */
const net = (p: Data) => {
  const amount = Number(p.amount) || 0;
  return Math.max(0, amount - Math.min(Number(p.notTaxAmount) || 0, amount));
};

/**
 * What a Miner paid since an officer's tab recorded their account: their net payments now beyond
 * the ones it counted (`paid`), whenever each was synced.
 */
export function paidSinceRecord(recorded: Data, payments: readonly Data[]): number {
  const paidNow = payments.reduce((sum, p) => sum + net(p), 0);
  return Math.max(0, paidNow - (Number(recorded.paid) || 0));
}

/**
 * A recorded running account less what the Miner paid since: their net payments now (less "not
 * tax") beyond the ones the officer's client counted, whenever each was synced. The money pays
 * what the client counted, oldest first: what the running days did not cover (older Statements),
 * then the recorded days oldest first, as the book's own allocation does.
 */
export function liveAccount(
  recorded: Data,
  payments: readonly Data[]
): {
  owed: number;
  days: number;
  oldest: string | null;
  paidThrough: string | null;
  asOf: string;
  /** The running days still owed after those payments; absent when the client recorded none. */
  unpaidDays?: OwedDay[];
} {
  const since = paidSinceRecord(recorded, payments);
  const owed = Math.max(0, (Number(recorded.owed) || 0) - since);
  const recordedDays = Array.isArray(recorded.unpaidDays)
    ? (recorded.unpaidDays as OwedDay[])
    : undefined;
  let unpaidDays: OwedDay[] | undefined;
  let days = Number(recorded.days) || 0;
  let oldest = (recorded.oldest as string | undefined) ?? null;
  if (recordedDays) {
    const covered = recordedDays.reduce((sum, d) => sum + d.owed, 0);
    // What older Statements owe: they take the new money before any running day.
    // A few ISK of per-day rounding is no Statement debt.
    const gap = Math.max(0, (Number(recorded.owed) || 0) - covered);
    const olderStatements = gap <= recordedDays.length + 1 ? 0 : gap;
    let left = Math.max(0, since - olderStatements);
    unpaidDays = [];
    for (const d of recordedDays) {
      const take = Math.min(d.owed, left);
      left -= take;
      if (d.owed - take > 0) unpaidDays.push({ ...d, owed: d.owed - take });
    }
    days = Math.max(0, days - (recordedDays.length - unpaidDays.length));
    // The oldest owed day moves on once the days before it are paid; older Statements keep theirs.
    if (olderStatements - since <= 0 && unpaidDays.length > 0) oldest = unpaidDays[0].date;
  }
  return {
    owed,
    days: owed > 0 ? days : 0,
    oldest: owed > 0 ? oldest : null,
    paidThrough: (recorded.paidThrough as string | undefined) ?? null,
    asOf: recorded.at as string,
    ...(unpaidDays ? { unpaidDays } : {}),
  };
}

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
      const amount = Number(data.amount) || 0;
      const net = Math.max(0, amount - Math.min(Number(data.notTaxAmount) || 0, amount));
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
