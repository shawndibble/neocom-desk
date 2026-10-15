import { useCallback, useEffect, useState } from 'react';
import {
  type CommunityRequest,
  type PledgesByRequest,
  type RequestPledge,
} from '@/engine/communities/requests';
import { loadCommunityPledges, loadPledges, loadRequests } from './requestStore';

const NO_PLEDGES: PledgesByRequest = new Map();

/**
 * A Community's Requests and every Pledge under them (one collection-group read), read once
 * `enabled` is true (the Requests tab has been opened) and again on
 * `reload()`. Firestore here has no listeners, so a change refetches:
 * `refreshPledges(id)` re-reads one Request's Pledges after a Pledge write.
 * `requests` is null until the first read lands; `pledgesFailed` says the
 * Pledge read failed, so the board does not pass an unread Request off as Open.
 */
export function useCommunityRequests(characterId: number, communityId: string, enabled: boolean) {
  const [requests, setRequests] = useState<CommunityRequest[] | null>(null);
  const [pledges, setPledges] = useState<PledgesByRequest>(NO_PLEDGES);
  const [failed, setFailed] = useState(false);
  const [pledgesFailed, setPledgesFailed] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const loaded = await loadRequests(characterId, communityId);
      // A failed Pledge read must not hide the board, nor pass for "no Pledges".
      const found = await loadCommunityPledges(characterId, communityId).catch(() => null);
      return { loaded, found };
    })().then(
      ({ loaded, found }) => {
        if (cancelled) return;
        setRequests(loaded);
        setPledges(found ?? NO_PLEDGES);
        setPledgesFailed(found === null);
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
  const refreshPledges = useCallback(
    async (requestId: string): Promise<RequestPledge[]> => {
      const fresh = await loadPledges(characterId, communityId, requestId);
      setPledges((before) => new Map(before).set(requestId, fresh));
      return fresh;
    },
    [characterId, communityId]
  );
  return { requests, pledges, pledgesFailed, failed, reload, refreshPledges };
}
