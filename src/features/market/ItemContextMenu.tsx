/**
 * Right-click menu for an item — the tree, search results (same tree,
 * CONTEXT.md round 8), the Quickbar, the Assets tree (issue #83), the
 * Variations table (issue #147) and a Build Plan's materials (round 27).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { marketLinkParams } from '@/engine/market/urlState';
import { usePiPlannable } from '@/features/pi/usePiPlannable';
import { useCompareSet } from './compareSet';

export interface ItemContextMenuProps {
  typeId: number;
  itemName: string;
  /** Undefined while the blueprint catalog hasn't been checked yet; null once checked and no blueprint produces this item. */
  blueprintTypeID: number | null | undefined;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  /** False with no active character — the Quickbar has nobody to save the item under. */
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
  /** Variations-table rows only (issue #147): opens the attribute-compare modal for the row's variation group. Omitted elsewhere. */
  onCompareVariations?: () => void;
  onOpenChange?: (open: boolean) => void;
  children: ReactElement;
}

/**
 * Item context menu: add to Quickbar, show info, add to Compare, view in
 * Market, copy name, jump to a Build Plan, jump to a PI Plan.
 *
 * The PI action asks for itself rather than taking a prop the way
 * `blueprintTypeID` does: `pi.json` is 15KB against `blueprints.json`'s
 * 1.4MB, so there is nothing to defend by making five call sites load it and
 * thread it down. It is also rendered only when the answer is yes — a
 * permanently-disabled row on every item in the game buys nothing, where the
 * Build Plan row's disabled state is telling the user something they might
 * have expected otherwise. Nothing renders while the answer is unknown, so
 * the row never appears under a cursor already in the menu.
 */
export function ItemContextMenu({
  typeId,
  itemName,
  blueprintTypeID,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
  onCompareVariations,
  onOpenChange,
  children,
}: ItemContextMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const addToCompare = useCompareSet((state) => state.add);
  const piPlannable = usePiPlannable(typeId);

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
        <ContextMenuItem
          disabled={!quickbarAvailable}
          title={quickbarAvailable ? undefined : t('market.contextMenu.quickbarNoCharacter')}
          onSelect={() => onAddToQuickbar(typeId, itemName)}
        >
          {t('market.contextMenu.addToQuickbar')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onShowInfo(typeId, itemName)}>
          {t('market.contextMenu.showInfo')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => addToCompare({ typeId, itemName })}>
          {t('market.contextMenu.addToCompare')}
        </ContextMenuItem>
        {onCompareVariations && (
          <ContextMenuItem onSelect={onCompareVariations}>
            {t('market.contextMenu.compareVariations')}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onSelect={() => {
            const params = marketLinkParams(typeId, location.search);
            navigate(`/market?${new URLSearchParams(params).toString()}`);
          }}
        >
          {t('market.contextMenu.viewInMarket')}
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
        {piPlannable && (
          <ContextMenuItem onSelect={() => navigate(`/planetary-industry?tab=plan&type=${typeId}`)}>
            {t('market.contextMenu.piPlan')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
