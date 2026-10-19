import { useEffect, useMemo, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import type { PayeeRecord } from '@/db';
import { useAutoContinueSessions, useDismissedContinuations } from './continueSessionPref';
import type { DisplayRow } from './groupRows';
import { continueSession as continueSessionAction, undoContinue } from './ledgerActions';
import { findSessionContinuations, type SessionContinuation } from './sessionContinuation';

export type TaxToast = { message: string; onUndo?: () => void } | null;

interface UseContinuationsInput {
  /** Whether the snapshot has loaded — automatic mode waits for it. */
  hasData: boolean;
  /** The ledger rows the Character filter lets through. */
  rows: readonly DisplayRow[];
  allDisplayRows: readonly DisplayRow[];
  payeeById: ReadonlyMap<string, PayeeRecord>;
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  refresh: () => void;
  setToast: (toast: TaxToast) => void;
}

/**
 * "Continue yesterday's session" offers (issue #523 follow-up): finding them,
 * continuing one (with Undo), keeping one separate, and the automatic mode
 * that continues each new offer without asking.
 */
export function useContinuations({
  hasData,
  rows,
  allDisplayRows,
  payeeById,
  pricesFor,
  refresh,
  setToast,
}: UseContinuationsInput) {
  const { t } = useTranslation();
  const autoContinue = useAutoContinueSessions((state) => state.value);
  const setAutoContinue = useAutoContinueSessions((state) => state.setValue);
  const dismissedContinuations = useDismissedContinuations((state) => state.value);
  const setDismissedContinuations = useDismissedContinuations((state) => state.setValue);
  useHydratedStore(useAutoContinueSessions, useDismissedContinuations);

  // Offers on screen when automatic mode was switched on — "next time" means
  // they stay offers rather than being continued the moment the box is ticked.
  const [autoSkip, setAutoSkip] = useState<ReadonlySet<string>>(new Set());
  const [continuing, setContinuing] = useState(false);

  const continuations = useMemo(
    () =>
      findSessionContinuations(rows).filter((c) => !dismissedContinuations.includes(c.next.key)),
    [rows, dismissedContinuations]
  );

  /**
   * Continues one session, offering Undo in a toast. `false` when nothing was
   * written: its Payee is gone, the day was claimed meanwhile (the refresh
   * shows what exists), or the write failed (the toast says so).
   */
  async function continueSession(continuation: SessionContinuation): Promise<boolean> {
    const payee = payeeById.get(continuation.payeeId);
    if (!payee) return false;
    const result = await continueSessionAction(continuation, (date) =>
      pricesFor(payee.hubId, date)
    );
    refresh();
    if (!result.ok) {
      if (result.reason === 'save-failed') setToast({ message: t('miningTax.saveFailed') });
      return false;
    }
    setToast({
      message: t('miningTax.continue.done', {
        date: continuation.next.row.entry.date,
        payee: payee.name,
      }),
      onUndo: () => {
        setToast(null);
        void undoContinue(result.value).then((undone) => {
          if (!undone.ok) setToast({ message: t('miningTax.saveFailed') });
          refresh();
        });
      },
    });
    return true;
  }

  // The automatic-mode effect must not re-run when `continueSession`'s closure
  // changes (it reads `payeeById`/`pricesFor`/`t`/`refresh`) — only when the
  // offers do. Reading it through a ref keeps it current without that.
  const continueSessionRef = useRef(continueSession);
  useEffect(() => {
    continueSessionRef.current = continueSession;
  });

  async function handleContinue(continuation: SessionContinuation) {
    setContinuing(true);
    try {
      await continueSession(continuation);
    } finally {
      setContinuing(false);
    }
  }

  // Automatic mode: continue each new offer once, without asking. The ref
  // keeps a rerender from re-firing a continuation before the refresh lands.
  const autoContinuedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!autoContinue || !hasData) return;
    const fresh = continuations.filter(
      (c) => !autoContinuedRef.current.has(c.next.key) && !autoSkip.has(c.next.key)
    );
    if (fresh.length === 0) return;
    for (const c of fresh) autoContinuedRef.current.add(c.next.key);
    void (async () => {
      for (const c of fresh) {
        const continued = await continueSessionRef.current(c);
        // Not continued: bring the offer back as a card so the pilot can retry
        // or choose, rather than it vanishing until the next page load.
        if (!continued) setAutoSkip((previous) => new Set(previous).add(c.next.key));
      }
    })();
  }, [autoContinue, autoSkip, continuations, hasData]);

  function setAutoContinueFromCard(next: boolean) {
    if (next) setAutoSkip(new Set(continuations.map((c) => c.next.key)));
    void setAutoContinue(next);
  }

  /** "Keep separate", remembered — pruned to entries still in the ledger so the list can't grow forever. */
  function keepSeparate(continuation: SessionContinuation) {
    const present = new Set(allDisplayRows.map((dr) => dr.key));
    void setDismissedContinuations([
      ...dismissedContinuations.filter((key) => present.has(key)),
      continuation.next.key,
    ]);
  }

  return {
    continuations,
    continuing,
    autoContinue,
    autoSkip,
    handleContinue,
    keepSeparate,
    setAutoContinueFromCard,
  };
}
