import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BuildPlanRecord } from '@/db';
import { DataGate } from '@/components/DataGate';
import { useRetryableLoad } from '@/lib/useRetryableLoad';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  IconButton,
  Spinner,
  TabPanel,
  Toast,
  ToastStack,
  useDeferredCommits,
  useTimedToast,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { guarded, preloadRouteChunk } from '@/app/routeChunks';
import { useIndustryWorkspace } from '@/features/industry/useIndustryWorkspace';
import { loadActivityFacilityDefaults } from '@/features/industry/facilityDefaults';
import { IndustryHeader } from '@/features/industry/IndustryHeader';
import {
  buildPlansByMaterialTypeID,
  type BlueprintCatalogEntry,
} from '@/features/industry/blueprintCatalog';
import { findOwnedBlueprint } from '@/features/industry/data';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import type { PlanIndexStats, PlanRollupStats } from '@/features/industry/BuildPlanList';
import { planReactionLocation } from '@/features/industry/planReactionLocation';
import { industryActivityOf } from '@/engine/industry/types';
import { toIndustryBlueprint } from '@/features/industry/blueprintCatalog';
import {
  planForOpportunityCandidate,
  type OpportunityPlanSeed,
  type OpportunityRow,
} from '@/features/industry/opportunities';
import {
  BpcSourcingPanel,
  type BpcSourcingHeaderState,
} from '@/features/bpcContracts/BpcSourcingPanel';
import {
  mostRecentlyUpdatedPlan,
  newBuildPlan,
  newPlanHub,
} from '@/features/industry/newBuildPlan';
import { useHubFor } from '@/features/market/hub';
import {
  blueprintPriceSourcing,
  clearPlanSeed,
  hasBlueprintPricePick,
  matchesPlanSeed,
  parseBlueprintPriceSeed,
  parsePlanSeed,
  type BuildPlanSeed,
} from '@/features/industry/planSeed';
import { addBuildGroup, buildGroupsFor, renameBuildGroup } from '@/features/industry/buildGroups';
import { deleteBuildGroup } from '@/features/industry/buildGroupActions';
import {
  applyBuildPlanChange,
  createBuildPlans,
  duplicateBuildPlan,
  patchBuildPlans,
  moveBuildPlan,
  removeBuildPlan,
} from '@/features/industry/buildPlanStore';
import { useExpandedGroups, withGroupExpanded } from '@/features/industry/expandedGroups';
import { applyFitImport, fitImportGroupName } from '@/features/industry/fitImport';
import type { FitToBuildPlansResult } from '@/engine/import/fitToBuildPlans';
import { useComparedBuildResults } from '@/features/industry/useComparedBuildResults';
import { computeGroupIndexStats } from '@/features/industry/groupIndexStats';
import { INDUSTRY_TABS, INDUSTRY_TABS_ID } from '@/features/industry/industryTabs';
import { applyBlueprintPaste, previewBlueprintPaste } from '@/features/industry/blueprintPaste';
import { loadBlueprintNames } from '@/features/industry/blueprintNames';
import type {
  BlueprintPasteNoticeState,
  IndustryBlueprintListState,
  IndustryFitImportState,
} from '@/lib/shortcuts';
import { usePageTab } from '@/lib/usePageTab';
import { useUrlParam } from '@/lib/useUrlState';
import { boolParam } from '@/lib/urlState';
import { loadMarketWideTrees } from '@/sde/loadSde';
import type { MarketWideTreeMap } from '@/sde/types';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const BuildPlanList = lazy(() =>
  guarded(() => import('@/features/industry/BuildPlanList')).then((m) => ({
    default: m.BuildPlanList,
  }))
);
const BuildPlanCompare = lazy(() =>
  guarded(() => import('@/features/industry/BuildPlanCompare')).then((m) => ({
    default: m.BuildPlanCompare,
  }))
);
const OpportunitiesPanel = lazy(() =>
  guarded(() => import('@/features/industry/OpportunitiesPanel')).then((m) => ({
    default: m.OpportunitiesPanel,
  }))
);
const MarketWideOpportunitiesPanel = lazy(() =>
  guarded(() => import('@/features/industry/MarketWideOpportunitiesPanel')).then((m) => ({
    default: m.MarketWideOpportunitiesPanel,
  }))
);
const ProductionLogPanel = lazy(() =>
  guarded(() => import('@/features/industry/ProductionLogPanel')).then((m) => ({
    default: m.ProductionLogPanel,
  }))
);
const FitImportDialog = lazy(() =>
  guarded(() => import('@/features/industry/FitImportDialog')).then((m) => ({
    default: m.FitImportDialog,
  }))
);

const COMPARE_MODE = boolParam();

export function Industry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const workspace = useIndustryWorkspace();
  const { hydrated: industryHubHydrated } = useHubFor('industry');
  const {
    activeCharacterId,
    hydrated,
    catalog,
    catalogFailed,
    characterLoaded,
    retryCatalog,
    pi,
    ownedBlueprints,
    pricingInputs,
    blueprintsNeedsReauth,
    modifiers,
    buildGroups,
    buildGroupsHydrated,
    setBuildGroups,
    assumedTe,
    facilityDefaults,
  } = workspace;
  const { assumedMe } = pricingInputs;
  const [marketWideTrees, setMarketWideTrees] = useState<MarketWideTreeMap | null>(null);
  const {
    failed: marketWideTreesFailed,
    attempt: marketWideTreesAttempt,
    fail: failMarketWideTrees,
    clear: clearMarketWideTreesFailure,
    retry: retryMarketWideTrees,
  } = useRetryableLoad();
  useEffect(() => {
    let cancelled = false;
    clearMarketWideTreesFailure();
    loadMarketWideTrees().then(
      (trees) => {
        if (!cancelled) setMarketWideTrees(trees);
      },
      () => {
        if (!cancelled) failMarketWideTrees();
      }
    );
    return () => {
      cancelled = true;
    };
  }, [marketWideTreesAttempt, failMarketWideTrees, clearMarketWideTreesFailure]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = usePageTab(INDUSTRY_TABS);

  const pendingDeletes = useDeferredCommits();
  const plansQuery = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return {
      characterId: activeCharacterId,
      rows: await db.buildPlans.where('characterId').equals(activeCharacterId).toArray(),
    };
  }, [activeCharacterId]);
  const allPlans = plansQuery?.characterId === activeCharacterId ? plansQuery.rows : undefined;
  const { hiddenIds: hiddenPlanIds } = pendingDeletes;
  const plans = useMemo(
    () => (hiddenPlanIds.size === 0 ? allPlans : allPlans?.filter((p) => !hiddenPlanIds.has(p.id))),
    [allPlans, hiddenPlanIds]
  );

  const itemActions = usePageItemActions({ activeCharacterId });

  const expandedGroups = useExpandedGroups((state) => state.value);
  const expandedGroupsHydrated = useHydratedStore(useExpandedGroups);
  const setExpandedGroups = useExpandedGroups((state) => state.setValue);
  useEffect(() => {
    preloadRouteChunk('/industry/plans/:planId');
  }, []);

  const [fitImportOpen, setFitImportOpen] = useState(false);
  const [fitImportSeedText, setFitImportSeedText] = useState<string | undefined>(undefined);
  function closeFitImport() {
    setFitImportOpen(false);
    setFitImportSeedText(undefined);
  }
  const handledFitImportKey = useRef<string | null>(null);
  useEffect(() => {
    const text = (location.state as Partial<IndustryFitImportState> | null)?.fitImportText;
    if (!text || handledFitImportKey.current === location.key) return;
    handledFitImportKey.current = location.key;
    setFitImportSeedText(text);
    setFitImportOpen(true);
  }, [location.key, location.state]);
  const [blueprintPasteNote, setBlueprintPasteNote] = useState<string | null>(null);
  useTimedToast(blueprintPasteNote, () => setBlueprintPasteNote(null));
  const handledBlueprintPasteKey = useRef<string | null>(null);
  useEffect(() => {
    const text = (location.state as Partial<IndustryBlueprintListState> | null)?.blueprintListText;
    if (!text || handledBlueprintPasteKey.current === location.key) return;
    if (activeCharacterId === null || !plans || !catalog || !buildGroupsHydrated) return;
    handledBlueprintPasteKey.current = location.key;
    void (async () => {
      try {
        const preview = previewBlueprintPaste(text, catalog, await loadBlueprintNames());
        void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
        const result = await applyBlueprintPaste(preview, {
          characterId: activeCharacterId,
          plans,
          ownedBlueprints,
          defaultsFrom: mostRecentlyUpdatedPlan(plans),
          facilityDefaults: await loadActivityFacilityDefaults(),
          assumedMe,
          assumedTe,
          buildGroups,
          setBuildGroups,
          groupName: t('industry.blueprintPasteGroupName'),
        });
        if (!result) {
          setBlueprintPasteNote(
            [
              t('industry.blueprintPasteNone'),
              t('industry.blueprintPasteSkipped', { count: preview.skipped }),
            ].join(' ')
          );
          return;
        }
        await setExpandedGroups(
          withGroupExpanded(expandedGroups, activeCharacterId, result.groupId, true)
        );
        void navigate(`/industry/groups/${result.groupId}`, {
          state: {
            blueprintPasteNotice: { skipped: preview.skipped, reused: result.reused },
          } satisfies BlueprintPasteNoticeState,
        });
      } catch {
        setBlueprintPasteNote(t('industry.blueprintPasteFailed'));
      }
    })();
  }, [
    location.key,
    location.state,
    location.pathname,
    location.search,
    activeCharacterId,
    plans,
    catalog,
    buildGroupsHydrated,
    ownedBlueprints,
    assumedMe,
    assumedTe,
    buildGroups,
    setBuildGroups,
    expandedGroups,
    setExpandedGroups,
    navigate,
    t,
  ]);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  const [compareMode, setCompareMode] = useUrlParam('plans.compare', COMPARE_MODE);
  const [compareSelectedIds, setCompareSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [prevCompareMode, setPrevCompareMode] = useState(compareMode);
  if (compareMode !== prevCompareMode) {
    setPrevCompareMode(compareMode);
    if (!compareMode) setCompareSelectedIds(new Set());
  }
  const [comparing, setComparing] = useState(false);
  const [opportunitiesDataAge, setOpportunitiesDataAge] = useState<Date | null>(null);
  const [bpcSourcingHeader, setBpcSourcingHeader] = useState<BpcSourcingHeaderState | null>(null);

  const startingPlanRef = useRef(false);

  const createPlan = useCallback(
    async (
      entry: BlueprintCatalogEntry,
      seed: BuildPlanSeed | null = null,
      blueprintPrice: number | null = null,
      research: { me: number; te: number } | null = null
    ): Promise<string | null> => {
      if (activeCharacterId === null) return null;
      const owned = findOwnedBlueprint(ownedBlueprints, entry.blueprintTypeID);
      const currentFacilityDefaults = await loadActivityFacilityDefaults();
      const plan = newBuildPlan(
        activeCharacterId,
        entry,
        owned,
        mostRecentlyUpdatedPlan(plans),
        currentFacilityDefaults,
        {
          assumedMe,
          assumedTe,
          ...(research ? { me: research.me, te: research.te } : {}),
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
      const seeded =
        blueprintPrice === null
          ? plan
          : {
              ...plan,
              name: t('industry.lpSeededPlanName', { name: entry.productName }),
              materialSourcing: {
                ...plan.materialSourcing,
                [entry.blueprintTypeID]: blueprintPriceSourcing(blueprintPrice),
              },
            };
      await createBuildPlans([seeded]);
      return seeded.id;
    },
    [activeCharacterId, ownedBlueprints, plans, assumedMe, assumedTe, t]
  );

  const productParam = searchParams.get('product');
  const materialParam = searchParams.get('material');
  const planSeed = useMemo(() => parsePlanSeed(searchParams), [searchParams]);
  const blueprintPriceSeed = useMemo(() => parseBlueprintPriceSeed(searchParams), [searchParams]);
  useEffect(() => {
    if (activeCharacterId === null || !plans || !catalog) return;
    if (productParam) {
      const entry = catalog.byProductTypeID.get(Number(productParam)) ?? null;
      const existing = entry
        ? (plans.find(
            (p) =>
              p.blueprintTypeID === entry.blueprintTypeID &&
              (planSeed === null || matchesPlanSeed(p, planSeed)) &&
              (blueprintPriceSeed === null || hasBlueprintPricePick(p))
          ) ?? null)
        : null;
      if (existing) {
        const open = () => navigate(`/industry/plans/${existing.id}`, { replace: true });
        const stalePrice =
          blueprintPriceSeed !== null &&
          existing.materialSourcing?.[existing.blueprintTypeID]?.overridePrice !==
            blueprintPriceSeed;
        if (stalePrice) {
          void patchBuildPlans([existing.id], {
            materialSourcing: {
              ...existing.materialSourcing,
              [existing.blueprintTypeID]: blueprintPriceSourcing(blueprintPriceSeed),
            },
          }).then(open);
        } else open();
        return;
      }
      if (entry) {
        void createPlan(entry, planSeed, blueprintPriceSeed).then((id) => {
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
    blueprintPriceSeed,
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
  const groupedRows = useComparedBuildResults({
    plans: groupedPlans,
    catalog,
    pi,
    ownedBlueprints,
    modifiers,
    pricingInputs,
    computeGroupResult: true,
  });
  const ungroupedRows = useComparedBuildResults({
    plans: ungroupedPlans,
    catalog,
    pi,
    ownedBlueprints,
    modifiers,
    pricingInputs,
  });
  const statsByPlanId = useMemo(() => {
    const map = new Map<string, PlanIndexStats>();
    const runsByPlanId = new Map((plans ?? []).map((plan) => [plan.id, plan.runs]));
    const planById = new Map((plans ?? []).map((plan) => [plan.id, plan]));
    const reactionsBlocked = (planId: string): boolean => {
      const plan = planById.get(planId);
      const entry = plan && catalog?.byBlueprintTypeID.get(plan.blueprintTypeID);
      if (!plan || !entry) return false;
      const activity = industryActivityOf(toIndustryBlueprint(entry.blueprint));
      return planReactionLocation(plan, activity)?.state === 'highsec';
    };
    for (const row of [...groupedRows, ...ungroupedRows]) {
      map.set(row.planId, {
        profit: row.result?.profit ?? null,
        verdict: reactionsBlocked(row.planId)
          ? 'fixLocation'
          : (row.result?.recommendation ?? 'unknown'),
        buildCost: row.result?.unpriceable ? null : (row.result?.totalCost ?? null),
        buyCost: row.result?.unpriceable ? null : (row.result?.buyCost ?? null),
        runs: runsByPlanId.get(row.planId) ?? 0,
        iskPerHour: row.result?.iskPerHour ?? null,
        marginPct: row.result?.marginPct ?? null,
      });
    }
    return map;
  }, [groupedRows, ungroupedRows, plans, catalog]);

  const statsByGroupId = useMemo(() => {
    const rowByPlanId = new Map(groupedRows.map((row) => [row.planId, row]));
    const map = new Map<string, PlanRollupStats>();
    for (const group of groups) {
      const memberPlans = groupedPlans.filter((p) => p.buildGroupId === group.id);
      map.set(group.id, computeGroupIndexStats(group, memberPlans, rowByPlanId));
    }
    return map;
  }, [groups, groupedPlans, groupedRows]);

  if (!hydrated || !industryHubHydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  async function handleDuplicate(id: string) {
    const source = plans?.find((p) => p.id === id);
    if (!source) return;
    await duplicateBuildPlan(source, t('industry.copySuffix', { name: source.name }));
  }

  function handleDelete(id: string) {
    if (activeCharacterId === null) return;
    const characterId = activeCharacterId;
    const name = plans?.find((p) => p.id === id)?.name ?? '';
    pendingDeletes.defer({
      id,
      message: t('industry.planDeleted', { name }),
      commit: () => removeBuildPlan(characterId, id),
    });
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
      facilityDefaults: await loadActivityFacilityDefaults(),
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
    closeFitImport();
    navigate(`/industry/groups/${result.groupId}`);
  }

  async function seedCompare(newPlans: readonly BuildPlanRecord[]) {
    await createBuildPlans(newPlans);
    setCompareSelectedIds(new Set(newPlans.map((p) => p.id)));
    setComparing(true);
    setTab('plans');
  }

  async function handleAddOpportunitiesToCompare(rows: readonly OpportunityRow[]) {
    if (activeCharacterId === null || rows.length === 0) return;
    const currentFacilityDefaults = await loadActivityFacilityDefaults();
    await seedCompare(
      rows.map((row) =>
        planForOpportunityCandidate(
          row.candidate,
          currentFacilityDefaults,
          row.materialSourcing,
          row.buildHere,
          activeCharacterId,
          row.hub,
          row.defaultsFrom
        )
      )
    );
  }

  async function handleAddProjectsToCompare(plans: readonly BuildPlanRecord[]) {
    if (activeCharacterId === null || plans.length === 0) return;
    await seedCompare(
      plans.map((plan) => ({
        ...plan,
        id: crypto.randomUUID(),
        characterId: activeCharacterId,
        updatedAt: Date.now(),
      }))
    );
  }

  async function handleStartPlan(
    entry: BlueprintCatalogEntry,
    research?: { me: number; te: number }
  ): Promise<boolean> {
    if (startingPlanRef.current) return false;
    startingPlanRef.current = true;
    try {
      const id = await createPlan(entry, null, null, research ?? null);
      if (id) {
        navigate(`/industry/plans/${id}`);
        return true;
      }
    } catch {}
    startingPlanRef.current = false;
    return false;
  }

  async function handleStartPlanFromRow(
    entry: BlueprintCatalogEntry,
    seed?: OpportunityPlanSeed
  ): Promise<boolean> {
    if (!seed || activeCharacterId === null) return handleStartPlan(entry);
    if (startingPlanRef.current) return false;
    startingPlanRef.current = true;
    try {
      const plan = planForOpportunityCandidate(
        seed.candidate,
        await loadActivityFacilityDefaults(),
        seed.materialSourcing,
        seed.buildHere,
        activeCharacterId,
        seed.hub,
        seed.defaultsFrom
      );
      await createBuildPlans([plan]);
      navigate(`/industry/plans/${plan.id}`);
      return true;
    } catch {}
    startingPlanRef.current = false;
    return false;
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

  const latestPlan = mostRecentlyUpdatedPlan(plans);
  const marketWideHub = newPlanHub(latestPlan);
  const marketWidePanel = catalog && plans !== undefined && (
    <MarketWideOpportunitiesPanel
      key="market-wide"
      hub={marketWideHub}
      latestPlan={latestPlan}
      trees={marketWideTrees}
      treesFailed={marketWideTreesFailed}
      onRetryTrees={retryMarketWideTrees}
      catalog={catalog}
      modifiers={modifiers}
      activeCharacterId={activeCharacterId}
      onStartPlan={handleStartPlan}
      ownedBlueprints={ownedBlueprints}
      assumedMe={assumedMe}
      assumedTe={assumedTe}
    />
  );
  const ownedRankingPanel = !catalog ? null : !pricingInputs.hydrated ? (
    <div key="owned-ranking" className="flex justify-center py-16">
      <Spinner label={t('common.loading')} />
    </div>
  ) : (
    <OpportunitiesPanel
      key="owned-ranking"
      catalog={catalog}
      pi={pi}
      facilityDefaults={facilityDefaults}
      activeCharacterId={activeCharacterId}
      ownedStockSnapshot={workspace.ownedStockSnapshot}
      assumedMe={assumedMe}
      pricingInputs={pricingInputs}
      onAddToCompare={(rows) => void handleAddOpportunitiesToCompare(rows)}
      onAddProjectsToCompare={(plans) => void handleAddProjectsToCompare(plans)}
      onStartPlan={handleStartPlanFromRow}
      onDataAgeChange={setOpportunitiesDataAge}
    />
  );
  const opportunitiesPanels = [marketWidePanel, ownedRankingPanel];
  return (
    <ItemActionsProvider page={itemActions}>
      <div className="mx-auto max-w-page space-y-4">
        <IndustryHeader
          activeCharacterId={activeCharacterId}
          activeTab={tab}
          onTabChange={setTab}
          blueprintsNeedsReauth={blueprintsNeedsReauth}
          meta={
            tab === 'opportunities' && opportunitiesDataAge ? (
              <DataAgeBadge date={opportunitiesDataAge} />
            ) : tab === 'sourcing' && bpcSourcingHeader?.dataAge ? (
              <DataAgeBadge date={bpcSourcingHeader.dataAge} />
            ) : undefined
          }
          actions={
            tab === 'sourcing' && bpcSourcingHeader ? (
              <IconButton
                icon={<Icon.Refresh />}
                label={t('bpcContracts.refresh')}
                onClick={bpcSourcingHeader.refresh}
                busy={bpcSourcingHeader.busy}
              />
            ) : undefined
          }
        />

        <TabPanel tabsId={INDUSTRY_TABS_ID} tabId={tab} className="space-y-4">
          {tab === 'sourcing' ? (
            characterLoaded ? (
              <BpcSourcingPanel onHeaderChange={setBpcSourcingHeader} />
            ) : (
              <Spinner block="page" label={t('common.loading')} />
            )
          ) : (
            <DataGate
              status={
                catalogFailed
                  ? 'failed'
                  : !plans || !catalog || !buildGroupsHydrated || !expandedGroupsHydrated
                    ? 'busy'
                    : 'ok'
              }
              title={t('industry.catalogUnavailable')}
              hint={
                ownedBlueprints.length > 0 ? t('industry.catalogUnavailableOwnedHint') : undefined
              }
              onRetry={retryCatalog}
              resetKey={activeCharacterId}
            >
              {plans && catalog && buildGroupsHydrated && expandedGroupsHydrated && (
                <Suspense fallback={<Spinner block="page" label={t('common.loading')} />}>
                  {tab === 'opportunities' ? (
                    <div className="flex flex-col gap-4">{opportunitiesPanels}</div>
                  ) : tab === 'logs' ? (
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
                        modifiers={modifiers}
                        pricingInputs={pricingInputs}
                        onDone={exitCompare}
                        onOpenPlan={(planId) => {
                          exitCompare();
                          navigate(`/industry/plans/${planId}`);
                        }}
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
                    <BuildPlanList
                      note={
                        (plans?.length ?? 0) > 0 && (
                          <AssumesBaseStandingsNote hint={t('industry.assumesBaseStandingsHint')} />
                        )
                      }
                      plans={plans}
                      catalog={catalog}
                      selectedId={null}
                      onSelect={(id) => navigate(`/industry/plans/${id}`)}
                      onCreate={(entry) => void createPlan(entry)}
                      onDuplicate={(id) => void handleDuplicate(id)}
                      onDelete={handleDelete}
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
                      ownedBlueprints={ownedBlueprints}
                      statsByGroupId={statsByGroupId}
                    />
                  )}
                </Suspense>
              )}
            </DataGate>
          )}
        </TabPanel>

        <ConfirmDialog
          open={deletingGroupId !== null}
          onClose={() => setDeletingGroupId(null)}
          title={t('industry.deleteGroup')}
          body={t('industry.deleteGroupConfirm', {
            group: groups.find((g) => g.id === deletingGroupId)?.name ?? '',
            count: deletingGroupId ? membersOfGroup(deletingGroupId).length : 0,
          })}
          actionLabel={t('industry.deleteGroupAndPlans', {
            count: deletingGroupId ? membersOfGroup(deletingGroupId).length : 0,
          })}
          cancelLabel={t('industry.cancel')}
          onConfirm={async () => {
            if (deletingGroupId) await handleDeleteGroup(deletingGroupId);
          }}
        />

        {blueprintPasteNote && <Toast message={blueprintPasteNote} />}

        <ToastStack
          items={pendingDeletes.items}
          undoLabel={t('industry.errands.undo')}
          onUndo={pendingDeletes.undo}
          onClose={pendingDeletes.commit}
        />

        {fitImportOpen && catalog && (
          <Suspense fallback={null}>
            <FitImportDialog
              catalog={catalog}
              onApply={(preview) => void handleFitImport(preview)}
              onClose={closeFitImport}
              initialText={fitImportSeedText}
            />
          </Suspense>
        )}
      </div>
    </ItemActionsProvider>
  );
}
