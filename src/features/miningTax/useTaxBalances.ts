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
  duplicateAliases: ReadonlyMap<string, string>;
  estimatedValueOf: (dr: DisplayRow) => number;
  madePayments: Parameters<typeof useLinkSuggestions>[0]['madePayments'];
  links: readonly PayeePaymentLink[];
  accounts: PayeeRunningAccounts;
  bookCorporations: ReadonlySet<number>;
  bookCredits?: ReadonlyMap<string, number>;
  bookOwes?: ReadonlyMap<string, number>;
  bookDays?: ReadonlyMap<string, BookOwedDays>;
}

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
