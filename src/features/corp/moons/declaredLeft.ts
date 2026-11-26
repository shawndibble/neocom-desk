import type { Declaration } from '@/engine/corpTaxBook/overdue';

export function declaredLeft(d: Pick<Declaration, 'amount' | 'transfers' | 'checks'>) {
  const { transfers, checks } = d;
  if (!transfers || transfers.length === 0 || !checks || checks.length === 0) return d.amount;
  const left = transfers.reduce(
    (sum, tr, i) => (checks[i]?.result === 'found' ? sum : sum + tr.amount),
    0
  );
  return left > 0 ? left : undefined;
}
