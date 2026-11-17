/**
 * A running account's figures on the verify link (#6294). Pure and dependency-free, so the root
 * parity test (`functionsMirror.test.ts`) can check its payment sum against the client's `netOf`.
 */
type Data = Record<string, unknown>;

/**
 * A recorded running account less what the Miner paid since: their net payments now (less "not
 * tax") beyond the ones the officer's client counted, whenever each was synced.
 */
export function liveAccount(
  recorded: Data,
  payments: readonly Data[]
): { owed: number; days: number; oldest: string | null; paidThrough: string | null; asOf: string } {
  const net = (p: Data) => {
    const amount = Number(p.amount) || 0;
    return Math.max(0, amount - Math.min(Number(p.notTaxAmount) || 0, amount));
  };
  const paidNow = payments.reduce((sum, p) => sum + net(p), 0);
  const since = Math.max(0, paidNow - (Number(recorded.paid) || 0));
  const owed = Math.max(0, (Number(recorded.owed) || 0) - since);
  return {
    owed,
    days: owed > 0 ? Number(recorded.days) || 0 : 0,
    oldest: owed > 0 ? ((recorded.oldest as string | undefined) ?? null) : null,
    paidThrough: (recorded.paidThrough as string | undefined) ?? null,
    asOf: recorded.at as string,
  };
}
