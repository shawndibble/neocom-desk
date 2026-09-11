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
import { useEffect, useState } from 'react';
import { useFacilityDefaults } from './facilityDefaults';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { SkillLevels } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadPi } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadBlueprintCatalog, type BlueprintCatalog } from './blueprintCatalog';
import { loadCharacterBlueprints } from './data';
import { useOwnedStockSnapshot } from './useDetectedOwnedStock';
import { useCorpOwnedStockSource, type CorpOwnedStockState } from './corpOwnedStock';
import { useBuildGroups } from './buildGroups';
import { useAssumedMe } from './assumedMe';
import { useAssumedTe } from './assumedTe';
import type { OwnedStockSnapshot } from './ownedStockDetection';

export interface IndustryWorkspace {
  hydrated: boolean;
  activeCharacterId: number | null;
  facilityDefaults: ReturnType<typeof useFacilityDefaults.getState>['value'];
  catalog: BlueprintCatalog | null;
  pi: PiData | null;
  ownedBlueprints: CharacterBlueprint[];
  blueprintsNeedsReauth: boolean;
  skills: SkillLevels;
  ownedStockSnapshot: OwnedStockSnapshot;
  corpOwnedStock: CorpOwnedStockState;
  assumedMe: number;
  assumedTe: number;
  buildGroups: ReturnType<typeof useBuildGroups.getState>['value'];
  buildGroupsHydrated: boolean;
  setBuildGroups: ReturnType<typeof useBuildGroups.getState>['setValue'];
}

export function useIndustryWorkspace(): IndustryWorkspace {
  const facilityDefaults = useFacilityDefaults((state) => state.value);
  const hydrateFacilityDefaults = useFacilityDefaults((state) => state.hydrate);
  useEffect(() => {
    void hydrateFacilityDefaults();
  }, [hydrateFacilityDefaults]);

  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);

  const ownedStockSnapshot = useOwnedStockSnapshot();
  const corpOwnedStock = useCorpOwnedStockSource();

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
  const [skills, setSkills] = useState<SkillLevels>({});

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [cat, planetary, owned, corrected] = await Promise.all([
        loadBlueprintCatalog(),
        // Only the make-or-buy marker needs this one, so its failure costs a
        // handful of verdicts rather than the whole page.
        loadPi().catch(() => null),
        loadCharacterBlueprints(activeCharacterId),
        loadCorrectedSkills(activeCharacterId, Date.now(), { skipQueueWithoutScope: true }),
      ]);
      if (cancelled) return;
      setCatalog(cat);
      setPi(planetary);
      setOwnedBlueprints(owned.cached?.data ?? []);
      setBlueprintsNeedsReauth(owned.needsReauth);
      // /skills lags until the character logs in; completed queue entries are
      // the difference. Without them industry math undercounts skills.
      const map: SkillLevels = {};
      for (const [skillId, trained] of corrected.trained) map[skillId] = trained.level;
      setSkills(map);
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
    skills,
    ownedStockSnapshot,
    corpOwnedStock,
    assumedMe,
    assumedTe,
    buildGroups,
    buildGroupsHydrated,
    setBuildGroups,
  };
}
