import type { ReactElement, ReactNode } from 'react';
import {
  ItemContextMenu,
  ItemMoreActions,
  type ItemMenuFor,
} from '@/features/market/ItemContextMenu';
import { BpcSourcingMenuItem } from './BpcSourcingMenuItem';
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
 *
 * Given `onSearchBpcSourcing`, an item whose blueprint is known (the item is
 * one, or something builds it) also offers "Find BPC in BPC Sourcing".
 */
export function buildItemMenuProps(
  catalog: BlueprintCatalog,
  onSearchBpcSourcing?: (blueprintTypeID: number) => void
): {
  itemMenuFor: ItemMenuFor;
  itemActionsFor: (typeId: number, bordered?: boolean, extraItems?: ReactNode) => ReactElement;
} {
  const menuProps = (typeId: number, rowItems?: ReactNode) => {
    const blueprintTypeID = catalog.byProductTypeID.get(typeId)?.blueprintTypeID ?? null;
    const sourcingBlueprint = catalog.byBlueprintTypeID.has(typeId) ? typeId : blueprintTypeID;
    return {
      typeId,
      itemName: nameForType(catalog, typeId),
      blueprintTypeID,
      hideBuildPlan: true,
      hideCompare: true,
      extraItems: (
        <>
          {onSearchBpcSourcing && sourcingBlueprint !== null && (
            <BpcSourcingMenuItem
              blueprintTypeID={sourcingBlueprint}
              onSearch={onSearchBpcSourcing}
            />
          )}
          {rowItems}
        </>
      ),
    };
  };

  /** The menu on every item name the page shows — product heading, the recipe and acquisition modals. */
  const itemMenuFor: ItemMenuFor = (typeId, trigger, extraItems) => (
    <ItemContextMenu {...menuProps(typeId, extraItems)}>{trigger}</ItemContextMenu>
  );

  const itemActionsFor = (
    typeId: number,
    bordered = false,
    extraItems?: ReactNode
  ): ReactElement => (
    <ItemMoreActions
      variant={bordered ? 'ghost' : undefined}
      size={bordered ? 'sm' : undefined}
      {...menuProps(typeId, extraItems)}
    />
  );

  return { itemMenuFor, itemActionsFor };
}
