/**
 * Right-click menu for an item on the surfaces that only *name* it: the public
 * BPC search table, Contract Search rows, and both contract detail modals.
 * None of them has the Market Browser's wiring — a Quickbar to save into, a
 * show-info panel, a variations group — which is what `ItemContextMenu`
 * requires of every call site, so this is the menu those surfaces can actually
 * render.
 *
 * The actions here are the ones that need nothing from the caller but a type
 * ID: open a Build Plan, view the item in the Market Browser, copy its name,
 * add it to the Compare Set. The last two need a name to work with and appear
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
 * `BpcOfferMoreActions` (issue #1498) is the visible, keyboard-reachable
 * equivalent of this menu, but only for the BPC Sourcing table's offer rows —
 * the other three surfaces above keep the right-click-only menu unchanged,
 * per the ticket's scope. It shares this file's item list through
 * `useBuildPlanMenuNodes` so the two can't drift, the same shape
 * `ItemContextMenu`'s `useItemMenuNodes` uses for its own button/menu pair.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { industryTabHref } from './industryTabs';
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
import { useCompareSet } from '@/features/market/compareSet';
import {
  loadPlannableIndex,
  plannableProductTypeID,
  type PlannableIndex,
} from './plannableProduct';
import { applyPlanSeed, type BuildPlanSeed } from './planSeed';

/** `ContextMenuItem` and `DropdownMenuItem` share this shape — both spread onto a Radix `Item`. */
type MenuItemComponent = typeof ContextMenuItem;

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
}

/**
 * Resolves the plannable-product index on first open. Shared by the
 * right-click menu and the visible button (issue #1498) — each trigger owns
 * its own instance (same reasoning as `ItemContextMenu`'s per-trigger
 * `alertOpen`), so a failed fetch on one retries on that trigger's own next
 * open rather than depending on the other having been opened first.
 * `loadBlueprints` underneath is already memoized, so two instances resolving
 * independently still only fetches `blueprints.json` once.
 */
function usePlannableIndexOnOpen(): {
  index: PlannableIndex | null;
  onOpenChange: (open: boolean) => void;
} {
  const [index, setIndex] = useState<PlannableIndex | null>(null);
  /** Bumped on every open until the index resolves, so a failed fetch retries on the next open instead of reading "checking…" forever. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0 || index) return;
    let cancelled = false;
    void loadPlannableIndex().then(
      (next) => {
        if (!cancelled) setIndex(next);
      },
      () => {
        // Leave the label in its checking state; the next open retries.
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, index]);

  return {
    index,
    onOpenChange: (open) => {
      if (open && !index) setAttempt((n) => n + 1);
    },
  };
}

/**
 * The item list shared by `BuildPlanContextMenu` (right-click) and
 * `BpcOfferMoreActions` (the visible button, issue #1498) — one function
 * so the two can't drift. `MenuItem` picks which menu family's item component
 * renders each entry, the same parameter `ItemContextMenu`'s
 * `useItemMenuNodes` takes.
 */
function useBuildPlanMenuNodes(
  { typeId, itemName, seed }: Pick<BuildPlanContextMenuProps, 'typeId' | 'itemName' | 'seed'>,
  index: PlannableIndex | null,
  MenuItem: MenuItemComponent
): ReactElement[] {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const addToCompare = useCompareSet((state) => state.add);

  /** `undefined` while the index is still loading, mirroring `ItemContextMenu`'s `blueprintTypeID`. */
  const productTypeId = index ? plannableProductTypeID(index, typeId) : undefined;

  const nodes: ReactElement[] = [
    <MenuItem
      key="viewInMarket"
      onSelect={() => {
        const params = marketLinkParams(typeId, location.search);
        navigate(`/market/browser?${new URLSearchParams(params).toString()}`);
      }}
    >
      {t('market.contextMenu.viewInMarket')}
    </MenuItem>,
  ];
  if (itemName !== undefined) {
    nodes.push(
      <MenuItem key="addToCompare" onSelect={() => addToCompare({ typeId, itemName })}>
        {t('market.contextMenu.addToCompare')}
      </MenuItem>,
      <MenuItem key="copyName" onSelect={() => void writeToClipboard(itemName)}>
        {t('market.contextMenu.copyName')}
      </MenuItem>
    );
  }
  nodes.push(
    <MenuItem
      key="buildPlan"
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
    </MenuItem>
  );
  return nodes;
}

export function BuildPlanContextMenu({
  typeId,
  trigger,
  itemName,
  seed,
}: BuildPlanContextMenuProps) {
  const { index, onOpenChange } = usePlannableIndexOnOpen();
  const items = useBuildPlanMenuNodes({ typeId, itemName, seed }, index, ContextMenuItem);

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
      <ContextMenuContent>{items}</ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * Visible "More actions" trigger for the same item list (WCAG 2.1.1, issue
 * #1498) — rendered only by the BPC Sourcing table's offer rows, which is the
 * one surface among this menu's four call sites the ticket asks for a visible
 * button on; the other three keep `BuildPlanContextMenu`'s right-click-only
 * behavior.
 *
 * `itemName` stays optional, matching `BuildPlanContextMenuProps` — an
 * unresolved name still omits Copy/Compare but must not block the button
 * itself from rendering, since the row's own right-click menu is available in
 * that state too and a keyboard user needs the same access. The accessible
 * name falls back to `#<typeId>`, the same placeholder `BpcSourcingPanel`'s
 * own Item column already prints for an unresolved name, rather than reading
 * "More actions for undefined".
 */
export function BpcOfferMoreActions({
  typeId,
  itemName,
  seed,
}: Omit<BuildPlanContextMenuProps, 'trigger'>) {
  const { t } = useTranslation();
  const { index, onOpenChange } = usePlannableIndexOnOpen();
  const items = useBuildPlanMenuNodes({ typeId, itemName, seed }, index, DropdownMenuItem);

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={<Icon.More size={Icon.ICON_SIZE.sm} />}
          label={t('industry.moreActionsLabel', { name: itemName ?? `#${typeId}` })}
          variant="plain"
          size="sm"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{items}</DropdownMenuContent>
    </DropdownMenu>
  );
}
