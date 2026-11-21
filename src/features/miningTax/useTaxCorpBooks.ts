import { useMemo } from 'react';
import { NO_NAMES } from '@/lib/emptyCollections';
import { useMadePayments } from '@/features/miningTax/useMadePayments';
import { useAutoClaimDonations } from '@/features/miningTax/corpBook/useAutoClaimDonations';
import { useBookSystems } from '@/features/miningTax/corpBook/useBookSystems';
import { useHiddenLeftCorps } from '@/features/miningTax/corpBook/leftCorpAck';
import { useCorpBookView } from '@/features/miningTax/corpBook/useCorpBookView';
import { withPaidStatus } from './payeeAccounts';
import type { TaxSnapshot } from './taxSnapshot';
import type { TrackedCharacter } from './snapshot';

const NO_SECURITY: ReadonlyMap<number, number> = new Map();

/** What the Tax tab reads beside the personal ledger: the wallet's payments made, and the member's Corp Tax Books. */
export function useTaxCorpBooks(
  data: TaxSnapshot | null,
  characters: readonly TrackedCharacter[],
  activeCharacterId: number | null
) {
  const { madePayments, paymentSources } = useMadePayments(
    characters.map((c) => c.characterId).join(',')
  );

  const payees = useMemo(
    () => [...(data?.payeesByCharacter.values() ?? [])].flat(),
    [data?.payeesByCharacter]
  );
  // The ledger as the tab reads it: an Assignment is Paid while its Payee's account has paid its
  // day, oldest first (decision 20261120-235011), whatever mark it stores.
  const ledger = useMemo(
    (): TaxSnapshot | null =>
      data ? { ...data, entries: withPaidStatus(data.entries, payees, data.paymentLinks) } : null,
    [data, payees]
  );

  // The member's Corp Tax Books (D24: only when their corp has an active one; otherwise null and
  // the tab is exactly what it was).
  const leftAck = useHiddenLeftCorps();
  const {
    view: corpView,
    booksRead,
    reload: reloadCorpBooks,
    shownBooks,
    corpNameOf,
    hiddenLeft,
  } = useCorpBookView({
    rows: ledger?.entries,
    characters,
    activeCharacterId,
    madePayments,
    payees,
    reloadKey: data?.fetchedAt?.getTime(),
    hiddenCorps: leftAck.hidden,
  });
  // The player's own Unmatched donations are claimed for them; only a failed claim is left to retry.
  // Only from a book read this visit: the last good copy can offer a donation already claimed since.
  const { failed: failedClaims } = useAutoClaimDonations(
    booksRead ? corpView : null,
    reloadCorpBooks
  );
  // Book rows carry a raw solar system id; resolve it like a personal row's.
  const bookSystems = useBookSystems(corpView, {
    names: data?.systemNames ?? NO_NAMES,
    security: data?.systemSecurity ?? NO_SECURITY,
  });
  return {
    ledger,
    madePayments,
    paymentSources,
    corpView,
    reloadCorpBooks,
    leftCorp: { shownBooks, corpNameOf, hiddenLeft, hide: leftAck.hide, show: leftAck.show },
    failedClaims,
    systemNames: bookSystems.names,
    systemSecurity: bookSystems.security,
  };
}
