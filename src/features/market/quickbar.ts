/**
 * Pure Quickbar list editing helpers (CONTEXT.md): a flat, drag-ordered list
 * of saved item shortcuts, deduped by typeId. Reordering moves the active
 * item to sit at the target item's position, matching @dnd-kit's arrayMove.
 */
import type { QuickbarItem } from '@/db';

/** A Quickbar item's price alert target, or `null` to clear one (issue #680). */
export type QuickbarTarget = { price: number; direction: 'above' | 'below' } | null;

/** Whether a Quickbar item carries a price alert target — the one check every reader shares, rather than each re-deriving it from the pair of optional fields. */
export function hasQuickbarTarget(item: QuickbarItem): boolean {
  return item.targetPrice !== undefined && item.targetDirection !== undefined;
}

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

/**
 * Formats the Quickbar's contents the same way a manual multibuy paste would
 * (issue #726), for handoff into Appraisal's paste box. `QuickbarItem` carries
 * no quantity, so each line is a bare name — `parseAppraisalPaste` already
 * treats a bare name as a stack of one.
 */
export function quickbarToPasteText(items: readonly QuickbarItem[]): string {
  return items.map((item) => item.name).join('\n');
}

/**
 * Sets or clears a Quickbar item's price alert target (issue #680). `null`
 * clears both fields rather than leaving a stale price behind — the only way
 * to stop a target's alerts is to remove it or replace it outright, never to
 * edit one field independently of the other.
 */
export function setQuickbarItemTarget(
  items: readonly QuickbarItem[],
  typeId: number,
  target: QuickbarTarget
): QuickbarItem[] {
  return items.map((item) => {
    if (item.typeId !== typeId) return item;
    if (target === null) {
      return { typeId: item.typeId, name: item.name };
    }
    return { ...item, targetPrice: target.price, targetDirection: target.direction };
  });
}
