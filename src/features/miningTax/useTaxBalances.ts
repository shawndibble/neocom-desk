import { useMemo } from 'react';
import type { PayeeRecord } from '@/db';
import { allMembers, type DisplayRow } from '@/features/miningTax/groupRows';
import { systemsByPayee } from '@/features/miningTax/suggestPayee';
import { useLinkSuggestions } from '@/features/miningTax/useMadePayments';
import type { PersonalOverlay } from '@/engine/corpTaxBook/personal';
import { computeOwedByPayee } from './owedByPayee';
import { alsoBilledShareOf, owedBalances, unassignedSummary } from './owedNow';

interface Args {
  characterFiltered: readonly DisplayRow[];
  personalRows: readonly DisplayRow[];
  ledgerPayees: readonly PayeeRecord[];
  allPayees: readonly PayeeRecord[];
  estimatedValueOf: (dr: DisplayRow) => number;
  madePayments: Parameters<typeof useLinkSuggestions>[0]['madePayments'];
  /** What the Corp Tax Books bill too of the member's Assignments to other Payees (#6204). */
  alsoBilled?: PersonalOverlay['alsoBilled'];
}

/** What the owed cards, the payment-link suggestions and the Payee manager read from the ledger. */
export function useTaxBalances({
  characterFiltered,
  personalRows,
  ledgerPayees,
  allPayees,
  estimatedValueOf,
  madePayments,
  alsoBilled,
}: Args) {
  // The owed cards: per Payee, what is owed *now*. Follows the Character
  // filter (an alt's debts are still debts) but deliberately not the Payee
  // filter — narrowing the ledger to one Payee must not change a balance.
  // Ore a Corp Tax Book bills is owed to the corporation, not to the member's own Payee too:
  // every owed figure per Payee leaves that share out (#6204).
  // The Overview's Mining tax card reads the same figure (`loadOwedBalances`).
  const alsoBilledShare = useMemo(() => alsoBilledShareOf(alsoBilled), [alsoBilled]);
  const balances = useMemo(
    () => owedBalances(characterFiltered, ledgerPayees, alsoBilled),
    [characterFiltered, ledgerPayees, alsoBilled]
  );
  const unassigned = useMemo(
    () => unassignedSummary(characterFiltered, estimatedValueOf),
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
  const owedByPayee = useMemo(
    () => computeOwedByPayee(everyAssignment, alsoBilledShare),
    [everyAssignment, alsoBilledShare]
  );

  return { balances, unassigned, everyAssignment, linkSuggestions, payeeSystems, owedByPayee };
}
