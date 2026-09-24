/**
 * Right-click menu for an item — the tree, search results (same tree,
 * CONTEXT.md round 8), the Quickbar, the Assets tree (issue #83), the
 * Variations table (issue #147) and every item name on a Build Plan page —
 * materials (round 27), product heading, revenue and owned-sale rows, and the
 * recipe and Blueprint Acquisition modals.
 */
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { industryTabHref } from '@/features/industry/industryTabs';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { writeToClipboard } from '@/lib/clipboard';
import { marketLinkParams } from '@/engine/market/urlState';
import { usePiPlannable } from '@/features/pi/usePiPlannable';
import { useCompareSet } from './compareSet';
import { PriceAlertDialog, PriceAlertMenuItem } from './PriceAlertDialog';

/** `ContextMenuItem` and `DropdownMenuItem` share this shape — both spread onto a Radix `Item`. */
type MenuItemComponent = typeof ContextMenuItem;

export interface ItemContextMenuProps {
  typeId: number;
  itemName: string;
  /** Undefined while the blueprint catalog hasn't been checked yet; null once checked and no blueprint produces this item. */
  blueprintTypeID: number | null | undefined;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  /** False with no active character — the Quickbar has nobody to save the item under. */
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
  /** Variations-table rows only (issue #147): adds the row's variation group to the Compare Set and opens the Compare drawer on Attributes. Omitted elsewhere. */
  onCompareVariations?: () => void;
  /** Present only when at least one of the character's own Build Plans consumes this item as a material (issue #414); omitted when unknown or when no plan does. */
  onViewInIndustryAsMaterial?: () => void;
  /**
   * Switches this material between being bought and being produced in the
   * Build Plan the row belongs to — the same toggle a Build Plan's own
   * materials table offers inline for a row something here can manufacture.
   * Present only from that table, and only on a material with a recipe;
   * omitted everywhere else the menu appears, and on a row that only exists
   * because another build already introduced it (one level deep,
   * docs/context/decisions).
   */
  onToggleBuildHere?: () => void;
  /** Picks the toggle's label. Meaningless without `onToggleBuildHere`. */
  buildingHere?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactElement;
}

/**
 * Wraps `trigger` in this menu for `typeId`, the caller having already bound
 * the rest of the props. How a page that owns the Quickbar/show-info wiring
 * hands the menu down to children that only know a type ID — same shape as
 * `DataTable`'s `rowContextMenu`.
 */
export type ItemMenuFor = (typeId: number, trigger: ReactElement) => ReactElement;

/**
 * The item list shared by `ItemContextMenu` (right-click) and
 * `ItemMoreActions` (the visible button, issue #1498) — one hook so the two
 * can never drift. `MenuItem` picks which menu family's item component
 * renders each entry; `onAlertRequest` opens the caller's own
 * `PriceAlertDialog` instance, since each trigger owns its `alertOpen` state
 * independently (an alert opened from the button shouldn't depend on the
 * context menu ever having rendered).
 *
 * Add to Quickbar, show info, add to Compare, view in Market, copy name,
 * jump to a Build Plan, jump to a PI Plan.
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
function useItemMenuNodes(
  {
    typeId,
    itemName,
    blueprintTypeID,
    onAddToQuickbar,
    quickbarAvailable,
    onShowInfo,
    onCompareVariations,
    onViewInIndustryAsMaterial,
    onToggleBuildHere,
    buildingHere,
  }: Omit<ItemContextMenuProps, 'children' | 'onOpenChange'>,
  MenuItem: MenuItemComponent,
  onAlertRequest: () => void
): ReactElement[] {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const addToCompare = useCompareSet((state) => state.add);
  const piPlannable = usePiPlannable(typeId);

  // `industry.*`, not `market.*`: `BuildPlanContextMenu` offers this same
  // action on the pages this richer menu doesn't reach (the BPC search table,
  // a contract's item list), and one action wants one set of labels.
  const buildPlanLabel =
    blueprintTypeID === undefined
      ? t('industry.contextMenu.buildPlanChecking')
      : blueprintTypeID === null
        ? t('industry.contextMenu.noBlueprintOptions')
        : t('industry.contextMenu.buildPlan');

  const nodes: ReactElement[] = [
    <MenuItem
      key="addToQuickbar"
      disabled={!quickbarAvailable}
      title={quickbarAvailable ? undefined : t('market.contextMenu.quickbarNoCharacter')}
      onSelect={() => onAddToQuickbar(typeId, itemName)}
    >
      {t('market.contextMenu.addToQuickbar')}
    </MenuItem>,
    <PriceAlertMenuItem
      key="priceAlert"
      as={MenuItem}
      typeId={typeId}
      available={quickbarAvailable}
      onSelect={onAlertRequest}
    />,
    <MenuItem key="showInfo" onSelect={() => onShowInfo(typeId, itemName)}>
      {t('market.contextMenu.showInfo')}
    </MenuItem>,
    <MenuItem key="addToCompare" onSelect={() => addToCompare({ typeId, itemName })}>
      {t('market.contextMenu.addToCompare')}
    </MenuItem>,
  ];
  if (onCompareVariations) {
    nodes.push(
      <MenuItem key="compareVariations" onSelect={onCompareVariations}>
        {t('market.contextMenu.compareVariations')}
      </MenuItem>
    );
  }
  nodes.push(
    <MenuItem
      key="viewInMarket"
      onSelect={() => {
        const params = marketLinkParams(typeId, location.search);
        navigate(`/market/browser?${new URLSearchParams(params).toString()}`);
      }}
    >
      {t('market.contextMenu.viewInMarket')}
    </MenuItem>,
    <MenuItem key="copyName" onSelect={() => void writeToClipboard(itemName)}>
      {t('market.contextMenu.copyName')}
    </MenuItem>,
    <MenuItem
      key="buildPlan"
      disabled={!blueprintTypeID}
      onSelect={() => {
        if (blueprintTypeID) navigate(`${industryTabHref('plans')}?product=${typeId}`);
      }}
    >
      {buildPlanLabel}
    </MenuItem>
  );
  if (onViewInIndustryAsMaterial) {
    nodes.push(
      <MenuItem key="viewInIndustryAsMaterial" onSelect={onViewInIndustryAsMaterial}>
        {t('market.contextMenu.viewInIndustryAsMaterial')}
      </MenuItem>
    );
  }
  if (onToggleBuildHere) {
    nodes.push(
      <MenuItem key="toggleBuildHere" onSelect={onToggleBuildHere}>
        {t(
          buildingHere
            ? 'market.contextMenu.buyInsteadOfBuilding'
            : 'market.contextMenu.addMaterialComponents'
        )}
      </MenuItem>
    );
  }
  if (piPlannable) {
    nodes.push(
      <MenuItem key="piPlan" onSelect={() => navigate(`/planetary-industry/plan?type=${typeId}`)}>
        {t('market.contextMenu.piPlan')}
      </MenuItem>
    );
  }
  return nodes;
}

export function ItemContextMenu(props: ItemContextMenuProps) {
  const { typeId, itemName, onOpenChange, children } = props;
  const [alertOpen, setAlertOpen] = useState(false);
  const items = useItemMenuNodes(props, ContextMenuItem, () => setAlertOpen(true));

  return (
    <>
      <ContextMenu onOpenChange={onOpenChange}>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>{items}</ContextMenuContent>
      </ContextMenu>
      {alertOpen && (
        <PriceAlertDialog typeId={typeId} itemName={itemName} onClose={() => setAlertOpen(false)} />
      )}
    </>
  );
}

/**
 * Visible "More actions" trigger for the same item menu (WCAG 2.1.1, issue
 * #1498) — every surface that wraps a row in `ItemContextMenu` renders this
 * beside it so the row has a keyboard path independent of whatever element
 * `ItemContextMenu`'s trigger happens to be.
 */
export function ItemMoreActions(props: Omit<ItemContextMenuProps, 'children' | 'onOpenChange'>) {
  const { t } = useTranslation();
  const { typeId, itemName } = props;
  const [alertOpen, setAlertOpen] = useState(false);
  const items = useItemMenuNodes(props, DropdownMenuItem, () => setAlertOpen(true));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            icon={<Icon.More size={Icon.ICON_SIZE.sm} />}
            label={t('market.moreActionsLabel', { name: itemName })}
            variant="plain"
            size="sm"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{items}</DropdownMenuContent>
      </DropdownMenu>
      {alertOpen && (
        <PriceAlertDialog typeId={typeId} itemName={itemName} onClose={() => setAlertOpen(false)} />
      )}
    </>
  );
}
