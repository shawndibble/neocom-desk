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

export function useTaxCorpBooks(
  data: TaxSnapshot | null,
  characters: readonly TrackedCharacter[],
  activeCharacterId: number | null,
  onOwnershipStored?: () => void
) {
  const { madePayments, paymentSources } = useMadePayments(
    characters.map((c) => c.characterId).join(',')
  );

  const payees = useMemo(
    () => [...(data?.payeesByCharacter.values() ?? [])].flat(),
    [data?.payeesByCharacter]
  );
  const linked = useMemo(() => heldPaymentKeys(data?.paymentLinks ?? []), [data?.paymentLinks]);
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
    recorded: data?.paymentLinks,
    payees,
    reloadKey: data?.fetchedAt?.getTime(),
    hiddenCorps: leftAck.hidden,
  });
  const overlay = corpView?.overlay;
  const billed = useMemo(
    () => (overlay ? billedElsewhereOf(overlay) : data?.billedElsewhere),
    [overlay, data?.billedElsewhere]
  );
  const bookOwners = useMemo(
    () => bookOwnersOf(payees, shownBooks, corpNameOf),
    [payees, shownBooks, corpNameOf]
  );
  const bookOwned = useMemo(() => new Set(bookOwners.keys()), [bookOwners]);
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
  const bookOwnerOf = useCallback(
    (payeeId: string): string | undefined => {
      if (!accounts.isBookOwned(payeeId)) return undefined;
      const primary = accounts.primaryIdOf(payeeId);
      return [...bookOwners].find(([own]) => accounts.primaryIdOf(own) === primary)?.[1];
    },
    [accounts, bookOwners]
  );
  const ledger = useMemo(
    (): TaxSnapshot | null =>
      data ? { ...data, entries: withPaidStatus(data.entries, accounts) } : null,
    [data, accounts]
  );
  const stored = useRef<ReadonlyMap<string, number> | undefined>(data?.billedElsewhere);
  useEffect(() => {
    if (!data || !overlay || !billed || billed === stored.current) return;
    stored.current = billed;
    void saveBilledElsewhere(billed).catch(() => undefined);
  }, [overlay, billed, data]);
  const hasDefaultSystems = useMemo(
    () =>
      [...(data?.payeesByCharacter.values() ?? [])].some((list) =>
        list.some((p) => (p.defaultSystems?.length ?? 0) > 0)
      ),
    [data]
  );
  const storedOwned = useRef<ReadonlySet<string> | undefined>(undefined);
  useEffect(() => {
    if (!data || !booksKnown || storedOwned.current === bookOwned) return;
    storedOwned.current = bookOwned;
    void saveBookOwned(bookOwned)
      .then((changed) => {
        if (changed && hasDefaultSystems) onOwnershipStored?.();
      })
      .catch(() => undefined);
  }, [data, booksKnown, bookOwned, hasDefaultSystems, onOwnershipStored]);
  const { failed: failedClaims } = useAutoClaimDonations(
    booksRead ? corpView : null,
    reloadCorpBooks
  );
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
