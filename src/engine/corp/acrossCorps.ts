/**
 * Corp Board widgets read across several corporations (the All scope): merging
 * each corporation's rows into one list and totalling what sums.
 *
 * Pure (CLAUDE.md): the reads arrive already loaded, one per corporation.
 */

/** One corporation's rows. */
export interface CorpRows<T> {
  corporationId: number;
  items: readonly T[];
}

/**
 * Several corporations' rows as one list ordered by `compare`, each stamped with
 * its corporation. A tie keeps the order the corporations came in.
 */
export function mergeByCorporation<T>(
  reads: readonly CorpRows<T>[],
  compare: (a: T, b: T) => number
): (T & { corporationId: number })[] {
  return reads
    .flatMap(({ corporationId, items }) => items.map((item) => ({ ...item, corporationId })))
    .sort(compare);
}

/** One corporation's wallet: its master division's balance and all its readable divisions'. */
export interface CorpBalances {
  corporationId: number;
  master: number;
  total: number;
}

/** Each corporation's master and total balance, largest total first, and the grand total. */
export function walletBalancesAcross(
  reads: readonly {
    corporationId: number;
    /** The master wallet's division number. */
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

/** A corporation's killboard totals, as zKillboard states them. */
export interface KillTotals {
  kills: number;
  losses: number;
  iskDestroyed: number;
  iskLost: number;
}

/**
 * Kills and losses summed; ISK efficiency over the summed ISK (zKillboard's own
 * formula), so a big corporation weighs more than a quiet one. Null when no ISK moved.
 */
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
