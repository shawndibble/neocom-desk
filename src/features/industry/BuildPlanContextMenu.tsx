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

export interface BuildPlanContextMenuProps {
  /** The row's own type — a blueprint on the BPC table, anything at all in a contract. */
  typeId: number;
  /** The element the menu hangs off: a `<tr>` from `DataTable`'s `rowContextMenu`, or any single element. */
  trigger: ReactElement;
}

export function BuildPlanContextMenu({ typeId, trigger }: BuildPlanContextMenuProps) {
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
            if (productTypeId != null) navigate(`/industry?product=${productTypeId}`);
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
