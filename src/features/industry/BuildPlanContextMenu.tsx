/**
 * Right-click menu for an item on the surfaces that only *name* it: the public
 * BPC search table, Contract Search rows, and both contract detail modals.
 * None of them has the Market Browser's wiring — a Quickbar to save into, a
 * show-info panel, a variations group — which is what `ItemContextMenu`
 * requires of every call site, so this is the menu those surfaces can actually
 * render.
 *
 * The actions here are the ones that need nothing from the caller but a type
 * ID: open a Build Plan, view the item in the Market Browser (not an Abyssal
 * type), copy its name, add it to the Compare Set. The last two need a name to work with and appear
 * only when the caller passes one — the surfaces here have already resolved it
 * for their own rows, so they simply hand it over.
 *
 * The blueprint index is resolved on first open rather than on mount, for the
 * same reason `ItemContextMenu` makes its call sites thread `blueprintTypeID`
 * down: `blueprints.json` is 1.4MB, and a contract detail modal that opened it
 * just to render menus nobody used would pay that on every contract clicked.
 * The BPC search page has already loaded it, so there the label never visibly
 * settles; in a contract it reads "checking…" for as long as the fetch takes,
 * the same three-state treatment `ItemContextMenu` documents.
 *
 * Labels come from the same `market.contextMenu.*` / `industry.contextMenu.*`
 * keys `ItemContextMenu` uses — one action, one wording, wherever it appears.
 *
 * The visible, keyboard-reachable "More actions" button (WCAG 2.1.1, issue
 * #1498) is `DataTable`'s own `rowMoreActions` column: it reads the same
 * items straight out of the `RowActionsContext` this menu publishes, so a
 * caller opts in with `rowMoreActions` on the table rather than rendering a
 * second copy of the button here.
 */
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { industryTabHref } from './industryTabs';
import { MenuItem as RowMenuItem, RowActionsMenu } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { useCompareSet } from '@/features/market/compareSet';
import { ViewInMarketMenuItem } from '@/features/market/ViewInMarketMenuItem';
import { plannableProductTypeID, type PlannableIndex } from './plannableProduct';
import { applyPlanSeed, type BuildPlanSeed } from './planSeed';
import { usePlannableIndexOnOpen } from './usePlannableIndexOnOpen';

export interface BuildPlanContextMenuProps {
  /** The row's own type — a blueprint on the BPC table, anything at all in a contract. */
  typeId: number;
  /** The element the menu hangs off: a `<tr>` from `DataTable`'s `rowContextMenu`, or any single element. */
  trigger: ReactElement;
  /**
   * The item's resolved name. Omitted where the surface only has a type ID —
   * "Copy name" and "Add to Compare" then don't render, rather than offering
   * to copy `#34` or to compare an unnamed row.
   */
  itemName?: string;
  /**
   * The ME/TE/runs of the specific copy this row names, where the surface
   * knows them — always for a BPC Sourcing Offer, sometimes for a contract
   * line (`seedFromContractItem` returns `null` when ESI didn't report all
   * three). `null`/`undefined` both mean the plain defaults. Not a second
   * menu entry: one action, one label, seeded or not.
   */
  seed?: BuildPlanSeed | null;
  /** Caller-specific entries appended after the shared ones (BPC Sourcing's "Set waypoint in game"), as `ItemContextMenu`'s are. */
  extraItems?: ReactNode;
  /** Drops "View in Market" where the row already links the item to its Market listing. */
  omitViewInMarket?: boolean;
}

/**
 * "Build Plan" for `typeId`: opens a new plan for what it builds, seeded with
 * the copy's ME/TE/runs when given. "checking…" until `index` loads, off when
 * nothing plannable comes of it. Exported for a row menu that lists its own
 * actions (the Community Library's Shared Blueprints), which resolves `index`
 * with `usePlannableIndexOnOpen` as this menu does.
 */
export function BuildPlanMenuItem({
  typeId,
  seed,
  index,
}: {
  typeId: number;
  seed?: BuildPlanSeed | null;
  index: PlannableIndex | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  /** `undefined` while the index is still loading, mirroring `ItemContextMenu`'s `blueprintTypeID`. */
  const productTypeId = index ? plannableProductTypeID(index, typeId) : undefined;
  return (
    <RowMenuItem
      disabled={productTypeId == null}
      onSelect={() => {
        if (productTypeId == null) return;
        const params = new URLSearchParams({ product: String(productTypeId) });
        applyPlanSeed(params, seed ?? null);
        navigate(`${industryTabHref('plans')}?${params.toString()}`);
      }}
    >
      {productTypeId === undefined
        ? t('industry.contextMenu.buildPlanChecking')
        : productTypeId === null
          ? t('industry.contextMenu.noBlueprintOptions')
          : t('industry.contextMenu.buildPlan')}
    </RowMenuItem>
  );
}

/** The item list `BuildPlanContextMenu` publishes, to both its own right-click trigger and any `RowMoreActions` reading its `RowActionsContext`. */
function useBuildPlanMenuNodes(
  {
    typeId,
    itemName,
    seed,
    omitViewInMarket,
  }: Pick<BuildPlanContextMenuProps, 'typeId' | 'itemName' | 'seed' | 'omitViewInMarket'>,
  index: PlannableIndex | null
): ReactElement[] {
  const { t } = useTranslation();
  const addToCompare = useCompareSet((state) => state.add);

  const nodes: ReactElement[] = omitViewInMarket
    ? []
    : [<ViewInMarketMenuItem key="viewInMarket" typeId={typeId} />];
  if (itemName !== undefined) {
    nodes.push(
      <RowMenuItem key="addToCompare" onSelect={() => addToCompare({ typeId, itemName })}>
        {t('market.contextMenu.addToCompare')}
      </RowMenuItem>,
      <RowMenuItem key="copyName" onSelect={() => void writeToClipboard(itemName)}>
        {t('market.contextMenu.copyName')}
      </RowMenuItem>
    );
  }
  nodes.push(<BuildPlanMenuItem key="buildPlan" typeId={typeId} seed={seed} index={index} />);
  return nodes;
}

export function BuildPlanContextMenu({
  typeId,
  trigger,
  itemName,
  seed,
  extraItems,
  omitViewInMarket,
}: BuildPlanContextMenuProps) {
  const { index, onOpenChange } = usePlannableIndexOnOpen();
  const items = useBuildPlanMenuNodes({ typeId, itemName, seed, omitViewInMarket }, index);

  return (
    <RowActionsMenu
      name={itemName ?? `#${typeId}`}
      items={
        <>
          {items}
          {extraItems}
        </>
      }
      onOpenChange={onOpenChange}
    >
      {trigger}
    </RowActionsMenu>
  );
}
