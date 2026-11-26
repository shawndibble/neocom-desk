import type { QuickbarItem } from '@/db';

export type QuickbarTarget = { price: number; direction: 'above' | 'below' } | null;

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

export function restoreQuickbarItem(
  items: readonly QuickbarItem[],
  item: QuickbarItem,
  index: number
): QuickbarItem[] {
  if (items.some((i) => i.typeId === item.typeId)) return [...items];
  const next = [...items];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
  return next;
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

export function quickbarToPasteText(items: readonly QuickbarItem[]): string {
  return items.map((item) => item.name).join('\n');
}

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

export function pinWithTarget(
  items: readonly QuickbarItem[],
  typeId: number,
  name: string,
  target: QuickbarTarget
): QuickbarItem[] {
  if (target === null) return setQuickbarItemTarget(items, typeId, null);
  return setQuickbarItemTarget(addQuickbarItem(items, { typeId, name }), typeId, target);
}
