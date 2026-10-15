import { useCallback, useEffect, useState } from 'react';
import type { CommunityRequest } from '@/engine/communities/requests';
import { loadRequests } from './requestStore';

/**
 * A Community's Requests, read once `enabled` is true (the Requests tab has
 * been opened) and again on `reload()`. Firestore here has no listeners, so a
 * change refetches. `requests` is null until the first read lands.
 */
export function useCommunityRequests(characterId: number, communityId: string, enabled: boolean) {
  const [requests, setRequests] = useState<CommunityRequest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadRequests(characterId, communityId).then(
      (loaded) => {
        if (cancelled) return;
        setRequests(loaded);
        setFailed(false);
      },
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, communityId, enabled, version]);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return { requests, failed, reload };
}
