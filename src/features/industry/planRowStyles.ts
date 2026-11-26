import { interactiveClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';

const selectedPressClassName = `hover:bg-panel-2 ${interactiveClassName}`;

export function rowStateClassName(active: boolean, dropping: boolean): string {
  if (dropping) return interactiveClassName;
  return active ? selectedPressClassName : rowInteractiveClassName;
}
