import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import * as Icon from './icons';
import { controlHeightClassName, fieldBaseClassName } from './controlStyles';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Wrapper class — put width/layout here; the field always fills it. */
  className?: string;
}

/**
 * The app's one search box: `type="search"`, a leading magnifier, and a single
 * height.
 *
 * Five of these shipped hand-written at three different heights and only one
 * carried the magnifier, so the same control read differently on Assets,
 * Market, Skills and the two pickers. The size is fixed at `md` rather than
 * exposed as a prop: a search box is the primary affordance of whatever panel
 * it heads, and there is no panel where it should be the compact one.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className = '', ...rest },
  ref
) {
  return (
    <div className={cx('relative', className)}>
      <Icon.Search
        size={Icon.ICON_SIZE.md}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint"
      />
      <input
        ref={ref}
        type="search"
        className={cx(fieldBaseClassName, controlHeightClassName.md, 'w-full pr-3 pl-10 text-sm')}
        {...rest}
      />
    </div>
  );
});
