import { useEffect, useState } from 'react';
import type { RequestPledge } from '@/engine/communities/requests';
import { syncRequestDeliveries, type DeliverySyncResult } from './requestDelivery';

export function useDeliverySync({
  characterId,
  communityId,
  requestId,
  enabled,
  tick,
  refreshPledges,
}: {
  characterId: number;
  communityId: string;
  requestId: string;
  enabled: boolean;
  tick: number;
  refreshPledges: (requestId: string) => Promise<RequestPledge[]>;
}): DeliverySyncResult | null {
  const [result, setResult] = useState<DeliverySyncResult | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void syncRequestDeliveries(characterId, communityId).then(async (found) => {
      if (cancelled) return;
      setResult(found);
      if (found.updated > 0)
        await refreshPledges(requestId).catch((err) =>
          console.warn('Request delivery: could not re-read the Pledges', err)
        );
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, requestId, enabled, tick, refreshPledges]);
  return enabled ? result : null;
}
