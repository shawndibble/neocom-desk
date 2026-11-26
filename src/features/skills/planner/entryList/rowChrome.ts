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

export const ICON_BUTTON = cx(iconButtonClassName({ size: 'sm' }), 'lg:scroll-mt-40');
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
export const TIME_CELL = 'w-24 shrink-0 whitespace-nowrap text-right';
export const NAME_CELL = 'flex min-w-0 flex-1 items-center gap-1.5';
export const ACTION_SPACER = 'w-7 shrink-0';

export function priorityLabelKey(priority: PlanPriority): string {
  return `plans.priority${priority[0].toUpperCase()}${priority.slice(1)}`;
}

export function attributePairLabel(primary: AttributeName, secondary: AttributeName): string {
  return `${primary.slice(0, 3).toUpperCase()}/${secondary.slice(0, 3).toUpperCase()}`;
}

interface SortableRowChrome {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  handleProps: Record<string, unknown>;
  isDragging: boolean;
}

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
