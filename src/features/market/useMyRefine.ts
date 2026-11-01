import { captureException } from '@sentry/react';
import { useEffect, useMemo, useState } from 'react';
import type { AppraisalItem } from '@/engine/market/appraisal';
import type { RefiningSetup } from '@/engine/industry/refiningSetup';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { useRefiningSetup } from '@/features/refining/useRefiningSetup';
import { loadReprocessing } from '@/sde/loadSde';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { itemsWithMyRefine, type AppraisalShareView } from './appraisalShareData';

export type MyRefine =
  | { status: 'idle' | 'loading' | 'signedOut' | 'failed' }
  | { status: 'ready'; items: AppraisalItem[]; setup: RefiningSetup };

/**
 * A Shared Appraisal's refine figures at the visitor's own skills and Refining
 * Setup, still at the sharer's mineral prices. Reads nothing until `enabled`
 * (the visitor opened the breakdown): the reprocessing data is 1.4 MB and most
 * visitors only look. `signedOut` means no active Character, so no skills.
 */
export function useMyRefine(view: AppraisalShareView | null, enabled: boolean): MyRefine {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const refining = useRefiningSetup();
  const [loaded, setLoaded] = useState<{
    view: AppraisalShareView;
    characterId: number;
    setup: RefiningSetup;
    items: AppraisalItem[];
  } | null>(null);
  // Keyed to what failed, so a later view, Character or setup starts clean instead of staying failed.
  const [failedFor, setFailedFor] = useState<{
    view: AppraisalShareView;
    characterId: number;
    setup: RefiningSetup;
  } | null>(null);

  useEffect(() => {
    if (enabled && !hydrated) void useActiveCharacter.getState().hydrate();
  }, [enabled, hydrated]);

  // By value, so a setup read again with the same numbers does not restart the load.
  const { stationRate, taxRate } = refining.setup;
  const setup = useMemo<RefiningSetup>(() => ({ stationRate, taxRate }), [stationRate, taxRate]);
  useEffect(() => {
    if (!enabled || view === null || characterId === null || !refining.hydrated) return;
    let cancelled = false;
    void (async () => {
      try {
        const [reprocessing, modifiers] = await Promise.all([
          loadReprocessing(),
          loadCharacterModifiers(characterId, Date.now()),
        ]);
        if (cancelled) return;
        setLoaded({
          view,
          characterId,
          setup,
          items: itemsWithMyRefine(view, { reprocessing, modifiers, refining: setup }),
        });
      } catch (error) {
        // Offline or a failed skill read: the shared numbers stay on screen and the button says why.
        captureException(error);
        if (!cancelled) setFailedFor({ view, characterId, setup });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, view, characterId, refining.hydrated, setup]);

  if (!enabled) return { status: 'idle' };
  if (!hydrated) return { status: 'loading' };
  if (characterId === null) return { status: 'signedOut' };
  const failed =
    failedFor !== null &&
    failedFor.view === view &&
    failedFor.characterId === characterId &&
    failedFor.setup === setup;
  if (failed) return { status: 'failed' };
  if (
    loaded &&
    loaded.view === view &&
    loaded.characterId === characterId &&
    loaded.setup === setup
  ) {
    return { status: 'ready', items: loaded.items, setup: loaded.setup };
  }
  return { status: 'loading' };
}
