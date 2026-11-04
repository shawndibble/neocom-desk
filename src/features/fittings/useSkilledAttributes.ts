/**
 * Item Detail's "base → skilled" values: the item's attributes with the
 * active Character's skills and active-clone implants applied, worked out by
 * the dogma engine (`skilledAttributes`). Ships and fittable modules only
 * (`skilledTargetOf`).
 *
 * The engine is a multi-MB one-time download, so Show info never starts it on
 * its own: with the engine already loaded or cached the values just appear;
 * otherwise the state is `needs-download` and the caller offers a control that
 * calls `load()`. With no pilot to read (no Character, skills unreadable) the
 * state is `none` and Item Detail shows base values only.
 */
import { useCallback, useState } from 'react';
import { skilledTargetOf, type SkilledTarget } from '@/engine/fittings/skilledTarget';
import type { ItemMutation } from '@/engine/fittings/types';
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
  | { status: 'ready'; values: ReadonlyMap<number, number> };

async function loadTarget(typeId: number, mutation?: ItemMutation): Promise<SkilledTarget | null> {
  const [types, categories, slots] = await Promise.all([
    loadTypes(),
    loadGroupCategories(),
    loadFittingSlots(),
  ]);
  return skilledTargetOf(typeId, { types, categories, slots }, mutation);
}

/** `mutation` must be stable across renders (memoise it); a new identity recalculates. */
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
    const { skilledAttributes } = await import('./dogmaFittingEngine');
    return skilledAttributes(runnable, profile);
  }, [runnable, profile]);
  const skilled = useKeyedLoad(
    runnable ? `${characterId}:${typeId}:${mutationKey}` : null,
    skilledLoader
  );

  if (characterId === null || pilot.failed || !pilot.skillsKnown) return { status: 'none' };
  if (target.status === 'failed' || (target.status === 'ready' && target.data === null)) {
    return { status: 'none' };
  }
  if (!engineAvailable) {
    if (cached.status !== 'ready' && cached.status !== 'failed') return { status: 'loading' };
    // Nothing cached and no connection: a download button would only fail.
    return online ? { status: 'needs-download', load } : { status: 'none' };
  }
  if (skilled.status === 'ready') return { status: 'ready', values: skilled.data };
  if (skilled.status === 'failed' || engineStatus === 'failed') return { status: 'none' };
  return { status: 'loading' };
}
