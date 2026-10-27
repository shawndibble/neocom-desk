import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import { cx } from '@/lib/cx';
import { iconButtonClassName } from '@/components/ui';
import {
  focusRingClassName,
  gripHitAreaClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import type { AttributeName, PlanPriority } from '@/engine/types';
import { PLAN_HANDLE_ATTR } from '../focusNeighbour';

/**
 * A row's icon-only buttons (grip, prereq promote). `iconButtonClassName` on a
 * bare `<button>` rather than `IconButton`, which wraps each one in a Tooltip —
 * a Radix provider on every row of a long queue. (The ⋮ is `RowMoreActions`;
 * its menu content mounts only when opened, so a long queue pays for the
 * trigger button only.) It also never shrinks its glyph: a
 * text `Button` narrowed to `w-7` kept its `px-2.5` padding and squeezed a
 * 1rem icon into what was left, down to a dot.
 */
export const ICON_BUTTON = cx(iconButtonClassName({ size: 'sm' }), 'lg:scroll-mt-40');
/** A row's drag grip: the shared recipe plus the grab cursor and the touch hit area. */
export const GRIP_BUTTON = cx(
  'cursor-grab touch-none rounded-xs px-1 text-text-faint hover:text-text',
  interactiveClassName,
  focusRingClassName,
  gripHitAreaClassName,
  'lg:scroll-mt-40'
);
export const DANGER_ICON_BUTTON = cx(
  iconButtonClassName({ size: 'sm', tone: 'danger' }),
  'lg:scroll-mt-40'
);
/**
 * Every training-time cell and its desktop column header, so the two cannot
 * drift apart and leave the numbers unaligned. 6rem holds the widest duration
 * formatCountdown produces ("9999d 23h"); the previous 4rem ran out around
 * "99d 23h", so any plan longer than a few months broke its own times
 * across two lines mid-value ("123d 18h" / "58m").
 */
export const TIME_CELL = 'w-24 shrink-0 whitespace-nowrap text-right';
/**
 * The name cell, shared by every row kind so the skill names form one column.
 * `min-w-0` is what lets the inner `truncate` still work inside this flex
 * container.
 */
export const NAME_CELL = 'flex min-w-0 flex-1 items-center gap-1.5';
/**
 * Stands in for a row's single trailing icon button (remove / promote), so the
 * desktop column headers and the level breakdown keep their numbers in the
 * same column as the rows above and below them.
 */
export const ACTION_SPACER = 'w-7 shrink-0';

/** i18n key for a priority's display label, e.g. 'high' -> 'plans.priorityHigh'. */
export function priorityLabelKey(priority: PlanPriority): string {
  return `plans.priority${priority[0].toUpperCase()}${priority.slice(1)}`;
}

/** "PER/WIL": same three-letter abbreviation PlanEditor's remapInstruction uses. */
export function attributePairLabel(primary: AttributeName, secondary: AttributeName): string {
  return `${primary.slice(0, 3).toUpperCase()}/${secondary.slice(0, 3).toUpperCase()}`;
}

interface SortableRowChrome {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  handleProps: Record<string, unknown>;
  isDragging: boolean;
}

/** Shared useSortable plumbing for entry and marker rows. */
export function useRowSortable(id: string): SortableRowChrome {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return {
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    handleProps: { ...attributes, ...listeners, [PLAN_HANDLE_ATTR]: id },
    isDragging,
  };
}
