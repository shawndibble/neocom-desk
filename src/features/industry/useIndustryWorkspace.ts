/**
 * Data every Industry route needs, regardless of which of the three pages
 * it's on (`/industry`, `/industry/plans/:id`, `/industry/groups/:id`) —
 * extracted from what used to be one `Industry.tsx` mounting all three at
 * once. Each page calls this independently rather than sharing a layout
 * route: this codebase's routes are a flat path -> element map (see
 * `App.tsx`), not a nested `<Route>`/`<Outlet>` tree, and every load here
 * (`loadBlueprintCatalog`, `loadPi`, ...) is already cache-backed, so paying
 * for it again on navigation between Industry pages is cheap.
 */
import { useEffect, useMemo, useState } from 'react';
import { hydrateActivityFacilityDefaults, useFacilityDefaults } from './facilityDefaults';
import { useReactionFacilityDefaults } from './reactionFacilityDefaults';
import type { ActivityFacilityDefaults } from './facilityDefaults';
import { useActiveCharacter } from '@/stores/activeCharacter';
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
import { useCorpOwnedStockSource, type CorpOwnedStockState } from './corpOwnedStock';
import { useCorpOwnedBlueprints, type CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import { useBuildGroups } from './buildGroups';
import { useAssumedMe } from './assumedMe';
import { useAssumedTe } from './assumedTe';
import type { OwnedStockSnapshot } from './ownedStockDetection';

export interface IndustryWorkspace {
  hydrated: boolean;
  activeCharacterId: number | null;
  /** One default per activity — see `ActivityFacilityDefaults`. */
  facilityDefaults: ActivityFacilityDefaults;
  catalog: BlueprintCatalog | null;
  pi: PiData | null;
  ownedBlueprints: CharacterBlueprint[];
  blueprintsNeedsReauth: boolean;
  /** The active Character's skills + implants (issue #1284). Stable identity per Character load. */
  modifiers: CharacterModifiers;
  ownedStockSnapshot: OwnedStockSnapshot;
  corpOwnedStock: CorpOwnedStockState;
  corpOwnedBlueprints: CorpOwnedBlueprintsState;
  assumedMe: number;
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
  const corpOwnedBlueprints = useCorpOwnedBlueprints();

  const buildGroups = useBuildGroups((state) => state.value);
  const buildGroupsHydrated = useBuildGroups((state) => state.hydrated);
  const hydrateBuildGroups = useBuildGroups((state) => state.hydrate);
  const setBuildGroups = useBuildGroups((state) => state.setValue);
  const assumedMe = useAssumedMe((state) => state.value);
  const hydrateAssumedMe = useAssumedMe((state) => state.hydrate);
  const assumedTe = useAssumedTe((state) => state.value);
  const hydrateAssumedTe = useAssumedTe((state) => state.hydrate);
  useEffect(() => {
    void hydrateBuildGroups();
    void hydrateAssumedMe();
    void hydrateAssumedTe();
  }, [hydrateBuildGroups, hydrateAssumedMe, hydrateAssumedTe]);

  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  const [pi, setPi] = useState<PiData | null>(null);
  const [ownedBlueprints, setOwnedBlueprints] = useState<CharacterBlueprint[]>([]);
  const [blueprintsNeedsReauth, setBlueprintsNeedsReauth] = useState(false);
  const [modifiers, setModifiers] = useState<CharacterModifiers>(NO_CHARACTER_MODIFIERS);

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [cat, planetary, owned, loadedModifiers] = await Promise.all([
        loadBlueprintCatalog(),
        // Only the make-or-buy marker needs this one, so its failure costs a
        // handful of verdicts rather than the whole page.
        loadPi().catch(() => null),
        loadCharacterBlueprints(activeCharacterId),
        loadCharacterModifiers(activeCharacterId, Date.now(), { skipQueueWithoutScope: true }),
      ]);
      if (cancelled) return;
      setCatalog(cat);
      setPi(planetary);
      setOwnedBlueprints(owned.cached?.data ?? []);
      setBlueprintsNeedsReauth(owned.needsReauth);
      setModifiers(loadedModifiers);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  return {
    hydrated,
    activeCharacterId,
    facilityDefaults,
    catalog,
    pi,
    ownedBlueprints,
    blueprintsNeedsReauth,
    modifiers,
    ownedStockSnapshot,
    corpOwnedStock,
    corpOwnedBlueprints,
    assumedMe,
    assumedTe,
    buildGroups,
    buildGroupsHydrated,
    setBuildGroups,
  };
}
