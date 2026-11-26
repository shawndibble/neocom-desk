import { useMemo } from 'react';
import type { PayeeRecord } from '@/db';
import type { TaxSnapshot } from './taxSnapshot';
import type { CorpBookView } from './corpBook/corpBookView';
import { corpPayeeAliases } from './corpBook/corpRows';
import { groupPayees, payeeDuplicateAliases } from './payeeGroups';

export function useTaxPayees(data: TaxSnapshot | null, corpView: CorpBookView | null) {
  const allPayees = useMemo(() => {
    const seen = new Map<string, PayeeRecord>();
    for (const payees of data?.payeesByCharacter.values() ?? []) {
      for (const payee of payees) seen.set(payee.id, payee);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
  const payeeById = useMemo(() => new Map(allPayees.map((p) => [p.id, p])), [allPayees]);
  const payeeGroups = useMemo(() => groupPayees(allPayees), [allPayees]);
  const duplicateAliases = useMemo(() => payeeDuplicateAliases(payeeGroups), [payeeGroups]);
  const groupedPayees = useMemo(() => payeeGroups.map((g) => g.primary), [payeeGroups]);

  const ledgerPayees = useMemo(
    () => [...groupedPayees, ...(corpView?.payees ?? [])],
    [groupedPayees, corpView]
  );
  const payeeAliases = useMemo(() => {
    const aliases = corpPayeeAliases(groupedPayees, corpView?.payees ?? []);
    for (const [duplicate, primary] of duplicateAliases) aliases.set(duplicate, primary);
    return aliases;
  }, [groupedPayees, duplicateAliases, corpView]);
  const filterPayees = useMemo(
    () => ledgerPayees.filter((p) => !payeeAliases.has(p.id)),
    [ledgerPayees, payeeAliases]
  );
  return {
    allPayees,
    payeeById,
    duplicateAliases,
    ledgerPayees,
    filterPayees,
    payeeAliases,
  };
}
