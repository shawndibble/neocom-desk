/**
 * Right-click menu for an item — the tree, search results (same tree,
 * CONTEXT.md round 8) and, once #7 ships, the Quickbar. Add to Quickbar, show
 * info and add to Compare Set have no target yet (#7, #8, #6-detail-modal);
 * this ticket puts the menu in place and connects what already exists: copy
 * name and the jump to a Build Plan (issue #6).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { useCompareSet } from './compareSet';

export interface ItemContextMenuProps {
  typeId: number;
  itemName: string;
  /** Undefined while the blueprint catalog hasn't been checked yet; null once checked and no blueprint produces this item. */
  blueprintTypeID: number | null | undefined;
  onOpenChange?: (open: boolean) => void;
  children: ReactElement;
}

/** Item context menu: add to Quickbar, show info, add to Compare, copy name, jump to Build Plan. */
export function ItemContextMenu({
  typeId,
  itemName,
  blueprintTypeID,
  onOpenChange,
  children,
}: ItemContextMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const addToCompare = useCompareSet((state) => state.add);

  const buildPlanLabel =
    blueprintTypeID === undefined
      ? t('market.contextMenu.buildPlanChecking')
      : blueprintTypeID === null
        ? t('market.contextMenu.noBlueprintOptions')
        : t('market.contextMenu.buildPlan');

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled title={t('market.contextMenu.unavailable')}>
          {t('market.contextMenu.addToQuickbar')}
        </ContextMenuItem>
        <ContextMenuItem disabled title={t('market.contextMenu.unavailable')}>
          {t('market.contextMenu.showInfo')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => addToCompare({ typeId, itemName })}>
          {t('market.contextMenu.addToCompare')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void writeToClipboard(itemName)}>
          {t('market.contextMenu.copyName')}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!blueprintTypeID}
          onSelect={() => {
            if (blueprintTypeID) navigate(`/industry?product=${typeId}`);
          }}
        >
          {buildPlanLabel}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
