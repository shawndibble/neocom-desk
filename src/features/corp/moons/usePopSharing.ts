import { useCallback, useEffect, useState } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import type { PopSharingDoc } from '../../../../functions/src/popSharing';
import {
  invalidatePopSharing,
  onPopSharingInvalidated,
  readPopSharingCached,
} from '../taxBook/popSharingCache';
import {
  readPopSharingCommunities,
  type PopSharingCommunityStatus,
} from '../taxBook/popSharingClient';

export type PopSharingLoad =
  { state: 'loading' } | { state: 'failed' } | { state: 'ready'; doc: PopSharingDoc };

export function usePopSharing(
  characterId: number,
  corporationId: number
): { load: PopSharingLoad; reload: () => void } {
  const [load, setLoad] = useState<PopSharingLoad>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    readPopSharingCached(characterId, corporationId).then(
      (doc) => !cancelled && setLoad({ state: 'ready', doc }),
      () => !cancelled && setLoad({ state: 'failed' })
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, attempt]);
  useEffect(
    () =>
      onPopSharingInvalidated((corp) => {
        if (corp === corporationId) setAttempt((n) => n + 1);
      }),
    [corporationId]
  );
  const reload = useCallback(() => invalidatePopSharing(corporationId), [corporationId]);
  return { load, reload };
}

const NO_STATUS: Record<string, PopSharingCommunityStatus> = {};

export function usePopSharingCommunities(
  characterId: number,
  corporationId: number,
  settingsVersion: unknown
): Record<string, PopSharingCommunityStatus> {
  const load = useCallback(
    () => readPopSharingCommunities(characterId, corporationId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterId, corporationId, settingsVersion]
  );
  return useKeyedLoad(`${characterId}:${corporationId}`, load).data ?? NO_STATUS;
}
