import type { ReactElement } from 'react';
import {
  ItemContextMenu,
  ItemMoreActions,
  type ItemMenuFor,
} from '@/features/market/ItemContextMenu';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';

/**
 * Plain function, not a hook (no state), so callers past an early return may use it.
 *
 * The Build Plan's item menu and its visible "More actions" button, built
 * from one set of props so the right-click menu and the button can never
 * list different actions (WCAG 2.1.1, issue #1498).
 *
 * This page is already a Build Plan and has no Compare drawer, so the menu
 * leaves out "Build Plan" and "Add to Compare".
 */
export function buildItemMenuProps(catalog: BlueprintCatalog): {
  itemMenuFor: ItemMenuFor;
  itemActionsFor: (typeId: number, bordered?: boolean) => ReactElement;
} {
  const menuProps = (typeId: number) => ({
    typeId,
    itemName: nameForType(catalog, typeId),
    blueprintTypeID: catalog.byProductTypeID.get(typeId)?.blueprintTypeID ?? null,
    hideBuildPlan: true,
    hideCompare: true,
  });

  /** The menu on every item name the page shows — product heading, the recipe and acquisition modals. */
  const itemMenuFor: ItemMenuFor = (typeId, trigger) => (
    <ItemContextMenu {...menuProps(typeId)}>{trigger}</ItemContextMenu>
  );

  const itemActionsFor = (typeId: number, bordered = false): ReactElement => (
    <ItemMoreActions
      variant={bordered ? 'ghost' : undefined}
      size={bordered ? 'sm' : undefined}
      {...menuProps(typeId)}
    />
  );

  return { itemMenuFor, itemActionsFor };
}
