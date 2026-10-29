import { useMemo } from 'react';
import type { PayeeRecord } from '@/db';
import { computePayeeBalances, summarizeUnassigned } from '@/features/miningTax/balances';
import { allMembers, type DisplayRow } from '@/features/miningTax/groupRows';
import { systemsByPayee } from '@/features/miningTax/suggestPayee';
import { useLinkSuggestions } from '@/features/miningTax/useMadePayments';
import { computeOwedByPayee } from './owedByPayee';

interface Args {
  characterFiltered: readonly DisplayRow[];
  personalRows: readonly DisplayRow[];
  ledgerPayees: readonly PayeeRecord[];
  allPayees: readonly PayeeRecord[];
  estimatedValueOf: (dr: DisplayRow) => number;
  madePayments: Parameters<typeof useLinkSuggestions>[0]['madePayments'];
}

/** What the owed cards, the payment-link suggestions and the Payee manager read from the ledger. */
export function useTaxBalances({
  characterFiltered,
  personalRows,
  ledgerPayees,
  allPayees,
  estimatedValueOf,
  madePayments,
}: Args) {
  // The owed cards: per Payee, what is owed *now*. Follows the Character
  // filter (an alt's debts are still debts) but deliberately not the Payee
  // filter — narrowing the ledger to one Payee must not change a balance.
  const balances = useMemo(
    () => computePayeeBalances(characterFiltered, ledgerPayees),
    [characterFiltered, ledgerPayees]
  );
  // A row a Corp Tax Book has labelled (Pending corp record, Unattributed) is not waiting on the
  // member: it stays out of the "needs assigning" count.
  const unassigned = useMemo(
    () =>
      summarizeUnassigned(
        characterFiltered.filter((dr) => !dr.corp),
        estimatedValueOf
      ),
    [characterFiltered, estimatedValueOf]
  );

  const everyAssignment = useMemo(
    () => personalRows.flatMap((dr) => allMembers(dr).map((m) => m.assignment)),
    [personalRows]
  );

  const linkSuggestions = useLinkSuggestions({ madePayments, everyAssignment, balances });

  // Every Payee's systems and owed entries, for the Payee manager's rows.
  const payeeSystems = useMemo(
    () => systemsByPayee(everyAssignment, allPayees),
    [everyAssignment, allPayees]
  );
  const owedByPayee = useMemo(() => computeOwedByPayee(everyAssignment), [everyAssignment]);

  return { balances, unassigned, everyAssignment, linkSuggestions, payeeSystems, owedByPayee };
}
