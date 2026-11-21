import { useEffect, useMemo, useState } from 'react';
import { NO_NAMES } from '@/lib/emptyCollections';
import { useMadePayments } from '@/features/miningTax/useMadePayments';
import { useAutoClaimDonations } from '@/features/miningTax/corpBook/useAutoClaimDonations';
import { useBookSystems } from '@/features/miningTax/corpBook/useBookSystems';
import { useHiddenLeftCorps } from '@/features/miningTax/corpBook/leftCorpAck';
import { useCorpBookView } from '@/features/miningTax/corpBook/useCorpBookView';
import { heldPaymentKeys } from '@/engine/miningTax/payeeAccount';
import { PayeeAccounts, withPaidStatus } from './payeeAccounts';
import { saveBilledElsewhere } from './paymentLinkStore';
import { billedElsewhereOf } from './owedNow';
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
  // A payment a link holds pays its personal Payee, never a book as a donation in flight too.
  const linked = useMemo(() => heldPaymentKeys(data?.paymentLinks ?? []), [data?.paymentLinks]);
  // What the books bill too, as last seen; replaced (and stored) when the overlay below reads
  // something else, so every account build bills the same.
  const [billedElsewhere, setBilledElsewhere] = useState<ReadonlyMap<string, number> | null>(null);
  const billed = billedElsewhere ?? data?.billedElsewhere;
  // The one accounts build (`PayeeAccounts.build`): row statuses, owed figures and Settle up.
  const accounts = useMemo(
    () =>
      PayeeAccounts.build({
        assignments: data?.entries.flatMap((row) => row.assignments) ?? [],
        payees,
        links: data?.paymentLinks ?? [],
        ...(data ? { checkpoints: new Map(data.payeeCheckpoints) } : {}),
        ...(billed ? { billedElsewhere: billed } : {}),
      }),
    [data, payees, billed]
  );
  // The ledger as the tab reads it: an Assignment is Paid while its Payee's account has paid its
  // day, oldest first (decision 20261120-235011), whatever mark it stores.
  const ledger = useMemo(
    (): TaxSnapshot | null =>
      data ? { ...data, entries: withPaidStatus(data.entries, accounts) } : null,
    [data, accounts]
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
    linked,
    payees,
    reloadKey: data?.fetchedAt?.getTime(),
    hiddenCorps: leftAck.hidden,
  });
  // The overlay's shares, once they differ from what the accounts were built with: stored, and
  // the accounts rebuilt with them (the next overlay reads the same, so this settles).
  const alsoBilled = corpView?.overlay.alsoBilled;
  useEffect(() => {
    if (!data || !alsoBilled) return;
    const next = billedElsewhereOf(alsoBilled);
    const held = billed ?? new Map<string, number>();
    const same =
      next.size === held.size &&
      [...next].every(([id, v]) => Math.abs((held.get(id) ?? 0) - v) < 1e-9);
    if (same) return;
    const dates = new Map(data.entries.flatMap((r) => r.assignments.map((a) => [a.id, a.date])));
    // Rebuilt once stored (or once storing failed: this page still bills what the books do).
    void saveBilledElsewhere(next, (id) => dates.get(id))
      .catch(() => undefined)
      .finally(() => setBilledElsewhere(next));
  }, [alsoBilled, billed, data]);
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
    accounts,
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
