import { useEffect, useMemo, useRef, useState } from 'react';
import type { PayeeRecord } from '@/db';
import {
  paymentLinkKey,
  type PayeePaymentLink,
  heldPaymentKeys,
} from '@/engine/miningTax/payeeRunningAccount';
import { linkPayment } from './ledgerActions';
import { useRetainedResult } from '@/lib/useRetainedResult';
import { loadMadePaymentsWithStatus, type MadePaymentsResult } from './madePayments';
import type { PayeeRunningAccounts } from './payeeRunningAccounts';
import {
  autoMatchRecorded,
  linkFor,
  suggestLinks,
  type LinkContext,
  type MadePayment,
} from './paymentLinks';

interface UseLinkSuggestionsInput {
  madePayments: readonly MadePayment[];
  links: readonly PayeePaymentLink[];
  payees: readonly PayeeRecord[];
  accounts: PayeeRunningAccounts;
  bookCorporations: ReadonlySet<number>;
}

const NO_PAYMENTS: MadePaymentsResult['payments'] = [];
const NO_SOURCES: MadePaymentsResult['sources'] = [];

export function useMadePayments(trackedCharacterIds: string) {
  const [loaded, setLoaded] = useState<{ roster: string; result: MadePaymentsResult } | null>(null);
  const fresh = loaded?.roster === trackedCharacterIds ? loaded.result : null;
  const { read, startLoad } = useRetainedResult<MadePaymentsResult>(
    'moonMiningTaxMadePayments',
    trackedCharacterIds
  );
  const retained = read();
  const madePayments = fresh?.payments ?? retained?.payments ?? NO_PAYMENTS;
  const paymentSources = fresh?.sources ?? retained?.sources ?? NO_SOURCES;
  useEffect(() => {
    if (trackedCharacterIds === '') return;
    let cancelled = false;
    const save = startLoad();
    void loadMadePaymentsWithStatus(trackedCharacterIds.split(',').map(Number)).then((result) => {
      if (cancelled) return;
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

  return useMemo(() => {
    const claimed = new Set(recordedMatches.map((m) => m.payment.key));
    return suggestLinks(
      madePayments.filter((p) => !claimed.has(p.key)),
      ctx
    );
  }, [madePayments, recordedMatches, ctx]);
}
