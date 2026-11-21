import { useEffect, useMemo, useRef, useState } from 'react';
import type { PayeeRecord } from '@/db';
import {
  paymentLinkKey,
  type PayeePaymentLink,
  heldPaymentKeys,
} from '@/engine/miningTax/payeeAccount';
import { linkPayment } from './ledgerActions';
import { useRetainedResult } from '@/lib/useRetainedResult';
import { loadMadePaymentsWithStatus, type MadePaymentsResult } from './madePayments';
import type { PayeeAccounts } from './payeeAccounts';
import {
  autoMatchRecorded,
  linkFor,
  suggestLinks,
  type LinkContext,
  type MadePayment,
} from './paymentLinks';

interface UseLinkSuggestionsInput {
  madePayments: readonly MadePayment[];
  /** Every stored link: a payment one holds is never offered again. */
  links: readonly PayeePaymentLink[];
  /** Every stored Payee record. */
  payees: readonly PayeeRecord[];
  accounts: PayeeAccounts;
  /** The corporations of the member's Corp Tax Books: a donation to one is the book's. */
  bookCorporations: ReadonlySet<number>;
}

const NO_PAYMENTS: MadePaymentsResult['payments'] = [];
const NO_SOURCES: MadePaymentsResult['sources'] = [];

/**
 * Payments already made (issue #540), loaded *after* the ledger rather than
 * as part of its snapshot. Two paginated ESI reads per tracked character —
 * the wallet journal and contracts — must not sit in front of the table
 * rendering: `SettleUpDialog` deferred the very same journal fetch out of
 * its own open path for exactly this reason ("most settle-ups never get
 * here"), and blocking here would invert that. The card appears when this
 * resolves.
 *
 * @param trackedCharacterIds Comma-joined character ids — a string so the
 *   effect keys on the roster, never on `data` (see below).
 */
export function useMadePayments(trackedCharacterIds: string) {
  // Tagged with the roster it was read for: a roster change must not keep showing the old one's.
  const [loaded, setLoaded] = useState<{ roster: string; result: MadePaymentsResult } | null>(null);
  const fresh = loaded?.roster === trackedCharacterIds ? loaded.result : null;
  // The last good read, so the first frame (and an offline one) has the payments the ledger's
  // coverage depends on instead of an empty list the late read then corrects.
  const { read, startLoad } = useRetainedResult<MadePaymentsResult>(
    'moonMiningTaxMadePayments',
    trackedCharacterIds
  );
  const retained = read();
  const madePayments = fresh?.payments ?? retained?.payments ?? NO_PAYMENTS;
  const paymentSources = fresh?.sources ?? retained?.sources ?? NO_SOURCES;
  /**
   * Keyed on the character roster, never on `data`. `useRouteSnapshot`
   * re-runs its loader on `onCacheRevalidated`, which is a *global* signal —
   * an unrelated Jita price row lapsing anywhere in the app hands this route a
   * brand-new `data` object. Keying the effect on that would refetch the
   * journal and contracts for every character each time, to learn nothing.
   *
   * Nothing is lost by not refetching after a link is confirmed either: the
   * just-linked payment disappears because a link now holds it, not because
   * the payment list was reloaded.
   */
  useEffect(() => {
    if (trackedCharacterIds === '') return;
    let cancelled = false;
    const save = startLoad();
    void loadMadePaymentsWithStatus(trackedCharacterIds.split(',').map(Number)).then((result) => {
      if (cancelled) return;
      // A read that threw for a character left its payments out, and one that found nothing at
      // all where the last read found some is offline with the cache row gone: neither is the
      // truth, so keep the last complete read (the wallet archive means real payments do not vanish).
      const prior = read();
      const incomplete =
        result.sources.some((s) => s.journal === 'failed' || s.contracts === 'failed') ||
        (result.payments.length === 0 && (prior?.payments?.length ?? 0) > 0);
      if (incomplete && prior?.payments && prior.sources) {
        setLoaded({
          roster: trackedCharacterIds,
          result: { payments: prior.payments, sources: result.sources },
        });
        return;
      }
      setLoaded({ roster: trackedCharacterIds, result });
      if (!incomplete) save(result);
    });
    return () => {
      cancelled = true;
    };
  }, [trackedCharacterIds, read, startLoad]);

  return { madePayments, paymentSources };
}

/**
 * Silently links a recorded Settle-up payment to its transaction once it shows up (one to one,
 * to its recipient, or nothing: `autoMatchRecorded`), and suggests a Payee for every other
 * payment it can name the recipient of. Separate from `useMadePayments` because the payments feed
 * the Corp Tax Book view, which the ledger rows (and so the accounts this reads) are built from.
 */
export function useLinkSuggestions({
  madePayments,
  links,
  payees,
  accounts,
  bookCorporations,
}: UseLinkSuggestionsInput) {
  const ctx = useMemo(
    (): LinkContext => ({
      payees: accounts.linkable(payees),
      linked: heldPaymentKeys(links),
      bookCorporations,
    }),
    [accounts, payees, links, bookCorporations]
  );
  const recordedMatches = useMemo(
    () => autoMatchRecorded(madePayments, links, ctx),
    [madePayments, links, ctx]
  );

  // Attempted once per recorded payment, not on every render: the write lands in Dexie, and the
  // next reload reads the link like any other.
  const attemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = recordedMatches.filter(
      ({ link }) => !attemptedRef.current.has(paymentLinkKey(link))
    );
    if (fresh.length === 0) return;
    for (const { link } of fresh) attemptedRef.current.add(paymentLinkKey(link));
    void Promise.all(
      fresh.map(({ link, payment }) =>
        linkPayment(
          linkFor(payment, link.payeeId, 'auto'),
          payment.characterId,
          paymentLinkKey(link)
        )
      )
    );
  }, [recordedMatches]);

  // Payments nothing accounts for, each with the Payee it most likely paid; what the matcher just
  // claimed is left out.
  return useMemo(() => {
    const claimed = new Set(recordedMatches.map((m) => m.payment.key));
    return suggestLinks(
      madePayments.filter((p) => !claimed.has(p.key)),
      ctx
    );
  }, [madePayments, recordedMatches, ctx]);
}
