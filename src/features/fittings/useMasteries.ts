/**
 * `masteries.json`, read three ways instead of two. The file is lazy (not in
 * the install precache), so offline on a first visit it can be missing, and
 * "missing" must not read as "this hull has no Mastery": the tree would lose
 * its badges, the header chip would vanish and Ship Info would say "No
 * Mastery data for this hull" about a hull that has plenty.
 *
 * - `loading`: asked for, not here yet.
 * - `loaded`: here; a hull with no entry in it genuinely has none.
 * - `unavailable`: the load failed. Tries again by itself when the connection returns.
 *
 * A retry from `unavailable` stays `unavailable` with `retrying` set until it
 * settles, rather than dropping back to `loading`: the panel holding the Retry
 * button must not unmount (and take the keyboard focus with it) mid-retry.
 */
import { useCallback, useEffect, useState } from 'react';
import { loadMasteries } from '@/sde/loadSde';
import type { MasteryMap } from '@/sde/types';
import { onReconnect } from '@/stores/network';

export type MasteriesState =
  { status: 'loading' } | { status: 'loaded'; masteries: MasteryMap } | { status: 'unavailable' };

export function useMasteries(): MasteriesState & { retry: () => void; retrying: boolean } {
  const [state, setState] = useState<MasteriesState>({ status: 'loading' });
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    // A retry keeps what is on screen; only the first load is `loading`.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a retry marks itself, not a render-time derivation
    if (attempt > 0) setRetrying(true);
    loadMasteries()
      .then((masteries) => {
        if (cancelled) return;
        setState({ status: 'loaded', masteries });
        setRetrying(false);
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'unavailable' });
        setRetrying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const unavailable = state.status === 'unavailable';
  useEffect(() => (unavailable ? onReconnect(retry) : undefined), [unavailable, retry]);
  return { ...state, retry, retrying };
}
