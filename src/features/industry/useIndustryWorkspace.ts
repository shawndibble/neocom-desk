import { useEffect, useMemo, useState } from 'react';
import { hydrateActivityFacilityDefaults, useFacilityDefaults } from './facilityDefaults';
import { useReactionFacilityDefaults } from './reactionFacilityDefaults';
import type { ActivityFacilityDefaults } from './facilityDefaults';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useRetryableLoad } from '@/lib/useRetryableLoad';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadPi } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';
import {
  NO_CHARACTER_MODIFIERS,
  type CharacterModifiers,
} from '@/engine/industry/characterModifiers';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { loadBlueprintCatalog, type BlueprintCatalog } from './blueprintCatalog';
import { loadCharacterBlueprints } from './data';
import { useOwnedStockSnapshot } from './useDetectedOwnedStock';
import { lastWorkspaceLoad, patchWorkspaceLoad, reuseIfUnchanged } from './workspaceLoadCache';
import { useCorpOwnedStockSource, type CorpOwnedStockState } from './corpOwnedStock';
import { useBuildGroups } from './buildGroups';
import { useBuildPlanPricingInputs, type BuildPlanPricingInputs } from './buildPlanPricingInputs';
import { useAssumedTe } from './assumedTe';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { useHydratedStore } from '@/lib/useHydratedStore';

export interface IndustryWorkspace {
  hydrated: boolean;
  activeCharacterId: number | null;
  facilityDefaults: ActivityFacilityDefaults;
  catalog: BlueprintCatalog | null;
  characterLoaded: boolean;
  catalogFailed: boolean;
  retryCatalog: () => void;
  pi: PiData | null;
  ownedBlueprints: CharacterBlueprint[];
  blueprintsNeedsReauth: boolean;
  modifiers: CharacterModifiers;
  ownedStockSnapshot: OwnedStockSnapshot;
  corpOwnedStock: CorpOwnedStockState;
  pricingInputs: BuildPlanPricingInputs;
  assumedTe: number;
  buildGroups: ReturnType<typeof useBuildGroups.getState>['value'];
  buildGroupsHydrated: boolean;
  setBuildGroups: ReturnType<typeof useBuildGroups.getState>['setValue'];
}

export function useIndustryWorkspace(): IndustryWorkspace {
  const manufacturingDefaults = useFacilityDefaults((state) => state.value);
  const reactionDefaults = useReactionFacilityDefaults((state) => state.value);
  useEffect(() => {
    void hydrateActivityFacilityDefaults();
  }, []);
  const facilityDefaults = useMemo<ActivityFacilityDefaults>(
    () => ({ manufacturing: manufacturingDefaults, reaction: reactionDefaults }),
    [manufacturingDefaults, reactionDefaults]
  );

  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const ownedStockSnapshot = useOwnedStockSnapshot();
  const corpOwnedStock = useCorpOwnedStockSource();
  const pricingInputs = useBuildPlanPricingInputs(activeCharacterId);

  const buildGroups = useBuildGroups((state) => state.value);
  const setBuildGroups = useBuildGroups((state) => state.setValue);
  const assumedTe = useAssumedTe((state) => state.value);
  const buildGroupsHydrated = useHydratedStore(useBuildGroups);
  useHydratedStore(useAssumedTe);

  const [initial] = useState(() => lastWorkspaceLoad(activeCharacterId));
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(initial?.catalog ?? null);
  const [pi, setPi] = useState<PiData | null>(initial?.pi ?? null);
  const [ownedBlueprints, setOwnedBlueprints] = useState<CharacterBlueprint[]>(
    initial?.ownedBlueprints ?? []
  );
  const [blueprintsNeedsReauth, setBlueprintsNeedsReauth] = useState(
    initial?.blueprintsNeedsReauth ?? false
  );
  const [modifiers, setModifiers] = useState<CharacterModifiers>(
    initial?.modifiers ?? NO_CHARACTER_MODIFIERS
  );

  const {
    failed: catalogFailed,
    attempt: catalogAttempt,
    fail: failCatalog,
    clear: clearCatalogFailure,
    retry: retryCatalog,
  } = useRetryableLoad();
  const [characterLoadedFor, setCharacterLoadedFor] = useState<number | null>(
    initial?.characterLoaded ? activeCharacterId : null
  );
  const characterLoaded = characterLoadedFor !== null && characterLoadedFor === activeCharacterId;

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    clearCatalogFailure();
    void (async () => {
      const [cat, planetary] = await Promise.allSettled([
        loadBlueprintCatalog(),
        loadPi().catch(() => null),
      ]);
      if (cancelled) return;
      if (cat.status === 'rejected') {
        failCatalog();
        return;
      }
      const load = patchWorkspaceLoad(activeCharacterId, {
        catalog: cat.value,
        pi: planetary.status === 'fulfilled' ? planetary.value : null,
      });
      setCatalog(load.catalog);
      setPi(load.pi);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId, catalogAttempt, failCatalog, clearCatalogFailure]);

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [owned, loadedModifiers] = await Promise.allSettled([
        loadCharacterBlueprints(activeCharacterId),
        loadCharacterModifiers(activeCharacterId, Date.now(), {
          skipQueueWithoutScope: true,
          levels: 'effective',
        }),
      ]);
      if (cancelled) return;
      const previous = lastWorkspaceLoad(activeCharacterId);
      const patch: Parameters<typeof patchWorkspaceLoad>[1] = { characterLoaded: true };
      if (owned.status === 'fulfilled') {
        patch.ownedBlueprints = reuseIfUnchanged(
          previous?.ownedBlueprints,
          owned.value.cached?.data ?? []
        );
        patch.blueprintsNeedsReauth = owned.value.needsReauth;
      }
      if (loadedModifiers.status === 'fulfilled') {
        patch.modifiers = reuseIfUnchanged(previous?.modifiers, loadedModifiers.value);
      }
      const load = patchWorkspaceLoad(activeCharacterId, patch);
      setOwnedBlueprints(load.ownedBlueprints);
      setBlueprintsNeedsReauth(load.blueprintsNeedsReauth);
      setModifiers(load.modifiers);
      setCharacterLoadedFor(activeCharacterId);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  return {
    hydrated,
    activeCharacterId,
    facilityDefaults,
    characterLoaded,
    catalog: characterLoaded ? catalog : null,
    catalogFailed: catalogFailed && catalog === null,
    retryCatalog,
    pi,
    ownedBlueprints,
    blueprintsNeedsReauth,
    modifiers,
    ownedStockSnapshot,
    corpOwnedStock,
    pricingInputs,
    assumedTe,
    buildGroups,
    buildGroupsHydrated,
    setBuildGroups,
  };
}
