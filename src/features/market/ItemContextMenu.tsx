/**
 * Right-click menu for an item — the tree, search results (same tree,
 * CONTEXT.md round 8), the Quickbar, the Assets tree (issue #83), the
 * Variations table (issue #147) and every item name on a Build Plan page —
 * materials (round 27), product heading, revenue and owned-sale rows, and the
 * recipe and Blueprint Acquisition modals.
 */
import { useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { industryTabHref } from '@/features/industry/industryTabs';
import { MenuItem, RowActionsContext, RowActionsMenu, RowMoreActions } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { marketLinkParams } from '@/engine/market/urlState';
import { usePiPlannable } from '@/features/pi/usePiPlannable';
import { useCompareSet } from './compareSet';
import { PriceAlertDialog, PriceAlertMenuItem } from './PriceAlertDialog';

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
  /** Caller-specific entries appended after the shared ones (Open Orders' "Copy new price"). */
  extraItems?: ReactNode;
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

/** Everything the menu's entries need — the props minus the trigger wiring. */
type ItemMenuProps = Omit<ItemContextMenuProps, 'children' | 'onOpenChange'>;

/** The item menu's "Show info" — also reused as-is by menus that aren't item menus (the Fittings editor's). */
export function ShowInfoMenuItem({
  typeId,
  itemName,
  onShowInfo,
}: {
  typeId: number;
  itemName: string;
  onShowInfo: (typeId: number, itemName: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <MenuItem onSelect={() => onShowInfo(typeId, itemName)}>
      {t('market.contextMenu.showInfo')}
    </MenuItem>
  );
}

/** The item menu's "View in Market", keeping the page's region or hub; reused as `ShowInfoMenuItem` is. */
export function ViewInMarketMenuItem({ typeId }: { typeId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <MenuItem
      onSelect={() => {
        const params = marketLinkParams(typeId, location.search);
        navigate(`/market/browser?${new URLSearchParams(params).toString()}`);
      }}
    >
      {t('market.contextMenu.viewInMarket')}
    </MenuItem>
  );
}

/**
 * The item menu's entries, shared by `ItemContextMenu` (right-click, and the
 * row's `RowMoreActions` button it publishes to) and `ItemMoreActions` (a
 * standalone button, issue #1498) — one list, so none of them can drift.
 * Written with the kind-agnostic `MenuItem`, which renders as whichever menu
 * family it lands in. `onAlertRequest` opens the caller's own
 * `PriceAlertDialog`.
 *
 * Add to Quickbar, show info, add to Compare, view in
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
function useItemMenuItems(
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
    extraItems,
  }: ItemMenuProps,
  onAlertRequest: () => void
): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  return (
    <>
      <MenuItem
        disabled={!quickbarAvailable}
        title={quickbarAvailable ? undefined : t('market.contextMenu.quickbarNoCharacter')}
        onSelect={() => onAddToQuickbar(typeId, itemName)}
      >
        {t('market.contextMenu.addToQuickbar')}
      </MenuItem>
      <PriceAlertMenuItem typeId={typeId} available={quickbarAvailable} onSelect={onAlertRequest} />
      <ShowInfoMenuItem typeId={typeId} itemName={itemName} onShowInfo={onShowInfo} />
      <MenuItem onSelect={() => addToCompare({ typeId, itemName })}>
        {t('market.contextMenu.addToCompare')}
      </MenuItem>
      {onCompareVariations && (
        <MenuItem onSelect={onCompareVariations}>
          {t('market.contextMenu.compareVariations')}
        </MenuItem>
      )}
      <ViewInMarketMenuItem typeId={typeId} />
      <MenuItem onSelect={() => void writeToClipboard(itemName)}>
        {t('market.contextMenu.copyName')}
      </MenuItem>
      <MenuItem
        disabled={!blueprintTypeID}
        onSelect={() => {
          if (blueprintTypeID) navigate(`${industryTabHref('plans')}?product=${typeId}`);
        }}
      >
        {buildPlanLabel}
      </MenuItem>
      {onViewInIndustryAsMaterial && (
        <MenuItem onSelect={onViewInIndustryAsMaterial}>
          {t('market.contextMenu.viewInIndustryAsMaterial')}
        </MenuItem>
      )}
      {onToggleBuildHere && (
        <MenuItem onSelect={onToggleBuildHere}>
          {t(
            buildingHere
              ? 'market.contextMenu.buyInsteadOfBuilding'
              : 'market.contextMenu.addMaterialComponents'
          )}
        </MenuItem>
      )}
      {piPlannable && (
        <MenuItem onSelect={() => navigate(`/planetary-industry/plan?type=${typeId}`)}>
          {t('market.contextMenu.piPlan')}
        </MenuItem>
      )}
      {extraItems}
    </>
  );
}

/**
 * Item context menu. Also publishes its items, so a `RowMoreActions` in the
 * row (or `DataTable`'s `rowMoreActions` column) opens exactly these (WCAG
 * 2.1.1, issue #1497).
 */
export function ItemContextMenu(props: ItemContextMenuProps) {
  const { typeId, itemName, onOpenChange, children } = props;
  const [alertOpen, setAlertOpen] = useState(false);
  const items = useItemMenuItems(props, () => setAlertOpen(true));

  return (
    <>
      <RowActionsMenu name={itemName} items={items} onOpenChange={onOpenChange}>
        {children}
      </RowActionsMenu>
      {alertOpen && (
        <PriceAlertDialog typeId={typeId} itemName={itemName} onClose={() => setAlertOpen(false)} />
      )}
    </>
  );
}

/**
 * Visible "More actions" trigger for the same item menu (WCAG 2.1.1, issue
 * #1498), for a surface whose button can't sit inside `ItemContextMenu`'s
 * trigger — it builds its own copy of the items rather than reading a
 * surrounding `ItemContextMenu`'s.
 */
export function ItemMoreActions(props: ItemMenuProps) {
  const { typeId, itemName } = props;
  const [alertOpen, setAlertOpen] = useState(false);
  const items = useItemMenuItems(props, () => setAlertOpen(true));

  return (
    <>
      <RowActionsContext.Provider value={{ name: itemName, items }}>
        <RowMoreActions />
      </RowActionsContext.Provider>
      {alertOpen && (
        <PriceAlertDialog typeId={typeId} itemName={itemName} onClose={() => setAlertOpen(false)} />
      )}
    </>
  );
}
