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
 * router `Link` alike. It carries no `min-h-11`: it sits right under the login
 * image, and a 44px box would push it away from the button it belongs to.
 */
export function plainTextActionClassName(extra = ''): string {
  return cx(
    'inline-flex items-center rounded-xs text-xs font-medium text-text underline decoration-1 underline-offset-2 hover:decoration-2 active:text-text/75',
    interactiveClassName,
    focusRingClassName,
    disabledClassName,
    extra
  );
}
