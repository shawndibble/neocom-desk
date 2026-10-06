/**
 * Right-click menu for an item — the tree, search results (same tree,
 * CONTEXT.md round 8), the Quickbar, the Assets tree (issue #83), the
 * Variations table (issue #147) and every item name on a Build Plan page —
 * materials (round 27), product heading, revenue and owned-sale rows, and the
 * recipe and Blueprint Acquisition modals.
 */
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { industryTabHref } from '@/features/industry/industryTabs';
import {
  DisabledMenuItem,
  MenuItem,
  RowActionsContext,
  RowActionsMenu,
  RowMoreActions,
} from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { marketLinkParams } from '@/engine/market/urlState';
import { usePiPlannable } from '@/features/pi/usePiPlannable';
import { piPlanHref } from '@/features/pi/piPlanLink';
import { useCompareSet } from './compareSet';
import { useItemActions } from './itemActions';
import { PriceAlertDialog, PriceAlertMenuItem } from './PriceAlertDialog';

export interface ItemContextMenuProps {
  typeId: number;
  itemName: string;
  /**
   * The blueprint behind Build Plan, when the row already knows it (an
   * industry job, a Loyalty Store offer); null when nothing produces the item.
   * Undefined while the row's own catalog hasn't loaded ("checking…").
   * Omitted, the page's Item Actions look it up — "checking…" until the lazy
   * catalog loads, which the menu requests as it opens.
   */
  blueprintTypeID?: number | null | undefined;
  /** The product the Build Plan action opens when it isn't `typeId` itself � a blueprint row (Assets) plans what it builds. */
  planProductTypeID?: number;
  /** Variations-table rows only (issue #147): adds the row's variation group to the Compare Set and opens the Compare drawer on Attributes. Omitted elsewhere. */
  onCompareVariations?: () => void;
  /** Present only when at least one of the character's own Build Plans consumes this item as a material (issue #414); omitted when unknown or when no plan does. */
  onViewInIndustryAsMaterial?: () => void;
  /** Caller-specific entries appended after the shared ones (Open Orders' "Copy new price"). */
  extraItems?: ReactNode;
  /** A right-click or hold on a link in the row stays the browser's (`RowActionsMenu`'s `linksKeepBrowserMenu`). */
  linksKeepBrowserMenu?: boolean;
  children: ReactElement;
}

/**
 * Wraps `trigger` in this menu for `typeId`, the caller having already bound
 * the rest of the props. How a page that knows item names and blueprints
 * hands the menu down to children that only know a type ID — same shape as
 * `DataTable`'s `rowContextMenu`.
 */
export type ItemMenuFor = (typeId: number, trigger: ReactElement) => ReactElement;

/** Everything the menu's entries need — the props minus the trigger wiring. */
type ItemMenuProps = Omit<ItemContextMenuProps, 'children'>;

/** The item menu's "Show info" — also reused as-is by menus that aren't item menus (the Fittings editor's). */
export function ShowInfoMenuItem({ typeId, itemName }: { typeId: number; itemName: string }) {
  const { t } = useTranslation();
  const { showInfo } = useItemActions();
  return (
    <MenuItem onSelect={() => showInfo(typeId, itemName)}>
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
 * "Build Plan" and "View blueprint in Market" for an item — reused as
 * `ShowInfoMenuItem` is, by menus that aren't item menus (the Fittings
 * editor's). Both go off while nothing produces the item; the lazy blueprint
 * catalog loads when the entries first render, i.e. as the menu opens.
 */
export function BuildPlanMenuItems({ typeId }: { typeId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { blueprintFor, requestBlueprints } = useItemActions();
  useEffect(() => requestBlueprints(), [requestBlueprints]);
  const blueprintTypeID = blueprintFor(typeId);
  const buildPlanLabel =
    blueprintTypeID === undefined
      ? t('industry.contextMenu.buildPlanChecking')
      : blueprintTypeID === null
        ? t('industry.contextMenu.noBlueprintOptions')
        : t('industry.contextMenu.buildPlan');
  return (
    <>
      <MenuItem
        disabled={!blueprintTypeID}
        onSelect={() => {
          if (blueprintTypeID) navigate(`${industryTabHref('plans')}?product=${typeId}`);
        }}
      >
        {buildPlanLabel}
      </MenuItem>
      <MenuItem
        disabled={!blueprintTypeID}
        onSelect={() => {
          if (!blueprintTypeID) return;
          const params = marketLinkParams(blueprintTypeID, location.search);
          navigate(`/market/browser?${new URLSearchParams(params).toString()}`);
        }}
      >
        {t('market.contextMenu.viewBlueprintInMarket')}
      </MenuItem>
    </>
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
 * The PI action asks for itself rather than going through the page's Item
 * Actions the way `blueprintTypeID` does: `pi.json` is 15KB against
 * `blueprints.json`'s 1.4MB, so there is nothing to defend by loading it
 * once per page. It is also rendered only when the answer is yes — a
 * permanently-disabled row on every item in the game buys nothing, where the
 * Build Plan row's disabled state is telling the user something they might
 * have expected otherwise. Nothing renders while the answer is unknown, so
 * the row never appears under a cursor already in the menu.
 */
function useItemMenuItems(props: ItemMenuProps, onAlertRequest: () => void): ReactNode {
  const {
    typeId,
    itemName,
    planProductTypeID,
    onCompareVariations,
    onViewInIndustryAsMaterial,
    extraItems,
  } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const addToCompare = useCompareSet((state) => state.add);
  const piPlannable = usePiPlannable(typeId);
  const { canAddToQuickbar, addToQuickbar, blueprintFor } = useItemActions();
  // Present-but-undefined is the row's own "checking…"; only an omitted prop defers to the page.
  const blueprintTypeID = 'blueprintTypeID' in props ? props.blueprintTypeID : blueprintFor(typeId);

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
      {canAddToQuickbar ? (
        <MenuItem onSelect={() => addToQuickbar(typeId, itemName)}>
          {t('market.contextMenu.addToQuickbar')}
        </MenuItem>
      ) : (
        <DisabledMenuItem reason={t('market.contextMenu.quickbarNoCharacter')}>
          {t('market.contextMenu.addToQuickbar')}
        </DisabledMenuItem>
      )}
      <PriceAlertMenuItem typeId={typeId} available={canAddToQuickbar} onSelect={onAlertRequest} />
      <ShowInfoMenuItem typeId={typeId} itemName={itemName} />
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
          if (blueprintTypeID)
            navigate(`${industryTabHref('plans')}?product=${planProductTypeID ?? typeId}`);
        }}
      >
        {buildPlanLabel}
      </MenuItem>
      {onViewInIndustryAsMaterial && (
        <MenuItem onSelect={onViewInIndustryAsMaterial}>
          {t('market.contextMenu.viewInIndustryAsMaterial')}
        </MenuItem>
      )}
      {piPlannable && (
        <MenuItem onSelect={() => navigate(piPlanHref(typeId, location.pathname, location.search))}>
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
  const { typeId, itemName, linksKeepBrowserMenu, children } = props;
  const [alertOpen, setAlertOpen] = useState(false);
  const items = useItemMenuItems(props, () => setAlertOpen(true));
  const { requestBlueprints } = useItemActions();

  return (
    <>
      <RowActionsMenu
        name={itemName}
        items={items}
        linksKeepBrowserMenu={linksKeepBrowserMenu}
        onOpenChange={(open) => {
          if (open) requestBlueprints();
        }}
      >
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
