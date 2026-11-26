export interface CorpRows<T> {
  corporationId: number;
  items: readonly T[];
}

export function mergeByCorporation<T>(
  reads: readonly CorpRows<T>[],
  compare: (a: T, b: T) => number
): (T & { corporationId: number })[] {
  return reads
    .flatMap(({ corporationId, items }) => items.map((item) => ({ ...item, corporationId })))
    .sort(compare);
}

export interface CorpBalances {
  corporationId: number;
  master: number;
  total: number;
}

export function walletBalancesAcross(
  reads: readonly {
    corporationId: number;
    masterDivision: number;
    divisions: readonly { division: number; balance: number }[];
  }[]
): { rows: CorpBalances[]; total: number } {
  const rows = reads
    .map(({ corporationId, masterDivision, divisions }) => ({
      corporationId,
      master: divisions.find((d) => d.division === masterDivision)?.balance ?? 0,
      total: divisions.reduce((sum, d) => sum + d.balance, 0),
    }))
    .sort((a, b) => b.total - a.total);
  return { rows, total: rows.reduce((sum, row) => sum + row.total, 0) };
}

export interface KillTotals {
  kills: number;
  losses: number;
  iskDestroyed: number;
  iskLost: number;
}

export function killTotalsAcross(stats: readonly KillTotals[]): {
  kills: number;
  losses: number;
  iskEfficiency: number | null;
} {
  const sum = (pick: (s: KillTotals) => number) => stats.reduce((acc, s) => acc + pick(s), 0);
  const destroyed = sum((s) => s.iskDestroyed);
  const moved = destroyed + sum((s) => s.iskLost);
  return {
    kills: sum((s) => s.kills),
    losses: sum((s) => s.losses),
    iskEfficiency: moved > 0 ? destroyed / moved : null,
  };
}
