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
import { useState } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { loadMasteries } from '@/sde/loadSde';
import type { MasteryMap } from '@/sde/types';

export type MasteriesState =
  { status: 'loading' } | { status: 'loaded'; masteries: MasteryMap } | { status: 'unavailable' };

export function useMasteries(): MasteriesState & { retry: () => void; retrying: boolean } {
  const load = useAsyncLoad(loadMasteries);
  // A retry keeps what is on screen: once failed, `loading` reads as a retry until it settles.
  const [failedBefore, setFailedBefore] = useState(false);
  if (load.status === 'failed' && !failedBefore) setFailedBefore(true);
  if (load.status === 'ready' && failedBefore) setFailedBefore(false);
  const { retry } = load;
  if (load.status === 'ready')
    return { status: 'loaded', masteries: load.data, retry, retrying: false };
  if (load.status === 'failed') return { status: 'unavailable', retry, retrying: false };
  if (failedBefore) return { status: 'unavailable', retry, retrying: true };
  return { status: 'loading', retry, retrying: false };
}
