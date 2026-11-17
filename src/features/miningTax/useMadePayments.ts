import { useEffect, useMemo, useRef, useState } from 'react';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { PayeeBalance } from './balances';
import { linkRecordedPayment } from './ledgerActions';
import { useRetainedResult } from '@/lib/useRetainedResult';
import { loadMadePaymentsWithStatus, type MadePaymentsResult } from './madePayments';
import {
  autoMatchRecordedPayments,
  suggestLinks,
  unlinkedPayments,
  unlinkedRecordedPayments,
  type MadePayment,
} from './paymentLinks';

interface UseLinkSuggestionsInput {
  madePayments: readonly MadePayment[];
  everyAssignment: readonly MiningTaxAssignmentRecord[];
  /**
   * Every stored Assignment, the ones a book row stands in for included: a transaction any of
   * them links is already used. Defaults to `everyAssignment`.
   */
  linkedAssignments?: readonly MiningTaxAssignmentRecord[];
  balances: readonly PayeeBalance[];
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
   * just-linked payment disappears because `unlinkedPayments` now sees the
   * Assignment referencing it, not because the payment list was reloaded.
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
 * Silently links recorded payments whose transaction has since shown up, and
 * suggests links for the rest. Separate from `useMadePayments` because the
 * payments feed the Corp Tax Book view, which the ledger rows (and so the
 * assignments and balances this reads) are built from.
 */
export function useLinkSuggestions({
  madePayments,
  everyAssignment,
  linkedAssignments = everyAssignment,
  balances,
}: UseLinkSuggestionsInput) {
  // Settle-up payments already recorded (paid-on/method/amount) but never
  // live-linked, because step 2 stopped trying to search the wallet journal
  // at pay time (it always missed — ESI hadn't posted the transaction yet).
  // An exact amount + recorded-date + paying-character match is unambiguous
  // enough to attach silently, once the real transaction actually shows up —
  // see `autoMatchRecordedPayments`'s own doc comment for why this skips the
  // confirmation dialog `suggestLink` uses.
  const recordedMatches = useMemo(() => {
    const candidates = unlinkedPayments(madePayments, linkedAssignments);
    return autoMatchRecordedPayments(candidates, unlinkedRecordedPayments(linkedAssignments));
  }, [linkedAssignments, madePayments]);

  // Attempted once per `paymentId`, not on every render this effect's deps
  // happen to recompute — the write lands in Dexie but nothing here forces a
  // `refresh()` (that always re-hits ESI); the exclusion below already keeps
  // the card in sync for this render, and the next real reload picks up the
  // persisted link like any other Assignment field.
  const attemptedLinksRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = recordedMatches.filter(
      ({ group }) => !attemptedLinksRef.current.has(group.paymentId)
    );
    if (fresh.length === 0) return;
    for (const { group } of fresh) attemptedLinksRef.current.add(group.paymentId);
    void Promise.all(
      fresh.map(({ group, payment }) =>
        linkRecordedPayment(
          group.assignments,
          payment.kind === 'journal'
            ? { journalRefId: payment.refId }
            : { contractId: payment.refId }
        )
      )
    );
  }, [recordedMatches]);

  // Payments nothing accounts for, each with the Payee and entries it most
  // likely settled. Only payments with a plausible target survive
  // `suggestLinks`, which is what lets the card stay a quiet offer rather than
  // a standing alert. Excludes whatever `recordedMatches` just claimed
  // automatically — those never need the confirmation dialog.
  const linkSuggestions = useMemo(() => {
    const candidates = unlinkedPayments(madePayments, linkedAssignments);
    const autoLinked = new Set(recordedMatches.map((m) => m.payment.key));
    return suggestLinks(
      candidates.filter((p) => !autoLinked.has(p.key)),
      balances
    );
  }, [linkedAssignments, madePayments, balances, recordedMatches]);

  return linkSuggestions;
}
