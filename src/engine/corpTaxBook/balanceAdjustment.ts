/** A Miner's balance: positive is owed, negative is credit held (what the ledger's last row shows). */
export function accountBalance(row: { owed: number; credit: number }): number {
  return row.owed - row.credit;
}

/**
 * The Adjustment amount that moves a Miner's balance from `current` to `target` (both positive
 * when owed): positive charges, negative credits. Whole ISK, 0 when nothing needs moving.
 */
export function balanceAdjustment(current: number, target: number): number {
  const delta = Math.round(target) - Math.round(current);
  return delta === 0 ? 0 : delta;
}
