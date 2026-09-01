/**
 * Pure Quickbar list editing helpers (CONTEXT.md): a flat, drag-ordered list
 * of saved item shortcuts, deduped by typeId. Reordering moves the active
 * item to sit at the target item's position, matching @dnd-kit's arrayMove.
 */
import type { QuickbarItem } from '@/db';

export function addQuickbarItem(
  items: readonly QuickbarItem[],
  item: QuickbarItem
): QuickbarItem[] {
  if (items.some((i) => i.typeId === item.typeId)) return [...items];
  return [...items, item];
}

export function removeQuickbarItem(items: readonly QuickbarItem[], typeId: number): QuickbarItem[] {
  return items.filter((i) => i.typeId !== typeId);
}

export function reorderQuickbarItems(
  items: readonly QuickbarItem[],
  activeTypeId: number,
  overTypeId: number
): QuickbarItem[] {
  const activeIndex = items.findIndex((i) => i.typeId === activeTypeId);
  const overIndex = items.findIndex((i) => i.typeId === overTypeId);
  if (activeIndex === -1 || overIndex === -1) return [...items];
  const next = [...items];
  const [moved] = next.splice(activeIndex, 1);
  next.splice(overIndex, 0, moved);
  return next;
}
