import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui';
import type { BuildPlanRecord } from '@/db';
import type { BuildGroup } from './buildGroups';

export interface BuildPlanRowContextMenuProps {
  plan: BuildPlanRecord;
  groups: readonly BuildGroup[];
  onRename: () => void;
  onDuplicate: () => void;
  onMovePlan: (groupId: string | null) => void;
  children: ReactElement;
}

/** Right-click/long-press row actions for a Build Plan: move to group, rename, duplicate. */
export function BuildPlanRowContextMenu({
  plan,
  groups,
  onRename,
  onDuplicate,
  onMovePlan,
  children,
}: BuildPlanRowContextMenuProps) {
  const { t } = useTranslation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t('industry.moveToGroup')}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {groups.map((group) => (
              <ContextMenuItem
                key={group.id}
                disabled={plan.buildGroupId === group.id}
                onSelect={() => onMovePlan(group.id)}
              >
                {group.name}
              </ContextMenuItem>
            ))}
            {groups.length > 0 && <ContextMenuSeparator />}
            <ContextMenuItem
              disabled={plan.buildGroupId === undefined}
              onSelect={() => onMovePlan(null)}
            >
              {t('industry.removeFromGroup')}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={onRename}>{t('industry.rename')}</ContextMenuItem>
        <ContextMenuItem onSelect={onDuplicate}>{t('industry.duplicate')}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
