import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Button, EmptyState, IconButton, Panel, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useStableCallback } from './useStableCallback';
import { useUrlFilter } from '@/lib/useUrlState';
import { usePrefersReducedMotion, useTouchContext } from '@/lib/useMediaQuery';
import { BuildPlanFilterBar } from './BuildPlanFilterBar';
import {
  BUILD_PLAN_FILTER,
  DEFAULT_BUILD_PLAN_FILTER,
  GROUP_ANY,
  GROUP_NONE,
  activePlanFilterCount,
  filterPlans,
  type BuildPlanFilterState,
} from './buildPlanFilter';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { BlueprintPicker } from './BlueprintPicker';
import type { BuildGroup } from './buildGroups';
import { planDropId, planIdFromDropId, resolveGroupDrop } from './groupDrop';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { BuildPlanSortHeader } from './BuildPlanSortHeader';
import { useBuildPlanSort, sortPlans } from './buildPlanSort';
import { collisionDetection } from './buildPlanDnd';
import { PlanRow } from './BuildPlanRow';
import { GroupHeader } from './BuildGroupHeader';

export type PlanVerdictTag = 'build' | 'buy' | 'unknown' | 'fixLocation';

export interface PlanRollupStats {
  profit: number | null;
  verdict: PlanVerdictTag;
  buildCost?: number | null;
  buyCost?: number | null;
}

export interface PlanIndexStats extends PlanRollupStats {
  runs: number;
  iskPerHour?: number | null;
  marginPct?: number | null;
}

interface BuildPlanListProps {
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (entry: BlueprintCatalogEntry) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  compareMode: boolean;
  compareSelectedIds: ReadonlySet<string>;
  onToggleCompareMode: () => void;
  onToggleCompareSelected: (id: string) => void;
  onOpenCompare: () => void;
  groups: readonly BuildGroup[];
  expandedGroupIds: ReadonlySet<string>;
  selectedGroupId: string | null;
  onToggleGroup: (groupId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onMovePlan: (planId: string, groupId: string | null) => void;
  onOpenFitImport: () => void;
  note?: ReactNode;
  statsByPlanId: ReadonlyMap<string, PlanIndexStats>;
  ownedBlueprints?: readonly CharacterBlueprint[];
  statsByGroupId: ReadonlyMap<string, PlanRollupStats>;
}

export function BuildPlanList({
  plans,
  catalog,
  selectedId,
  onSelect: onSelectProp,
  onCreate,
  onDuplicate: onDuplicateProp,
  onDelete: onDeleteProp,
  onRename: onRenameProp,
  compareMode,
  compareSelectedIds,
  onToggleCompareMode,
  onToggleCompareSelected: onToggleCompareSelectedProp,
  onOpenCompare,
  groups,
  expandedGroupIds,
  selectedGroupId,
  onToggleGroup,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onMovePlan: onMovePlanProp,
  onOpenFitImport,
  note,
  statsByPlanId,
  statsByGroupId,
  ownedBlueprints,
}: BuildPlanListProps) {
  const { t } = useTranslation();
  const touchContext = useTouchContext();
  const reduced = usePrefersReducedMotion();
  const onSelect = useStableCallback(onSelectProp);
  const onDuplicate = useStableCallback(onDuplicateProp);
  const onDelete = useStableCallback(onDeleteProp);
  const onRename = useStableCallback(onRenameProp);
  const onToggleCompareSelected = useStableCallback(onToggleCompareSelectedProp);
  const onMovePlan = useStableCallback(onMovePlanProp);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const { sort, cycleSort } = useBuildPlanSort();
  const [draggingPlanId, setDraggingPlanId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    overId: string;
    groupId: string | null;
  } | null>(null);

  const [urlFilter, setFilter] = useUrlFilter<BuildPlanFilterState>(
    'build-plans',
    BUILD_PLAN_FILTER.schema,
    BUILD_PLAN_FILTER.fieldToParam,
    BUILD_PLAN_FILTER.emptyParams
  );
  const filter = useMemo<BuildPlanFilterState>(() => {
    const knownGroup =
      urlFilter.group === GROUP_ANY ||
      urlFilter.group === GROUP_NONE ||
      groups.some((group) => group.id === urlFilter.group);
    return {
      ...urlFilter,
      ownership: ownedBlueprints === undefined ? 'any' : urlFilter.ownership,
      group: knownGroup ? urlFilter.group : GROUP_ANY,
    };
  }, [urlFilter, ownedBlueprints, groups]);
  const filtering = activePlanFilterCount(filter) > 0;
  const sharedNames = useMemo(() => {
    const seen = new Set<string>();
    const shared = new Set<string>();
    for (const plan of plans) {
      const key = plan.name.trim().toLowerCase();
      if (seen.has(key)) shared.add(key);
      seen.add(key);
    }
    return shared;
  }, [plans]);
  const visiblePlans = useMemo(
    () =>
      filterPlans(plans, filter, {
        owned: ownedBlueprints ?? [],
        activityOf: (plan) =>
          catalog.byBlueprintTypeID.get(plan.blueprintTypeID)?.blueprint.activity,
        statsByPlanId,
        knownGroupIds: new Set(groups.map((group) => group.id)),
      }),
    [plans, filter, ownedBlueprints, catalog, statsByPlanId, groups]
  );

  const { membersByGroup, ungrouped, groupOfPlan } = useMemo(() => {
    const known = new Set(groups.map((group) => group.id));
    const byGroup = new Map<string, BuildPlanRecord[]>();
    const loose: BuildPlanRecord[] = [];
    const ofPlan = new Map<string, string>();
    for (const plan of visiblePlans) {
      const groupId = plan.buildGroupId;
      if (groupId === undefined || !known.has(groupId)) {
        loose.push(plan);
        continue;
      }
      ofPlan.set(plan.id, groupId);
      const members = byGroup.get(groupId);
      if (members) members.push(plan);
      else byGroup.set(groupId, [plan]);
    }
    for (const [groupId, members] of byGroup) {
      byGroup.set(groupId, [...sortPlans(members, sort, statsByPlanId)]);
    }
    return {
      membersByGroup: byGroup,
      ungrouped: [...sortPlans(loose, sort, statsByPlanId)],
      groupOfPlan: ofPlan,
    };
  }, [visiblePlans, groups, sort, statsByPlanId]);

  const draggingPlan =
    draggingPlanId === null ? undefined : plans.find((p) => p.id === draggingPlanId);

  function droppableIdOf(over: { id: string | number } | null) {
    return over === null ? null : String(over.id);
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingPlanId(planIdFromDropId(String(event.active.id)));
  }

  function handleDragOver(event: DragOverEvent) {
    const over = droppableIdOf(event.over);
    const move = resolveGroupDrop(String(event.active.id), over, groupOfPlan);
    setDropTarget(move === null || over === null ? null : { overId: over, groupId: move.groupId });
  }

  function endDrag() {
    setDraggingPlanId(null);
    setDropTarget(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const move = resolveGroupDrop(String(event.active.id), droppableIdOf(event.over), groupOfPlan);
    endDrag();
    if (move) onMovePlan(move.planId, move.groupId);
  }

  function rowProps(plan: BuildPlanRecord) {
    const hovered = dropTarget !== null && dropTarget.overId === planDropId(plan.id);
    return {
      plan,
      active: plan.id === selectedId,
      dropKind: !hovered
        ? null
        : dropTarget.groupId === null
          ? ('out' as const)
          : ('into' as const),
      onSelect,
      onDuplicate,
      onDelete,
      onRename,
      compareMode,
      compareSelected: compareSelectedIds.has(plan.id),
      onToggleCompareSelected,
      groups,
      onMovePlan,
      stats: statsByPlanId.get(plan.id),
      locationHint: sharedNames.has(plan.name.trim().toLowerCase())
        ? (plan.buildLocationName ?? plan.buildSystemName)
        : undefined,
    };
  }

  const picker = (
    <BlueprintPicker
      catalog={catalog}
      onPick={onCreate}
      ownedBlueprints={ownedBlueprints}
      className="min-w-0 flex-1 basis-48"
    />
  );

  return (
    <Panel
      title={t('industry.title')}
      actions={
        compareMode ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onToggleCompareMode}>
              {t('industry.compareCancel')}
            </Button>
            <Tooltip content={compareSelectedIds.size < 2 ? t('industry.compareNeedsTwo') : null}>
              <Button
                variant="primary"
                size="sm"
                aria-disabled={compareSelectedIds.size < 2 || undefined}
                onClick={onOpenCompare}
              >
                {t('industry.compareHandle', { count: compareSelectedIds.size })}
              </Button>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <IconButton
              size="sm"
              icon={<Icon.ImportClipboard />}
              label={t('industry.fitImportOpen')}
              onClick={onOpenFitImport}
            />
            <IconButton
              size="sm"
              icon={<Icon.BuildGroup />}
              label={t('industry.createGroup')}
              onClick={onCreateGroup}
            />
            {plans.length > 1 && (
              <IconButton
                size="sm"
                icon={<Icon.Compare />}
                label={t('industry.compareToggle')}
                onClick={onToggleCompareMode}
              />
            )}
          </div>
        )
      }
    >
      {note}
      <div className="space-y-2">
        {plans.length === 0 ? (
          picker
        ) : (
          <BuildPlanFilterBar
            filter={filter}
            onChange={setFilter}
            groups={groups}
            search={picker}
            canFilterOwnership={ownedBlueprints !== undefined}
            resultCount={visiblePlans.length}
          />
        )}
        {filtering && plans.length > 0 && (
          <p className="text-xs text-text-dim" aria-live="polite">
            {t('industry.planFilters.count', { shown: visiblePlans.length, total: plans.length })}
          </p>
        )}

        {plans.length === 0 && groups.length === 0 ? (
          <EmptyState
            title={t('industry.emptyTitle')}
            hint={t('industry.emptyHint', { context: touchContext })}
            className="py-6"
          />
        ) : filtering && visiblePlans.length === 0 ? (
          <EmptyState
            title={t('industry.planFilters.noMatchTitle')}
            hint={t('industry.planFilters.noMatchHint')}
            className="py-6"
            action={
              <Button size="sm" onClick={() => setFilter(DEFAULT_BUILD_PLAN_FILTER)}>
                {t('common.resetFilters')}
              </Button>
            }
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={endDrag}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            autoScroll={{ threshold: { x: 0.2, y: 0.25 }, acceleration: 20 }}
          >
            <div className="flex items-center gap-2 border-b border-line bg-panel-2 px-2 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              <span className="flex-1">{t('industry.title')}</span>
              <BuildPlanSortHeader
                sortKey="profit"
                label={t('industry.profitColumn')}
                sort={sort}
                onSort={cycleSort}
                className="w-24 shrink-0 text-right"
              />
              <BuildPlanSortHeader
                sortKey="iskPerHour"
                label={t('industry.iskPerHourColumn')}
                sort={sort}
                onSort={cycleSort}
                className="hidden w-24 shrink-0 text-right lg:block"
              />
              <BuildPlanSortHeader
                sortKey="margin"
                label={t('industry.marginColumn')}
                sort={sort}
                onSort={cycleSort}
                className="hidden w-16 shrink-0 text-right lg:block"
              />
              <span className="hidden w-14 shrink-0 justify-end sm:flex">
                {t('industry.verdictColumn')}
              </span>
              <span className="hidden w-8 shrink-0 text-right sm:block">
                {t('industry.runsColumn')}
              </span>
              <span className="w-9 shrink-0 md:w-7" aria-hidden="true" />
            </div>
            <ul className="rounded-xs border border-line">
              {groups.map((group) => {
                const members = membersByGroup.get(group.id) ?? [];
                const selectedCount = members.filter((p) => compareSelectedIds.has(p.id)).length;
                return (
                  <Fragment key={group.id}>
                    <GroupHeader
                      group={group}
                      expanded={expandedGroupIds.has(group.id)}
                      active={group.id === selectedGroupId}
                      dropActive={dropTarget?.groupId === group.id}
                      compareMode={compareMode}
                      membersSelected={
                        members.length > 0 && selectedCount === members.length
                          ? 'all'
                          : selectedCount > 0
                            ? 'some'
                            : 'none'
                      }
                      onToggle={() => onToggleGroup(group.id)}
                      onSelect={() => onSelectGroup(group.id)}
                      onRename={(name) => onRenameGroup(group.id, name)}
                      onDelete={() => onDeleteGroup(group.id)}
                      stats={statsByGroupId.get(group.id)}
                      onToggleAllMembers={(selected) => {
                        for (const member of members) {
                          if (compareSelectedIds.has(member.id) !== selected) {
                            onToggleCompareSelected(member.id);
                          }
                        }
                      }}
                    />
                    {expandedGroupIds.has(group.id) &&
                      members.map((plan) => <PlanRow key={plan.id} {...rowProps(plan)} indented />)}
                  </Fragment>
                );
              })}
              {ungrouped.map((plan) => (
                <PlanRow key={plan.id} {...rowProps(plan)} />
              ))}
            </ul>
            <DragOverlay dropAnimation={reduced ? null : undefined}>
              {draggingPlan && (
                <div className="rounded-xs border border-accent-dim bg-panel-2 px-2 py-1.5 text-xs">
                  {draggingPlan.name}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </Panel>
  );
}
