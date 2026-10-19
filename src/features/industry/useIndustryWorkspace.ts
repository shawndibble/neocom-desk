/**
 * Data every Industry route needs, regardless of which of the three pages
 * it's on (`/industry`, `/industry/plans/:id`, `/industry/groups/:id`) —
 * extracted from what used to be one `Industry.tsx` mounting all three at
 * once. Each page calls this independently rather than sharing a layout
 * route: this codebase's routes are a flat path -> element map (see
 * `App.tsx`), not a nested `<Route>`/`<Outlet>` tree. A page mounting for the
 * same Character starts from the last page's load (`workspaceLoadCache.ts`)
 * and refreshes behind it, so opening a plan never waits on loads the index
 * just finished.
 */
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
  /** One default per activity — see `ActivityFacilityDefaults`. */
  facilityDefaults: ActivityFacilityDefaults;
  catalog: BlueprintCatalog | null;
  /** The catalog couldn't load (no copy on this device and no connection). `retryCatalog` tries again. */
  /** The Character's own reads (blueprints, skills) have settled, whether or not they succeeded. */
  characterLoaded: boolean;
  catalogFailed: boolean;
  retryCatalog: () => void;
  pi: PiData | null;
  ownedBlueprints: CharacterBlueprint[];
  blueprintsNeedsReauth: boolean;
  /** The active Character's skills + implants (issue #1284). Stable identity per Character load. */
  modifiers: CharacterModifiers;
  ownedStockSnapshot: OwnedStockSnapshot;
  corpOwnedStock: CorpOwnedStockState;
  /**
   * Everything a Build Plan is priced against beyond the fields above
   * (`buildPlanPricingInputs.ts`), for the active Character. Loaded here, above
   * the open plan's remount boundary, so switching plans never reloads it.
   */
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

  // Read once, on mount: every field below starts from the same load.
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

  // The static data (catalog, Planetary Industry) loads apart from the
  // Character's own, so one failing never discards the other: before this a
  // rejected catalog threw away the owned blueprints and modifiers with it and
  // left every Industry page on a spinner.
  const {
    failed: catalogFailed,
    attempt: catalogAttempt,
    fail: failCatalog,
    clear: clearCatalogFailure,
    retry: retryCatalog,
  } = useRetryableLoad();
  // Pages price from `catalog`, so it stays hidden until the Character's own
  // reads have settled too: otherwise a catalog that lands first (it often
  // resolves in a microtask) prices everything with no skills or blueprints,
  // and the numbers jump when they arrive.
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
        // Only the make-or-buy marker needs this one, so its failure costs a
        // handful of verdicts rather than the whole page.
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
        // Effective levels (issue #1236): an alpha or lapsed-omega clone can't
        // use a level industry math would otherwise credit in full.
        loadCharacterModifiers(activeCharacterId, Date.now(), {
          skipQueueWithoutScope: true,
          levels: 'effective',
        }),
      ]);
      if (cancelled) return;
      // Diffed against the load this mount started from, so a refresh that
      // changed nothing keeps each value's identity and doesn't re-price. A
      // read that failed keeps what the page already has.
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
