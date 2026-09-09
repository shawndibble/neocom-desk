import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  Button,
  Caret,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import { BlueprintPicker } from './BlueprintPicker';
import type { BuildGroup } from './buildGroups';
import {
  dropTargetGroupId,
  groupDropId,
  planDropId,
  planIdFromDropId,
  resolveGroupDrop,
} from './groupDrop';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';

/**
 * Hand-composed, because `closestCenter` — what both existing dnd lists use —
 * is wrong for dropping *into* a container (#627). It scores by distance
 * between droppable centres, so a ~28px group header sitting among ~40px plan
 * rows loses to its neighbours from most pointer positions the pilot would
 * call "on the header".
 *
 * The order is dnd-kit's own recommendation for multi-container lists:
 *
 * 1. `pointerWithin` — the pointer is literally inside a droppable. Exact, and
 *    the answer whenever the pilot is aiming at a specific row.
 * 2. `rectIntersection` — nothing under the pointer, but the dragged rect
 *    overlaps something. Covers a drag whose pointer has run past the list
 *    edge while the row is still over it.
 * 3. `closestCorners` — nothing overlaps either. Also the *first* usable step
 *    for any drag with no pointer coordinates at all, which is why the chain
 *    exists rather than `pointerWithin` alone.
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  const rectHits = rectIntersection(args);
  return rectHits.length > 0 ? rectHits : closestCorners(args);
};

/** A drop target the pointer is currently resolving to. */
const DROP_TARGET_CLASS = 'bg-accent/10 outline-2 -outline-offset-2 outline-accent-dim';

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
  /** Opens the group's own rollup in the detail pane. */
  onSelectGroup: (groupId: string) => void;
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  /** Moves one plan into a group, or out of every group when null. */
  onMovePlan: (planId: string, groupId: string | null) => void;
  onOpenFitImport: () => void;
}

/**
 * The inline rename both a plan row and a group header use: commit on Enter or
 * blur, abandon on Escape, and never store a blank name.
 *
 * Rendered only while renaming, so it re-reads `value` on each open and needs
 * no reset path of its own — which is what the two hand-rolled copies of this
 * were spending their `else setDraftName(...)` branch on.
 */
function RenameField({
  value,
  label,
  onRename,
  onDone,
}: {
  value: string;
  label: string;
  onRename: (name: string) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(value);

  function commit() {
    onDone();
    const name = draft.trim();
    if (name && name !== value) onRename(name);
  }

  return (
    <TextInput
      size="sm"
      autoFocus
      value={draft}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onDone();
      }}
      className="flex-1"
    />
  );
}

type PlanRowProps = {
  plan: BuildPlanRecord;
  active: boolean;
  compareMode: boolean;
  compareSelected: boolean;
  onToggleCompareSelected: (id: string) => void;
  groups: readonly BuildGroup[];
  onMovePlan: (planId: string, groupId: string | null) => void;
  /** Set on a row sitting under its group's header, to step it in from the ungrouped ones. */
  indented?: boolean;
} & Pick<BuildPlanListProps, 'onSelect' | 'onDuplicate' | 'onDelete' | 'onRename'>;

function PlanRow({
  plan,
  active,
  onSelect,
  onDuplicate,
  onDelete,
  onRename,
  compareMode,
  compareSelected,
  onToggleCompareSelected,
  groups,
  onMovePlan,
  indented = false,
}: PlanRowProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  // One id for both roles, the way `useSortable` registers its own: a row is
  // the thing being dragged *and* a target meaning "into whatever group this
  // row is in", which is how an expanded group's body accepts a drop rather
  // than only its header.
  const dropId = planDropId(plan.id);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dropId });
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({ id: dropId });

  return (
    <li
      ref={(node) => {
        setDropRef(node);
        setDragRef(node);
      }}
      className={`flex items-center gap-2 border-b border-line py-1.5 pr-2 text-xs last:border-b-0 ${
        indented ? 'pl-6' : 'pl-2'
      } ${active ? 'bg-panel-2' : ''} ${isDragging ? 'opacity-40' : ''} ${
        isOver && !isDragging ? DROP_TARGET_CLASS : ''
      }`}
    >
      {/* Deliberately not focusable and hidden from assistive tech. Keyboard
          dragging here would step the row a flat 25px per arrow press —
          `sortableKeyboardCoordinates` needs a sort order this list does not
          have — and announce raw droppable ids. The "Move to group" menu two
          controls along reaches every destination this handle does, from the
          keyboard, which is the pointer alternative that matters (WCAG 2.5.7).

          `distance: 4` on the sensor and `touch-none` here are both load-
          bearing, for the reasons EntryList.tsx's copy spells out (#408). */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        {...listeners}
        title={t('industry.dragToGroup')}
        className="shrink-0 cursor-grab touch-none px-1 text-text-faint hover:text-text"
      >
        ⠿
      </button>
      {compareMode && (
        <input
          type="checkbox"
          checked={compareSelected}
          onChange={() => onToggleCompareSelected(plan.id)}
          aria-label={t('industry.compareSelectFor', { name: plan.name })}
          className="size-4 shrink-0 cursor-pointer accent-accent"
        />
      )}
      {renaming ? (
        <RenameField
          value={plan.name}
          label={t('industry.rename')}
          onRename={(name) => onRename(plan.id, name)}
          onDone={() => setRenaming(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelect(plan.id)}
          onDoubleClick={() => setRenaming(true)}
          className="flex-1 truncate text-left"
        >
          {plan.name}
        </button>
      )}
      {/* Three labelled buttons left the plan name ~90px on a phone ("Raven
          Nav…"). The name is the row — the actions are the adornment — so the
          actions become icons and give the width back. Each label names the
          plan too, so a screen reader hears which row it is on; the tooltip
          drops it, since a pointer user is already looking at the row.

          Grouping is a fourth control, which would take that width straight
          back, so it lives behind a menu rather than beside them (#626). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            size="sm"
            icon={<Icon.BuildGroup />}
            label={`${t('industry.moveToGroup')} ${plan.name}`}
            tooltip={t('industry.moveToGroup')}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {groups.map((group) => (
            <DropdownMenuItem
              key={group.id}
              disabled={plan.buildGroupId === group.id}
              onSelect={() => onMovePlan(plan.id, group.id)}
            >
              {group.name}
            </DropdownMenuItem>
          ))}
          {groups.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem
            disabled={plan.buildGroupId === undefined}
            onSelect={() => onMovePlan(plan.id, null)}
          >
            {t('industry.removeFromGroup')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton
        size="sm"
        icon={<Icon.Rename />}
        label={`${t('industry.rename')} ${plan.name}`}
        tooltip={t('industry.rename')}
        onClick={() => setRenaming(true)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Duplicate />}
        label={`${t('industry.duplicate')} ${plan.name}`}
        tooltip={t('industry.duplicate')}
        onClick={() => onDuplicate(plan.id)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        label={`${t('industry.delete')} ${plan.name}`}
        tooltip={t('industry.delete')}
        tone="danger"
        onClick={() => onDelete(plan.id)}
      />
    </li>
  );
}

function GroupHeader({
  group,
  memberCount,
  expanded,
  active,
  dropActive,
  compareMode,
  membersSelected,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  onToggleAllMembers,
}: {
  group: BuildGroup;
  memberCount: number;
  expanded: boolean;
  active: boolean;
  /** A dragged plan currently resolves to this group — including via one of its member rows. */
  dropActive: boolean;
  compareMode: boolean;
  /** 'all' | 'some' | 'none' — drives the header checkbox's indeterminate state. */
  membersSelected: 'all' | 'some' | 'none';
  onToggle: () => void;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onToggleAllMembers: (selected: boolean) => void;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  // A collapsed group renders no member rows at all, so this header is the
  // only rect its group has — the case #627 exists for.
  const { setNodeRef } = useDroppable({ id: groupDropId(group.id) });

  return (
    <li
      ref={setNodeRef}
      className={`flex items-center gap-2 border-b border-line px-2 py-1.5 text-xs ${
        active ? 'bg-panel-2' : ''
      } ${dropActive ? DROP_TARGET_CLASS : ''}`}
    >
      {/* Compare's checkbox only ever renders on a *visible* row, so a
          collapsed group's members are unreachable without this — it selects
          every member at once rather than making the pilot expand first. */}
      {compareMode && (
        <input
          type="checkbox"
          checked={membersSelected === 'all'}
          ref={(el) => {
            if (el) el.indeterminate = membersSelected === 'some';
          }}
          onChange={() => onToggleAllMembers(membersSelected !== 'all')}
          aria-label={t('industry.selectGroupMembers', { name: group.name })}
          className="size-4 shrink-0 cursor-pointer accent-accent"
        />
      )}
      <IconButton
        size="sm"
        variant="plain"
        icon={<Caret expanded={expanded} />}
        label={t('industry.toggleGroup', { name: group.name })}
        aria-expanded={expanded}
        onClick={onToggle}
      />
      {renaming ? (
        <RenameField
          value={group.name}
          label={t('industry.renameGroup')}
          onRename={onRename}
          onDone={() => setRenaming(false)}
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => setRenaming(true)}
          className="flex-1 truncate text-left font-semibold"
        >
          {group.name}
        </button>
      )}
      <span className="shrink-0 tabular-nums text-text-dim">{memberCount}</span>
      <IconButton
        size="sm"
        icon={<Icon.Rename />}
        label={`${t('industry.renameGroup')} ${group.name}`}
        tooltip={t('industry.renameGroup')}
        onClick={() => setRenaming(true)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        label={`${t('industry.deleteGroup')} ${group.name}`}
        tooltip={t('industry.deleteGroup')}
        tone="danger"
        onClick={onDelete}
      />
    </li>
  );
}

/** Build Plan CRUD list: create via blueprint search, select, duplicate, delete, rename inline. Owns Compare mode's row checkboxes (issue #453) and the Build Group rows (issue #626) — the comparison and the group rollup both render in `Industry.tsx`'s detail pane. A plan row can be dragged onto a group header or another group's row to move it (issue #627); `groupDrop.ts` decides what a drop meant. */
export function BuildPlanList({
  plans,
  catalog,
  selectedId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  onRename,
  compareMode,
  compareSelectedIds,
  onToggleCompareMode,
  onToggleCompareSelected,
  onOpenCompare,
  groups,
  expandedGroupIds,
  selectedGroupId,
  onToggleGroup,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onMovePlan,
  onOpenFitImport,
}: BuildPlanListProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    // A bare PointerSensor starts dragging on the first pixel of pointer
    // movement, which fires from ordinary jitter on a click and fights a tap
    // on touch — every row here has four tap targets sitting beside the
    // handle. EntryList.tsx settled on the same constraint for the same
    // reason (#408).
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );
  /** The plan under the pointer mid-drag, for the overlay. */
  const [draggingPlanId, setDraggingPlanId] = useState<string | null>(null);
  /** Where a drop would land right now: a group id, null for ungrouped, undefined for nowhere. */
  const [dropGroupId, setDropGroupId] = useState<string | null | undefined>(undefined);

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
    for (const plan of plans) {
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
    return { membersByGroup: byGroup, ungrouped: loose, groupOfPlan: ofPlan };
  }, [plans, groups]);

  const draggingPlan =
    draggingPlanId === null ? undefined : plans.find((p) => p.id === draggingPlanId);

  function overId(over: { id: string | number } | null) {
    return over === null ? null : String(over.id);
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingPlanId(planIdFromDropId(String(event.active.id)));
  }

  function handleDragOver(event: DragOverEvent) {
    setDropGroupId(dropTargetGroupId(overId(event.over), groupOfPlan));
  }

  function endDrag() {
    setDraggingPlanId(null);
    setDropGroupId(undefined);
  }

  function handleDragEnd(event: DragEndEvent) {
    const move = resolveGroupDrop(String(event.active.id), overId(event.over), groupOfPlan);
    endDrag();
    // A drop that changes nothing — back into the same group, onto itself, or
    // outside the list — is not written: `handleMovePlan` bumps `updatedAt`
    // and schedules a sync, which a no-op move has no business doing.
    if (move) onMovePlan(move.planId, move.groupId);
  }

  function rowProps(plan: BuildPlanRecord) {
    return {
      plan,
      active: plan.id === selectedId,
      onSelect,
      onDuplicate,
      onDelete,
      onRename,
      compareMode,
      compareSelected: compareSelectedIds.has(plan.id),
      onToggleCompareSelected,
      groups,
      onMovePlan,
    };
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('industry.title')}
        </h2>
        {compareMode ? (
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
        )}
      </div>

      <BlueprintPicker catalog={catalog} onPick={onCreate} />

      {plans.length === 0 && groups.length === 0 ? (
        <EmptyState
          title={t('industry.emptyTitle')}
          hint={t('industry.emptyHint')}
          className="py-6"
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
          // default, matching EntryList.tsx: the list below is a capped-height
          // scroller (#408's shape), and the default threshold leaves too
          // little room near its edges to start autoscrolling before the
          // pointer runs out of list.
          autoScroll={{ threshold: { x: 0.2, y: 0.25 }, acceleration: 20 }}
        >
          {/* The scroller is the row list alone, not the whole pane: the heading
              and the blueprint picker stay put while a long plan list scrolls
              under them, same as Mail's list. */}
          <ul className="max-h-[28rem] overflow-y-auto rounded-xs border border-line">
            {/* A group's header and its members are siblings in this one list,
                not a nested `ul` per group: a nested list announces "list, 1
                item" before every single plan. */}
            {groups.map((group) => {
              const members = membersByGroup.get(group.id) ?? [];
              const selectedCount = members.filter((p) => compareSelectedIds.has(p.id)).length;
              return (
                <Fragment key={group.id}>
                  <GroupHeader
                    group={group}
                    memberCount={members.length}
                    expanded={expandedGroupIds.has(group.id)}
                    active={group.id === selectedGroupId}
                    dropActive={dropGroupId === group.id}
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
  );
}
