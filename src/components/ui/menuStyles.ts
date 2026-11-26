import { highlightedOptionClassName, interactiveClassName } from './controlStyles';

const menuSurfaceClassName =
  'z-50 rounded-xs border border-line bg-panel p-1 text-text shadow-lg shadow-black/50 outline-none';

export const menuContentClassName = `${menuSurfaceClassName} motion-pop min-w-40`;

export const menuSubContentClassName = `${menuSurfaceClassName} motion-fade min-w-[min(10rem,var(--radix-popper-available-width))] max-w-[var(--radix-popper-available-width)]`;

export const MENU_COLLISION_PADDING = 8;

export const menuScrollClassName = 'max-h-[var(--radix-popper-available-height)] overflow-y-auto';

export const menuItemClassName = `flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-sm touch:min-h-9 ${interactiveClassName} ${highlightedOptionClassName} aria-disabled:cursor-default aria-disabled:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:text-text-dim data-[disabled]:opacity-40 data-[highlighted]:bg-panel-2 data-[highlighted]:text-text active:bg-panel`;
