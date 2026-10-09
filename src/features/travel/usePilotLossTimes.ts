/**
 * When a pilot's newest losses happened, for the Threat verdict of a pilot with
 * no recent kill: a recent loss means they are flying, so they are not
 * "inactive". Read from the newest kills and losses `Recent kills and losses`
 * already loads (`fetchPilotKillmails`, one request shared between them), and
 * asked for only when `enabled`.
 */
import { useEffect, useState } from 'react';
import { fetchPilotKillmails } from '@/lib/zkillboard';
import { lossTimesMs } from './pilotLossTimes';

export type PilotLossTimesState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; timesMs: number[] };

export function usePilotLossTimes(characterId: number, enabled: boolean): PilotLossTimesState {
  const [answer, setAnswer] = useState<{
    characterId: number;
    state: PilotLossTimesState;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchPilotKillmails(characterId).then((result) => {
      if (cancelled) return;
      setAnswer({
        characterId,
        state: result.ok
          ? { kind: 'ready', timesMs: lossTimesMs(result.entries) }
          : { kind: 'failed' },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, enabled]);

  if (!enabled) return { kind: 'idle' };
  return answer?.characterId === characterId ? answer.state : { kind: 'loading' };
}
