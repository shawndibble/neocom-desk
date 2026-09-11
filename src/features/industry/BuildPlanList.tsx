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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  EmptyState,
  IconButton,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import { iskToneClass } from '@/features/character/format';
import { formatIsk } from '@/lib/isk';
import { BlueprintPicker } from './BlueprintPicker';
import { BuildPlanRowContextMenu } from './BuildPlanRowContextMenu';
import type { BuildGroup } from './buildGroups';
import { groupDropId, planDropId, planIdFromDropId, resolveGroupDrop } from './groupDrop';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';

/** Build-vs-buy verdict, compact enough for a list row's own column. */
export type PlanVerdictTag = 'build' | 'buy' | 'unknown';

/** Profit / Verdict — the two figures both a plan row and a group row carry. */
export interface PlanRollupStats {
  /** Buy price minus build cost — positive is money saved building it, negative is money lost building it. Null with no buy price to compare against. */
  profit: number | null;
  verdict: PlanVerdictTag;
}

/** One plan row's Est. total / Verdict / Runs — everything the pricing/records data supplies per plan. */
export interface PlanIndexStats extends PlanRollupStats {
  runs: number;
}

// Same tone convention `PlanVerdictHero.tsx`'s `VerdictPill` already
// established for this exact build/buy/unknown concept — not the ISK-amount
// tokens (`isk-pos`/`isk-neg`), which DESIGN.md §1 reserves for money
// figures, and not a fourth ad-hoc palette for what is still a two-outcome
// status, which already has one (`success`/`warning`/muted).
const VERDICT_TAG_CLASS: Record<PlanVerdictTag, string> = {
  build: 'text-success border-success/50',
  buy: 'text-warning border-warning/50',
  unknown: 'text-text-faint border-line',
};

function VerdictTag({ verdict }: { verdict: PlanVerdictTag }) {
  const { t } = useTranslation();
  const label =
    verdict === 'build'
      ? t('industry.verdictTagBuild')
      : verdict === 'buy'
        ? t('industry.verdictTagBuy')
        : t('industry.verdictTagUnknown');
  return (
    <span
      className={`rounded-xs border px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide ${VERDICT_TAG_CLASS[verdict]}`}
    >
      {label}
    </span>
  );
}

/** `runs === 0` reads as "—", not "0" — an unraised plan is not the same statement as a plan with zero runs recorded. */
function RunsCell({ runs }: { runs: number }) {
  return <span className="tabular-nums text-text-dim">{runs > 0 ? runs : '—'}</span>;
}

/** Sign kept alongside the color, not instead of it (DESIGN.md §7) — a viewer who can't tell green from red still reads "+"/"-". */
function ProfitCell({ profit }: { profit: number | null }) {
  if (profit === null) return <span className="tabular-nums text-text-dim">—</span>;
  return (
    <span className={`tabular-nums ${iskToneClass(profit)}`}>
      {profit > 0 ? '+' : ''}
      {formatIsk(profit)}
    </span>
  );
}

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

/** A drop that lands the plan *in* a group: accent, the app's "this is the live target" colour. */
const DROP_INTO_CLASS = 'bg-accent/10 outline-2 -outline-offset-2 outline-accent-dim';
/**
 * A drop that takes the plan *out* of every group. Deliberately not the accent
 * treatment: leaving is the absence of a destination, and drawing it as one
 * more would lose the only distinction `groupDrop.ts` works to keep — a plain
 * dashed hairline reads as "no group" rather than as another group.
 */
const DROP_OUT_CLASS = 'outline-2 -outline-offset-2 outline-dashed outline-line-bright';

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
  /** Profit / Verdict / Runs per plan row — `undefined` renders every column as "—". */
  statsByPlanId: ReadonlyMap<string, PlanIndexStats>;
  /** Profit / Verdict per group row (rolled up from its members) — Runs has no group-level meaning. */
  statsByGroupId: ReadonlyMap<string, PlanRollupStats>;
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
  /** What a drop on this row would do right now, or null when it would do nothing — see `dropTarget` in the list. */
  dropKind: 'into' | 'out' | null;
  /** Set on a row sitting under its group's header, to step it in from the ungrouped ones. */
  indented?: boolean;
  stats: PlanIndexStats | undefined;
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
  dropKind,
  indented = false,
  stats,
}: PlanRowProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  // One id for both roles, the way `useSortable` registers its own: a row is
  // the thing being dragged *and* a target meaning "into whatever group this
  // row is in", which is how an expanded group's body accepts a drop rather
  // than only its header.
  const dropId = planDropId(plan.id);
  const { setNodeRef: setDropRef } = useDroppable({ id: dropId });
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
        dropKind === 'into' ? DROP_INTO_CLASS : dropKind === 'out' ? DROP_OUT_CLASS : ''
      }`}
    >
      {/* No groups yet means every drop is a no-op, and a grab cursor on a row
          nothing will accept is a lie — so the handle appears with the first
          group. The list still renders inside a DndContext either way, which
          keeps the hooks above unconditional.

          Deliberately not focusable and hidden from assistive tech. Keyboard
          dragging here would step the row a flat 25px per arrow press —
          `sortableKeyboardCoordinates` needs a sort order this list does not
          have — and announce raw droppable ids. The row's `ContextMenu` (name
          button, opens on right-click/long-press or the keyboard's Shift+F10 /
          Menu key) has a "Move to group" submenu that reaches every
          destination this handle does, which is the pointer alternative that
          matters (WCAG 2.5.7).

          The `title` is a pointer-only hint on a pointer-only control rather
          than a `Tooltip`, which would put it back in the accessibility tree
          this element is deliberately out of.

          `distance: 4` on the sensor and `touch-none` here are both load-
          bearing, for the reasons EntryList.tsx's copy spells out (#408). */}
      {groups.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          {...listeners}
          title={t('industry.dragToGroup')}
          className="shrink-0 cursor-grab touch-none px-1 text-text-faint hover:text-text"
        >
          <Icon.DragHandle />
        </button>
      )}
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
        // Only Delete stays a visible button; move-to-group/rename/duplicate
        // move into the row's context menu, so delete doesn't get lost among
        // four same-weight icons.
        <BuildPlanRowContextMenu
          plan={plan}
          groups={groups}
          onRename={() => setRenaming(true)}
          onDuplicate={() => onDuplicate(plan.id)}
          onMovePlan={(groupId) => onMovePlan(plan.id, groupId)}
        >
          <button
            type="button"
            onClick={() => onSelect(plan.id)}
            onDoubleClick={() => setRenaming(true)}
            className="flex-1 truncate text-left"
          >
            {plan.name}
          </button>
        </BuildPlanRowContextMenu>
      )}
      <span className="w-24 shrink-0 text-right">
        <ProfitCell profit={stats?.profit ?? null} />
      </span>
      <span className="hidden w-14 shrink-0 justify-end sm:flex">
        <VerdictTag verdict={stats?.verdict ?? 'unknown'} />
      </span>
      <span className="hidden w-8 shrink-0 text-right sm:block">
        <RunsCell runs={stats?.runs ?? 0} />
      </span>
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
  stats,
}: {
  group: BuildGroup;
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
  stats: PlanRollupStats | undefined;
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
      } ${dropActive ? DROP_INTO_CLASS : ''}`}
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
        // Rename lives in the context menu now, same as a plan row's own
        // name button — a second always-visible icon here was shifting the
        // Est. total/Verdict/Runs columns over for every group header.
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              onClick={onSelect}
              onDoubleClick={() => setRenaming(true)}
              className="flex-1 truncate text-left font-semibold"
            >
              {group.name}
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => setRenaming(true)}>
              {t('industry.rename')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
      <span className="w-24 shrink-0 text-right">
        <ProfitCell profit={stats?.profit ?? null} />
      </span>
      <span className="hidden w-14 shrink-0 justify-end sm:flex">
        <VerdictTag verdict={stats?.verdict ?? 'unknown'} />
      </span>
      {/* Runs has no group-level meaning — a group aggregates cost, not a
          production history of its own — so this column stays a fixed-width
          blank rather than a second dash competing with the plan rows' real
          one for the reader's attention. */}
      <span className="hidden w-8 shrink-0 sm:block" aria-hidden="true" />
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
  statsByPlanId,
  statsByGroupId,
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
            <span className="w-24 shrink-0 text-right">{t('industry.profitColumn')}</span>
            <span className="hidden w-14 shrink-0 justify-end sm:flex">
              {t('industry.verdictColumn')}
            </span>
            <span className="hidden w-8 shrink-0 text-right sm:block">
              {t('industry.runsColumn')}
            </span>
            <span className="w-9 shrink-0" aria-hidden="true" />
          </div>
          <ul className="rounded-xs border border-line">
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
  );
}
