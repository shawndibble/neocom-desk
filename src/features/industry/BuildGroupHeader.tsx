import { selectedRowClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import {
  Caret,
  IconButton,
  isRowOwnEvent,
  MenuItem,
  RowActionsMenu,
  RowMoreActions,
  Tooltip,
  Checkbox,
} from '@/components/ui';
import { rowStateClassName } from './planRowStyles';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useLiftAfterHoldGuard } from '@/components/ui/liftAfterHold';
import { RowTappableContext } from '@/components/ui/tooltipHold';
import type { BuildGroup } from './buildGroups';
import { groupDropId } from './groupDrop';
import type { PlanRollupStats } from './BuildPlanList';
import { ProfitCell, VerdictTag } from './BuildPlanCells';
import { DROP_INTO_CLASS } from './buildPlanDnd';
import { RenameField } from './BuildPlanRow';

export function GroupHeader({
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
  dropActive: boolean;
  compareMode: boolean;
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
  const guard = useLiftAfterHoldGuard();
  const { setNodeRef } = useDroppable({ id: groupDropId(group.id) });

  const startRename = () => setTimeout(() => setRenaming(true), 0);
  const items = (
    <>
      <MenuItem onSelect={startRename}>{t('industry.rename')}</MenuItem>
      <MenuItem className="text-danger" onSelect={onDelete}>
        {t('industry.deleteGroupMenu')}
      </MenuItem>
    </>
  );

  return (
    <RowActionsMenu name={group.name} items={items} openHref={`/industry/groups/${group.id}`}>
      <li
        ref={setNodeRef}
        aria-current={active ? 'true' : undefined}
        {...guard.handlers}
        onClick={(event) => {
          if (guard.swallowClick(event)) return;
          if (isRowOwnEvent(event)) onSelect();
        }}
        className={`flex cursor-pointer items-center gap-2 border-b border-line px-2 py-1.5 text-xs ${rowStateClassName(active, dropActive)} ${
          active ? selectedRowClassName : ''
        } ${dropActive ? DROP_INTO_CLASS : ''}`}
      >
        <RowTappableContext.Provider value>
          {compareMode && (
            <label className={touchCheckboxLabelClassName}>
              <Checkbox
                checked={membersSelected === 'all'}
                ref={(el) => {
                  if (el) el.indeterminate = membersSelected === 'some';
                }}
                onChange={() => onToggleAllMembers(membersSelected !== 'all')}
                aria-label={t('industry.selectGroupMembers', { name: group.name })}
              />
            </label>
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
            <span className="flex min-w-0 flex-1">
              <Tooltip content={group.name}>
                <button
                  type="button"
                  onClick={(event) => {
                    if (!guard.swallowClick(event)) onSelect();
                  }}
                  onDoubleClick={() => setRenaming(true)}
                  className={entityLinkClassName(
                    'dt-primary min-w-0 truncate text-left font-semibold'
                  )}
                >
                  {group.name}
                </button>
              </Tooltip>
            </span>
          )}
          <span className="w-24 shrink-0 text-right">
            <span className="sr-only">{t('industry.profitColumn')}: </span>
            <ProfitCell profit={stats?.profit ?? null} />
          </span>
          <span className="hidden w-24 shrink-0 lg:block" aria-hidden="true" />
          <span className="hidden w-16 shrink-0 lg:block" aria-hidden="true" />
          <span className="hidden w-14 shrink-0 justify-end sm:flex">
            <span className="sr-only">{t('industry.verdictColumn')}: </span>
            <VerdictTag
              verdict={stats?.verdict ?? 'unknown'}
              buildCost={stats?.buildCost}
              buyCost={stats?.buyCost}
            />
          </span>
          <span className="hidden w-8 shrink-0 sm:block" aria-hidden="true" />
          {renaming ? (
            <span className="w-9 shrink-0 md:w-7" aria-hidden="true" />
          ) : (
            <RowMoreActions />
          )}
        </RowTappableContext.Provider>
      </li>
    </RowActionsMenu>
  );
}
