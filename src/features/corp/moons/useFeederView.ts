import { useCallback, useEffect, useState } from 'react';
import { resolveNames } from '@/features/character/names';
import {
  loadFeederView,
  type FeederView,
  type FeederViewAccess,
} from '../taxBook/feederViewClient';
import { characterIdsOf, payeeIdOf } from '../taxBook/feederViewModel';

export type FeederViewLoad =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | {
      state: 'ready';
      access: FeederViewAccess;
      /** `null` when the server has not built the view yet. */
      view: FeederView | null;
      names: (characterId: number) => string;
      /** A resolved name, or undefined: the refinery label chain skips what is unknown. */
      nameOf: (id: number) => string | undefined;
    };

/**
 * The moon owner's view for a corporation: access, then the view, then the miners' names.
 * `collectorCorporationId` opens an accounting corporation it left (#4621).
 */
export function useFeederView(
  characterId: number,
  corporationId: number,
  collectorCorporationId?: number
): { load: FeederViewLoad; reload: () => void } {
  const [load, setLoad] = useState<FeederViewLoad>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { access, view } =
          collectorCorporationId === undefined
            ? await loadFeederView(characterId, corporationId)
            : await loadFeederView(characterId, corporationId, collectorCorporationId);
        // Universe names resolves characters, corporations and systems alike: the miners, the
        // payee, the moon owner itself and its refineries' systems for the label chain.
        const ids = view
          ? [
              ...characterIdsOf(view.days),
              payeeIdOf(view.summary),
              view.summary.feederCorporationId,
              ...view.refineries.flatMap((r) => (r.solarSystemId == null ? [] : [r.solarSystemId])),
            ]
          : [];
        const resolved = await resolveNames(ids).catch(() => new Map<number, string>());
        if (!cancelled)
          setLoad({
            state: 'ready',
            access,
            view,
            names: (id) => resolved.get(id) ?? `#${id}`,
            nameOf: (id) => resolved.get(id),
          });
      } catch (e) {
        if (!cancelled)
          setLoad({ state: 'failed', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, collectorCorporationId, attempt]);
  const reload = useCallback(() => {
    setLoad({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  return { load, reload };
}
