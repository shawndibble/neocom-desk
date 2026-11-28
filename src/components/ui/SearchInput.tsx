import { forwardRef, useContext, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { PRIMARY_SEARCH_ATTRIBUTE } from '@/lib/pageSearch';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';
import * as Icon from './icons';
import { controlHeightClassName, fieldBaseClassName } from './controlStyles';
import { PrimarySearchContext } from './primarySearch';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  className?: string;
  inputClassName?: string;
  pageSearch?: boolean;
}

/** @summary The one search box: a magnifier and a fixed `md` height; use it for every filter-as-you-type field. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className = '', inputClassName, pageSearch = false, ...rest },
  ref
) {
  const primary = useContext(PrimarySearchContext) || pageSearch;
  const shortcutsOn = useSingleKeyShortcuts((s) => s.value);
  const hint = primary && shortcutsOn;
  return (
    <div className={cx('relative', className)}>
      <Icon.Search
        size={Icon.ICON_SIZE.md}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint"
      />
      <input
        ref={ref}
        type="search"
        {...(primary && { [PRIMARY_SEARCH_ATTRIBUTE]: '' })}
        aria-keyshortcuts={hint ? '/' : undefined}
        className={cx(
          fieldBaseClassName,
          controlHeightClassName.md,
          'w-full pl-10 text-sm',
          hint ? 'peer pr-9 touch:pr-3' : 'pr-3',
          inputClassName
        )}
        {...rest}
      />
      {hint && (
        <kbd
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-xs border border-line px-1.5 font-mono text-[0.6875rem] leading-4 text-text-faint peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden touch:hidden"
        >
          /
        </kbd>
      )}
    </div>
  );
});
