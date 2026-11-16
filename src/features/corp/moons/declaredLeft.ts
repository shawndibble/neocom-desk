import type { Declaration } from '@/engine/corpTaxBook/overdue';

/**
 * What a declaration still asks an officer to count: its transfers whose check was not `found`
 * (a found one is credited the moment it is declared, so recording the declared total again
 * would count it twice). Without transfers and checks, the amount the Miner declared; undefined
 * when there is nothing to go on, or every transfer was found.
 */
export function declaredLeft(d: Pick<Declaration, 'amount' | 'transfers' | 'checks'>) {
  const { transfers, checks } = d;
  if (!transfers || transfers.length === 0 || !checks || checks.length === 0) return d.amount;
  const left = transfers.reduce(
    (sum, tr, i) => (checks[i]?.result === 'found' ? sum : sum + tr.amount),
    0
  );
  return left > 0 ? left : undefined;
}
