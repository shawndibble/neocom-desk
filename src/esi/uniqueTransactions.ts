export function uniqueTransactions<T extends { transaction_id: number }>(rows: readonly T[]): T[] {
  const seen = new Set<number>();
  return rows.filter((row) => {
    if (seen.has(row.transaction_id)) return false;
    seen.add(row.transaction_id);
    return true;
  });
}
