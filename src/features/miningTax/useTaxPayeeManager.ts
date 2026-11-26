import { useMemo, useState } from 'react';
import type { PayeeRecord } from '@/db';
import type { CorpBookView } from '@/features/miningTax/corpBook/corpBookView';
import type { TrackedCharacter } from '@/features/miningTax/snapshot';
import { useIsNarrow } from '@/lib/useIsNarrow';

export function useTaxPayeeManager(
  hasData: boolean,
  characters: readonly TrackedCharacter[],
  activeCharacterId: number | null,
  allPayees: readonly PayeeRecord[],
  corpView: CorpBookView | null
) {
  const payeesFit = !useIsNarrow();
  const [payeeManagerCharacterId, setPayeeManagerCharacterId] = useState<number | null>(null);

  const defaultCharacterId =
    characters.find((c) => c.characterId === activeCharacterId)?.characterId ??
    characters[0]?.characterId ??
    null;

  const bookHasTheirs =
    corpView !== null &&
    (corpView.overlay.rows.length > 0 || corpView.books.some((b) => b.pendingFrom !== undefined));
  const needsFirstPayee =
    hasData && allPayees.length === 0 && !bookHasTheirs && defaultCharacterId !== null;

  const onAddPayee = useMemo(
    () =>
      defaultCharacterId !== null
        ? () => setPayeeManagerCharacterId(defaultCharacterId)
        : undefined,
    [defaultCharacterId]
  );

  const canManagePayees = defaultCharacterId !== null;
  const payeesInline = canManagePayees && (payeesFit || needsFirstPayee);

  return {
    payeeManagerCharacterId,
    openPayeeManager: () => setPayeeManagerCharacterId(defaultCharacterId),
    closePayeeManager: () => setPayeeManagerCharacterId(null),
    needsFirstPayee,
    onAddPayee,
    canManagePayees,
    payeesInline,
  };
}
