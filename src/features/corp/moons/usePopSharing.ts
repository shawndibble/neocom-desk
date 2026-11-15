import { useCallback, useEffect, useState } from 'react';
import type { PopSharingDoc } from '../../../../functions/src/popSharing';
import {
  readPopSharing,
  readPopSharingCommunities,
  type PopSharingCommunityStatus,
} from '../taxBook/popSharingClient';

export type PopSharingLoad =
  { state: 'loading' } | { state: 'failed' } | { state: 'ready'; doc: PopSharingDoc };

/** The book's Pop Sharing settings (#6222), read on mount and after each `reload`. */
export function usePopSharing(
  characterId: number,
  corporationId: number
): { load: PopSharingLoad; reload: () => void } {
  const [load, setLoad] = useState<PopSharingLoad>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    readPopSharing(characterId, corporationId).then(
      (doc) => !cancelled && setLoad({ state: 'ready', doc }),
      () => !cancelled && setLoad({ state: 'failed' })
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { load, reload };
}

/**
 * Whether each Community the settings name carries the book's pops (#6223), read when the
 * settings load or change. Empty until read, or when the read fails: nothing is marked then.
 */
export function usePopSharingCommunities(
  characterId: number,
  corporationId: number,
  settingsVersion: unknown
): Record<string, PopSharingCommunityStatus> {
  const [status, setStatus] = useState<Record<string, PopSharingCommunityStatus>>({});
  useEffect(() => {
    let cancelled = false;
    readPopSharingCommunities(characterId, corporationId).then(
      (s) => !cancelled && setStatus(s),
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, settingsVersion]);
  return status;
}
