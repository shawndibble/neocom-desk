import { useCallback, useState } from 'react';
import { skilledTargetOf, type SkilledTarget } from '@/engine/fittings/skilledTarget';
import type { SkilledSource } from '@/engine/fittings/skilledSources';
import type { ItemMutation, PilotProfile } from '@/engine/fittings/types';
import { loadTypeNames } from '@/features/character/typeNames';
import { useAsyncLoad, useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadFittingSlots, loadGroupCategories, loadTypes } from '@/sde/loadSde';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { dogmaEngineAssetsCached } from './dogmaEngineAssets';
import { usePilotProfile } from './fittingPilotProfile';
import { useDogmaEngineStatus } from './useDogmaEngineStatus';

export type SkilledAttributesState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'needs-download'; load: () => void }
  | {
      status: 'ready';
      values: ReadonlyMap<number, number>;
      sources: ReadonlyMap<number, readonly NamedSkilledSource[]>;
    };

export interface NamedSkilledSource extends SkilledSource {
  name: string;
  level?: number;
}

interface Skilled {
  values: Map<number, number>;
  sources: Map<number, NamedSkilledSource[]>;
}

async function calculateSkilled(target: SkilledTarget, profile: PilotProfile): Promise<Skilled> {
  const { skilledAttributes } = await import('./dogmaFittingEngine');
  const raw = await skilledAttributes(target, profile);
  const typeIds = [...raw.values()].flatMap(({ sources }) => sources.map((s) => s.typeId));
  const names = typeIds.length > 0 ? await loadTypeNames(typeIds) : new Map<number, string>();
  const values = new Map<number, number>();
  const sources = new Map<number, NamedSkilledSource[]>();
  for (const [id, { value, sources: made }] of raw) {
    values.set(id, value);
    sources.set(
      id,
      made.map((source) => ({
        ...source,
        name: names.get(source.typeId) ?? `#${source.typeId}`,
        ...(source.kind === 'skill' ? { level: profile.skillLevels.get(source.typeId) ?? 0 } : {}),
      }))
    );
  }
  return { values, sources };
}

async function loadTarget(typeId: number, mutation?: ItemMutation): Promise<SkilledTarget | null> {
  const [types, categories, slots] = await Promise.all([
    loadTypes(),
    loadGroupCategories(),
    loadFittingSlots(),
  ]);
  return skilledTargetOf(typeId, { types, categories, slots }, mutation);
}

export function useSkilledAttributes(
  typeId: number,
  mutation?: ItemMutation
): SkilledAttributesState {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const pilot = usePilotProfile(characterId);
  const engineStatus = useDogmaEngineStatus();
  const online = useOnline();
  const cached = useAsyncLoad(dogmaEngineAssetsCached);
  const [requested, setRequested] = useState(false);
  const load = useCallback(() => setRequested(true), []);

  const mutationKey = mutation ? JSON.stringify(mutation) : '';
  const targetLoader = useCallback(() => loadTarget(typeId, mutation), [typeId, mutation]);
  const target = useKeyedLoad(`${typeId}:${mutationKey}`, targetLoader);

  const profile = characterId !== null && pilot.skillsKnown ? pilot.profile : null;
  const engineAvailable = engineStatus === 'ready' || cached.data === true || requested;
  const runnable = target.data && profile && engineAvailable ? target.data : null;
  const skilledLoader = useCallback(async () => {
    if (!runnable || !profile) throw new Error('nothing to calculate');
    return calculateSkilled(runnable, profile);
  }, [runnable, profile]);
  const skilled = useKeyedLoad(
    runnable ? `${characterId}:${typeId}:${mutationKey}` : null,
    skilledLoader
  );

  if (characterId === null || pilot.failed || !pilot.skillsKnown) return { status: 'none' };
  if (target.status === 'failed' || (target.status === 'ready' && target.data === null)) {
    return { status: 'none' };
  }
  if (target.status !== 'ready' || !profile) return { status: 'loading' };
  if (!engineAvailable) {
    if (cached.status !== 'ready' && cached.status !== 'failed') return { status: 'loading' };
    return online ? { status: 'needs-download', load } : { status: 'none' };
  }
  if (skilled.status === 'ready') {
    return { status: 'ready', values: skilled.data.values, sources: skilled.data.sources };
  }
  if (skilled.status === 'failed' || engineStatus === 'failed') return { status: 'none' };
  return { status: 'loading' };
}
