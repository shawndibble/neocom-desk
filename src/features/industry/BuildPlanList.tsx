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
import { Button, EmptyState, IconButton, Panel } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useStableCallback } from './useStableCallback';
import { useUrlFilter } from '@/lib/useUrlState';
import { BuildPlanFilterBar } from './BuildPlanFilterBar';
import {
  BUILD_PLAN_FILTER,
  DEFAULT_BUILD_PLAN_FILTER,
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

/** Build-vs-buy verdict, compact enough for a list row's own column. */
export type PlanVerdictTag = 'build' | 'buy' | 'unknown' | 'fixLocation';

/** Profit / Verdict — the two figures both a plan row and a group row carry. */
export interface PlanRollupStats {
  /**
   * Profit after fees — materials + job cost + sales tax + broker fee,
   * against selling the finished product(s). Same figure the plan's detail
   * page headlines; for a group row, the sum of each member's own profit
   * (`BuildGroupRollup.profit`). Null when unpriceable.
   */
  profit: number | null;
  /** Build/Buy verdict: buy price minus build cost, positive means cheaper to build. Independent of `profit` above. */
  verdict: PlanVerdictTag;
  /**
   * The two totals the verdict compares — what building costs (materials +
   * job fees) and what buying the product(s) outright costs. Null when
   * unpriceable; the verdict tag's tooltip shows them so the call is
   * explainable, since `profit` above is a different question.
   */
  buildCost?: number | null;
  buyCost?: number | null;
}

/** One plan row's Est. total / Verdict / Runs — everything the pricing/records data supplies per plan. */
export interface PlanIndexStats extends PlanRollupStats {
  runs: number;
  /** Profit per hour of job time; null when unpriceable. Read only by the `lg:` ISK/h column and its sort. */
  iskPerHour?: number | null;
  /** Profit as a percentage of revenue; null when unpriceable. Read only by the `lg:` Margin column and its sort. */
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
  /** Compare mode (issue #453): a per-row checkbox replaces plain row selection for building a comparison set. */
  compareMode: boolean;
  compareSelectedIds: ReadonlySet<string>;
  onToggleCompareMode: () => void;
  onToggleCompareSelected: (id: string) => void;
  /** Opens the comparison table for the checked plans (disabled below 2 selections). */
  onOpenCompare: () => void;
  /** Build Groups (issue #626), in display order. */
  groups: readonly BuildGroup[];
  /** Which groups are open. Absent means collapsed — see `expandedGroups.ts`. */
  expandedGroupIds: ReadonlySet<string>;
  selectedGroupId: string | null;
  onToggleGroup: (groupId: string) => void;
  /** Opens the group's own rollup page (`/industry/groups/:id`). */
  onSelectGroup: (groupId: string) => void;
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  /** Moves one plan into a group, or out of every group when null. */
  onMovePlan: (planId: string, groupId: string | null) => void;
  onOpenFitImport: () => void;
  /** Sits under the header bar, above the search box � e.g. the base-standings note. */
  note?: ReactNode;
  /** Profit / Verdict / Runs per plan row — `undefined` renders every column as "—". */
  statsByPlanId: ReadonlyMap<string, PlanIndexStats>;
  /** Owned blueprints, so the picker can tag results the pilot already has a copy of. */
  ownedBlueprints?: readonly CharacterBlueprint[];
  /** Profit / Verdict per group row (rolled up from its members) — Runs has no group-level meaning. */
  statsByGroupId: ReadonlyMap<string, PlanRollupStats>;
}

/**
 * Build Plan CRUD list: create via blueprint search, select, duplicate,
 * delete, rename inline. Owns Compare mode's row checkboxes (issue #453) and
 * the Build Group rows (issue #626). `onSelect`/`onSelectGroup` navigate to
 * that plan's/group's own full-width page (`/industry/plans/:id`,
 * `/industry/groups/:id`) rather than swapping an in-memory selection — this
 * is now the whole `/industry` index, not a sidebar beside a detail column.
 * A plan row can be dragged onto a group header or another group's row to
 * move it (issue #627); `groupDrop.ts` decides what a drop meant.
 */
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
  // Parents pass inline handlers; stable wrappers keep the memoised PlanRows
  // from re-rendering on every list render.
  const onSelect = useStableCallback(onSelectProp);
  const onDuplicate = useStableCallback(onDuplicateProp);
  const onDelete = useStableCallback(onDeleteProp);
  const onRename = useStableCallback(onRenameProp);
  const onToggleCompareSelected = useStableCallback(onToggleCompareSelectedProp);
  const onMovePlan = useStableCallback(onMovePlanProp);
  const sensors = useSensors(
    // A bare PointerSensor starts dragging on the first pixel of pointer
    // movement, which fires from ordinary jitter on a click and fights a tap
    // on touch — every row here has four tap targets sitting beside the
    // handle. EntryList.tsx settled on the same constraint for the same
    // reason (#408).
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );
  // Click-to-sort orders plans within each section (a group's members, the
  // ungrouped ones) and leaves group rows where they are.
  const { sort, cycleSort } = useBuildPlanSort();
  /** The plan being dragged, for the overlay. */
  const [draggingPlanId, setDraggingPlanId] = useState<string | null>(null);
  /**
   * The drop the pointer is currently offering, or null when it is offering
   * none — which includes hovering the dragged plan's *own* group, since that
   * drop would change nothing.
   *
   * Resolved through `resolveGroupDrop`, the same function `onDragEnd` writes
   * from, so the highlight can never promise a move the drop then discards.
   * `overId` is kept alongside the group so the row under the pointer and the
   * group header it belongs to can light up together.
   */
  const [dropTarget, setDropTarget] = useState<{
    overId: string;
    groupId: string | null;
  } | null>(null);

  // The filter lives in the URL, so a reload or a shared link keeps it.
  const [filter, setFilter] = useUrlFilter<BuildPlanFilterState>(
    'build-plans',
    BUILD_PLAN_FILTER.schema,
    BUILD_PLAN_FILTER.fieldToParam,
    BUILD_PLAN_FILTER.emptyParams
  );
  const filtering = activePlanFilterCount(filter) > 0;
  // Two plans may share a name (one blueprint, two stations). Only those rows
  // say where they run, so a unique name stays a single clean line.
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

  // One pass, rather than a `filter` per group plus a `some` per plan.
  //
  // A plan whose group is gone — deleted here, or a sync race delivering the
  // plan before the settings blob — falls into `ungrouped` and renders as an
  // ordinary plan rather than vanishing from the list.
  //
  // `groupOfPlan` comes out of this same pass rather than off `buildGroupId`
  // directly, so drop resolution answers "which group does this row look like
  // it is in" — the question the pilot is actually asking mid-drag.
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

  /** dnd-kit ids are `string | number`; every id this list registers is a string. */
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
    // A drop that changes nothing — back into the same group, onto itself, or
    // outside the list — is not written: `handleMovePlan` bumps `updatedAt`
    // and schedules a sync, which a no-op move has no business doing.
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
    <BlueprintPicker catalog={catalog} onPick={onCreate} ownedBlueprints={ownedBlueprints} />
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
            <Button
              variant="primary"
              size="sm"
              disabled={compareSelectedIds.size < 2}
              onClick={onOpenCompare}
            >
              {t('industry.compareHandle', { count: compareSelectedIds.size })}
            </Button>
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
            {/* Compare was a labelled button until the two controls above
                  joined it (#626) — three labels wrapped the toolbar onto a
                  second line on a phone, which is the width this list can least
                  afford. */}
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
            hint={t('industry.emptyHint')}
            className="py-6"
          />
        ) : filtering && visiblePlans.length === 0 ? (
          <EmptyState
            title={t('industry.planFilters.noMatchTitle')}
            hint={t('industry.planFilters.noMatchHint')}
            className="py-6"
            action={
              <Button size="sm" onClick={() => setFilter(DEFAULT_BUILD_PLAN_FILTER)}>
                {t('industry.planFilters.clear')}
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
            // Droppable rects are measured once at drag start by default, and
            // this list reflows *during* a drag: dropping expands the target
            // group (Industry.tsx), and the underlying `useLiveQuery` can
            // deliver a changed plan set at any moment. Every rect below the
            // change would otherwise be stale for the rest of the drag.
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            // Wider edge threshold and stronger acceleration than dnd-kit's
            // default (#408, matching EntryList.tsx): now that the list has no
            // scroller of its own, the nearest scrollable ancestor dnd-kit finds
            // is the page itself, and the default threshold leaves too little
            // room near the viewport's top/bottom edge to trigger autoscroll
            // before the pointer runs off screen.
            autoScroll={{ threshold: { x: 0.2, y: 0.25 }, acceleration: 20 }}
          >
            {/* Column labels for the three cells every row now carries. Not a
              `role="table"` header — this list stays the flat `<ul>` above
              (a nested list per group would announce "list, 1 item" before
              every plan), so this is a plain labelled strip lined up with the
              row cells by the same fixed widths, not real table cells. */}
            <div className="flex items-center gap-2 border-b border-line bg-panel-2 px-2 py-1.5 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
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
              {/* A group's header and its members are siblings in this one list,
                not a nested `ul` per group: a nested list announces "list, 1
                item" before every single plan. */}
              {groups.map((group) => {
                const members = membersByGroup.get(group.id) ?? [];
                // A group with nothing left under the filter is noise, not an answer.
                if (filtering && members.length === 0) return null;
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
                        // Toggled one row at a time, through the very callback a
                        // row's own checkbox uses, so the header can never write a
                        // selection the rows disagree with.
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
            {/* Name only, not a copy of the row: a second set of the row's
              labelled buttons would put duplicate accessible names in the
              document for as long as the drag lasts. */}
            <DragOverlay>
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
