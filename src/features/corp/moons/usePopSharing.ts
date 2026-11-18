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

/**
 * The book's Pop Sharing settings (#6222), through the one cached read every list shares.
 * `reload` drops that read, so every mounted list reads the settings again; so does an edit
 * of them anywhere on the device.
 */
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

/**
 * Whether each Community the settings name carries the book's pops (#6223), read when the
 * settings load or change. Empty until read, or when the read fails: nothing is marked then.
 */
export function usePopSharingCommunities(
  characterId: number,
  corporationId: number,
  settingsVersion: unknown
): Record<string, PopSharingCommunityStatus> {
  const load = useCallback(
    () => readPopSharingCommunities(characterId, corporationId),
    // A new settings version re-reads behind the status on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterId, corporationId, settingsVersion]
  );
  return useKeyedLoad(`${characterId}:${corporationId}`, load).data ?? NO_STATUS;
}
