import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { usePrefersReducedMotion } from '@/lib/useMediaQuery';
import * as Icon from './icons';
import { panelDomId, tabDomId, useTabPanelProps } from './tabPanel';
import { pageScrollDelta, scrollEdges, wheelScrollDelta, type ScrollEdges } from './tabScroll';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabChevronClassName,
  tabListClassName,
  tabScrollerClassName,
} from './tabStyles';

export interface TabItem {
  id: string;
  label: string;
  /**
   * How many things the tab holds (a Community's Members), in a round badge
   * after the label (§6c). Part of the tab's name, never a control or a status.
   */
  count?: number;
  /**
   * Tints the count's ring and number: `warning` for work waiting on the pilot,
   * `danger` for what needs recovering. The number always prints, so the tint
   * is never the only signal. Only with `count`.
   */
  countTone?: 'warning' | 'danger';
}

interface TabPanelProps {
  tabsId: string;
  /** The selected tab this panel shows. */
  tabId: string;
  className?: string;
  children: ReactNode;
}

/**
 * The content region for the selected tab of a `Tabs` bar.
 *
 * @summary The panel that holds the selected tab's content; pair it with `Tabs`.
 */
export function TabPanel({ tabsId, tabId, className, children }: TabPanelProps) {
  const { className: ring, ...rest } = useTabPanelProps(tabsId, tabId);
  return (
    <div {...rest} className={cx(ring, className)}>
      {children}
    </div>
  );
}

interface TabsProps {
  /** Shared id base from `useTabsId`, also given to the tab's panel. */
  tabsId: string;
  /** @summary The tabs, each with an id and an already-translated label. */
  tabs: TabItem[];
  /** @summary Id of the selected tab. */
  value: string;
  /** @summary Called with the id of the tab the user picked. */
  onChange: (id: string) => void;
  /** @summary Accessible name for the tablist. */
  label: string;
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
 * tablist itself. With a pointer, a vertical wheel over the bar travels it and
 * a chevron appears at whichever end still has tabs beyond it (§6c); on touch
 * the swipe and the edge fade are the cue, so the chevrons are not drawn.
 *
 * @summary Horizontal tab bar for peer views inside one page (Open / History); not for navigation.
 */
export function Tabs({
  tabsId,
  tabs,
  value,
  onChange,
  label,
  className = '',
  activation = 'automatic',
}: TabsProps) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Only consulted in 'manual' mode, where the roving tab stop tracks
  // keyboard focus rather than `value` — arrowing around must not select
  // anything until Enter/Space says so.
  const [manualFocusId, setManualFocusId] = useState(value);
  const focusedId = activation === 'manual' ? manualFocusId : value;
  const reducedMotion = usePrefersReducedMotion();
  const [edges, setEdges] = useState<ScrollEdges>({ before: false, after: false });

  // Chevrons and wheel travel both need to know which ends still have tabs
  // beyond them. Recomputed on scroll and on any resize of the frame or the
  // bar (a tab added, a count badge growing, a window resize), so it needs no
  // dependency on `tabs`, which callers often pass as a fresh array.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const next = scrollEdges(scroller);
      setEdges((prev) => (prev.before === next.before && prev.after === next.after ? prev : next));
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(scroller);
    if (listRef.current) observer?.observe(listRef.current);
    return () => {
      scroller.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  // Native listener, not `onWheel`: React registers wheel passively, and
  // taking the event over means calling `preventDefault`.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      const delta = wheelScrollDelta(event, scrollEdges(scroller));
      if (delta === null) return;
      event.preventDefault();
      scroller.scrollLeft += delta;
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, []);

  function pageScroll(direction: 'before' | 'after') {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: pageScrollDelta(direction, scroller.clientWidth),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }

  /**
   * Keeps the selected (or, in manual mode, focused) tab on screen when it
   * changes from outside this component — a deep link that opens a specific
   * tab, a page selecting one in response to something else. A click or an
   * arrow key brings its own tab into view (you cannot click what you cannot
   * see, and `.focus()` scrolls to what it focuses), so this is only for the
   * case nothing else covers.
   *
   * Slides only the bar's own `scrollLeft`, never `scrollIntoView`: that
   * scrolls every ancestor too, even with `block: 'nearest'`, so a bar below
   * the fold dragged the whole page down to it on load (the landing page's
   * feature tabs). Honours the bar's `scroll-padding-inline` as
   * `scrollIntoView` did, so the tab stops clear of the edge fade.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    const tab = listRef.current?.querySelector(`[data-tab-id="${focusedId}"]`);
    if (!scroller || !tab) return;
    const bar = scroller.getBoundingClientRect();
    const style = getComputedStyle(scroller);
    // `auto` (no padding set) parses to NaN.
    const start = bar.left + (parseFloat(style.scrollPaddingLeft) || 0);
    const end = bar.right - (parseFloat(style.scrollPaddingRight) || 0);
    const item = tab.getBoundingClientRect();
    if (item.left < start) scroller.scrollLeft -= start - item.left;
    else if (item.right > end) scroller.scrollLeft += item.right - end;
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
    // `className` lands on this frame, not the tablist: callers pass spacing
    // (`mt-3`), and margin on the inner bar would be measured inside the
    // scrollport. The chevrons sit here too, outside the scroller, because the
    // scroller's edge-fade mask would fade them out with the tabs.
    <div className={cx('relative', className)}>
      {(['before', 'after'] as const).map((side) =>
        edges[side] ? (
          // Pointer-only and out of the tab order: arrow keys already travel
          // the bar, and a screen reader reads every tab in the tablist.
          <button
            key={side}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            aria-label={t(side === 'before' ? 'common.scrollTabsBefore' : 'common.scrollTabsAfter')}
            onClick={() => pageScroll(side)}
            className={cx(tabChevronClassName, side === 'before' ? 'left-0.5' : 'right-0.5')}
          >
            {side === 'before' ? <Icon.Back size={14} /> : <Icon.Descend size={14} />}
          </button>
        ) : null
      )}
      <div ref={scrollerRef} className={tabScrollerClassName}>
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
                id={tabDomId(tabsId, tab.id)}
                data-tab-id={tab.id}
                aria-selected={active}
                // Only the selected tab has a rendered panel; elsewhere the id would dangle.
                aria-controls={active ? panelDomId(tabsId, tab.id) : undefined}
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
                {/* The space keeps the name "Members 12"; a flex item, it draws nothing. */}
                {tab.count !== undefined && ' '}
                {tab.count !== undefined && (
                  <span
                    className={cx(
                      'ml-1.5 inline-grid h-4.5 min-w-4.5 place-items-center rounded-full border px-1 text-[0.625rem] tracking-normal tabular-nums',
                      tab.countTone === 'danger' && 'border-danger text-danger',
                      tab.countTone === 'warning' && 'border-warning text-warning',
                      tab.countTone === undefined &&
                        (active ? 'border-accent-dim text-text' : 'border-line-bright')
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
