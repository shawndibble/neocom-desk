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
 */
import { useEffect, useState, type ReactElement } from 'react';
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
import { useCompareSet } from '@/features/market/compareSet';
import {
  loadPlannableIndex,
  plannableProductTypeID,
  type PlannableIndex,
} from './plannableProduct';
import { applyPlanSeed, type BuildPlanSeed } from './planSeed';

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

export function BuildPlanContextMenu({
  typeId,
  trigger,
  itemName,
  seed,
}: BuildPlanContextMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const addToCompare = useCompareSet((state) => state.add);
  const [index, setIndex] = useState<PlannableIndex | null>(null);
  /** Bumped on every open until the index resolves, so a failed fetch retries on the next right-click instead of reading "checking…" forever. */
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

  /** `undefined` while the index is still loading, mirroring `ItemContextMenu`'s `blueprintTypeID`. */
  const productTypeId = index ? plannableProductTypeID(index, typeId) : undefined;

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open && !index) setAttempt((n) => n + 1);
      }}
    >
      <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            const params = marketLinkParams(typeId, location.search);
            navigate(`/market?${new URLSearchParams(params).toString()}`);
          }}
        >
          {t('market.contextMenu.viewInMarket')}
        </ContextMenuItem>
        {itemName !== undefined && (
          <ContextMenuItem onSelect={() => addToCompare({ typeId, itemName })}>
            {t('market.contextMenu.addToCompare')}
          </ContextMenuItem>
        )}
        {itemName !== undefined && (
          <ContextMenuItem onSelect={() => void writeToClipboard(itemName)}>
            {t('market.contextMenu.copyName')}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          disabled={productTypeId == null}
          onSelect={() => {
            if (productTypeId == null) return;
            const params = new URLSearchParams({ product: String(productTypeId) });
            applyPlanSeed(params, seed ?? null);
            navigate(`/industry/plans?${params.toString()}`);
          }}
        >
          {productTypeId === undefined
            ? t('industry.contextMenu.buildPlanChecking')
            : productTypeId === null
              ? t('industry.contextMenu.noBlueprintOptions')
              : t('industry.contextMenu.buildPlan')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
