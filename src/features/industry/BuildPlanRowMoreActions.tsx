import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import type { BuildGroup } from './buildGroups';

export interface BuildPlanRowMoreActionsProps {
  plan: BuildPlanRecord;
  groups: readonly BuildGroup[];
  onRename: () => void;
  onDuplicate: () => void;
  onMovePlan: (groupId: string | null) => void;
}

/**
 * Visible "More actions" trigger for a plan row (WCAG 2.1.1, issue #1498) —
 * the same three actions `BuildPlanRowContextMenu`'s right-click menu offers
 * (move to group, rename, duplicate), kept as an independent component
 * rather than a shared hook: three items is little enough duplication that
 * threading a `MenuItem`-component parameter through a shared list isn't
 * worth it, and the two menus already differ in trigger family
 * (`ContextMenuSub` vs `DropdownMenuSub`).
 */
export function BuildPlanRowMoreActions({
  plan,
  groups,
  onRename,
  onDuplicate,
  onMovePlan,
}: BuildPlanRowMoreActionsProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={<Icon.More size={Icon.ICON_SIZE.sm} />}
          label={t('industry.moreActionsLabel', { name: plan.name })}
          variant="plain"
          size="sm"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t('industry.moveToGroup')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {groups.map((group) => (
              <DropdownMenuItem
                key={group.id}
                disabled={plan.buildGroupId === group.id}
                onSelect={() => onMovePlan(group.id)}
              >
                {group.name}
              </DropdownMenuItem>
            ))}
            {groups.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={plan.buildGroupId === undefined}
              onSelect={() => onMovePlan(null)}
            >
              {t('industry.removeFromGroup')}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={onRename}>{t('industry.rename')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>{t('industry.duplicate')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
