import { interactiveClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';

// A selected row keeps its panel-2 fill while pressed (as DataTable's).
const selectedPressClassName = `hover:bg-panel-2 ${interactiveClassName}`;

/**
 * The row's hover/pressed recipe. Dropped while the row is a live drop target:
 * its hover fill would paint over the target's accent fill, and a dragged
 * pointer over the row is always hovering it.
 */
export function rowStateClassName(active: boolean, dropping: boolean): string {
  if (dropping) return interactiveClassName;
  return active ? selectedPressClassName : rowInteractiveClassName;
}
