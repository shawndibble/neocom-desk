import { useEffect, useRef, useState } from 'react';
import type { CorpBookView } from './corpBookView';
import { claimCorpTaxBookPayment } from './corpBookStore';

export function claimKeyOf(corporationId: number, paymentId: string): string {
  return `${corporationId}:${paymentId}`;
}

/**
 * Claims the player's own Unmatched donations as soon as the books load. `view.claims` holds only
 * donations the signed-in player made (the server answers anyone else's like a missing one), so
 * there is nothing for them to confirm. Each is tried once; a failed claim is returned in `failed`
 * so the page can offer a manual retry rather than retrying in a loop.
 */
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
