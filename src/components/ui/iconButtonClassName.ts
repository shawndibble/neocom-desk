import { cx } from '@/lib/cx';

export type IconButtonVariant = 'ghost' | 'plain';
export type IconButtonTone = 'default' | 'danger' | 'positive';
export type IconButtonSize = 'md' | 'sm';

export interface IconButtonClassNameOptions {
  /**
   * `ghost` (default) carries the hairline border of a Button. `plain` drops
   * it, for affordances that sit inside a row and would otherwise draw a box
   * around every line of a list.
   */
  variant?: IconButtonVariant;
  /** `danger` is the destructive treatment; `positive` the "worth doing" one. */
  tone?: IconButtonTone;
  /** `md` (default) is the toolbar size; `sm` is for controls nested in a dense row. */
  size?: IconButtonSize;
  /** Toggle state — takes the accent treatment when on. */
  pressed?: boolean;
  disabled?: boolean;
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
 * The size classes are the 44px touch tier below `md` and the standard 36px
 * control above it (DESIGN.md §3): a pointer never gets the phone-sized box
 * and a thumb never gets the mouse-sized one.
 */
export function iconButtonClassName({
  variant = 'ghost',
  tone = 'default',
  size = 'md',
  pressed,
  disabled = false,
  className = '',
}: IconButtonClassNameOptions = {}): string {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-xs',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    'disabled:cursor-not-allowed disabled:opacity-40',
    size === 'md' ? 'size-11 md:size-9' : 'size-9 md:size-7',
    // `border` alone here: each state below names its own border colour, so no
    // two border-colour utilities ever land on the element at once. Tailwind
    // resolves same-property utilities by stylesheet order, not by their order
    // in this attribute, so "a later class overrides an earlier one" is not
    // something to rely on.
    variant === 'ghost' && 'border',
    pressed === true
      ? cx('bg-accent/12 text-accent', variant === 'ghost' && 'border-accent')
      : tone === 'danger'
        ? cx(
            'text-danger',
            variant === 'ghost' && 'border-danger/60',
            !disabled && 'hover:bg-danger/10',
            variant === 'ghost' && !disabled && 'hover:border-danger'
          )
        : tone === 'positive'
          ? cx('text-isk-pos', variant === 'ghost' && 'border-line')
          : cx(
              'text-text-dim',
              variant === 'ghost' && 'border-line',
              !disabled && 'hover:text-text',
              variant === 'ghost' && 'bg-panel-2',
              variant === 'ghost' && !disabled && 'hover:border-line-bright'
            ),
    className
  );
}
