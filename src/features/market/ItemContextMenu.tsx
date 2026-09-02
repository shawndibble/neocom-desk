/**
 * Right-click menu for an item — the tree, search results (same tree,
 * CONTEXT.md round 8), the Quickbar, and the Assets tree (issue #83).
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
import { parseMarketParams, buildMarketParams } from '@/engine/market/urlState';
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

/** Item context menu: add to Quickbar, show info, add to Compare, view in Market, copy name, jump to Build Plan. */
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
            // Preserves an existing region/hub param when already on
            // /market (e.g. clicking this from another item's order book —
            // region wins over hub, matching resolveMarketLocation's own
            // precedence); a caller arriving from elsewhere (Assets) starts
            // with neither, so this falls back to the device's Location
            // Mode default, same as opening /market?type=… fresh.
            const parsed = parseMarketParams((key) =>
              new URLSearchParams(location.search).get(key)
            );
            const params =
              parsed.regionId !== null
                ? buildMarketParams(typeId, { mode: 'region', regionId: parsed.regionId })
                : parsed.hubId !== null
                  ? buildMarketParams(typeId, { mode: 'hub', hubId: parsed.hubId })
                  : { type: String(typeId) };
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
      </ContextMenuContent>
    </ContextMenu>
  );
}
