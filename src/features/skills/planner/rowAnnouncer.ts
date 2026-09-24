/**
 * Row-name/position lookups for dnd-kit's drag announcements (#1493, WCAG
 * 4.1.3), naming the skill/marker and its new position rather than dnd-kit's
 * default raw sortable id in hardcoded English ("Picked up draggable item
 * 3300-4"). Pure and its own file (not EntryList.tsx, which may only export
 * components — `react-refresh/only-export-components`) so the announcement
 * text is unit-testable without simulating a dnd-kit drag, which needs real
 * layout measurement jsdom doesn't provide.
 */
import type { Announcements } from '@dnd-kit/core';
import type { MergedRow } from './queueRows';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** "{name} {level}" in Roman numerals — shared with EntryList.tsx's `EntryRow`/`PrereqRow` labels so a row's on-screen name and its announced name can't drift apart. */
export function formatLevelLabel(name: string, level: number): string {
  return `${name} ${ROMAN[level - 1]}`;
}

interface RowAnnouncer {
  /** A row's display name — the skill/level for an entry or prereq row, the fixed marker label for a marker row. Also used for a marker row's Move-menu label. `id` may not resolve to a row (a stale id mid-unmount); falls back to the id itself rather than throwing. */
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

  /** 1-based position in the sortable list, or the last position for an id dnd-kit somehow didn't report (should not happen — `over` only ever names a row inside this same `SortableContext`). */
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
