import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BuildPlanRecord } from '@/db';
import { markBuildPlanDeleted, scheduleSync } from '@/sync';
import {
  Button,
  EmptyState,
  PageHeader,
  Panel,
  ReauthBanner,
  Spinner,
  Tabs,
} from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginEveLogin } from '@/app/loginFlow';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type {
  FacilityKind,
  IndustryActivity,
  MaterialSourcing,
  SkillLevels,
} from '@/engine/industry/types';
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
import { ProductionLogPanel } from '@/features/industry/ProductionLogPanel';
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

/**
 * The historical hardcoded default per activity — a character with no prior
 * plan of that activity, or whose most recent plan is the other activity
 * (issue #460: `defaultsFrom.facility` would otherwise be an NPC station
 * that cannot host a reaction, or a refinery that cannot manufacture).
 */
function fallbackFacility(activity: IndustryActivity): FacilityKind {
  return activity === 'reaction' ? 'athanor' : 'npcStation';
}

// Facility/rig/security/hub/tax, build system and build location all default
// from the character's own most recently updated plan (issue #456), so a
// second plan doesn't force re-picking settings the pilot already set once. `defaultsFrom` is that
// plan, or null/undefined for a character with no plans yet, in which case
// the historical hardcoded defaults apply. Only carried when it hosts the
// same activity as the new plan (issue #460) — otherwise it names a
// facility the new blueprint/formula cannot run at.
function newBuildPlan(
  characterId: number,
  entry: BlueprintCatalogEntry,
  owned: CharacterBlueprint | null,
  defaultsFrom?: BuildPlanRecord | null
): BuildPlanRecord {
  // Unlike `IndustryBlueprint.activity` (optional, for pre-#460 engine test
  // literals), the SDE's own `BlueprintType.activity` is always set — no
  // fallback needed here.
  const activity = entry.blueprint.activity;
  const defaultsMatchActivity =
    defaultsFrom != null && FACILITY_PRESETS[defaultsFrom.facility].activity === activity;
  return {
    id: crypto.randomUUID(),
    characterId,
    name: entry.productName,
    blueprintTypeID: entry.blueprintTypeID,
    runs: 1,
    me: owned?.material_efficiency ?? 0,
    te: owned?.time_efficiency ?? 0,
    facility: defaultsMatchActivity ? defaultsFrom.facility : fallbackFacility(activity),
    rigLevel: defaultsFrom?.rigLevel ?? 'none',
    security: defaultsFrom?.security ?? 'highsec',
    hubId: defaultsFrom?.hubId ?? DEFAULT_TRADE_HUB.id,
    // Carried like facility/rig/hub: a pilot who builds in one system builds
    // their next thing there too, and re-typing it every plan is the annoyance
    // issue #456 removed for the settings beside it.
    ...(defaultsFrom?.buildSystemId !== undefined
      ? { buildSystemId: defaultsFrom.buildSystemId, buildSystemName: defaultsFrom.buildSystemName }
      : {}),
    ...(defaultsFrom?.facilityTaxPct !== undefined
      ? { facilityTaxPct: defaultsFrom.facilityTaxPct }
      : {}),
    // Carried like the hub it names a side of: a pilot who sources on buy
    // orders sources their next plan that way too.
    ...(defaultsFrom?.materialPriceBasis !== undefined
      ? { materialPriceBasis: defaultsFrom.materialPriceBasis }
      : {}),
    // The picked place itself (#527), carried under the same activity check as
    // `facility` rather than merely when the source plan has one: where the
    // activity differs the new plan's facility is the hardcoded fallback, not
    // the picked place's, so its name would label a job whose numbers came
    // from somewhere else. The id and the name are independently optional —
    // ESI withholds some structure names, and the id alone still drives the
    // picker's stand-in label.
    ...(defaultsMatchActivity && defaultsFrom.buildLocationId !== undefined
      ? { buildLocationId: defaultsFrom.buildLocationId }
      : {}),
    ...(defaultsMatchActivity && defaultsFrom.buildLocationName !== undefined
      ? { buildLocationName: defaultsFrom.buildLocationName }
      : {}),
    updatedAt: Date.now(),
  };
}

/** The character's own plan with the highest `updatedAt`, or null if they have none yet. */
function mostRecentlyUpdatedPlan(plans: BuildPlanRecord[] | undefined): BuildPlanRecord | null {
  if (!plans || plans.length === 0) return null;
  return plans.reduce((latest, p) => (p.updatedAt > latest.updatedAt ? p : latest));
}

/** Build Plan manager: create (via blueprint search)/duplicate/delete/rename plans, edit the selected one. */
export function Industry() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'plans' | 'records'>('plans');

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

  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const [comparing, setComparing] = useState(false);

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
    async (entry: BlueprintCatalogEntry): Promise<string | null> => {
      if (activeCharacterId === null) return null;
      const owned = findOwnedBlueprint(ownedBlueprints, entry.blueprintTypeID);
      const plan = newBuildPlan(activeCharacterId, entry, owned, mostRecentlyUpdatedPlan(plans));
      await db.buildPlans.add(plan);
      scheduleSync(activeCharacterId);
      return plan.id;
    },
    [activeCharacterId, ownedBlueprints, plans]
  );

  // The Market Browser's item context menu "jump to a Build Plan" action
  // (issue #6) lands here with `?product=<typeId>`. The blueprint this
  // resolves to, and whether the character already has a plan for it, are
  // pure lookups against data already in hand — computed here so the
  // render-time sync below and the effect's create-if-missing branch read
  // the same answer instead of re-deriving it twice.
  const productParam = searchParams.get('product');
  const pendingEntry =
    productParam && catalog ? (catalog.byProductTypeID.get(Number(productParam)) ?? null) : null;
  const pendingExistingPlan =
    pendingEntry && plans
      ? (plans.find((p) => p.blueprintTypeID === pendingEntry.blueprintTypeID) ?? null)
      : null;

  // Render-time state adjustment ("Adjusting state when a prop changes",
  // react.dev): once the plan a `?product=` param points at exists — already
  // there, or just created by the effect below once `plans` catches up —
  // adopt it as the selection. Pure and synchronous, so it belongs here
  // rather than in the effect, which React's set-state-in-effect check flags
  // as cascading-render risk for exactly this shape.
  if (pendingExistingPlan && selectedId !== pendingExistingPlan.id) {
    setSelectedId(pendingExistingPlan.id);
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
      void createPlan(pendingEntry);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('product');
    setSearchParams(next, { replace: true });
  }, [
    productParam,
    activeCharacterId,
    plans,
    catalog,
    pendingEntry,
    pendingExistingPlan,
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
    setSelectedId(materialPlan.id);
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
  }, [plans, selectedId, lastOpened, lastOpenedHydrated, activeCharacterId]);

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
  const detailVisible = isDesktop || selectedId !== null || comparing;
  const showBackControl = !isDesktop && (selectedId !== null || comparing);

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
    setSelectedId(copy.id);
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

  async function handleUpdate(patch: PlanPatch) {
    if (!selectedPlan) return;
    await db.buildPlans.put({ ...selectedPlan, ...patch, updatedAt: Date.now() });
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
  }

  /**
   * A correction the app made for itself — today, a security band brought back
   * into line with the plan's build system.
   *
   * Deliberately does not touch `updatedAt`. Merely opening a plan is not
   * editing it: bumping the timestamp would make the last plan *viewed* win
   * the "default a new plan from the most recently updated one" rule (#456),
   * and would churn every device's sync for a value the pilot never changed.
   */
  async function handleDerivedFix(patch: PlanPatch) {
    if (!selectedPlan) return;
    await db.buildPlans.put({ ...selectedPlan, ...patch });
    if (activeCharacterId !== null) scheduleSync(activeCharacterId);
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
        setComparing(false);
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

  function exitCompare() {
    setComparing(false);
    setCompareMode(false);
    setCompareSelectedIds(new Set());
  }

  /**
   * Records tab row click: jump to the run's own Build Plan on the Build
   * Plans tab. Exits Compare first — otherwise the detail pane's own
   * `comparing` branch (checked before `selectedPlan`) would keep showing
   * the compare table instead of the run's plan if Compare was left open.
   */
  function openRunFromRecords(buildPlanId: string) {
    exitCompare();
    setSelectedId(buildPlanId);
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

      {!plans || !catalog ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <>
          <Tabs
            label={t('nav.industry')}
            value={tab}
            onChange={(id) => setTab(id as typeof tab)}
            tabs={[
              { id: 'plans', label: t('industry.buildPlansTab') },
              { id: 'records', label: t('industry.recordsTab') },
            ]}
          />

          {tab === 'records' ? (
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
                  onSelect={setSelectedId}
                  onCreate={(entry) =>
                    void createPlan(entry).then((id) => {
                      if (id) setSelectedId(id);
                    })
                  }
                  onDuplicate={(id) => void handleDuplicate(id)}
                  onDelete={(id) => void handleDelete(id)}
                  onRename={(id, name) => void handleRename(id, name)}
                  compareMode={compareMode}
                  compareSelectedIds={compareSelectedIds}
                  onToggleCompareMode={toggleCompareMode}
                  onToggleCompareSelected={toggleCompareSelected}
                  onOpenCompare={() => setComparing(true)}
                />
              </Panel>

              <article className={`space-y-2 ${detailVisible ? '' : 'hidden'}`}>
                {showBackControl && (
                  <Button
                    size="sm"
                    onClick={() => (comparing ? exitCompare() : setSelectedId(null))}
                  >
                    {t('industry.backToList')}
                  </Button>
                )}
                <div className="space-y-4">
                  {!detailVisible ? null : comparing ? (
                    comparePlans.length >= 2 ? (
                      <BuildPlanCompare
                        plans={comparePlans}
                        catalog={catalog}
                        pi={pi}
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
