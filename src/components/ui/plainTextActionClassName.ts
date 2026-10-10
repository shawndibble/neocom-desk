import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName, interactiveClassName } from './controlStyles';

/**
 * The class string of a quiet text action: body-colour text with a solid
 * underline at rest, no box and no accent. For a secondary action tucked under
 * a primary control (the "Choose permissions" under "Log in"), where an accent
 * word would compete with the primary and a `Button` box would read as a
 * second one. It is not a link in a sentence (`inlineLinkClassName`) and not an
 * uppercase header action (`textActionClassName`).
 *
 * Like `textActionClassName`, a class helper so it lands on a `<button>` and a
 * router `Link` alike; `min-h-11` is the 44px touch tier below `md`.
 */
export function plainTextActionClassName(extra = ''): string {
  return cx(
    'inline-flex min-h-11 items-center rounded-xs text-xs font-medium text-text underline decoration-1 underline-offset-2 hover:decoration-2 active:text-text/75 md:min-h-0',
    interactiveClassName,
    focusRingClassName,
    disabledClassName,
    extra
  );
}
