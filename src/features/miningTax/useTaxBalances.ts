import { useMemo } from 'react';
import type { PayeeRecord } from '@/db';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { allMembers, type DisplayRow } from '@/features/miningTax/groupRows';
import { systemsByPayee } from '@/features/miningTax/suggestPayee';
import { useLinkSuggestions } from '@/features/miningTax/useMadePayments';
import { computeOwedByPayee } from './owedByPayee';
import { computePayeeBalances, type BookOwedDays } from './balances';
import { unassignedSummary } from './owedNow';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';

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
  /** The corporations of the member's Corp Tax Books: a donation to one is the book's. */
  bookCorporations: ReadonlySet<number>;
  /** Each Corp Tax Book Payee's credit, by its id (`bookCreditsOf`). */
  bookCredits?: ReadonlyMap<string, number>;
  /** Each Corp Tax Book Payee's owed, by its id (`bookOwesOf`). */
  bookOwes?: ReadonlyMap<string, number>;
  /** Each Corp Tax Book Payee's owed days and oldest unpaid day, by its id (`bookDaysOf`). */
  bookDays?: ReadonlyMap<string, BookOwedDays>;
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
  bookCorporations,
  bookCredits,
  bookOwes,
  bookDays,
}: Args) {
  // The owed cards follow the Character filter (an alt's debts are still debts) but not the Payee
  // filter: narrowing the ledger to one Payee must not change a balance. The Overview's Mining
  // tax card reads the same figure (`loadOwedBalances`).
  const balances = useMemo(
    () =>
      computePayeeBalances(
        characterFiltered,
        ledgerPayees,
        accounts,
        duplicateAliases,
        bookCredits,
        bookOwes,
        bookDays
      ),
    [characterFiltered, ledgerPayees, accounts, duplicateAliases, bookCredits, bookOwes, bookDays]
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
