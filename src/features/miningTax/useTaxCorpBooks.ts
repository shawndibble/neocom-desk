import { useMemo } from 'react';
import { NO_NAMES } from '@/lib/emptyCollections';
import { useMadePayments } from '@/features/miningTax/useMadePayments';
import { useAutoClaimDonations } from '@/features/miningTax/corpBook/useAutoClaimDonations';
import { useBookSystems } from '@/features/miningTax/corpBook/useBookSystems';
import { useHiddenLeftCorps } from '@/features/miningTax/corpBook/leftCorpAck';
import { useCorpBookView } from '@/features/miningTax/corpBook/useCorpBookView';
import { owedWhereUncovered, paymentCoverage } from './paymentLinks';
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

  // Every Assignment the ledger stores, the ones a book row stands in for included: whether a
  // transaction is already linked is decided over all of them, or a donation two book days used
  // up is offered again to link to a third.
  const storedAssignments = useMemo(
    () => (data?.entries ?? []).flatMap((row) => row.assignments),
    [data?.entries]
  );
  // A paid day the ISK linked to it does not reach is still owed (`paymentCoverage`).
  const ledger = useMemo((): TaxSnapshot | null => {
    if (!data) return null;
    const amounts = new Map(madePayments.map((m) => [m.key, m.amount]));
    const { uncovered } = paymentCoverage(storedAssignments, (key) => amounts.get(key));
    const entries = owedWhereUncovered(data.entries, uncovered);
    return entries === data.entries ? data : { ...data, entries };
  }, [data, madePayments, storedAssignments]);

  const payees = useMemo(
    () => [...(data?.payeesByCharacter.values() ?? [])].flat(),
    [data?.payeesByCharacter]
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
    storedAssignments,
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
