import { useMemo } from 'react';
import type { PayeeRecord } from '@/db';
import {
  isSolePayeeFilter,
  resolvePayeeFilter,
  togglePayeeFilter,
  type PayeeFilter,
} from './payeeFilter';

/** The Payee filter resolved against the Payees the ledger knows, with the handlers that change it. */
export function usePayeeFilter(
  payeeFilter: PayeeFilter,
  setPayeeFilter: (next: PayeeFilter) => void,
  ledgerPayees: readonly PayeeRecord[]
) {
  const resolvedPayeeFilter = useMemo(
    () =>
      resolvePayeeFilter(
        payeeFilter,
        ledgerPayees.map((p) => p.id)
      ),
    [payeeFilter, ledgerPayees]
  );

  function togglePayee(payeeId: string) {
    setPayeeFilter(
      togglePayeeFilter(
        resolvedPayeeFilter,
        ledgerPayees.map((p) => p.id),
        payeeId
      )
    );
  }

  const isSolePayee = (payeeId: string) => isSolePayeeFilter(resolvedPayeeFilter, payeeId);

  /** A balance's Payee name doubles as "show me just this Payee's entries" — the filter its own figure came from. */
  function filterToPayee(payeeId: string) {
    setPayeeFilter(isSolePayee(payeeId) ? 'all' : new Set([payeeId]));
  }

  return { resolvedPayeeFilter, togglePayee, isSolePayee, filterToPayee };
}
