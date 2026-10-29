import { NO_NAMES } from '@/lib/emptyCollections';
import { useMadePayments } from '@/features/miningTax/useMadePayments';
import { useAutoClaimDonations } from '@/features/miningTax/corpBook/useAutoClaimDonations';
import { useBookSystems } from '@/features/miningTax/corpBook/useBookSystems';
import { useCorpBookView } from '@/features/miningTax/corpBook/useCorpBookView';
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

  // The member's Corp Tax Books (D24: only when their corp has an active one; otherwise null and
  // the tab is exactly what it was).
  const { view: corpView, reload: reloadCorpBooks } = useCorpBookView({
    rows: data?.entries,
    characters,
    activeCharacterId,
    madePayments,
    reloadKey: data?.fetchedAt?.getTime(),
  });
  // The player's own Unmatched donations are claimed for them; only a failed claim is left to retry.
  const { failed: failedClaims } = useAutoClaimDonations(corpView, reloadCorpBooks);
  // Book rows carry a raw solar system id; resolve it like a personal row's.
  const bookSystems = useBookSystems(corpView, {
    names: data?.systemNames ?? NO_NAMES,
    security: data?.systemSecurity ?? NO_SECURITY,
  });
  return {
    madePayments,
    paymentSources,
    corpView,
    reloadCorpBooks,
    failedClaims,
    systemNames: bookSystems.names,
    systemSecurity: bookSystems.security,
  };
}
