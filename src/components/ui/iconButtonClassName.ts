import { cx } from '@/lib/cx';
import { disabledClassName, focusRingClassName, interactiveClassName } from './controlStyles';

export type IconButtonVariant = 'ghost' | 'plain';
export type IconButtonTone = 'default' | 'danger' | 'positive' | 'warning';
export type IconButtonSize = 'md' | 'sm' | 'row';

export interface IconButtonClassNameOptions {
  /**
   * `ghost` (default) carries the hairline border of a Button. `plain` drops
   * it, for affordances that sit inside a row and would otherwise draw a box
   * around every line of a list.
   */
  variant?: IconButtonVariant;
  /** `danger` is the destructive treatment; `positive` the "worth doing" one; `warning` the amber caution one (`text-warning`). */
  tone?: IconButtonTone;
  /**
   * `md` (default) is the toolbar size; `sm` is for controls nested in a
   * dense row. `row` is `sm` on a pointer and the 44px touch tier below
   * `md` — a row's own ⋮ or inline action, the thumb's only way in.
   */
  size?: IconButtonSize;
  /** Toggle state — takes the accent treatment when on. */
  pressed?: boolean;
  disabled?: boolean;
  /** The button also shows a text label from `md` up, so it is wider than a square there. */
  withText?: boolean;
  className?: string;
}

/**
 * The class string an icon-only control gets from its variant/tone/size.
 *
 * Its own module rather than an export off `IconButton.tsx` so that file keeps
 * exporting only components (`react-refresh/only-export-components`), and so a
 * non-button element that must look identical — a `react-router-dom` `Link`
 * that navigates rather than acting, say — can match it exactly instead of
 * hand-copying the cascade. Mirrors `buttonClassName` for the same reason.
 *
 * The size classes are the 44px touch tier below `md` or on a coarse pointer
 * (`touch:`) and the standard 36px control above it (DESIGN.md §3): a pointer
 * never gets the phone-sized box and a thumb never gets the mouse-sized one.
 */
export function iconButtonClassName({
  variant = 'ghost',
  tone = 'default',
  size = 'md',
  pressed,
  disabled = false,
  withText = false,
  className = '',
}: IconButtonClassNameOptions = {}): string {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-xs',
    interactiveClassName,
    focusRingClassName,
    disabledClassName,
    // A labelled button keeps the square box below `md` and swaps to auto width
    // above it: one size utility per breakpoint, never two fighting at `md:`.
    withText
      ? size === 'sm'
        ? 'size-9 md:size-auto md:h-7 md:gap-1.5 md:px-2 touch:h-9 touch:min-w-9'
        : 'size-11 md:size-auto md:h-9 md:gap-1.5 md:px-2.5 touch:h-11 touch:min-w-11'
      : size === 'md'
        ? 'size-11 md:size-9 touch:size-11'
        : size === 'row'
          ? 'size-11 md:size-7 touch:size-11'
          : 'size-9 md:size-7 touch:size-9',
    // `border` alone here: each state below names its own border colour, so no
    // two border-colour utilities ever land on the element at once. Tailwind
    // resolves same-property utilities by stylesheet order, not by their order
    // in this attribute, so "a later class overrides an earlier one" is not
    // something to rely on.
    variant === 'ghost' && 'border',
    pressed === true
      ? cx(
          'bg-accent/12 text-accent',
          variant === 'ghost' && 'border-accent',
          !disabled && 'hover:bg-accent/20 active:bg-accent/28'
        )
      : tone === 'danger'
        ? cx(
            'text-danger',
            variant === 'ghost' && 'border-danger/60',
            !disabled && 'hover:bg-danger/10 active:bg-danger/20',
            variant === 'ghost' && !disabled && 'hover:border-danger'
          )
        : tone === 'positive'
          ? cx(
              'text-isk-pos',
              variant === 'ghost' && 'border-line',
              !disabled && 'hover:bg-isk-pos/10 active:bg-isk-pos/20',
              variant === 'ghost' && !disabled && 'hover:border-isk-pos'
            )
          : tone === 'warning'
            ? cx(
                'text-warning',
                variant === 'ghost' && 'border-line',
                !disabled && 'hover:bg-warning/10 active:bg-warning/20',
                variant === 'ghost' && !disabled && 'hover:border-warning'
              )
            : cx(
                'text-text-dim',
                variant === 'ghost' && 'border-line',
                !disabled && 'hover:text-text active:bg-panel',
                variant === 'plain' && !disabled && 'hover:bg-panel-2',
                variant === 'ghost' && 'bg-panel-2',
                variant === 'ghost' && !disabled && 'hover:border-line-bright'
              ),
    className
  );
}
