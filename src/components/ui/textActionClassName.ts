import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName, interactiveClassName } from './controlStyles';

export function textActionClassName(extra = ''): string {
  return cx(
    'flex min-h-9 items-center rounded-xs text-[0.6875rem] font-semibold tracking-widest text-accent uppercase hover:underline active:text-accent/75 md:min-h-6',
    interactiveClassName,
    focusRingClassName,
    disabledClassName,
    extra
  );
}
