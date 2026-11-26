import { useCallback } from 'react';
import { useKeyedLoad, type AsyncLoad } from '@/lib/useAsyncLoad';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  loadChainData,
  loadCorporationFaction,
  loadFactionFacts,
  loadKnownRows,
  loadLoyalty,
  loadStationsModel,
  loadWhereRows,
  type ChainData,
  type CorporationFaction,
  type FactionFacts,
  type KnownRows,
  type NpcInfoTarget,
  type OwnerTarget,
} from './npcInfoLoaders';
import type { LoyaltyModel, StationsModel, WhereRow } from './npcInfoModel';

const targetKey = ({ kind, id }: NpcInfoTarget) => `${kind}-${id}`;

function useCharacterId(): number | null {
  return useActiveCharacter((state) => state.activeCharacterId);
}

export function useChainData(target: NpcInfoTarget): AsyncLoad<ChainData | null> {
  const characterId = useCharacterId();
  const loader = useCallback(() => loadChainData(characterId!, target), [characterId, target]);
  return useKeyedLoad(characterId === null ? null : `${characterId}-${targetKey(target)}`, loader);
}

export function useStationsModel(
  owner: OwnerTarget | null,
  chain: ChainData | null | undefined
): AsyncLoad<StationsModel> {
  const characterId = useCharacterId();
  const loader = useCallback(() => loadStationsModel(owner!, chain!), [owner, chain]);
  return useKeyedLoad(owner && chain ? `${characterId}-${targetKey(owner)}` : null, loader);
}

export function useWhereRows(target: NpcInfoTarget): AsyncLoad<WhereRow[]> {
  const characterId = useCharacterId();
  const loader = useCallback(() => loadWhereRows(characterId, target), [characterId, target]);
  return useKeyedLoad(`${characterId}-${targetKey(target)}`, loader);
}

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

export function useCorporationFaction(corporationId: number): AsyncLoad<CorporationFaction | null> {
  const loader = useCallback(() => loadCorporationFaction(corporationId), [corporationId]);
  return useKeyedLoad(String(corporationId), loader);
}
