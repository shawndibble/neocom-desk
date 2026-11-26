import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type CommunityRequest,
  type PledgesByRequest,
  type RequestPledge,
} from '@/engine/communities/requests';
import { loadBoard } from './boardCache';
import { loadPledges } from './requestStore';

const NO_PLEDGES: PledgesByRequest = new Map();

export function useCommunityRequests(characterId: number, communityId: string, enabled: boolean) {
  const [requests, setRequests] = useState<CommunityRequest[] | null>(null);
  const [pledges, setPledges] = useState<PledgesByRequest>(NO_PLEDGES);
  const [failed, setFailed] = useState(false);
  const [pledgesFailed, setPledgesFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const pledgesFor = useRef('');
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadBoard(characterId, communityId).then(
      ({ requests: loaded, pledges: found }) => {
        if (cancelled) return;
        setRequests(loaded);
        const board = `${characterId}:${communityId}`;
        setPledges((before) => found ?? (pledgesFor.current === board ? before : NO_PLEDGES));
        if (found) pledgesFor.current = board;
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
