export function accountBalance(row: { owed: number; credit: number }): number {
  return row.owed - row.credit;
}

export function balanceAdjustment(current: number, target: number): number {
  const delta = Math.round(target) - Math.round(current);
  return delta === 0 ? 0 : delta;
}
