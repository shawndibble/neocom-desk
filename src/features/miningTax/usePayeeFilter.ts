import { useMemo } from 'react';
import type { PayeeRecord } from '@/db';
import {
  canonicalizePayeeFilter,
  canonicalPayeeId,
  resolvePayeeFilter,
  togglePayeeFilter,
  type PayeeFilter,
} from './payeeFilter';

export function usePayeeFilter(
  payeeFilter: PayeeFilter,
  setPayeeFilter: (next: PayeeFilter) => void,
  filterPayees: readonly PayeeRecord[],
  aliases: ReadonlyMap<string, string>
) {
  const canon = (payeeId: string) => canonicalPayeeId(aliases, payeeId);
  const resolvedPayeeFilter = useMemo(
    () =>
      resolvePayeeFilter(
        canonicalizePayeeFilter(payeeFilter, aliases),
        filterPayees.map((p) => p.id)
      ),
    [payeeFilter, filterPayees, aliases]
  );

  function togglePayee(payeeId: string) {
    setPayeeFilter(
      togglePayeeFilter(
        resolvedPayeeFilter,
        filterPayees.map((p) => p.id),
        canon(payeeId)
      )
    );
  }

  return { resolvedPayeeFilter, togglePayee };
}
