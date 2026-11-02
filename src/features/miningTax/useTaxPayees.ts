import { useMemo } from 'react';
import type { PayeeRecord } from '@/db';
import type { TaxSnapshot } from './taxSnapshot';
import type { CorpBookView } from './corpBook/corpBookView';
import { corpPayeeAliases } from './corpBook/corpRows';

/** The Payees the Tax tab knows: the member's own, and the ledger-wide list that adds each Corp Tax Book's. */
export function useTaxPayees(data: TaxSnapshot | null, corpView: CorpBookView | null) {
  // Every Payee across every tracked character, so the filter dropdown lists
  // them all regardless of the Character filter — "who do I owe" is a
  // question about Payees, not about which alt mined it.
  const allPayees = useMemo(() => {
    const seen = new Map<string, PayeeRecord>();
    for (const payees of data?.payeesByCharacter.values() ?? []) {
      for (const payee of payees) seen.set(payee.id, payee);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
  const payeeById = useMemo(() => new Map(allPayees.map((p) => [p.id, p])), [allPayees]);

  // The Payees balances and the Payee filter know: the member's own, plus each Corp Tax Book's
  // virtual Payee, named for the corporation. Never offered to an Assign dialog.
  const ledgerPayees = useMemo(
    () => [...allPayees, ...(corpView?.payees ?? [])],
    [allPayees, corpView]
  );
  // The Payee filter lists a corporation once: where the member's own Payee is that corporation, the
  // book's virtual one is merged into it.
  const payeeAliases = useMemo(
    () => corpPayeeAliases(allPayees, corpView?.payees ?? []),
    [allPayees, corpView]
  );
  const filterPayees = useMemo(
    () => ledgerPayees.filter((p) => !payeeAliases.has(p.id)),
    [ledgerPayees, payeeAliases]
  );
  return { allPayees, payeeById, ledgerPayees, filterPayees, payeeAliases };
}
