import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName, interactiveClassName } from './controlStyles';

export function plainTextActionClassName(extra = ''): string {
  return cx(
    'inline-flex items-center rounded-xs text-xs font-medium text-text underline decoration-1 underline-offset-2 hover:decoration-2 active:text-text/75',
    interactiveClassName,
    focusRingClassName,
    disabledClassName,
    extra
  );
}
