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
import type { SkillLevels } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadPi } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterImplants } from '@/features/skills/data';
import { resolveManufacturingTimeImplantBonusPct } from '@/engine/industry/time';
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
  skills: SkillLevels;
  /** The active Character's active-clone BX-80x manufacturing-time implant bonus, if any (issue #1229). */
  implantBonusPct: number;
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
  const [skills, setSkills] = useState<SkillLevels>({});
  const [implantBonusPct, setImplantBonusPct] = useState(0);

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      const [cat, planetary, owned, corrected, implants] = await Promise.all([
        loadBlueprintCatalog(),
        // Only the make-or-buy marker needs this one, so its failure costs a
        // handful of verdicts rather than the whole page.
        loadPi().catch(() => null),
        loadCharacterBlueprints(activeCharacterId),
        loadCorrectedSkills(activeCharacterId, Date.now(), { skipQueueWithoutScope: true }),
        loadCharacterImplants(activeCharacterId),
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
      setImplantBonusPct(resolveManufacturingTimeImplantBonusPct(implants?.data ?? []));
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
    implantBonusPct,
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
