import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import * as Icon from './icons';
import { fieldBaseClassName, fieldSizeClassName, type ControlSize } from './controlStyles';

interface NativeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** `md` (default) is the page/form size; `sm` matches `Button size="sm"` inside a dense row. */
  size?: ControlSize;
  /** Wrapper class — put width/layout here; the field always fills it. */
  className?: string;
}

/**
 * A real `<select>` in the house treatment.
 *
 * The sibling of `Select` (Radix), not a replacement for it: this is the right
 * pick for a short, static option list inside a form, where the platform
 * control already does everything and the native mobile picker is better than
 * anything a popover can be. `Select` earns its weight when the list is long,
 * searchable, or needs custom option rendering.
 *
 * The two are styled from the same `controlStyles` tokens and carry the same
 * caret glyph, so a form can mix them without the seam showing — which is the
 * whole point, since before this the raw `<select>`s ran `h-6`/`h-7`/`h-8`
 * against `Select`'s `h-9`.
 *
 * `appearance-none` plus our own caret, because the platform arrow is drawn in
 * the OS accent colour and ignores `--color-text-dim` — on the dark palette
 * that reads as a stray light pixel next to every field.
 */
export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(function NativeSelect(
  { size = 'md', className = '', children, ...rest },
  ref
) {
  return (
    <div className={cx('relative', className)}>
      <select
        ref={ref}
        className={cx(
          fieldBaseClassName,
          fieldSizeClassName[size],
          'w-full appearance-none',
          size === 'sm' ? 'pr-6' : 'pr-8'
        )}
        {...rest}
      >
        {children}
      </select>
      <Icon.Expanded
        size={size === 'sm' ? Icon.ICON_SIZE.sm : Icon.ICON_SIZE.md}
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-dim',
          size === 'sm' ? 'right-1' : 'right-2'
        )}
      />
    </div>
  );
});
