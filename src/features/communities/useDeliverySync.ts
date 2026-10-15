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
  refreshPledges,
}: {
  characterId: number;
  communityId: string;
  requestId: string;
  /** The viewer has a Pledge on an open Request of someone else. */
  enabled: boolean;
  refreshPledges: (requestId: string) => Promise<RequestPledge[]>;
}): DeliverySyncResult | null {
  const [result, setResult] = useState<DeliverySyncResult | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void syncRequestDeliveries(characterId, communityId).then(async (found) => {
      if (cancelled) return;
      setResult(found);
      if (found.updated > 0) await refreshPledges(requestId).catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, requestId, enabled, refreshPledges]);
  return enabled ? result : null;
}
