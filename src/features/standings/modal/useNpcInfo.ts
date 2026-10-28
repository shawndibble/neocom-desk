/**
 * The info modal's blocks, each loaded on its own (`useKeyedLoad`): a block
 * that is slow, failed or has nothing to say never holds up the others. The
 * ones about the pilot's own standing wait for the Character and their data;
 * without a Character (not signed in) they stay idle and the modal shows the
 * entity's facts alone.
 */
import { useCallback } from 'react';
import { useKeyedLoad, type AsyncLoad } from '@/lib/useAsyncLoad';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  loadChainData,
  loadFactionFacts,
  loadKnownRows,
  loadLoyalty,
  loadStationsModel,
  loadWhereRows,
  type ChainData,
  type FactionFacts,
  type KnownRows,
  type NpcInfoTarget,
  type OwnerTarget,
} from './npcInfoLoaders';
import type { LoyaltyModel, StationsModel, WhereRow } from './npcInfoModel';

const targetKey = ({ kind, id }: NpcInfoTarget) => `${kind}-${id}`;

/** The active Character's id, or null when none is signed in. */
function useCharacterId(): number | null {
  return useActiveCharacter((state) => state.activeCharacterId);
}

/**
 * The chain of standings. Every hook below takes the same `target` object
 * across renders (`NpcInfoView` memoizes it), so it is the loader's identity.
 * `ready` with `null` data means there is nothing honest to show.
 */
export function useChainData(target: NpcInfoTarget): AsyncLoad<ChainData | null> {
  const characterId = useCharacterId();
  const loader = useCallback(() => loadChainData(characterId!, target), [characterId, target]);
  return useKeyedLoad(characterId === null ? null : `${characterId}-${targetKey(target)}`, loader);
}

/** Broker fee and reprocessing tax; idle for an agent, and until the chain is read. */
export function useStationsModel(
  owner: OwnerTarget | null,
  chain: ChainData | null | undefined
): AsyncLoad<StationsModel> {
  const loader = useCallback(() => loadStationsModel(owner!, chain!), [owner, chain]);
  return useKeyedLoad(owner && chain ? targetKey(owner) : null, loader);
}

export function useWhereRows(target: NpcInfoTarget): AsyncLoad<WhereRow[]> {
  const characterId = useCharacterId();
  const loader = useCallback(() => loadWhereRows(characterId, target), [characterId, target]);
  return useKeyedLoad(`${characterId}-${targetKey(target)}`, loader);
}

/** Agents (of a corporation) or corporations (of a faction) the pilot holds a standing with. */
export function useKnownRows(
  owner: OwnerTarget | null,
  chain: ChainData | null | undefined
): AsyncLoad<KnownRows> {
  const characterId = useCharacterId();
  const loader = useCallback(
    () => loadKnownRows(characterId!, owner!, chain!),
    [characterId, owner, chain]
  );
  return useKeyedLoad(
    characterId !== null && owner && chain ? `${characterId}-${targetKey(owner)}` : null,
    loader
  );
}

export function useLoyalty(corporationId: number | null): AsyncLoad<LoyaltyModel | null> {
  const characterId = useCharacterId();
  const loader = useCallback(
    () => loadLoyalty(characterId!, corporationId!),
    [characterId, corporationId]
  );
  return useKeyedLoad(
    characterId === null || corporationId === null ? null : `${characterId}-${corporationId}`,
    loader
  );
}

export function useFactionFacts(factionId: number): AsyncLoad<FactionFacts | null> {
  const loader = useCallback(() => loadFactionFacts(factionId), [factionId]);
  return useKeyedLoad(String(factionId), loader);
}
