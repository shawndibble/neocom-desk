import { useEffect, useState } from 'react';
import type { RequestPledge } from '@/engine/communities/requests';
import { syncRequestDeliveries, type DeliverySyncResult } from './requestDelivery';

/**
 * Runs delivery marking (issue #3809) when a Request's panel opens for a
 * Member who has a Pledge on it, so a contract finished since the last
 * background sweep shows without a click, and returns what it found: the
 * status for the panel's quiet notes and the BPC flags. A marked delivery
 * re-reads the Request's Pledges into the board.
 */
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
  /** The viewer has a Pledge on an open Request of someone else. */
  enabled: boolean;
  /** Changes to run the sync again, e.g. after a typed amount is saved or cleared. */
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
