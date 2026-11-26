import type { ReactElement, ReactNode } from 'react';
import { RowActionsMenu, useOpenAfterMenu } from '@/components/ui';
import { OpenAfterMenuContext } from './itemMenu/menuContext';

export { AddCargoMenuItems, AddItemMenuItems } from './itemMenu/AddMenuItems';
export { CargoMenuItems } from './itemMenu/CargoMenuItems';
export { EmptySlotMenuItems, DroneMenuItems } from './itemMenu/SlotAndDroneMenuItems';
export { ModuleMenuItems } from './itemMenu/ModuleMenuItems';
export { WeaponMenuItems } from './itemMenu/WeaponMenuItems';

export function FittingItemMenu({
  name,
  items,
  tooltip,
  onOpenChange,
  children,
}: {
  name: string;
  items: ReactNode;
  tooltip?: string;
  onOpenChange?: (open: boolean) => void;
  children: ReactElement;
}) {
  const openAfter = useOpenAfterMenu();
  return (
    <OpenAfterMenuContext.Provider value={openAfter.run}>
      <RowActionsMenu
        name={name}
        items={items}
        tooltip={tooltip}
        onOpenChange={onOpenChange}
        onCloseAutoFocus={openAfter.onCloseAutoFocus}
      >
        {children}
      </RowActionsMenu>
    </OpenAfterMenuContext.Provider>
  );
}
