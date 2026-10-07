/**
 * Stock every Character holds at one station, for the Appraisal's "Minus
 * owned". Cache-first via `loadAllCharactersAssets`; idle (null) when off.
 */
import { useEffect, useState } from 'react';
import { ownedAtStation } from '@/engine/market/appraisalOwned';
import { loadAllCharactersAssets } from '@/features/character/assets';

export interface OwnedAtStation {
  /** Null while off, loading, or when nothing could be read. */
  owned: ReadonlyMap<number, number> | null;
  loading: boolean;
}

export function useOwnedAtStation(enabled: boolean, stationId: number): OwnedAtStation {
  const [state, setState] = useState<{ stationId: number; owned: Map<number, number> } | null>(
    null
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadAllCharactersAssets()
      .then(({ entries }) => {
        if (cancelled) return;
        setState({
          stationId,
          owned: ownedAtStation(
            entries.map((entry) => entry.assets),
            stationId
          ),
        });
      })
      .catch(() => {
        if (!cancelled) setState({ stationId, owned: new Map() });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, stationId]);

  const ready = enabled && state !== null && state.stationId === stationId;
  return { owned: ready ? state.owned : null, loading: enabled && !ready };
}
