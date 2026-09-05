import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BuildPlanRecord } from '@/db';
import { markBuildPlanDeleted, scheduleSync } from '@/sync';
import { Button, EmptyState, PageHeader, Panel, ReauthBanner, Spinner } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginEveLogin } from '@/app/loginFlow';
import { useIsDesktop } from '@/lib/useIsDesktop';
import {
  useViewportBoundedHeight,
  VIEWPORT_BOUNDED_BOTTOM_GAP_PX,
} from '@/lib/useViewportBoundedHeight';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { MaterialSourcing, SkillLevels } from '@/engine/industry/types';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadPi } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import {
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
import {
  BuildPlanDetail,
  type PlanPatch,
  type SourcingPatchEntry,
} from '@/features/industry/BuildPlanDetail';
import { saveSourcingEdit } from '@/features/industry/sourcingEdits';

function newBuildPlan(
  characterId: number,
  entry: BlueprintCatalogEntry,
  owned: CharacterBlueprint | null
): BuildPlanRecord {
  return {
    id: crypto.randomUUID(),
    characterId,
    name: entry.productName,
    blueprintTypeID: entry.blueprintTypeID,
    runs: 1,
    me: owned?.material_efficiency ?? 0,
    te: owned?.time_efficiency ?? 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: DEFAULT_TRADE_HUB.id,
    updatedAt: Date.now(),
  };
}

/** Build Plan manager: create (via blueprint search)/duplicate/delete/rename plans, edit the selected one. */
export function Industry() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [searchParams, setSearchParams] = useSearchParams();

  const plans = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return db.buildPlans.where('characterId').equals(activeCharacterId).toArray();
  }, [activeCharacterId]);

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
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(null);
  // Planetary schematics, for the materials table's make-or-buy marker. Loaded
  // beside the catalog so both are in place before a plan first renders — a
  // late arrival would widen the price fetch's type list and refire it.
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
      const plan = newBuildPlan(activeCharacterId, entry, owned);
      await db.buildPlans.add(plan);
      scheduleSync(activeCharacterId);
      return plan.id;
    },
    [activeCharacterId, ownedBlueprints]
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

  // Derived, not effect-synced: falls back to the first plan whenever the
  // explicitly selected one is missing (first load, or it was just deleted).
  const effectiveSelectedId = useMemo(() => {
    if (!plans) return null;
    if (selectedId && plans.some((p) => p.id === selectedId)) return selectedId;
    return plans[0]?.id ?? null;
  }, [plans, selectedId]);

  const selectedPlan = useMemo(
    () => plans?.find((p) => p.id === effectiveSelectedId) ?? null,
    [plans, effectiveSelectedId]
  );

  // Narrow screens show one column at a time (CONTEXT.md round 25); matches
  // the grid's own `lg:` breakpoint so the JS-driven visibility and the CSS
  // layout switch at the same width. Gated on the explicit `selectedId`, not
  // `effectiveSelectedId`'s first-plan fallback, so a narrow-screen visitor
  // lands on the list first, same as Mail/SkillPlans, rather than jumping
  // straight to whichever plan the fallback picked.
  const isDesktop = useIsDesktop();
  const detailVisible = isDesktop || selectedId !== null;
  const showBackControl = !isDesktop && selectedId !== null;
  const [scrollerRef, scrollerMaxHeight] = useViewportBoundedHeight(VIEWPORT_BOUNDED_BOTTOM_GAP_PX);

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
   * "Use all detected" (issue #181), applied one row at a time through the very
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

  return (
    <div className="mx-auto max-w-6xl space-y-4">
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
        // `lg:items-start`: grid items stretch to the row's height by
        // default, so without this the list column (often just a couple of
        // short rows) gets pulled up to match the detail column's full
        // height, rendering as a tall, mostly-empty box.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
          <Panel className={isDesktop || selectedId === null ? '' : 'hidden'}>
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
            />
          </Panel>

          <article className={`space-y-2 ${detailVisible ? '' : 'hidden'}`}>
            {showBackControl && (
              <Button size="sm" onClick={() => setSelectedId(null)}>
                {t('industry.backToList')}
              </Button>
            )}
            <div
              ref={scrollerRef}
              className="space-y-4 lg:overflow-y-auto"
              style={
                isDesktop && scrollerMaxHeight !== null
                  ? { maxHeight: scrollerMaxHeight }
                  : undefined
              }
            >
              {!detailVisible ? null : selectedPlan ? (
                <BuildPlanDetail
                  key={selectedPlan.id}
                  plan={selectedPlan}
                  catalog={catalog}
                  pi={pi}
                  ownedBlueprints={ownedBlueprints}
                  skills={skills}
                  ownedStockSnapshot={ownedStockSnapshot}
                  onUpdate={(patch) => void handleUpdate(patch)}
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
