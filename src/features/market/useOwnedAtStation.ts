/**
 * Stock every Character holds at one station, for the Appraisal's "Minus
 * owned". Cache-first via `loadAllCharactersAssets`; idle (null) when off.
 */
import { useEffect, useState } from 'react';
import { ownedAnywhere, ownedAtStation } from '@/engine/market/appraisalOwned';
import { loadAllCharactersAssets } from '@/features/assets/assets';

export interface OwnedAtStation {
  /** Null while off, loading, or when nothing could be read. */
  owned: ReadonlyMap<number, number> | null;
  loading: boolean;
}

/** One station's hangars, or `'all'` for everything held anywhere. */
export type OwnedScope = number | 'all';

export function useOwnedAtStation(enabled: boolean, scope: OwnedScope): OwnedAtStation {
  const [state, setState] = useState<{ scope: OwnedScope; owned: Map<number, number> } | null>(
    null
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadAllCharactersAssets()
      .then(({ entries }) => {
        if (cancelled) return;
        const lists = entries.map((entry) => entry.assets);
        setState({
          scope,
          owned: scope === 'all' ? ownedAnywhere(lists) : ownedAtStation(lists, scope),
        });
      })
      .catch(() => {
        if (!cancelled) setState({ scope, owned: new Map() });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, scope]);

  const ready = enabled && state !== null && state.scope === scope;
  return { owned: ready ? state.owned : null, loading: enabled && !ready };
}
