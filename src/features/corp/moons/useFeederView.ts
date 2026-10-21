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
    };

/** The moon owner's view for a corporation: access, then the view, then the miners' names. */
export function useFeederView(
  characterId: number,
  corporationId: number
): { load: FeederViewLoad; reload: () => void } {
  const [load, setLoad] = useState<FeederViewLoad>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { access, view } = await loadFeederView(characterId, corporationId);
        const ids = view ? [...characterIdsOf(view.days), payeeIdOf(view.summary)] : [];
        const resolved = await resolveNames(ids).catch(() => new Map<number, string>());
        if (!cancelled)
          setLoad({
            state: 'ready',
            access,
            view,
            names: (id) => resolved.get(id) ?? `#${id}`,
          });
      } catch (e) {
        if (!cancelled)
          setLoad({ state: 'failed', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, corporationId, attempt]);
  const reload = useCallback(() => {
    setLoad({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  return { load, reload };
}
