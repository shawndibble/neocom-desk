/**
 * `Industry.tsx`'s detail-pane selection state, given a seam of its own.
 *
 * Owns which of a Build Plan / a Build Group / the Compare table is showing,
 * the `?product=`/`?material=` deep-link resolution that can change that
 * selection (and, for `?product=`, create the plan it points at), and the
 * device-local "last opened plan" fallback chain that decides what shows on
 * a plain visit. Every regression this logic has ever had was a *lifecycle*
 * bug — a stale `useLiveQuery` result, a hydration race causing a double
 * price fetch, an effect calling a setter-calling helper — so the effects
 * and the render-time sync live here too, not just the arithmetic: pulling
 * out only a pure resolver would leave the actual bugs where they were.
 *
 * `plans`, `catalog` and `activeCharacterId` stay owned by the route (Dexie
 * live query, blueprint catalog fetch, active-character store) and are read
 * here rather than re-fetched, so nothing is loaded twice. `createPlan` is
 * injected for the same reason `BuildPlanSeed` matching stays a pure
 * comparison: it lets a test assert "created once, not duplicated" without
 * touching Dexie.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BuildPlanRecord } from '@/db';
import {
  buildPlansByMaterialTypeID,
  type BlueprintCatalog,
  type BlueprintCatalogEntry,
} from '@/features/industry/blueprintCatalog';
import {
  lastOpenedPlanFor,
  useLastOpenedPlan,
  withLastOpenedPlan,
} from '@/features/industry/lastOpenedPlan';
import {
  clearPlanSeed,
  matchesPlanSeed,
  parsePlanSeed,
  type BuildPlanSeed,
} from '@/features/industry/planSeed';

/**
 * What the detail pane is showing.
 *
 * One value rather than a plan id, a group id and a `comparing` boolean kept
 * mutually exclusive by hand: the invariant used to be re-stated at every site
 * that changed any of them, and one that forgot (creating a plan while a group
 * was open) left two selections live, so the new plan silently did not open.
 * Making the states alternatives of one type removes the invariant rather than
 * restating it.
 *
 * Compare *mode* — the row checkboxes — is deliberately not in here. It is
 * orthogonal: the checkboxes stay up while the table is closed, which is the
 * whole "check some, then open" flow, and stays owned by the route.
 */
export type DetailSelection =
  | { kind: 'none' }
  | { kind: 'plan'; planId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'compare' };

export const NO_SELECTION: DetailSelection = { kind: 'none' };

export interface UsePlanSelectionArgs {
  plans: readonly BuildPlanRecord[] | undefined;
  catalog: BlueprintCatalog | null;
  activeCharacterId: number | null;
  /** Writes the plan only — never selects it. See the module doc for why. */
  createPlan: (entry: BlueprintCatalogEntry, seed: BuildPlanSeed | null) => Promise<string | null>;
}

export interface UsePlanSelectionResult {
  selection: DetailSelection;
  selectedGroupId: string | null;
  comparing: boolean;
  /** The explicit selection, else the remembered plan, else the first plan. */
  effectiveSelectedId: string | null;
  selectedPlan: BuildPlanRecord | null;
  selectPlan: (planId: string) => void;
  openGroup: (groupId: string) => void;
  openCompare: () => void;
  /** Unconditionally clears the selection. */
  close: () => void;
  /** Clears the selection only if a Compare table is currently open. */
  closeIfComparing: () => void;
}

export function usePlanSelection({
  plans,
  catalog,
  activeCharacterId,
  createPlan,
}: UsePlanSelectionArgs): UsePlanSelectionResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selection, setSelection] = useState<DetailSelection>(NO_SELECTION);
  const selectedId = selection.kind === 'plan' ? selection.planId : null;
  const selectedGroupId = selection.kind === 'group' ? selection.groupId : null;
  const comparing = selection.kind === 'compare';

  const lastOpened = useLastOpenedPlan((state) => state.value);
  const lastOpenedHydrated = useLastOpenedPlan((state) => state.hydrated);
  const hydrateLastOpened = useLastOpenedPlan((state) => state.hydrate);
  const setLastOpened = useLastOpenedPlan((state) => state.setValue);
  useEffect(() => {
    void hydrateLastOpened();
  }, [hydrateLastOpened]);

  // The Market Browser's item context menu "jump to a Build Plan" action
  // (issue #6) lands here with `?product=<typeId>`. The blueprint this
  // resolves to, and whether the character already has a plan for it, are
  // pure lookups against data already in hand — computed here so the
  // render-time sync below and the effect's create-if-missing branch read
  // the same answer instead of re-deriving it twice.
  const productParam = searchParams.get('product');
  // A BPC Sourcing Offer also sends the copy's own ME/TE/runs (#637). Memoized on
  // `searchParams` — which react-router keeps stable per `location.search` —
  // because the create effect below depends on it: a fresh object every render
  // would re-fire that effect, and it writes to Dexie.
  const planSeed = useMemo(() => parsePlanSeed(searchParams), [searchParams]);
  const pendingEntry =
    productParam && catalog ? (catalog.byProductTypeID.get(Number(productParam)) ?? null) : null;
  // Unseeded, this adopts any plan for the blueprint — the Market Browser,
  // Assets and appraised-row behaviour, unchanged. Seeded, the plan must also
  // hold the Offer's three numbers: a plan for the same blueprint at other
  // research is left alone and the seeded one is created beside it, while
  // browsing back to the same Offer reuses what the first click created.
  const pendingExistingPlan =
    pendingEntry && plans
      ? (plans.find(
          (p) =>
            p.blueprintTypeID === pendingEntry.blueprintTypeID &&
            (planSeed === null || matchesPlanSeed(p, planSeed))
        ) ?? null)
      : null;

  // Render-time state adjustment ("Adjusting state when a prop changes",
  // react.dev): once the plan a `?product=` param points at exists — already
  // there, or just created by the effect below once `plans` catches up —
  // adopt it as the selection. Pure and synchronous, so it belongs here
  // rather than in the effect, which React's set-state-in-effect check flags
  // as cascading-render risk for exactly this shape.
  if (pendingExistingPlan && selectedId !== pendingExistingPlan.id) {
    setSelection({ kind: 'plan', planId: pendingExistingPlan.id });
  }

  // Creating a missing plan is a real side effect (a Dexie write), so it
  // stays here — but only the write (`createPlan`, never selects). The param
  // is cleared only once resolved to an existing plan: immediately if one
  // was already there, or once the create above lands and the render-time
  // sync picks it up — so the URL and the selection never disagree about
  // which plan the click was pointing at.
  useEffect(() => {
    if (!productParam || activeCharacterId === null || !plans || !catalog) return;
    if (pendingEntry && !pendingExistingPlan) {
      void createPlan(pendingEntry, planSeed);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('product');
    // Spent along with the param it rode in on: `?material=` below preserves
    // whatever it does not delete, so a leftover seed would ride onto an
    // unrelated navigation.
    clearPlanSeed(next);
    setSearchParams(next, { replace: true });
  }, [
    productParam,
    activeCharacterId,
    plans,
    catalog,
    pendingEntry,
    pendingExistingPlan,
    planSeed,
    searchParams,
    setSearchParams,
    createPlan,
  ]);

  // Assets' item context menu "View in Industry as material" action (issue
  // #414) lands here with `?material=<typeId>`. Unlike `?product=`, this
  // never creates a plan — the action only renders when at least one of the
  // character's own plans already consumes that material, so it just
  // selects that plan.
  const materialParam = searchParams.get('material');
  const materialPlanByTypeID = useMemo(
    () => (plans && catalog ? buildPlansByMaterialTypeID(plans, catalog) : null),
    [plans, catalog]
  );
  const materialPlan = materialParam
    ? (materialPlanByTypeID?.get(Number(materialParam)) ?? null)
    : null;

  if (materialPlan && selectedId !== materialPlan.id) {
    setSelection({ kind: 'plan', planId: materialPlan.id });
  }

  useEffect(() => {
    if (!materialParam || !plans || !catalog) return;
    const next = new URLSearchParams(searchParams);
    next.delete('material');
    setSearchParams(next, { replace: true });
  }, [materialParam, plans, catalog, searchParams, setSearchParams]);

  // Derived, not effect-synced: the explicit selection, else the plan this
  // Character had open last, else the first plan (first ever visit, or the
  // remembered one was deleted — here or on another device).
  const effectiveSelectedId = useMemo(() => {
    if (!plans) return null;
    // A group is showing, so the first-plan fallback below must not also pick
    // a plan — it would mark a row selected under the group's own rollup and
    // fetch market prices for a plan nobody opened.
    if (selection.kind === 'group') return null;
    if (selectedId && plans.some((p) => p.id === selectedId)) return selectedId;
    // Nothing until the memory has been read: the settings row and the Dexie
    // plan query race, and taking the first-plan fallback before the answer
    // arrives mounts the wrong plan, then swaps — a `key={plan.id}` remount
    // and a second price fetch for a plan the pilot never asked for. A failed
    // read still settles `hydrated`, so this cannot stall.
    if (!lastOpenedHydrated) return null;
    const remembered =
      activeCharacterId === null ? null : lastOpenedPlanFor(lastOpened, activeCharacterId);
    if (remembered && plans.some((p) => p.id === remembered)) return remembered;
    return plans[0]?.id ?? null;
  }, [plans, selection, selectedId, lastOpened, lastOpenedHydrated, activeCharacterId]);

  const selectedPlan = useMemo(
    () => plans?.find((p) => p.id === effectiveSelectedId) ?? null,
    [plans, effectiveSelectedId]
  );

  // Recorded from the effective selection rather than from each place that
  // sets one: the `?product=`/`?material=` deep links and the first-plan
  // fallback are openings too, and the narrow-screen back control — which
  // clears the selection to show the list again — is not a change of plan and
  // must not erase the memory. Waits for hydration, so the stored map is the
  // one being added to rather than an empty default overwriting it.
  useEffect(() => {
    if (!lastOpenedHydrated || activeCharacterId === null) return;
    // Against the plan, not the id: filing one pilot's plan under another's
    // name loses the memory this map exists to keep apart, so the ownership
    // the stamped query already guarantees is worth restating cheaply here.
    if (selectedPlan?.characterId !== activeCharacterId) return;
    if (lastOpenedPlanFor(lastOpened, activeCharacterId) === selectedPlan.id) return;
    void setLastOpened(withLastOpenedPlan(lastOpened, activeCharacterId, selectedPlan.id));
  }, [lastOpenedHydrated, lastOpened, activeCharacterId, selectedPlan, setLastOpened]);

  const selectPlan = useCallback((planId: string) => {
    setSelection({ kind: 'plan', planId });
  }, []);
  const openGroup = useCallback((groupId: string) => {
    setSelection({ kind: 'group', groupId });
  }, []);
  const openCompare = useCallback(() => {
    setSelection({ kind: 'compare' });
  }, []);
  const close = useCallback(() => {
    setSelection(NO_SELECTION);
  }, []);
  const closeIfComparing = useCallback(() => {
    setSelection((current) => (current.kind === 'compare' ? NO_SELECTION : current));
  }, []);

  return {
    selection,
    selectedGroupId,
    comparing,
    effectiveSelectedId,
    selectedPlan,
    selectPlan,
    openGroup,
    openCompare,
    close,
    closeIfComparing,
  };
}
