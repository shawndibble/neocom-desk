/**
 * A pilot's dated kills (zKillboard's latest 200), loaded once for everything
 * on a profile that reads them: the Threat verdict, "Where they kill" and the
 * hulls they killed. One owner holds the loading, failed and ready state for all
 * of them; the request itself is shared with Recent kills and losses by
 * `fetchPilotList`, so nothing is asked for twice either way.
 */
import { useCallback, useEffect, useState } from 'react';
import type { KillRecord } from '@/engine/pilotList/killActivity';
import { fetchPilotKillHistory } from '@/lib/zkillboard';

export type PilotKillHistoryState =
  { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; kills: KillRecord[] };

export function usePilotKillHistory(characterId: number): {
  history: PilotKillHistoryState;
  retry: () => void;
} {
  const [history, setHistory] = useState<PilotKillHistoryState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchPilotKillHistory(characterId).then((result) => {
      if (!cancelled)
        setHistory(result.ok ? { kind: 'ready', kills: result.kills } : { kind: 'failed' });
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, attempt]);

  const retry = useCallback(() => {
    setHistory({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { history, retry };
}
