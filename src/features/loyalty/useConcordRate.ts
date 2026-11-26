import { useEffect, useState } from 'react';
import { concordRate, type ConcordRate } from '@/engine/loyalty/concordExchange';
import { loadLpCorporations } from '@/sde/loadMarketSde';

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
