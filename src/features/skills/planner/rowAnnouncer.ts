import { romanLevel } from '@/engine/projection';
import type { Announcements } from '@dnd-kit/core';
import type { MergedRow } from './queueRows';

export function formatLevelLabel(name: string, level: number): string {
  return `${name} ${romanLevel(level)}`;
}

interface RowAnnouncer {
  describeRow: (id: string) => string;
  announcements: Announcements;
}

export function buildRowAnnouncer(
  rows: readonly MergedRow[],
  nameFor: (skillTypeID: number) => string,
  t: (key: string, options?: Record<string, unknown>) => string
): RowAnnouncer {
  const rowById = new Map<string, MergedRow>();
  const positions = new Map<string, number>();
  rows.forEach((r, i) => {
    rowById.set(r.id, r);
    positions.set(r.id, i + 1);
  });
  const total = rows.length;

  function describeRow(id: string): string {
    const row = rowById.get(id);
    if (!row) return id;
    if (row.kind === 'marker') return t('plans.markerRow');
    const skillTypeID = row.kind === 'entry' ? row.entry.skillTypeID : row.step.skillTypeID;
    const level = row.kind === 'entry' ? row.entry.targetLevel : row.step.level;
    return formatLevelLabel(nameFor(skillTypeID), level);
  }

  function positionOf(id: string): number {
    return positions.get(id) ?? total;
  }

  return {
    describeRow,
    announcements: {
      onDragStart: ({ active }) =>
        t('plans.dragAnnounceStart', { name: describeRow(String(active.id)) }),
      onDragOver: ({ active, over }) =>
        over
          ? t('plans.dragAnnounceOver', {
              name: describeRow(String(active.id)),
              position: positionOf(String(over.id)),
              total,
            })
          : t('plans.dragAnnounceOverNone', { name: describeRow(String(active.id)) }),
      onDragEnd: ({ active, over }) =>
        over
          ? t('plans.dragAnnounceEnd', {
              name: describeRow(String(active.id)),
              position: positionOf(String(over.id)),
              total,
            })
          : t('plans.dragAnnounceCancelled', { name: describeRow(String(active.id)) }),
      onDragCancel: ({ active }) =>
        t('plans.dragAnnounceCancelled', { name: describeRow(String(active.id)) }),
    },
  };
}
