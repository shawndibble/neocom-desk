import { useCallback, useEffect, useMemo, useRef } from 'react';
import { NO_NAMES } from '@/lib/emptyCollections';
import { useMadePayments } from '@/features/miningTax/useMadePayments';
import { useAutoClaimDonations } from '@/features/miningTax/corpBook/useAutoClaimDonations';
import { useBookSystems } from '@/features/miningTax/corpBook/useBookSystems';
import { useHiddenLeftCorps } from '@/features/miningTax/corpBook/leftCorpAck';
import { useCorpBookView } from '@/features/miningTax/corpBook/useCorpBookView';
import { heldPaymentKeys } from '@/engine/miningTax/payeeRunningAccount';
import { PayeeRunningAccounts, withPaidStatus } from './payeeRunningAccounts';
import { saveBilledElsewhere, saveBookOwned } from './paymentLinkStore';
import { billedElsewhereOf, bookOwnersOf } from './owedNow';
import type { TaxSnapshot } from './taxSnapshot';
import type { TrackedCharacter } from './snapshot';

const NO_SECURITY: ReadonlyMap<number, number> = new Map();

/** What the Tax tab reads beside the personal ledger: the wallet's payments made, and the member's Corp Tax Books. */
export function useTaxCorpBooks(
  data: TaxSnapshot | null,
  characters: readonly TrackedCharacter[],
  activeCharacterId: number | null,
  /**
   * Called when the stored book ownership changed (its first store included): the snapshot's load
   * path holds Default Systems back until ownership is known, so it reads the snapshot again.
   */
  onOwnershipStored?: () => void
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
  // What the books read of the ledger is each Assignment as its Payee's account stands before any
  // book takes ore off it (no `billedElsewhere`): a Default System's day is the book's to take only
  // while unpaid, and reading it after the take (a trimmed day paid by exactly what is left) would
  // flip it back and forth between taken and not.
  const bookInput = useMemo(
    (): TaxSnapshot | null =>
      data
        ? {
            ...data,
            entries: withPaidStatus(
              data.entries,
              PayeeRunningAccounts.build({
                assignments: data.entries.flatMap((row) => row.assignments),
                payees,
                links: data.paymentLinks ?? [],
              })
            ),
          }
        : null,
    [data, payees]
  );

  // The member's Corp Tax Books (D24: only when their corp has an active one; otherwise null and
  // the tab is exactly what it was).
  const leftAck = useHiddenLeftCorps();
  const {
    view: corpView,
    booksRead,
    booksKnown,
    reload: reloadCorpBooks,
    shownBooks,
    corpNameOf,
    hiddenLeft,
  } = useCorpBookView({
    rows: bookInput?.entries,
    characters,
    activeCharacterId,
    madePayments,
    linked,
    payees,
    reloadKey: data?.fetchedAt?.getTime(),
    hiddenCorps: leftAck.hidden,
  });
  // What the books bill too: derived from the overlay in this very render, so the accounts, the
  // owed cards and the Payee cards never count a book's days twice while a stored copy catches up.
  // Until a book is read, the copy the device last stored stands.
  const overlay = corpView?.overlay;
  const billed = useMemo(
    () => (overlay ? billedElsewhereOf(overlay) : data?.billedElsewhere),
    [overlay, data?.billedElsewhere]
  );
  // A Payee that is a book's corporation is the book's to answer for: its account counts nowhere.
  // The one reading of it (with the corporation's name): the accounts and Manage Payees share it.
  const bookOwners = useMemo(
    () => bookOwnersOf(payees, shownBooks, corpNameOf),
    [payees, shownBooks, corpNameOf]
  );
  const bookOwned = useMemo(() => new Set(bookOwners.keys()), [bookOwners]);
  // The one accounts build (`PayeeRunningAccounts.build`): row statuses, owed figures and Settle up.
  const accounts = useMemo(
    () =>
      PayeeRunningAccounts.build({
        assignments: data?.entries.flatMap((row) => row.assignments) ?? [],
        payees,
        links: data?.paymentLinks ?? [],
        ...(billed ? { billedElsewhere: billed } : {}),
        bookOwned,
      }),
    [data, payees, billed, bookOwned]
  );
  // The corporation's name a Payee is the book of, by any id of the merged Payee.
  const bookOwnerOf = useCallback(
    (payeeId: string): string | undefined => {
      if (!accounts.isBookOwned(payeeId)) return undefined;
      const primary = accounts.primaryIdOf(payeeId);
      return [...bookOwners].find(([own]) => accounts.primaryIdOf(own) === primary)?.[1];
    },
    [accounts, bookOwners]
  );
  // The ledger as the tab reads it: an Assignment is Paid while its Payee's account has paid its
  // day, oldest first (decision 20261120-235011), whatever mark it stores.
  const ledger = useMemo(
    (): TaxSnapshot | null =>
      data ? { ...data, entries: withPaidStatus(data.entries, accounts) } : null,
    [data, accounts]
  );
  // Stored for the builds outside this page (the Overview's, the journal's), which read it back.
  const stored = useRef<ReadonlyMap<string, number> | undefined>(data?.billedElsewhere);
  useEffect(() => {
    if (!data || !overlay || !billed || billed === stored.current) return;
    stored.current = billed;
    void saveBilledElsewhere(billed).catch(() => undefined);
  }, [overlay, billed, data]);
  // Likewise which Payees a book owns, once the books are known (never from a guess made before):
  // the load path's safeguards and the wallet journal read the accounts with the same rule.
  const storedOwned = useRef<ReadonlySet<string> | undefined>(undefined);
  useEffect(() => {
    if (!data || !booksKnown || storedOwned.current === bookOwned) return;
    storedOwned.current = bookOwned;
    void saveBookOwned(bookOwned)
      .then((changed) => {
        if (changed) onOwnershipStored?.();
      })
      .catch(() => undefined);
  }, [data, booksKnown, bookOwned, onOwnershipStored]);
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
    booksKnown,
    bookOwnerOf,
    reloadCorpBooks,
    leftCorp: { shownBooks, corpNameOf, hiddenLeft, hide: leftAck.hide, show: leftAck.show },
    failedClaims,
    systemNames: bookSystems.names,
    systemSecurity: bookSystems.security,
  };
}
