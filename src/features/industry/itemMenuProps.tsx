import type { ReactElement } from 'react';
import {
  ItemContextMenu,
  ItemMoreActions,
  type ItemMenuFor,
} from '@/features/market/ItemContextMenu';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';

/**
 * The item menu and its visible "More actions" button (WCAG 2.1.1, issue
 * #1498), built from identical props so the right-click menu and the button
 * can never list different actions. The page is already a Build Plan with no
 * Compare drawer, so both leave out "Build Plan" and "Add to Compare".
 */
export function itemMenuProps(catalog: BlueprintCatalog): {
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
  return {
    itemMenuFor: (typeId, trigger) => (
      <ItemContextMenu {...menuProps(typeId)}>{trigger}</ItemContextMenu>
    ),
    itemActionsFor: (typeId, bordered = false) => (
      <ItemMoreActions
        variant={bordered ? 'ghost' : undefined}
        size={bordered ? 'sm' : undefined}
        {...menuProps(typeId)}
      />
    ),
  };
}
