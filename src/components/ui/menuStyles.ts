/** Shared styling for the Radix-backed ContextMenu and DropdownMenu wrappers. Internal — not re-exported from the barrel. */
export const menuContentClassName =
  'z-50 min-w-40 rounded-xs border border-line bg-panel p-1 text-text shadow-lg shadow-black/50 outline-none';

export const menuItemClassName =
  'flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:text-text-dim data-[disabled]:opacity-50 data-[highlighted]:bg-panel-2 data-[highlighted]:text-text';
