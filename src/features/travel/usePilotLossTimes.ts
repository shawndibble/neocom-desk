import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { fetchPilotKillmails } from '@/lib/zkillboard';
import { lossTimesMs } from './pilotLossTimes';

export type PilotLossTimesState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; timesMs: number[] | null };

export function usePilotLossTimes(characterId: number, enabled: boolean): PilotLossTimesState {
  const loader = useCallback(async (): Promise<PilotLossTimesState> => {
    const result = await fetchPilotKillmails(characterId);
    return result.ok ? { kind: 'ready', timesMs: lossTimesMs(result.entries) } : { kind: 'failed' };
  }, [characterId]);
  const load = useKeyedLoad(enabled ? String(characterId) : null, loader);
  if (load.status === 'idle') return { kind: 'idle' };
  if (load.status === 'ready') return load.data;
  return { kind: load.status === 'failed' ? 'failed' : 'loading' };
}
