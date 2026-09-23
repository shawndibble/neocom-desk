import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { Button, EmptyState, Modal, Panel, Spinner } from '@/components/ui';
import { useIndustryWorkspace } from '@/features/industry/useIndustryWorkspace';
import { IndustryHeader } from '@/features/industry/IndustryHeader';
import {
  buildPlansByMaterialTypeID,
  type BlueprintCatalogEntry,
} from '@/features/industry/blueprintCatalog';
import { findOwnedBlueprint } from '@/features/industry/data';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { useQuickbar } from '@/features/market/useQuickbar';
import { useTradeHubStandings } from '@/features/market/useTradeHubStandings';
import { BuildPlanList } from '@/features/industry/BuildPlanList';
import type { PlanIndexStats, PlanRollupStats } from '@/features/industry/BuildPlanList';
import { BuildPlanCompare } from '@/features/industry/BuildPlanCompare';
import { OpportunitiesPanel } from '@/features/industry/OpportunitiesPanel';
import { MarketWideOpportunitiesPanel } from '@/features/industry/MarketWideOpportunitiesPanel';
import {
  planForOpportunityCandidate,
  type OpportunityRow,
} from '@/features/industry/opportunities';
import { ProductionLogPanel } from '@/features/industry/ProductionLogPanel';
import { BpcSourcingPanel } from '@/features/bpcContracts/BpcSourcingPanel';
import { mostRecentlyUpdatedPlan, newBuildPlan } from '@/features/industry/newBuildPlan';
import {
  clearPlanSeed,
  matchesPlanSeed,
  parsePlanSeed,
  type BuildPlanSeed,
} from '@/features/industry/planSeed';
import { addBuildGroup, buildGroupsFor, renameBuildGroup } from '@/features/industry/buildGroups';
import { deleteBuildGroup } from '@/features/industry/buildGroupActions';
import {
  applyBuildPlanChange,
  createBuildPlans,
  duplicateBuildPlan,
  moveBuildPlan,
  removeBuildPlan,
} from '@/features/industry/buildPlanStore';
import { useExpandedGroups, withGroupExpanded } from '@/features/industry/expandedGroups';
import { FitImportDialog } from '@/features/industry/FitImportDialog';
import { applyFitImport, fitImportGroupName } from '@/features/industry/fitImport';
import type { FitToBuildPlansResult } from '@/engine/import/fitToBuildPlans';
import { useComparedBuildResults } from '@/features/industry/useComparedBuildResults';
import { useRunCountsByPlan } from '@/features/industry/useRunCountsByPlan';
import { computeGroupIndexStats } from '@/features/industry/groupIndexStats';
import { INDUSTRY_TABS } from '@/features/industry/industryTabs';
import { usePageTab } from '@/lib/usePageTab';
import { useUrlParam } from '@/lib/useUrlState';
import { boolParam } from '@/lib/urlState';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { loadMarketWideTrees } from '@/sde/loadSde';
import type { MarketWideTreeMap } from '@/sde/types';

const COMPARE_MODE = boolParam();

/**
 * Build Plan manager index: create (via blueprint search)/duplicate/delete/
 * rename plans and groups, search, drag plans between groups, and open one
 * as its own full-width page (`/industry/plans/:id`, `/industry/groups/:id`)
 * — this route no longer renders any plan/group detail itself.
 */
export function Industry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspace = useIndustryWorkspace();
  const {
    activeCharacterId,
    hydrated,
    catalog,
    pi,
    ownedBlueprints,
    corpOwnedBlueprints,
    blueprintsNeedsReauth,
    modifiers,
    buildGroups,
    buildGroupsHydrated,
    setBuildGroups,
    assumedMe,
    assumedTe,
    facilityDefaults,
  } = workspace;
  // Character-independent, loaded once — the market-wide scan's precomputed
  // input (issue #819). Not part of `useIndustryWorkspace`: only this index's
  // Opportunities tab needs it, never the plan/group detail pages.
  const [marketWideTrees, setMarketWideTrees] = useState<MarketWideTreeMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMarketWideTrees().then((trees) => {
      if (!cancelled) setMarketWideTrees(trees);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = usePageTab(INDUSTRY_TABS);

  const plansQuery = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return {
      characterId: activeCharacterId,
      rows: await db.buildPlans.where('characterId').equals(activeCharacterId).toArray(),
    };
  }, [activeCharacterId]);
  const plans = plansQuery?.characterId === activeCharacterId ? plansQuery.rows : undefined;

  const quickbar = useQuickbar(activeCharacterId);
  const [infoModalItem, setInfoModalItem] = useState<{ typeId: number; itemName: string } | null>(
    null
  );

  const expandedGroups = useExpandedGroups((state) => state.value);
  const expandedGroupsHydrated = useExpandedGroups((state) => state.hydrated);
  const hydrateExpandedGroups = useExpandedGroups((state) => state.hydrate);
  const setExpandedGroups = useExpandedGroups((state) => state.setValue);
  useEffect(() => {
    void hydrateExpandedGroups();
  }, [hydrateExpandedGroups]);

  const [fitImportOpen, setFitImportOpen] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  const [compareMode, setCompareMode] = useUrlParam('plans.compare', COMPARE_MODE);
  const [compareSelectedIds, setCompareSelectedIds] = useState<ReadonlySet<string>>(new Set());
  // Compare mode can also turn off from the URL (Back, a bare /industry
  // link), not only the toggle — the ticked plans go with it either way.
  const [prevCompareMode, setPrevCompareMode] = useState(compareMode);
  if (compareMode !== prevCompareMode) {
    setPrevCompareMode(compareMode);
    if (!compareMode) setCompareSelectedIds(new Set());
  }
  const [comparing, setComparing] = useState(false);

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
          assumedMe,
          assumedTe,
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
      await createBuildPlans([plan]);
      return plan.id;
    },
    [activeCharacterId, ownedBlueprints, plans, facilityDefaults, assumedMe, assumedTe, t]
  );

  // The Market Browser / Assets / BPC Search "jump to a Build Plan" deep
  // links (`?product=<typeId>`, `?material=<typeId>`). Unlike the old
  // `usePlanSelection`, this navigates to the plan's own route rather than
  // setting in-memory selection — once resolved, the browser is simply on a
  // different page, so there is no selection state left to keep in sync with
  // the URL. Only the *unresolvable* cases stay on `/industry` and need the
  // param cleaned up.
  const productParam = searchParams.get('product');
  const materialParam = searchParams.get('material');
  const planSeed = useMemo(() => parsePlanSeed(searchParams), [searchParams]);
  useEffect(() => {
    if (activeCharacterId === null || !plans || !catalog) return;
    if (productParam) {
      const entry = catalog.byProductTypeID.get(Number(productParam)) ?? null;
      const existing = entry
        ? (plans.find(
            (p) =>
              p.blueprintTypeID === entry.blueprintTypeID &&
              (planSeed === null || matchesPlanSeed(p, planSeed))
          ) ?? null)
        : null;
      if (existing) {
        navigate(`/industry/plans/${existing.id}`, { replace: true });
        return;
      }
      if (entry) {
        void createPlan(entry, planSeed).then((id) => {
          if (id) navigate(`/industry/plans/${id}`, { replace: true });
        });
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.delete('product');
      clearPlanSeed(next);
      setSearchParams(next, { replace: true });
      return;
    }
    if (materialParam) {
      const materialPlan =
        buildPlansByMaterialTypeID(plans, catalog).get(Number(materialParam)) ?? null;
      if (materialPlan) {
        navigate(`/industry/plans/${materialPlan.id}`, { replace: true });
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.delete('material');
      setSearchParams(next, { replace: true });
    }
  }, [
    activeCharacterId,
    plans,
    catalog,
    productParam,
    materialParam,
    planSeed,
    searchParams,
    setSearchParams,
    createPlan,
    navigate,
  ]);

  const groups = useMemo(
    () => (activeCharacterId === null ? [] : buildGroupsFor(buildGroups, activeCharacterId)),
    [buildGroups, activeCharacterId]
  );
  const expandedGroupIds = useMemo(
    () => new Set(activeCharacterId === null ? [] : (expandedGroups[activeCharacterId] ?? [])),
    [expandedGroups, activeCharacterId]
  );
  const membersOfGroup = useCallback(
    (groupId: string) => plans?.filter((p) => p.buildGroupId === groupId) ?? [],
    [plans]
  );
  const comparePlans = useMemo(
    () => plans?.filter((p) => compareSelectedIds.has(p.id)) ?? [],
    [plans, compareSelectedIds]
  );

  // Profit / Verdict / Runs for every row. `computeGroupResult: true` only
  // for grouped plans — the extra owned-stock-disabled resolve
  // `BuildGroupPanel` already pays for its one open group, paid here for
  // every group at once so the group row can show its own rollup total;
  // ungrouped plans skip it, since nothing on this page ever rolls them up.
  const knownGroupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);
  const groupedPlans = useMemo(
    () =>
      (plans ?? []).filter(
        (p) => p.buildGroupId !== undefined && knownGroupIds.has(p.buildGroupId)
      ),
    [plans, knownGroupIds]
  );
  const ungroupedPlans = useMemo(
    () =>
      (plans ?? []).filter(
        (p) => p.buildGroupId === undefined || !knownGroupIds.has(p.buildGroupId)
      ),
    [plans, knownGroupIds]
  );
  const tradeHubStandings = useTradeHubStandings(activeCharacterId);
  const groupedRows = useComparedBuildResults({
    plans: groupedPlans,
    catalog,
    pi,
    ownedBlueprints,
    corpOwnedBlueprints,
    modifiers,
    tradeHubStandings,
    computeGroupResult: true,
  });
  const ungroupedRows = useComparedBuildResults({
    plans: ungroupedPlans,
    catalog,
    pi,
    ownedBlueprints,
    corpOwnedBlueprints,
    modifiers,
    tradeHubStandings,
  });
  const runCounts = useRunCountsByPlan(activeCharacterId);

  const statsByPlanId = useMemo(() => {
    const map = new Map<string, PlanIndexStats>();
    for (const row of [...groupedRows, ...ungroupedRows]) {
      // Displayed figure is profit after fees (matches the detail page's
      // headline number) — but the Build/Buy verdict stays keyed off
      // `recommendation`, the build-vs-buy question, a different one
      // (issue: list column read as "profit" while showing buy-vs-build
      // savings, a different number than the detail page's own "profit
      // after fees"). `recommendation` is read straight off `result` rather
      // than re-derived from `buyCost`/`totalCost` here, so it inherits the
      // same `unpriceable` gating `PlanVerdictHero`'s own Acquisition
      // Verdict pill uses — a re-derived value stayed non-null (falsely
      // confident) whenever a material was unpriced but the product itself
      // still had a hub price.
      map.set(row.planId, {
        profit: row.result?.profit ?? null,
        verdict: row.result?.recommendation ?? 'unknown',
        runs: runCounts.get(row.planId) ?? 0,
      });
    }
    return map;
  }, [groupedRows, ungroupedRows, runCounts]);

  const statsByGroupId = useMemo(() => {
    const rowByPlanId = new Map(groupedRows.map((row) => [row.planId, row]));
    const map = new Map<string, PlanRollupStats>();
    for (const group of groups) {
      const memberPlans = groupedPlans.filter((p) => p.buildGroupId === group.id);
      map.set(group.id, computeGroupIndexStats(group, memberPlans, rowByPlanId));
    }
    return map;
  }, [groups, groupedPlans, groupedRows]);

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
    if (!source) return;
    await duplicateBuildPlan(source, t('industry.copySuffix', { name: source.name }));
    // Stays on the index, like rename/delete — duplicate is a list-management
    // action here, not "go start editing this". Only a deep link
    // (`?product=`/`?material=`) or an explicit row click opens a plan's own
    // page.
  }

  async function handleDelete(id: string) {
    if (activeCharacterId === null) return;
    await removeBuildPlan(activeCharacterId, id);
  }

  async function handleRename(id: string, name: string) {
    await applyBuildPlanChange(id, { kind: 'edit', patch: { name } });
  }

  function toggleCompareMode() {
    setCompareMode(!compareMode);
  }

  function toggleCompareSelected(id: string) {
    setCompareSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    await setGroupExpanded(id, true);
  }

  async function handleRenameGroup(groupId: string, name: string) {
    if (activeCharacterId === null) return;
    await setBuildGroups(renameBuildGroup(buildGroups, activeCharacterId, groupId, name));
  }

  function requestDeleteGroup(groupId: string) {
    if (membersOfGroup(groupId).length === 0) void handleDeleteGroup(groupId);
    else setDeletingGroupId(groupId);
  }

  async function handleDeleteGroup(groupId: string) {
    if (activeCharacterId === null) return;
    setDeletingGroupId(null);
    await deleteBuildGroup(groupId, membersOfGroup(groupId), {
      characterId: activeCharacterId,
      buildGroups,
      setBuildGroups,
    });
  }

  async function handleMovePlan(planId: string, groupId: string | null) {
    await moveBuildPlan(planId, groupId);
    if (groupId !== null) await setGroupExpanded(groupId, true);
  }

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
    navigate(`/industry/groups/${result.groupId}`);
  }

  async function handleAddOpportunitiesToCompare(rows: readonly OpportunityRow[]) {
    if (activeCharacterId === null || rows.length === 0) return;
    const newPlans = rows.map((row) =>
      planForOpportunityCandidate(
        row.candidate,
        facilityDefaults,
        row.materialSourcing,
        row.buildHere,
        activeCharacterId
      )
    );
    await createBuildPlans(newPlans);
    setCompareSelectedIds(new Set(newPlans.map((p) => p.id)));
    setComparing(true);
    setTab('plans');
  }

  function exitCompare() {
    setCompareMode(false);
    setCompareSelectedIds(new Set());
    setComparing(false);
  }

  function openRunFromRecords(buildPlanId: string) {
    const groupId = plans?.find((p) => p.id === buildPlanId)?.buildGroupId;
    if (groupId !== undefined) void setGroupExpanded(groupId, true);
    navigate(`/industry/plans/${buildPlanId}`);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <IndustryHeader
        activeCharacterId={activeCharacterId}
        activeTab={tab}
        onTabChange={setTab}
        blueprintsNeedsReauth={blueprintsNeedsReauth}
        onAddToQuickbar={quickbar.add}
        quickbarAvailable={quickbar.available}
        onShowInfo={(typeId, itemName) => setInfoModalItem({ typeId, itemName })}
      />

      {!plans || !catalog || !buildGroupsHydrated || !expandedGroupsHydrated ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <>
          {tab === 'sourcing' ? (
            <BpcSourcingPanel />
          ) : tab === 'opportunities' ? (
            <div className="flex flex-col gap-4">
              <OpportunitiesPanel
                catalog={catalog}
                pi={pi}
                modifiers={modifiers}
                facilityDefaults={facilityDefaults}
                activeCharacterId={activeCharacterId}
                ownedStockSnapshot={workspace.ownedStockSnapshot}
                onAddToCompare={(rows) => void handleAddOpportunitiesToCompare(rows)}
              />
              <MarketWideOpportunitiesPanel
                hub={DEFAULT_TRADE_HUB}
                trees={marketWideTrees}
                catalog={catalog}
                modifiers={modifiers}
                activeCharacterId={activeCharacterId}
                onStartPlan={(entry) => {
                  // Distinct from the plain search-box create: picking a
                  // scan result is an explicit "go build this" choice, same
                  // as opening a `?product=` deep link, so it opens the new
                  // plan's own page rather than leaving the pilot on the
                  // Opportunities tab.
                  void createPlan(entry).then((id) => {
                    if (id) navigate(`/industry/plans/${id}`);
                  });
                }}
              />
            </div>
          ) : tab === 'records' ? (
            <ProductionLogPanel
              characterId={activeCharacterId}
              catalog={catalog}
              skills={modifiers.skills}
              plans={plans}
              onOpenRun={openRunFromRecords}
            />
          ) : comparing ? (
            comparePlans.length >= 2 ? (
              <BuildPlanCompare
                plans={comparePlans}
                catalog={catalog}
                pi={pi}
                ownedBlueprints={ownedBlueprints}
                corpOwnedBlueprints={corpOwnedBlueprints}
                modifiers={modifiers}
                tradeHubStandings={tradeHubStandings}
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
          ) : (
            <Panel>
              <BuildPlanList
                plans={plans}
                catalog={catalog}
                selectedId={null}
                onSelect={(id) => navigate(`/industry/plans/${id}`)}
                // Stays on the index, same as duplicate — the search box adds
                // a row to manage, it doesn't presume the pilot wants to edit
                // it immediately. `void`: `onCreate` only takes the entry.
                onCreate={(entry) => void createPlan(entry)}
                onDuplicate={(id) => void handleDuplicate(id)}
                onDelete={(id) => void handleDelete(id)}
                onRename={(id, name) => void handleRename(id, name)}
                compareMode={compareMode}
                compareSelectedIds={compareSelectedIds}
                onToggleCompareMode={toggleCompareMode}
                onToggleCompareSelected={toggleCompareSelected}
                onOpenCompare={() => setComparing(true)}
                groups={groups}
                expandedGroupIds={expandedGroupIds}
                selectedGroupId={null}
                onToggleGroup={(groupId) =>
                  void setGroupExpanded(groupId, !expandedGroupIds.has(groupId))
                }
                onSelectGroup={(groupId) => navigate(`/industry/groups/${groupId}`)}
                onCreateGroup={() => void handleCreateGroup()}
                onRenameGroup={(groupId, name) => void handleRenameGroup(groupId, name)}
                onDeleteGroup={requestDeleteGroup}
                onMovePlan={(planId, groupId) => void handleMovePlan(planId, groupId)}
                onOpenFitImport={() => setFitImportOpen(true)}
                statsByPlanId={statsByPlanId}
                statsByGroupId={statsByGroupId}
              />
            </Panel>
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
