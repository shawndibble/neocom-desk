/**
 * The Fitting editor's one item menu: every fitted module, empty slot, drone
 * and Ring cargo tile offers its actions through it, on the Ring
 * and the List alike. Built on the app's `RowActionsMenu`, so each gets the
 * right-click menu, Radix's own touch-and-hold for it, and — where the row
 * has room — a visible "More actions" (⋮) button a keyboard or touch user
 * reaches the same items with (WCAG 2.1.1). Every drag in the editor has its
 * equivalent here.
 *
 * The page owns the edits and hands them down once, as `FittingItemActions`
 * in context; a surface without it (the Start screen's read-only preview)
 * simply shows no menu.
 */
import type { ReactElement, ReactNode } from 'react';
import { RowActionsMenu, useOpenAfterMenu } from '@/components/ui';
import { OpenAfterMenuContext } from './itemMenu/menuContext';

export { AddCargoMenuItems, AddItemMenuItems } from './itemMenu/AddMenuItems';
export { CargoMenuItems } from './itemMenu/CargoMenuItems';
export { EmptySlotMenuItems, DroneMenuItems } from './itemMenu/SlotAndDroneMenuItems';
export { ModuleMenuItems } from './itemMenu/ModuleMenuItems';
export { WeaponMenuItems } from './itemMenu/WeaponMenuItems';

/**
 * Wraps a trigger in the item menu: right-click (or touch-and-hold) opens
 * `items`, and a `RowMoreActions` anywhere under it draws the ⋮ button.
 *
 * With `tooltip`, the trigger explains itself on hover and focus too (a Ring
 * tile). Touch-and-hold then belongs to the menu alone, so the menu is
 * touch's way to what the tile holds (`RowActionsMenu`'s own `tooltip`).
 */
export function FittingItemMenu({
  name,
  items,
  tooltip,
  onOpenChange,
  children,
}: {
  /** What the item is, for the ⋮ button's name ("More actions for …"). */
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
