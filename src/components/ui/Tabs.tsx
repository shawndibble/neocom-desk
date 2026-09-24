import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListClassName,
  tabScrollerClassName,
} from './tabStyles';

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist. */
  label?: string;
  className?: string;
  /**
   * `'manual'`: arrow keys only move focus, Enter/Space selects (native
   * button behavior). Use wherever `onChange` navigates to another route —
   * `'automatic'` (default) would unmount this tablist mid-keypress.
   */
  activation?: 'automatic' | 'manual';
}

/**
 * Controlled horizontal tab bar. For peer views within a page, not navigation.
 *
 * The bar scrolls sideways rather than squeezing when it outgrows its frame —
 * see `tabScrollerClassName` for why the scroller is the wrapper and not the
 * tablist itself.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
  className = '',
  activation = 'automatic',
}: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // Only consulted in 'manual' mode, where the roving tab stop tracks
  // keyboard focus rather than `value` — arrowing around must not select
  // anything until Enter/Space says so.
  const [manualFocusId, setManualFocusId] = useState(value);
  const focusedId = activation === 'manual' ? manualFocusId : value;

  /**
   * Keeps the selected (or, in manual mode, focused) tab on screen when it
   * changes from outside this component — a deep link that opens a specific
   * tab, a page selecting one in response to something else. A click or an
   * arrow key brings its own tab into view (you cannot click what you cannot
   * see, and `.focus()` scrolls to what it focuses), so this is only for the
   * case nothing else covers.
   *
   * `block: 'nearest'` is load-bearing: the default `'start'` would scroll the
   * page vertically to put the tab bar at the top, which is not what changing
   * a tab asked for.
   */
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab-id="${focusedId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focusedId]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === focusedId);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (activation === 'manual') {
      setManualFocusId(next.id);
    } else {
      onChange(next.id);
    }
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus();
  }

  return (
    // `className` lands on the scroller, not the tablist: callers pass spacing
    // (`mt-3`), and margin on the inner bar would be measured inside the
    // scrollport.
    <div className={cx(tabScrollerClassName, className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={tabListClassName}
      >
        {tabs.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tab-id={tab.id}
              aria-selected={active}
              tabIndex={tab.id === focusedId ? 0 : -1}
              onClick={() => {
                if (activation === 'manual') setManualFocusId(tab.id);
                onChange(tab.id);
              }}
              className={cx(
                tabItemClassName,
                active ? tabItemActiveClassName : tabItemIdleClassName
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
