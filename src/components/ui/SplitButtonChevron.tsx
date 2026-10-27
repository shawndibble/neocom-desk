import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cx } from '@/lib/cx';
import { Button } from './Button';
import { Expanded } from './icons';

interface SplitButtonChevronProps extends Omit<
  ComponentPropsWithoutRef<typeof Button>,
  'variant' | 'children' | 'aria-label'
> {
  /** The menu's name, e.g. "More save options". Sets the `aria-label`; the chevron has no text. */
  label: string;
}

/**
 * The caret half of a `primary` split button (DESIGN.md §6c), placed after a
 * `<Button variant="primary" className="rounded-r-none">` inside a `flex`
 * box and used as the `DropdownMenuTrigger asChild` child. A ghost split
 * button uses a `CaretDown` `IconButton` instead: `IconButton` has no
 * primary variant.
 *
 * `px-1!`, not `px-1`: `buttonClassName` joins rather than merges, and
 * Tailwind emits the size tier's `px-4` / `px-2.5` after `px-1`, so a bare
 * override never applies.
 *
 * Forwards its ref so it can be a Radix trigger directly.
 *
 * @summary The caret segment of a primary split button: squared left corners, a divider, 4px padding.
 */
export const SplitButtonChevron = forwardRef<HTMLButtonElement, SplitButtonChevronProps>(
  function SplitButtonChevron({ label, className, ...rest }, ref) {
    return (
      <Button
        ref={ref}
        variant="primary"
        aria-label={label}
        className={cx('rounded-l-none border-l-accent-contrast/30 px-1!', className)}
        {...rest}
      >
        <Expanded aria-hidden="true" />
      </Button>
    );
  }
);
