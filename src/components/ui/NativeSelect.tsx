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
 * The exception to `Select` (Radix), not its peer — reach for `Select` first.
 * This once claimed the short-static-list-in-a-form case on the strength of
 * the native mobile picker, and the app has since gone the other way: closed,
 * the two are indistinguishable; open, one is the OS menu and the other is our
 * panel, and that difference is visible the moment two selects share a row. So
 * it has no product call sites today — only the Styleguide. It stays for a
 * caller that can name why it needs the platform picker specifically.
 *
 * The two are styled from the same `controlStyles` tokens and carry the same
 * caret glyph, so a form can mix them without the *closed* seam showing —
 * which is why the difference hid for as long as it did.
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
