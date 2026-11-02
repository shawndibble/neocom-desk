import { useMemo } from 'react';
import type { PayeeRecord } from '@/db';
import {
  canonicalizePayeeFilter,
  canonicalPayeeId,
  isSolePayeeFilter,
  resolvePayeeFilter,
  togglePayeeFilter,
  type PayeeFilter,
} from './payeeFilter';

/** The Payee filter resolved against the Payees the ledger knows, with the handlers that change it. */
export function usePayeeFilter(
  payeeFilter: PayeeFilter,
  setPayeeFilter: (next: PayeeFilter) => void,
  filterPayees: readonly PayeeRecord[],
  /** Payee ids the filter lists under another Payee (see `corpPayeeAliases`). */
  aliases: ReadonlyMap<string, string>
) {
  const canon = (payeeId: string) => canonicalPayeeId(aliases, payeeId);
  const resolvedPayeeFilter = useMemo(
    () =>
      resolvePayeeFilter(
        // A link written before a Payee was merged names its old id.
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

  const isSolePayee = (payeeId: string) => isSolePayeeFilter(resolvedPayeeFilter, canon(payeeId));

  /** A balance's Payee name doubles as "show me just this Payee's entries" — the filter its own figure came from. */
  function filterToPayee(payeeId: string) {
    setPayeeFilter(isSolePayee(payeeId) ? 'all' : new Set([canon(payeeId)]));
  }

  return { resolvedPayeeFilter, togglePayee, isSolePayee, filterToPayee };
}
