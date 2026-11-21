import { useEffect, useMemo, useRef } from 'react';
import type { PayeeRecord } from '@/db';
import type {
  PayeePaymentLink,
  StoredPayeeCheckpoint,
} from '@/engine/miningTax/payeeRunningAccount';
import { utcDay } from '@/engine/localDay';
import { allMembers, type DisplayRow } from '@/features/miningTax/groupRows';
import { systemsByPayee } from '@/features/miningTax/suggestPayee';
import { useLinkSuggestions } from '@/features/miningTax/useMadePayments';
import { computeOwedByPayee } from './owedByPayee';
import { owedBalances, unassignedSummary } from './owedNow';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';
import { savePayeeCheckpoints } from './paymentLinkStore';

interface Args {
  characterFiltered: readonly DisplayRow[];
  personalRows: readonly DisplayRow[];
  ledgerPayees: readonly PayeeRecord[];
  allPayees: readonly PayeeRecord[];
  /** Duplicate records of one Payee mapped to the primary (`payeeDuplicateAliases`). */
  duplicateAliases: ReadonlyMap<string, string>;
  estimatedValueOf: (dr: DisplayRow) => number;
  madePayments: Parameters<typeof useLinkSuggestions>[0]['madePayments'];
  /** Every Made Payment linked to a Payee. */
  links: readonly PayeePaymentLink[];
  /** The one accounts build (`useTaxCorpBooks`). */
  accounts: PayeeRunningAccounts;
  /** When the account inputs were read: a checkpoint is only stored while they still hold. */
  historyGen: number | undefined;
  /** The corporations of the member's Corp Tax Books: a donation to one is the book's. */
  bookCorporations: ReadonlySet<number>;
  /** Each Corp Tax Book Payee's credit, by its id (`bookCreditsOf`). */
  bookCredits?: ReadonlyMap<string, number>;
}

/**
 * What the owed cards, Settle up, the Payee ledger, the payment-link suggestions and the Payee
 * manager read: the balances off every personal Payee's Running account.
 */
export function useTaxBalances({
  characterFiltered,
  personalRows,
  ledgerPayees,
  allPayees,
  duplicateAliases,
  estimatedValueOf,
  madePayments,
  links,
  accounts,
  historyGen,
  bookCorporations,
  bookCredits,
}: Args) {
  // The owed cards follow the Character filter (an alt's debts are still debts) but not the Payee
  // filter: narrowing the ledger to one Payee must not change a balance. The Overview's Mining
  // tax card reads the same figure (`loadOwedBalances`).
  const balances = useMemo(
    () => owedBalances(characterFiltered, ledgerPayees, accounts, duplicateAliases, bookCredits),
    [characterFiltered, ledgerPayees, accounts, duplicateAliases, bookCredits]
  );
  const unassigned = useMemo(
    () => unassignedSummary(characterFiltered, estimatedValueOf),
    [characterFiltered, estimatedValueOf]
  );

  const everyAssignment = useMemo(
    () => personalRows.flatMap((dr) => allMembers(dr).map((m) => m.assignment)),
    [personalRows]
  );

  const linkSuggestions = useLinkSuggestions({
    madePayments,
    links,
    payees: allPayees,
    accounts,
    bookCorporations,
  });

  // Each account closes through the end of the last month that is at least 31 days old, on the
  // device (decision 20261120-235011), once per checkpoint it moves to.
  const storedRef = useRef(new Set<string>());
  useEffect(() => {
    const today = utcDay();
    const next = new Map<string, StoredPayeeCheckpoint>();
    for (const [id, account] of accounts.entries()) {
      const stored = account.nextCheckpoint(today, new Date().toISOString());
      const key = stored ? `${id}|${stored.checkpoint.through}|${historyGen ?? ''}` : '';
      if (!stored || storedRef.current.has(key)) continue;
      storedRef.current.add(key);
      next.set(id, stored);
    }
    if (next.size > 0 && historyGen !== undefined)
      void savePayeeCheckpoints(next, historyGen).catch(() => undefined);
  }, [accounts, historyGen]);

  // Every Payee's systems and owed entries, for the Payee manager's rows.
  const payeeSystems = useMemo(
    () => systemsByPayee(everyAssignment, allPayees),
    [everyAssignment, allPayees]
  );
  const owedByPayee = useMemo(
    () => computeOwedByPayee(everyAssignment, accounts),
    [everyAssignment, accounts]
  );

  return {
    accounts,
    balances,
    unassigned,
    everyAssignment,
    linkSuggestions,
    payeeSystems,
    owedByPayee,
  };
}
