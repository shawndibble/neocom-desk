import { fixed1 } from '@/lib/fixedFormat';
import { selectedRowClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  IskAmount,
  isRowOwnEvent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  RowActionsMenu,
  RowMoreActions,
  TextInput,
  Tooltip,
  Checkbox,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { gripHitAreaClassName } from '@/components/ui/controlStyles';
import { rowStateClassName } from './planRowStyles';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useLiftAfterHoldGuard } from '@/components/ui/liftAfterHold';
import { useInPlaceEdit } from '@/lib/useInPlaceEdit';
import { RowTappableContext } from '@/components/ui/tooltipHold';
import type { BuildPlanRecord } from '@/db';
import type { BuildGroup } from './buildGroups';
import { planDropId } from './groupDrop';
import type { PlanIndexStats } from './BuildPlanList';
import { ProfitCell, RunsCell, VerdictTag } from './BuildPlanCells';
import { DROP_INTO_CLASS, DROP_OUT_CLASS } from './buildPlanDnd';

/**
 * The inline rename both a plan row and a group header use: commit on Enter or
 * blur, abandon on Escape, and never store a blank name.
 *
 * Rendered only while renaming, so it re-reads `value` on each open and needs
 * no reset path of its own — which is what the two hand-rolled copies of this
 * were spending their `else setDraftName(...)` branch on.
 */
export function RenameField({
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
  // Mounted only while renaming: the parent's `onDone` unmounts it.
  const { inputProps } = useInPlaceEdit({
    open: true,
    initial: () => value,
    onCommit: (draft) => {
      const name = draft.trim();
      if (name) onRename(name);
    },
    onClose: onDone,
  });

  return <TextInput size="sm" {...inputProps} aria-label={label} className="flex-1" />;
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
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
};

export const PlanRow = memo(function PlanRow({
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
  // The whole row opens the plan; a hold that became the row menu must not.
  const guard = useLiftAfterHoldGuard();
  // One id for both roles, the way `useSortable` registers its own: a row is
  // the thing being dragged *and* a target meaning "into whatever group this
  // row is in", which is how an expanded group's body accepts a drop rather
  // than only its header.
  const dropId = planDropId(plan.id);
  const { setNodeRef: setDropRef } = useDroppable({ id: dropId });
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({ id: dropId });
  // A drag released over its own row still ends in a click on that row; it
  // is the drop's, not an open. Stays set until the click has come and gone.
  const dragged = useRef(false);
  useEffect(() => {
    if (isDragging) {
      dragged.current = true;
      return;
    }
    const timer = setTimeout(() => {
      dragged.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [isDragging]);

  // After the menu has closed: its focus hand-back would blur the new field
  // and cancel the rename straight away.
  const startRename = () => setTimeout(() => setRenaming(true), 0);
  const items = (
    <>
      <MenuSub>
        <MenuSubTrigger>{t('industry.moveToGroup')}</MenuSubTrigger>
        <MenuSubContent>
          {groups.map((group) => (
            <MenuItem
              key={group.id}
              disabled={plan.buildGroupId === group.id}
              onSelect={() => onMovePlan(plan.id, group.id)}
            >
              {group.name}
            </MenuItem>
          ))}
          {groups.length > 0 && <MenuSeparator />}
          <MenuItem
            disabled={plan.buildGroupId === undefined}
            onSelect={() => onMovePlan(plan.id, null)}
          >
            {t('industry.removeFromGroup')}
          </MenuItem>
        </MenuSubContent>
      </MenuSub>
      <MenuItem onSelect={startRename}>{t('industry.rename')}</MenuItem>
      <MenuItem onSelect={() => onDuplicate(plan.id)}>{t('industry.duplicate')}</MenuItem>
      <MenuSeparator />
      <MenuItem className="text-danger" onSelect={() => onDelete(plan.id)}>
        {t('industry.deleteMenu')}
      </MenuItem>
    </>
  );

  return (
    <RowActionsMenu name={plan.name} items={items}>
      <li
        ref={(node) => {
          setDropRef(node);
          setDragRef(node);
        }}
        aria-current={active ? 'true' : undefined}
        {...guard.handlers}
        onClick={(event) => {
          if (guard.swallowClick(event) || dragged.current) return;
          if (isRowOwnEvent(event)) onSelect(plan.id);
        }}
        className={`flex cursor-pointer items-center gap-2 border-b border-line py-1.5 pr-2 text-xs last:border-b-0 ${rowStateClassName(active, dropKind === 'into')} ${
          indented ? 'pl-6' : 'pl-2'
        } ${active ? selectedRowClassName : ''} ${isDragging ? 'opacity-40' : ''} ${
          dropKind === 'into' ? DROP_INTO_CLASS : dropKind === 'out' ? DROP_OUT_CLASS : ''
        }`}
      >
        <RowTappableContext.Provider value>
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

          No tooltip or `title`: either would put it back in the accessibility
          tree this pointer-only grip is deliberately out of (the cursor is its cue).

          `distance: 4` on the sensor and `touch-none` here are both load-
          bearing, for the reasons EntryList.tsx's copy spells out (#408). */}
          {groups.length > 0 && (
            // `size-9 md:size-7`: the same touch-tier box `IconButton size="sm"`
            // gives `GroupHeader`'s Caret toggle. Without it this box stayed a
            // fixed 28px while the Caret's grew to 36px below `md` (DESIGN.md
            // §3), so the member row's deliberate nesting indent under its group
            // (`pl-6` vs the header's `px-2` — 16px by design) shrank to 8px on a
            // phone instead of matching desktop's own 16px.
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              {...listeners}
              data-testid="plan-drag-handle"
              className={`inline-flex size-9 shrink-0 cursor-grab touch-none items-center justify-center text-text-faint hover:text-text md:size-7 ${gripHitAreaClassName}`}
            >
              <Icon.DragHandle />
            </button>
          )}
          {compareMode && (
            <label className={touchCheckboxLabelClassName}>
              <Checkbox
                checked={compareSelected}
                onChange={() => onToggleCompareSelected(plan.id)}
                aria-label={t('industry.compareSelectFor', { name: plan.name })}
              />
            </label>
          )}
          {renaming ? (
            <RenameField
              value={plan.name}
              label={t('industry.rename')}
              onRename={(name) => onRename(plan.id, name)}
              onDone={() => setRenaming(false)}
            />
          ) : (
            // Name click opens the plan, double-click renames; the rest (move to
            // group, rename, duplicate, delete) is the trailing ⋮, also the row's
            // right-click menu.
            <span className="flex min-w-0 flex-1">
              <button
                type="button"
                onClick={(event) => {
                  if (!guard.swallowClick(event)) onSelect(plan.id);
                }}
                onDoubleClick={() => setRenaming(true)}
                className={entityLinkClassName('dt-primary min-w-0 truncate text-left')}
              >
                {plan.name}
              </button>
            </span>
          )}
          {/* Kept, not withheld, while the verdict is "Fix location": the figures
          read in the dim tone with a warning glyph, never faded. */}
          <span className="w-24 shrink-0 text-right">
            <span className="sr-only">{t('industry.profitColumn')}: </span>
            {stats?.verdict === 'fixLocation' && (
              <Tooltip content={t('industry.reactionBlocked.profitNotReal')} openOnTap>
                <span
                  tabIndex={0}
                  role="img"
                  aria-label={t('industry.reactionBlocked.profitNotReal')}
                  className="-my-1 mr-0 inline-flex size-6 items-center justify-center align-middle focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Icon.Warn size={Icon.ICON_SIZE.sm} className="text-warning" />
                </span>
              </Tooltip>
            )}
            <ProfitCell profit={stats?.profit ?? null} muted={stats?.verdict === 'fixLocation'} />
          </span>
          <span className="hidden w-24 shrink-0 text-right tabular-nums text-text-dim lg:block">
            <span className="sr-only">{t('industry.iskPerHourColumn')}: </span>
            {stats?.iskPerHour == null ? '—' : <IskAmount value={stats.iskPerHour} decimals={0} />}
          </span>
          <span className="hidden w-16 shrink-0 text-right tabular-nums text-text-dim lg:block">
            <span className="sr-only">{t('industry.marginColumn')}: </span>
            {stats?.marginPct == null ? '—' : `${fixed1(stats.marginPct)}%`}
          </span>
          <span className="hidden w-14 shrink-0 justify-end sm:flex">
            <span className="sr-only">{t('industry.verdictColumn')}: </span>
            <VerdictTag
              verdict={stats?.verdict ?? 'unknown'}
              buildCost={stats?.buildCost}
              buyCost={stats?.buyCost}
            />
          </span>
          <span className="hidden w-8 shrink-0 text-right sm:block">
            <span className="sr-only">{t('industry.runsColumn')}: </span>
            <RunsCell runs={stats?.runs ?? 0} />
          </span>
          {/* Unmounted while renaming: closing the menu hands focus back to the ⋮,
          which would blur the rename field and cancel it. The spacer keeps
          the stat columns where they are. */}
          {renaming ? (
            <span className="w-11 shrink-0 md:w-7" aria-hidden="true" />
          ) : (
            <RowMoreActions />
          )}
        </RowTappableContext.Provider>
      </li>
    </RowActionsMenu>
  );
});
