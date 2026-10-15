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
 * `requests` is null until the first read lands (a later failed reload keeps the last board and sets `failed`); `pledgesFailed` says the
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
    // Together, not one after the other. A failed Pledge read must not hide the
    // board, nor pass for "no Pledges".
    Promise.all([
      loadRequests(characterId, communityId),
      loadCommunityPledges(characterId, communityId).catch((err) => {
        console.warn('Community Pledges could not be read', err);
        return null;
      }),
    ]).then(
      ([loaded, found]) => {
        if (cancelled) return;
        setRequests(loaded);
        setPledges(found ?? NO_PLEDGES);
        setPledgesFailed(found === null);
        setFailed(false);
      },
      (err) => {
        if (cancelled) return;
        console.warn('Community Requests could not be read', err);
        setFailed(true);
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
