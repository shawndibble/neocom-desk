import type { ReactElement, ReactNode } from 'react';
import {
  ItemContextMenu,
  ItemMoreActions,
  type ItemMenuFor,
} from '@/features/market/ItemContextMenu';
import { BpcSourcingMenuItem } from './BpcSourcingMenuItem';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';

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
