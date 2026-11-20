/**
 * A Miner's balance: positive is owed, negative is credit held (what the ledger's last row shows).
 * A Statement-era book's billable days not yet on a Statement (`unbilled`) are part of it; a
 * running account has none, as every billable day is owed already.
 */
export function accountBalance(row: { owed: number; unbilled?: number; credit: number }): number {
  return row.owed + (row.unbilled ?? 0) - row.credit;
}

/**
 * The Adjustment amount that moves a Miner's balance from `current` to `target` (both positive
 * when owed): positive charges, negative credits. Whole ISK, 0 when nothing needs moving.
 */
export function balanceAdjustment(current: number, target: number): number {
  const delta = Math.round(target) - Math.round(current);
  return delta === 0 ? 0 : delta;
}
