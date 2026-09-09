/**
 * Right-click an item name and start a Build Plan for it — for the surfaces
 * that name an item but have none of the Market Browser's wiring (Quickbar,
 * show-info, compare) that `ItemContextMenu` requires: the public BPC search
 * table and a contract's item list.
 *
 * The index is resolved on first open rather than on mount, for the same
 * reason `ItemContextMenu` makes its call sites thread `blueprintTypeID` down:
 * `blueprints.json` is 1.4MB, and a contract detail modal that opened it just
 * to render menus nobody used would pay that on every contract clicked. The
 * BPC search page has already loaded it, so there the label never visibly
 * settles; in a contract it reads "checking…" for as long as the fetch takes,
 * the same three-state treatment `ItemContextMenu` documents.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui';
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
   * The ME/TE/runs of the specific copy this row names, where the surface
   * knows them — always for a BPC Sourcing Offer, sometimes for a contract
   * line (`seedFromContractItem` returns `null` when ESI didn't report all
   * three). `null`/`undefined` both mean the plain defaults. Not a second
   * menu entry: one action, one label, seeded or not.
   */
  seed?: BuildPlanSeed | null;
}

export function BuildPlanContextMenu({ typeId, trigger, seed }: BuildPlanContextMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
          disabled={productTypeId == null}
          onSelect={() => {
            if (productTypeId == null) return;
            const params = new URLSearchParams({ product: String(productTypeId) });
            applyPlanSeed(params, seed ?? null);
            navigate(`/industry?${params.toString()}`);
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
