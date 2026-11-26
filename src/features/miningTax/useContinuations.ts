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
  hasData: boolean;
  rows: readonly DisplayRow[];
  allDisplayRows: readonly DisplayRow[];
  payeeById: ReadonlyMap<string, PayeeRecord>;
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  refresh: () => void;
  setToast: (toast: TaxToast) => void;
}

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

  const [autoSkip, setAutoSkip] = useState<ReadonlySet<string>>(new Set());
  const [continuing, setContinuing] = useState(false);

  const continuations = useMemo(
    () =>
      findSessionContinuations(rows).filter((c) => !dismissedContinuations.includes(c.next.key)),
    [rows, dismissedContinuations]
  );

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
        if (!continued) setAutoSkip((previous) => new Set(previous).add(c.next.key));
      }
    })();
  }, [autoContinue, autoSkip, continuations, hasData]);

  function setAutoContinueFromCard(next: boolean) {
    if (next) setAutoSkip(new Set(continuations.map((c) => c.next.key)));
    void setAutoContinue(next);
  }

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
