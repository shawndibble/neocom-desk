import { useEffect, useMemo, useRef, useState } from 'react';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { PayeeBalance } from './balances';
import { linkRecordedPayment } from './ledgerActions';
import { loadMadePaymentsWithStatus, type MadePaymentSources } from './madePayments';
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
  balances: readonly PayeeBalance[];
}

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
  const [madePayments, setMadePayments] = useState<MadePayment[]>([]);
  const [paymentSources, setPaymentSources] = useState<MadePaymentSources[]>([]);
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
    void loadMadePaymentsWithStatus(trackedCharacterIds.split(',').map(Number)).then((result) => {
      if (cancelled) return;
      setMadePayments(result.payments);
      setPaymentSources(result.sources);
    });
    return () => {
      cancelled = true;
    };
  }, [trackedCharacterIds]);

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
    const candidates = unlinkedPayments(madePayments, everyAssignment);
    return autoMatchRecordedPayments(candidates, unlinkedRecordedPayments(everyAssignment));
  }, [everyAssignment, madePayments]);

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
    const candidates = unlinkedPayments(madePayments, everyAssignment);
    const autoLinked = new Set(recordedMatches.map((m) => m.payment.key));
    return suggestLinks(
      candidates.filter((p) => !autoLinked.has(p.key)),
      balances
    );
  }, [everyAssignment, madePayments, balances, recordedMatches]);

  return linkSuggestions;
}
