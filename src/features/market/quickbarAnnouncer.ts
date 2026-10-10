/**
 * dnd-kit drag announcements for the Quickbar (WCAG 4.1.3), naming the item
 * and its new position rather than dnd-kit's default "Draggable item 34 was
 * moved over droppable area 35" in hardcoded English. Built like the Skill
 * Plan's `buildRowAnnouncer` and pure for the same reason: unit-testable
 * without simulating a drag.
 */
import type { Announcements } from '@dnd-kit/core';
import type { QuickbarItem } from '@/db';

export function buildQuickbarAnnouncements(
  items: readonly QuickbarItem[],
  t: (key: string, options?: Record<string, unknown>) => string
): Announcements {
  const names = new Map<number, string>();
  const positions = new Map<number, number>();
  items.forEach((item, i) => {
    names.set(item.typeId, item.name);
    positions.set(item.typeId, i + 1);
  });
  const total = items.length;
  // A stale id mid-unmount falls back to the id itself rather than throwing.
  const nameOf = (id: string | number) => names.get(Number(id)) ?? String(id);
  const positionOf = (id: string | number) => positions.get(Number(id)) ?? total;

  return {
    onDragStart: ({ active }) => t('market.quickbar.drag.start', { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('market.quickbar.drag.over', {
            name: nameOf(active.id),
            position: positionOf(over.id),
            total,
          })
        : t('market.quickbar.drag.overNone', { name: nameOf(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t('market.quickbar.drag.end', {
            name: nameOf(active.id),
            position: positionOf(over.id),
            total,
          })
        : t('market.quickbar.drag.cancelled', { name: nameOf(active.id) }),
    onDragCancel: ({ active }) => t('market.quickbar.drag.cancelled', { name: nameOf(active.id) }),
  };
}
