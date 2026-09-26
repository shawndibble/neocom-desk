/** Shared styling for the Radix-backed ContextMenu and DropdownMenu wrappers. Internal — not re-exported from the barrel. */
const menuSurfaceClassName =
  'z-50 rounded-xs border border-line bg-panel p-1 text-text shadow-lg shadow-black/50 outline-none';

export const menuContentClassName = `${menuSurfaceClassName} min-w-40`;

/**
 * A submenu never runs past the viewport: on a phone the parent menu already
 * takes most of the width, and a submenu at its natural width had no side it
 * fitted on — it ran off the left edge, over its parent. Capped at the room
 * Radix measures on the side it lands (its popper's available width, less
 * `MENU_COLLISION_PADDING`), with items wrapping instead; the usual 10rem
 * floor gives way to that room when there is less of it.
 */
export const menuSubContentClassName = `${menuSurfaceClassName} min-w-[min(10rem,var(--radix-popper-available-width))] max-w-[var(--radix-popper-available-width)]`;

/** The gap a menu or submenu keeps from the viewport's edges, px. */
export const MENU_COLLISION_PADDING = 8;

/**
 * A menu (not a Popover, which shares the surface) scrolls rather than
 * running off the screen: long on a phone, and longer again once a submenu
 * opens in place there (`RowActions`' `MenuSub`).
 */
export const menuScrollClassName = 'max-h-[var(--radix-popper-available-height)] overflow-y-auto';

export const menuItemClassName =
  'flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:text-text-dim data-[disabled]:opacity-50 data-[highlighted]:bg-panel-2 data-[highlighted]:text-text';
