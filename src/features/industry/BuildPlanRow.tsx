import { fixed1 } from '@/lib/fixedFormat';
import { selectedRowClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  IskAmount,
  isRowOwnEvent,
  DisabledMenuItem,
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
import { planHref } from './planLinkClick';

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
  dropKind: 'into' | 'out' | null;
  indented?: boolean;
  stats: PlanIndexStats | undefined;
  locationHint?: string;
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
  locationHint,
}: PlanRowProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const guard = useLiftAfterHoldGuard();
  const dropId = planDropId(plan.id);
  const { setNodeRef: setDropRef } = useDroppable({ id: dropId });
  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({ id: dropId });
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

  const startRename = () => setTimeout(() => setRenaming(true), 0);
  const items = (
    <>
      <MenuSub>
        <MenuSubTrigger>{t('industry.moveToGroup')}</MenuSubTrigger>
        <MenuSubContent>
          {groups.map((group) =>
            plan.buildGroupId === group.id ? (
              <DisabledMenuItem key={group.id} reason={t('industry.alreadyInGroup')}>
                {group.name}
              </DisabledMenuItem>
            ) : (
              <MenuItem key={group.id} onSelect={() => onMovePlan(plan.id, group.id)}>
                {group.name}
              </MenuItem>
            )
          )}
          {groups.length > 0 && <MenuSeparator />}
          {plan.buildGroupId === undefined ? (
            <DisabledMenuItem reason={t('industry.notInGroup')}>
              {t('industry.removeFromGroup')}
            </DisabledMenuItem>
          ) : (
            <MenuItem onSelect={() => onMovePlan(plan.id, null)}>
              {t('industry.removeFromGroup')}
            </MenuItem>
          )}
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
    <RowActionsMenu name={plan.name} items={items} openHref={planHref(plan.id)}>
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
          {groups.length > 0 && (
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
            <span className="flex min-w-0 flex-1 flex-col">
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
              {locationHint && (
                <span className="truncate text-[0.6875rem] text-text-dim">{locationHint}</span>
              )}
            </span>
          )}
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
          {renaming ? (
            <span className="w-9 shrink-0 md:w-7" aria-hidden="true" />
          ) : (
            <RowMoreActions />
          )}
        </RowTappableContext.Provider>
      </li>
    </RowActionsMenu>
  );
});
