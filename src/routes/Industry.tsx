import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFacilityDefaults } from '@/features/industry/facilityDefaults';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BuildPlanRecord } from '@/db';
import { markBuildPlanDeleted, scheduleSync } from '@/sync';
import {
  Button,
  EmptyState,
  Modal,
  PageHeader,
  Panel,
  ReauthBanner,
  Spinner,
  Tabs,
} from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginEveLogin } from '@/app/loginFlow';
import { useIsDesktop } from '@/lib/useIsDesktop';
import type { MaterialSourcing, OwnedStockScope, SkillLevels } from '@/engine/industry/types';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { DepthChoice } from '@/features/industry/CraftSweepControl';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadPi } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import {
  buildPlansByMaterialTypeID,
  loadBlueprintCatalog,
  type BlueprintCatalog,
  type BlueprintCatalogEntry,
} from '@/features/industry/blueprintCatalog';
import { findOwnedBlueprint, loadCharacterBlueprints } from '@/features/industry/data';
import { useOwnedStockSnapshot } from '@/features/industry/useDetectedOwnedStock';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { useQuickbar } from '@/features/market/useQuickbar';
import { ActiveJobsPanel } from '@/features/industry/ActiveJobsPanel';
import { BuildPlanList } from '@/features/industry/BuildPlanList';
import { BuildPlanCompare } from '@/features/industry/BuildPlanCompare';
import { OpportunitiesPanel } from '@/features/industry/OpportunitiesPanel';
import {
  planForOpportunityCandidate,
  type OpportunityRow,
} from '@/features/industry/opportunities';
import { ProductionLogPanel } from '@/features/industry/ProductionLogPanel';
import { BpcSourcingPanel } from '@/features/bpcContracts/BpcSourcingPanel';
import {
  BuildPlanDetail,
  type PlanPatch,
  type SourcingPatchEntry,
} from '@/features/industry/BuildPlanDetail';
import { saveSourcingEdit } from '@/features/industry/sourcingEdits';
import {
  lastOpenedPlanFor,
  useLastOpenedPlan,
  withLastOpenedPlan,
} from '@/features/industry/lastOpenedPlan';
import { mostRecentlyUpdatedPlan, newBuildPlan } from '@/features/industry/newBuildPlan';
import {
  clearPlanSeed,
  matchesPlanSeed,
  parsePlanSeed,
  type BuildPlanSeed,
} from '@/features/industry/planSeed';
import {
  addBuildGroup,
  buildGroupsFor,
  renameBuildGroup,
  useBuildGroups,
  withGroupCraftSweepDefault,
  withGroupOwnedStock,
  withGroupOwnedStockScope,
  type BuildGroupSnapshot,
} from '@/features/industry/buildGroups';
import {
  deleteBuildGroup,
  moveBuildPlanToGroup,
  retargetBuildGroup,
} from '@/features/industry/buildGroupActions';
import { useExpandedGroups, withGroupExpanded } from '@/features/industry/expandedGroups';
import { BuildGroupPanel } from '@/features/industry/BuildGroupPanel';
import { applyGroupCraftSweep } from '@/features/industry/craftSweepGroup';
import { FitImportDialog } from '@/features/industry/FitImportDialog';
import { applyFitImport, fitImportGroupName } from '@/features/industry/fitImport';
import { useAssumedMe } from '@/features/industry/assumedMe';
import { useAssumedTe } from '@/features/industry/assumedTe';
import type { FitToBuildPlansResult } from '@/engine/import/fitToBuildPlans';

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
 * whole "check some, then open" flow.
 */
type DetailSelection =
  | { kind: 'none' }
  | { kind: 'plan'; planId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'compare' };

const NO_SELECTION: DetailSelection = { kind: 'none' };

type IndustryTab = 'plans' | 'records' | 'sourcing' | 'opportunities';

/** An unknown or absent `?tab=` falls back to Plans rather than rendering nothing — a stale or hand-edited link should land somewhere useful. */
function readIndustryTab(value: string | null): IndustryTab {
  return value === 'records' || value === 'sourcing' || value === 'opportunities' ? value : 'plans';
}

/** Build Plan manager: create (via blueprint search)/duplicate/delete/rename plans, edit the selected one. */
export function Industry() {
  const { t } = useTranslation();
  // Only consulted for a character's first plan, or one whose previous plan
  // hosts a different activity — `newBuildPlan` carries everything forward
  // from the most recent plan otherwise (issue #456).
  const facilityDefaults = useFacilityDefaults((state) => state.value);
  const hydrateFacilityDefaults = useFacilityDefaults((state) => state.hydrate);
  useEffect(() => {
    void hydrateFacilityDefaults();
  }, [hydrateFacilityDefaults]);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [searchParams, setSearchParams] = useSearchParams();
  /**
   * In the URL, unlike the other two tabs' history, because `/bpc-contracts`
   * redirects to `?tab=sourcing` — a deep link needs somewhere to land, and a
   * tab held only in component state has no address to give it.
   */
  const tab = readIndustryTab(searchParams.get('tab'));
  const setTab = useCallback(
    (next: IndustryTab) => {
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          // Plans is the default, so it stays out of the URL rather than
          // leaving `?tab=plans` on every visit that never touched the strip.
          if (next === 'plans') params.delete('tab');
          else params.set('tab', next);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Stamped with the Character it was read for, because `useLiveQuery` holds
  // its previous result in a ref across a deps change: for one render after
  // the active Character changes, the rows belong to the Character who just
  // left. Unstamped, every consumer below has to re-derive that — and the one
  // that mounts `BuildPlanDetail` would open a plan this pilot does not own
  // and fetch market prices for its materials, only to remount a tick later.
  const plansQuery = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return {
      characterId: activeCharacterId,
      rows: await db.buildPlans.where('characterId').equals(activeCharacterId).toArray(),
    };
  }, [activeCharacterId]);
  // `undefined` means "not read yet" for the incoming Character exactly as it
  // does on a first load, so every consumer's existing loading path covers it.
  const plans = plansQuery?.characterId === activeCharacterId ? plansQuery.rows : undefined;

  // The materials table's item context menu (CONTEXT.md round 26) writes the
  // same Quickbar record the Market Browser and Assets do, and opens the same
  // Item Detail modal — which stays mounted at the route, not inside
  // `BuildPlanDetail`, so switching plans while it is open doesn't tear it down.
  const quickbar = useQuickbar(activeCharacterId);
  const [infoModalItem, setInfoModalItem] = useState<{ typeId: number; itemName: string } | null>(
    null
  );

  // Loaded once here, above BuildPlanDetail's `key={plan.id}` remount below —
  // switching plans must not redo the whole-account asset load (issue #409).
  const ownedStockSnapshot = useOwnedStockSnapshot();

  // Build Groups (issue #626). Names/order/existence sync as one setting;
  // membership is `buildGroupId` on each plan. Which groups are *open* is
  // device-local — a phone left collapsed must not fold up the desktop.
  const buildGroups = useBuildGroups((state) => state.value);
  const buildGroupsHydrated = useBuildGroups((state) => state.hydrated);
  const hydrateBuildGroups = useBuildGroups((state) => state.hydrate);
  const setBuildGroups = useBuildGroups((state) => state.setValue);
  const expandedGroups = useExpandedGroups((state) => state.value);
  const expandedGroupsHydrated = useExpandedGroups((state) => state.hydrated);
  const hydrateExpandedGroups = useExpandedGroups((state) => state.hydrate);
  const setExpandedGroups = useExpandedGroups((state) => state.setValue);
  const assumedMe = useAssumedMe((state) => state.value);
  const hydrateAssumedMe = useAssumedMe((state) => state.hydrate);
  const assumedTe = useAssumedTe((state) => state.value);
  const hydrateAssumedTe = useAssumedTe((state) => state.hydrate);
  useEffect(() => {
    void hydrateBuildGroups();
    void hydrateExpandedGroups();
    void hydrateAssumedMe();
    void hydrateAssumedTe();
  }, [hydrateBuildGroups, hydrateExpandedGroups, hydrateAssumedMe, hydrateAssumedTe]);

  const [selection, setSelection] = useState<DetailSelection>(NO_SELECTION);
  // Read back as the three things the pane below actually asks about. The tag
  // is what keeps a group id out of `lastOpenedPlan`, which matches whatever
  // it is given against the Character's own plans and would hold a group id
  // as dead weight for ever.
  const selectedId = selection.kind === 'plan' ? selection.planId : null;
  const selectedGroupId = selection.kind === 'group' ? selection.groupId : null;
  const comparing = selection.kind === 'compare';
  const [fitImportOpen, setFitImportOpen] = useState(false);
  // Only ever set for a group that still has members: deleting an empty one
  // destroys nothing, and a dialog asking about plans it does not have would
  // be a worse answer than just doing it.
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  // Which plan this Character had open last time (device-local). Read only
  // through `effectiveSelectedId` below, never written into `selectedId`
  // itself: `selectedId` also decides which column a narrow screen shows, and
  // reopening a plan must not stop a phone landing on the list.
  const lastOpened = useLastOpenedPlan((state) => state.value);
  const lastOpenedHydrated = useLastOpenedPlan((state) => state.hydrated);
  const hydrateLastOpened = useLastOpenedPlan((state) => state.hydrate);
  const setLastOpened = useLastOpenedPlan((state) => state.setValue);
  useEffect(() => {
    void hydrateLastOpened();
  }, [hydrateLastOpened]);
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  // Planetary schematics, for the materials table's make-or-buy marker. Loaded
  // beside the catalog so both are in place before a plan first renders — a
  // late arrival would widen the price fetch's type list and refire it.
  const [pi, setPi] = useState<PiData | null>(null);
  const [ownedBlueprints, setOwnedBlueprints] = useState<CharacterBlueprint[]>([]);
  const [blueprintsNeedsReauth, setBlueprintsNeedsReauth] = useState(false);
  const [skills, setSkills] = useState<SkillLevels>({});

  // Compare mode (issue #453): the list shows a checkbox per row while
  // `compareMode` is on, and `comparing` swaps the detail pane over to
  // `BuildPlanCompare` for the checked plans. Kept as three separate pieces
  // (mode/selection/open) rather than one, because unchecking down to a
  // single plan while the table is open should show a "need 2+" hint, not
  // silently fall back to `selectedPlan`'s detail — only the explicit
  // `exitCompare` action (the compare view's "Done", or the back control)
  // does that.
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelectedIds, setCompareSelectedIds] = useState<ReadonlySet<string>>(new Set());

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

  // Writes the plan only — never selects it. A `useEffect` may call this
  // (see below): React's set-state-in-effect check traces into called
  // functions, so a helper an effect calls must never itself call a
  // `useState` setter, even after an `await`. Callers that need the new
  // plan selected (the blueprint-picker click handler; the render-time sync
  // below) do that themselves, outside the effect.
  const createPlan = useCallback(
    async (
      entry: BlueprintCatalogEntry,
      seed: BuildPlanSeed | null = null
    ): Promise<string | null> => {
      if (activeCharacterId === null) return null;
      const owned = findOwnedBlueprint(ownedBlueprints, entry.blueprintTypeID);
      const plan = newBuildPlan(
        activeCharacterId,
        entry,
        owned,
        mostRecentlyUpdatedPlan(plans),
        facilityDefaults,
        {
          // The same assumed ME and TE Fit Import seeds its plans with (#626,
          // #634). Passed here too so one blueprint cannot start at two
          // different research levels depending on whether it was picked or
          // imported; an owned copy still wins on both paths.
          assumedMe,
          assumedTe,
          // An Offer's own numbers beat both (#637). The name carries them too:
          // the reuse rule below lets a pilot hold a plain plan and one or more
          // seeded plans for one blueprint, and three rows all reading "Rifter"
          // would be unusable. Spelled field by field rather than spread:
          // TypeScript's excess-property check does not see through a spread,
          // so `{ ...seed }` would couple `BuildPlanSeed` to
          // `NewBuildPlanOverrides` by field-name coincidence alone.
          ...(seed
            ? {
                me: seed.me,
                te: seed.te,
                runs: seed.runs,
                name: t('industry.seededPlanName', {
                  name: entry.productName,
                  me: seed.me,
                  te: seed.te,
                  runs: seed.runs,
                }),
              }
            : {}),
        }
      );
      await db.buildPlans.add(plan);
      scheduleSync(activeCharacterId);
      return plan.id;
    },
    // `t` is load-bearing here, not incidental: this callback is a dependency
    // of the create-if-missing effect below, so a `t` whose identity churned
    // would re-fire a Dexie write. react-i18next only re-binds it on
    // `languageChanged`, which cannot happen while the app is English-only —
    // whoever adds a second locale needs to weigh that here.
    [activeCharacterId, ownedBlueprints, plans, facilityDefaults, assumedMe, assumedTe, t]
  );

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
  // clears `selectedId` to show the list again — is not a change of plan and
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

  const comparePlans = useMemo(
    () => plans?.filter((p) => compareSelectedIds.has(p.id)) ?? [],
    [plans, compareSelectedIds]
  );

  const groups = useMemo(
    () => (activeCharacterId === null ? [] : buildGroupsFor(buildGroups, activeCharacterId)),
    [buildGroups, activeCharacterId]
  );
  const expandedGroupIds = useMemo(
    () => new Set(activeCharacterId === null ? [] : (expandedGroups[activeCharacterId] ?? [])),
    [expandedGroups, activeCharacterId]
  );
  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );
  const membersOfGroup = useCallback(
    (groupId: string) => plans?.filter((p) => p.buildGroupId === groupId) ?? [],
    [plans]
  );
  const selectedGroupPlans = useMemo(
    () => (selectedGroupId === null ? [] : membersOfGroup(selectedGroupId)),
    [membersOfGroup, selectedGroupId]
  );
  /** The open plan's group's last Retarget (issue #632), for the quick-fill link. */
  const selectedPlanGroupSnapshot = useMemo(() => {
    const groupId = selectedPlan?.buildGroupId;
    if (groupId === undefined) return null;
    return groups.find((g) => g.id === groupId)?.snapshot ?? null;
  }, [selectedPlan, groups]);
  /**
   * The open plan's own group name, or null when ungrouped (issue #696) — a
   * separate question from `selectedPlanGroupSnapshot`, which is also null
   * for a grouped-but-never-Retargeted plan and so cannot tell the two
   * apart.
   */
  const selectedPlanGroupName = useMemo(() => {
    const groupId = selectedPlan?.buildGroupId;
    if (groupId === undefined) return null;
    return groups.find((g) => g.id === groupId)?.name ?? null;
  }, [selectedPlan, groups]);

  // Narrow screens show one column at a time (CONTEXT.md round 25); matches
  // the grid's own `lg:` breakpoint so the JS-driven visibility and the CSS
  // layout switch at the same width. Gated on the explicit `selectedId`, not
  // `effectiveSelectedId`'s first-plan fallback, so a narrow-screen visitor
  // lands on the list first, same as Mail/SkillPlans, rather than jumping
  // straight to whichever plan the fallback picked. `comparing` participates
  // in the same collapse (issue #453): it is a state of this detail pane, not
  // a separate screen, so opening it on a narrow screen must navigate away
  // from the list exactly like picking a plan does.
  const isDesktop = useIsDesktop();
  const detailVisible = isDesktop || selection.kind !== 'none';
  const showBackControl = !isDesktop && selection.kind !== 'none';

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  async function handleDuplicate(id: string) {
    const source = plans?.find((p) => p.id === id);
    if (!source || activeCharacterId === null) return;
    const copy: BuildPlanRecord = {
      ...source,
      id: crypto.randomUUID(),
      name: t('industry.copySuffix', { name: source.name }),
      updatedAt: Date.now(),
    };
    await db.buildPlans.add(copy);
    scheduleSync(activeCharacterId);
    selectPlan(copy.id);
  }

  async function handleDelete(id: string) {
    // No explicit selection reset needed: effectiveSelectedId falls back
    // automatically once `plans` no longer contains the deleted id.
    // Tombstoned (not plain-deleted) so the remote copy can't resurrect it.
    if (activeCharacterId === null) return;
    await markBuildPlanDeleted(activeCharacterId, id);
    scheduleSync(activeCharacterId);
  }

  async function handleRename(id: string, name: string) {
    await db.buildPlans.update(id, { name, updatedAt: Date.now() });
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
  }

  /**
   * Merges a patch into the stored record inside a transaction, never into
   * `selectedPlan` from this render's closure.
   *
   * A whole-record `put` built on a closure snapshot silently reverts every
   * field the patch does not mention back to whatever they were when that
   * snapshot was taken — which wiped `buildHere` (ten build choices at once)
   * whenever an async write landed with a stale one in hand.
   * `saveSourcingEdit` has always taken this path for exactly this reason.
   *
   * `touch` is the only thing separating the plan's two whole-field writers.
   * A pilot edit bumps `updatedAt`; a correction the app made for itself —
   * today, a security band brought back into line with the plan's build
   * system — deliberately does not. Merely opening a plan is not editing it:
   * bumping the timestamp would make the last plan *viewed* win the "default a
   * new plan from the most recently updated one" rule (#456), and would churn
   * every device's sync for a value the pilot never changed.
   */
  async function writePlanPatch(patch: PlanPatch, touch: boolean) {
    const planId = selectedPlan?.id;
    if (planId === undefined) return;
    await db.transaction('rw', db.buildPlans, async () => {
      const stored = await db.buildPlans.get(planId);
      if (!stored) return;
      await db.buildPlans.put({ ...stored, ...patch, ...(touch ? { updatedAt: Date.now() } : {}) });
    });
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
  }

  async function handleUpdate(patch: PlanPatch) {
    await writePlanPatch(patch, true);
  }

  async function handleDerivedFix(patch: PlanPatch) {
    await writePlanPatch(patch, false);
  }

  /**
   * "Use all" (issue #181), applied one row at a time through the very
   * same write path a typed value takes. Awaited in sequence, not fired in
   * parallel: each `saveSourcingEdit` merges into the record it reads inside
   * its own transaction, so overlapping writes would drop all but the last.
   */
  async function handleSourcingChangeMany(patches: readonly SourcingPatchEntry[]) {
    if (!selectedPlan) return;
    for (const { typeID, patch } of patches) {
      await saveSourcingEdit(selectedPlan.id, typeID, patch);
    }
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
  }

  async function handleSourcingChange(typeID: number, patch: MaterialSourcing) {
    if (!selectedPlan) return;
    await saveSourcingEdit(selectedPlan.id, typeID, patch);
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
  }

  function toggleCompareMode() {
    setCompareMode((wasOn) => {
      // Turning off (from either state) always resets the selection and
      // closes the table — the single exit path "Cancel" and "Done" share.
      if (wasOn) {
        setCompareSelectedIds(new Set());
        setSelection((current) => (current.kind === 'compare' ? NO_SELECTION : current));
      }
      return !wasOn;
    });
  }

  function toggleCompareSelected(id: string) {
    setCompareSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectPlan(planId: string) {
    setSelection({ kind: 'plan', planId });
  }

  /** Opens a group's rollup, and stands the row checkboxes down with it. */
  function selectGroup(groupId: string) {
    clearCompareMode();
    setSelection({ kind: 'group', groupId });
  }

  async function setGroupExpanded(groupId: string, expanded: boolean) {
    if (activeCharacterId === null) return;
    await setExpandedGroups(
      withGroupExpanded(expandedGroups, activeCharacterId, groupId, expanded)
    );
  }

  async function handleCreateGroup() {
    if (activeCharacterId === null) return;
    const id = crypto.randomUUID();
    await setBuildGroups(
      addBuildGroup(buildGroups, activeCharacterId, { id, name: t('industry.newGroupName') })
    );
    // Opened as well as created: a group with nothing in it is the one state
    // where an unopened row tells the pilot nothing at all.
    await setGroupExpanded(id, true);
    selectGroup(id);
  }

  async function handleRenameGroup(groupId: string, name: string) {
    if (activeCharacterId === null) return;
    await setBuildGroups(renameBuildGroup(buildGroups, activeCharacterId, groupId, name));
  }

  /** Asks first, but only when there are plans for the question to be about. */
  function requestDeleteGroup(groupId: string) {
    if (membersOfGroup(groupId).length === 0) void handleDeleteGroup(groupId);
    else setDeletingGroupId(groupId);
  }

  /**
   * Deleting a group orphans its plans; it never cascades.
   *
   * A Build Plan is worth more than its membership — the same call
   * `markBuildPlanDeleted` makes about Production Runs, which it deliberately
   * does not cascade to either. The members reappear in the ungrouped list.
   */
  async function handleDeleteGroup(groupId: string) {
    if (activeCharacterId === null) return;
    setDeletingGroupId(null);
    await deleteBuildGroup(groupId, membersOfGroup(groupId), {
      characterId: activeCharacterId,
      buildGroups,
      setBuildGroups,
    });
    if (selectedGroupId === groupId) setSelection(NO_SELECTION);
  }

  /** Moves one plan between groups, or out of every group when `groupId` is null. */
  async function handleMovePlan(planId: string, groupId: string | null) {
    if (activeCharacterId === null) return;
    await moveBuildPlanToGroup(planId, groupId, activeCharacterId);
    // Into a collapsed group the plan would simply vanish from the list, so
    // the move opens its destination.
    if (groupId !== null) await setGroupExpanded(groupId, true);
  }

  /**
   * Applies a Retarget group's chosen hub/facility/security/build-system to
   * every checked member plan (issue #632). See `buildGroupActions.ts` for
   * the write itself.
   */
  async function handleRetargetGroup(
    groupId: string,
    target: Omit<BuildGroupSnapshot, 'appliedAt'>,
    planIds: readonly string[]
  ) {
    if (activeCharacterId === null) return;
    await retargetBuildGroup(groupId, target, planIds, {
      characterId: activeCharacterId,
      buildGroups,
      setBuildGroups,
    });
  }

  /**
   * Craft Sweep on a Build Group (issue #696): the same one-shot bulk
   * build/buy control from #695, run once per member — each member's own
   * tree walked independently and only its own `buildHere` patched, never a
   * shared tree. The persisted default is written first, from the choice
   * the pilot just confirmed, rather than after the market fetch below: that
   * fetch can take real wall-clock time, and spanning it with the
   * `buildGroups` closure would risk overwriting a concurrent edit to the
   * group with a stale read.
   */
  async function handleCraftSweepGroup(
    groupId: string,
    groupPlans: readonly BuildPlanRecord[],
    options: { strategy: SweepStrategy; depth: number; depthChoice: DepthChoice }
  ) {
    if (activeCharacterId === null || !catalog) return;
    await setBuildGroups(
      withGroupCraftSweepDefault(buildGroups, activeCharacterId, groupId, {
        strategy: options.strategy,
        depthChoice: options.depthChoice,
      })
    );
    const picks = await applyGroupCraftSweep(
      groupPlans,
      catalog,
      pi,
      ownedBlueprints,
      skills,
      assumedMe,
      options
    );
    if (picks.size === 0) return;
    await db.transaction('rw', db.buildPlans, async () => {
      const stored = await db.buildPlans.bulkGet([...picks.keys()]);
      const now = Date.now();
      const updated = stored.flatMap((p) => {
        if (!p) return [];
        const picked = picks.get(p.id);
        return picked ? [{ ...p, buildHere: [...picked], updatedAt: now }] : [];
      });
      await db.buildPlans.bulkPut(updated);
    });
    scheduleSync(activeCharacterId);
  }

  /** Group Owned Overlay (issue #697): writes the group's own owned-stock ledger wholesale. */
  async function handleGroupOwnedStockChange(groupId: string, ownedStock: Record<number, number>) {
    if (activeCharacterId === null) return;
    await setBuildGroups(withGroupOwnedStock(buildGroups, activeCharacterId, groupId, ownedStock));
  }

  /** @see handleGroupOwnedStockChange */
  async function handleGroupOwnedStockScopeChange(
    groupId: string,
    scope: OwnedStockScope | undefined
  ) {
    if (activeCharacterId === null) return;
    await setBuildGroups(withGroupOwnedStockScope(buildGroups, activeCharacterId, groupId, scope));
  }

  /** Creates a group and one plan per buildable item in a pasted fit, then opens it. */
  async function handleFitImport(preview: FitToBuildPlansResult) {
    if (activeCharacterId === null || !catalog) return;
    const result = await applyFitImport(preview, {
      characterId: activeCharacterId,
      catalog,
      ownedBlueprints,
      defaultsFrom: mostRecentlyUpdatedPlan(plans),
      facilityDefaults,
      assumedMe,
      assumedTe,
      buildGroups,
      setBuildGroups,
      groupName: fitImportGroupName(preview, {
        withHull: (fit, ship) => t('industry.fitImportGroupName', { fit, ship }),
        untitled: t('industry.newGroupName'),
      }),
    });
    if (!result) return;
    await setGroupExpanded(result.groupId, true);
    setFitImportOpen(false);
    selectGroup(result.groupId);
  }

  /**
   * Build Opportunities' "Add to Compare" (issue #642): seeds real,
   * persisted Build Plans from the selected ranked rows, priced at the same
   * owned-materials claim that ranked them, then hands the pilot straight to
   * Compare. `OpportunitiesPanel` only lets the active Character's own rows
   * be selected, so every seeded plan belongs here — no cross-character
   * `scheduleSync` fan-out needed.
   */
  async function handleAddOpportunitiesToCompare(rows: readonly OpportunityRow[]) {
    if (activeCharacterId === null || rows.length === 0) return;
    const newPlans = rows.map((row) =>
      planForOpportunityCandidate(
        row.candidate,
        facilityDefaults,
        row.materialSourcing,
        row.buildHere
      )
    );
    await db.buildPlans.bulkAdd(newPlans);
    scheduleSync(activeCharacterId);
    setCompareSelectedIds(new Set(newPlans.map((p) => p.id)));
    setSelection({ kind: 'compare' });
    setTab('plans');
  }

  function clearCompareMode() {
    setCompareMode(false);
    setCompareSelectedIds(new Set());
  }

  function exitCompare() {
    clearCompareMode();
    setSelection(NO_SELECTION);
  }

  /**
   * Records tab row click: jump to the run's own Build Plan on the Build
   * Plans tab. Exits Compare first — otherwise the detail pane's own
   * `comparing` branch (checked before `selectedPlan`) would keep showing
   * the compare table instead of the run's plan if Compare was left open.
   */
  function openRunFromRecords(buildPlanId: string) {
    exitCompare();
    // A plan inside a collapsed group has no row on screen, so selecting it
    // would look like the click did nothing. Open its group first.
    const groupId = plans?.find((p) => p.id === buildPlanId)?.buildGroupId;
    if (groupId !== undefined) void setGroupExpanded(groupId, true);
    selectPlan(buildPlanId);
    setTab('plans');
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={t('nav.industry')} />
      <ActiveJobsPanel
        characterId={activeCharacterId}
        onAddToQuickbar={quickbar.add}
        quickbarAvailable={quickbar.available}
        onShowInfo={(typeId, itemName) => setInfoModalItem({ typeId, itemName })}
      />

      {blueprintsNeedsReauth && (
        <Panel title={t('industry.blueprintsTitle')}>
          <ReauthBanner
            title={t('industry.blueprintsReauthTitle')}
            hint={t('industry.blueprintsReauthHint')}
            actionLabel={t('industry.blueprintsReauthAction')}
            onLogin={() => void beginEveLogin()}
          />
        </Panel>
      )}

      {!plans || !catalog || !buildGroupsHydrated || !expandedGroupsHydrated ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <>
          <Tabs
            label={t('nav.industry')}
            value={tab}
            onChange={(id) => setTab(id as IndustryTab)}
            tabs={[
              { id: 'plans', label: t('industry.buildPlansTab') },
              { id: 'records', label: t('industry.recordsTab') },
              { id: 'sourcing', label: t('industry.bpcSearchTab') },
              { id: 'opportunities', label: t('industry.opportunitiesTab') },
            ]}
          />

          {tab === 'sourcing' ? (
            <BpcSourcingPanel />
          ) : tab === 'opportunities' ? (
            <OpportunitiesPanel
              catalog={catalog}
              pi={pi}
              skills={skills}
              facilityDefaults={facilityDefaults}
              activeCharacterId={activeCharacterId}
              ownedStockSnapshot={ownedStockSnapshot}
              onAddToCompare={(rows) => void handleAddOpportunitiesToCompare(rows)}
            />
          ) : tab === 'records' ? (
            <ProductionLogPanel
              characterId={activeCharacterId}
              catalog={catalog}
              skills={skills}
              plans={plans}
              onOpenRun={openRunFromRecords}
            />
          ) : (
            // `lg:items-start`: grid items stretch to the row's height by
            // default, so without this the list column (often just a couple
            // of short rows) gets pulled up to match the detail column's
            // full height, rendering as a tall, mostly-empty box.
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
              <Panel className={isDesktop || !detailVisible ? '' : 'hidden'}>
                <BuildPlanList
                  plans={plans}
                  catalog={catalog}
                  // Only mark a row selected when its detail is actually on
                  // screen: the first-plan fallback would otherwise leave a row
                  // highlighted on a narrow screen with nothing open.
                  selectedId={detailVisible ? effectiveSelectedId : null}
                  onSelect={selectPlan}
                  onCreate={(entry) =>
                    void createPlan(entry).then((id) => {
                      if (id) selectPlan(id);
                    })
                  }
                  onDuplicate={(id) => void handleDuplicate(id)}
                  onDelete={(id) => void handleDelete(id)}
                  onRename={(id, name) => void handleRename(id, name)}
                  compareMode={compareMode}
                  compareSelectedIds={compareSelectedIds}
                  onToggleCompareMode={toggleCompareMode}
                  onToggleCompareSelected={toggleCompareSelected}
                  onOpenCompare={() => setSelection({ kind: 'compare' })}
                  groups={groups}
                  expandedGroupIds={expandedGroupIds}
                  selectedGroupId={detailVisible ? selectedGroupId : null}
                  onToggleGroup={(groupId) =>
                    void setGroupExpanded(groupId, !expandedGroupIds.has(groupId))
                  }
                  onSelectGroup={selectGroup}
                  onCreateGroup={() => void handleCreateGroup()}
                  onRenameGroup={(groupId, name) => void handleRenameGroup(groupId, name)}
                  onDeleteGroup={requestDeleteGroup}
                  onMovePlan={(planId, groupId) => void handleMovePlan(planId, groupId)}
                  onOpenFitImport={() => setFitImportOpen(true)}
                />
              </Panel>

              <article className={`space-y-2 ${detailVisible ? '' : 'hidden'}`}>
                {showBackControl && (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (comparing) exitCompare();
                      else setSelection(NO_SELECTION);
                    }}
                  >
                    {t('industry.backToList')}
                  </Button>
                )}
                <div className="space-y-4">
                  {!detailVisible ? null : selectedGroup ? (
                    <BuildGroupPanel
                      key={selectedGroup.id}
                      group={selectedGroup}
                      plans={selectedGroupPlans}
                      catalog={catalog}
                      pi={pi}
                      ownedBlueprints={ownedBlueprints}
                      skills={skills}
                      ownedStockSnapshot={ownedStockSnapshot}
                      onOpenPlan={selectPlan}
                      onRetarget={(target, planIds) =>
                        void handleRetargetGroup(selectedGroup.id, target, planIds)
                      }
                      onCraftSweep={(options) =>
                        handleCraftSweepGroup(selectedGroup.id, selectedGroupPlans, options)
                      }
                      onOwnedStockChange={(ownedStock) =>
                        void handleGroupOwnedStockChange(selectedGroup.id, ownedStock)
                      }
                      onOwnedStockScopeChange={(scope) =>
                        void handleGroupOwnedStockScopeChange(selectedGroup.id, scope)
                      }
                    />
                  ) : comparing ? (
                    comparePlans.length >= 2 ? (
                      <BuildPlanCompare
                        plans={comparePlans}
                        catalog={catalog}
                        pi={pi}
                        ownedBlueprints={ownedBlueprints}
                        skills={skills}
                        onDone={exitCompare}
                      />
                    ) : (
                      <EmptyState
                        title={t('industry.compareNeedMore')}
                        hint={t('industry.compareNeedMoreHint')}
                        action={
                          <Button size="sm" onClick={exitCompare}>
                            {t('industry.compareDone')}
                          </Button>
                        }
                      />
                    )
                  ) : selectedPlan ? (
                    <BuildPlanDetail
                      key={selectedPlan.id}
                      plan={selectedPlan}
                      catalog={catalog}
                      pi={pi}
                      ownedBlueprints={ownedBlueprints}
                      skills={skills}
                      ownedStockSnapshot={ownedStockSnapshot}
                      onUpdate={(patch) => void handleUpdate(patch)}
                      onDerivedFix={(patch) => void handleDerivedFix(patch)}
                      onSourcingChange={(typeID, patch) => void handleSourcingChange(typeID, patch)}
                      onSourcingChangeMany={(patches) => void handleSourcingChangeMany(patches)}
                      onAddToQuickbar={quickbar.add}
                      quickbarAvailable={quickbar.available}
                      onShowInfo={(typeId, itemName) => setInfoModalItem({ typeId, itemName })}
                      groupSnapshot={selectedPlanGroupSnapshot}
                      groupName={selectedPlanGroupName}
                    />
                  ) : plans.length > 0 ? (
                    <div className="flex justify-center py-8">
                      <Spinner label={t('common.loading')} />
                    </div>
                  ) : (
                    <EmptyState title={t('industry.selectHint')} />
                  )}
                </div>
              </article>
            </div>
          )}
        </>
      )}

      <Modal
        open={deletingGroupId !== null}
        onClose={() => setDeletingGroupId(null)}
        title={t('industry.deleteGroup')}
      >
        <p className="text-xs text-text-dim">{t('industry.deleteGroupConfirm')}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDeletingGroupId(null)}>
            {t('industry.cancel')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => deletingGroupId && void handleDeleteGroup(deletingGroupId)}
          >
            {t('industry.deleteGroup')}
          </Button>
        </div>
      </Modal>

      {fitImportOpen && catalog && (
        <FitImportDialog
          catalog={catalog}
          onApply={(preview) => void handleFitImport(preview)}
          onClose={() => setFitImportOpen(false)}
        />
      )}

      {infoModalItem && (
        <ItemDetailModal
          typeId={infoModalItem.typeId}
          itemName={infoModalItem.itemName}
          onClose={() => setInfoModalItem(null)}
        />
      )}
    </div>
  );
}
