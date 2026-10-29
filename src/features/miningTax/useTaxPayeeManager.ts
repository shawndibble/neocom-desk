import { useMemo, useState } from 'react';
import type { PayeeRecord } from '@/db';
import type { CorpBookView } from '@/features/miningTax/corpBook/corpBookView';
import type { TrackedCharacter } from '@/features/miningTax/snapshot';
import { useIsNarrow } from '@/lib/useIsNarrow';

/** Whether and where the Payee manager opens: its target Character, the first-run call to action, and where the header shows its button. */
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

  // A corp's book is something to owe on its own: a member with no Payee of their own yet still
  // sees what the book billed.
  const needsFirstPayee =
    hasData &&
    allPayees.length === 0 &&
    !(corpView && corpView.overlay.rows.length > 0) &&
    defaultCharacterId !== null;

  const onAddPayee = useMemo(
    () =>
      defaultCharacterId !== null
        ? () => setPayeeManagerCharacterId(defaultCharacterId)
        : undefined,
    [defaultCharacterId]
  );

  // The header row never wraps (it has a picker): below `md` Payees moves
  // into the ⋮, except as the accent first-run call to action, which is the
  // one control an empty tab is waiting on and so stays in sight.
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
