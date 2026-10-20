import { useEffect, useState } from 'react';
import { concordRate, type ConcordRate } from '@/engine/loyalty/concordExchange';
import { loadLpCorporations } from '@/sde/loadMarketSde';

/**
 * The corporation's CONCORD LP exchange rate. It is a faction rule keyed off the
 * corporation's faction, which the offers feed does not carry: it comes from the
 * bundled LP corporation list. `pending` until the list loads (or when it fails), so
 * a corporation that does have an exchange never reads "no exchange" in the meantime.
 */
export function useConcordRate(corporationId: number): {
  concord: ConcordRate | null;
  concordPending: boolean;
} {
  const [state, setState] = useState<ConcordRate | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadLpCorporations()
      .then((corps) => {
        const corp = corps.find((c) => c.id === corporationId);
        if (live) setState(corp ? concordRate(corp) : null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [corporationId]);
  return { concord: state ?? null, concordPending: state === undefined };
}
