import { useState } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { loadMasteries } from '@/sde/loadSde';
import type { MasteryMap } from '@/sde/types';

export type MasteriesState =
  { status: 'loading' } | { status: 'loaded'; masteries: MasteryMap } | { status: 'unavailable' };

export function useMasteries(): MasteriesState & { retry: () => void; retrying: boolean } {
  const load = useAsyncLoad(loadMasteries);
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
