import { useEffect, useRef, useState } from 'react';
import type { CorpBookView } from './corpBookView';
import { claimCorpTaxBookPayment } from './corpBookStore';

export function claimKeyOf(corporationId: number, paymentId: string): string {
  return `${corporationId}:${paymentId}`;
}

export function useAutoClaimDonations(
  view: CorpBookView | null,
  reload: () => void
): { failed: ReadonlySet<string> } {
  const tried = useRef(new Set<string>());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const fresh = (view?.claims ?? []).filter(
      (c) => !tried.current.has(claimKeyOf(c.corporationId, c.payment.id))
    );
    if (fresh.length === 0) return;
    for (const c of fresh) tried.current.add(claimKeyOf(c.corporationId, c.payment.id));
    void Promise.all(
      fresh.map((c) =>
        claimCorpTaxBookPayment(c.payment.characterId, c.corporationId, c.payment.id).then(
          () => null,
          () => claimKeyOf(c.corporationId, c.payment.id)
        )
      )
    ).then((results) => {
      const bad = results.filter((k): k is string => k !== null);
      if (bad.length > 0) setFailed((prev) => new Set([...prev, ...bad]));
      reload();
    });
  }, [view, reload]);

  return { failed };
}
