import { forwardRef, useContext, type InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { PRIMARY_SEARCH_ATTRIBUTE } from '@/lib/pageSearch';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';
import * as Icon from './icons';
import { controlHeightClassName, fieldBaseClassName } from './controlStyles';
import { PrimarySearchContext } from './primarySearch';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Wrapper class — put width/layout here; the field always fills it. */
  className?: string;
  /** The `<input>` itself — for what only the focused element can carry (e.g. `scroll-mt-*`). */
  inputClassName?: string;
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
 *
 * In a `FilterBar`'s `search` slot it is the page's own search box: `/`
 * focuses it (`lib/pageSearch.ts`), and while it is empty and unfocused it
 * shows a `/` key cap saying so — not on a touch screen, which has no `/` to
 * press, and not with single-key shortcuts switched off.
 *
 * @summary The one search box: a magnifier and a fixed `md` height; use it for every filter-as-you-type field.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className = '', inputClassName, ...rest },
  ref
) {
  const primary = useContext(PrimarySearchContext);
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
          // Room for the key cap, which sits where typed text would run.
          hint ? 'peer pr-9 touch:pr-3' : 'pr-3',
          inputClassName
        )}
        {...rest}
      />
      {hint && (
        // After the input, for `peer-*`: hidden once it has focus or text
        // (`:placeholder-shown` is the CSS test for an empty field).
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
