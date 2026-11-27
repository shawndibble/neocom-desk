import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import * as Icon from './icons';
import { panelDomId, tabDomId, useTabPanelProps } from './tabPanel';
import { revealInScroller, scrollEdges, wheelScrollDelta } from './tabScroll';
import { useScrollEdges } from './useScrollEdges';
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
  count?: number;
  countTone?: 'warning' | 'danger';
}

interface TabPanelProps {
  tabsId: string;
  tabId: string;
  className?: string;
  children: ReactNode;
}

/**
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
  activation?: 'automatic' | 'manual';
  onPreload?: (id: string) => void;
}

/**
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
  onPreload,
}: TabsProps) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [manualFocusId, setManualFocusId] = useState(value);
  const focusedId = activation === 'manual' ? manualFocusId : value;
  const { edges, pageScroll } = useScrollEdges(scrollerRef, listRef);

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

  useEffect(() => {
    const scroller = scrollerRef.current;
    const tab = listRef.current?.querySelector(`[data-tab-id="${focusedId}"]`);
    if (!scroller || !tab) return;
    revealInScroller(scroller, tab);
  }, [focusedId]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const { key } = event;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === focusedId);
    const next =
      key === 'Home'
        ? tabs[0]
        : key === 'End'
          ? tabs[tabs.length - 1]
          : tabs[(index + (key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    if (activation === 'manual') {
      setManualFocusId(next.id);
    } else {
      onChange(next.id);
    }
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus();
  }

  return (
    <div className={cx('relative', className)}>
      {(['before', 'after'] as const).map((side) =>
        edges[side] ? (
          <button
            key={side}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            aria-label={t(side === 'before' ? 'common.scrollTabsBefore' : 'common.scrollTabsAfter')}
            onClick={() => pageScroll(side)}
            className={cx(tabChevronClassName, side === 'before' ? 'left-0.5' : 'right-0.5')}
          >
            {side === 'before' ? (
              <Icon.Back className="size-3.5" />
            ) : (
              <Icon.Descend className="size-3.5" />
            )}
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
                aria-controls={active ? panelDomId(tabsId, tab.id) : undefined}
                tabIndex={tab.id === focusedId ? 0 : -1}
                onClick={() => {
                  if (activation === 'manual') setManualFocusId(tab.id);
                  onChange(tab.id);
                }}
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'touch') onPreload?.(tab.id);
                }}
                onFocus={() => onPreload?.(tab.id)}
                className={cx(
                  tabItemClassName,
                  active ? tabItemActiveClassName : tabItemIdleClassName
                )}
              >
                {tab.label}
                {tab.count !== undefined && ' '}
                {tab.count !== undefined && (
                  <span
                    className={cx(
                      'ml-1.5 inline-grid h-4.5 min-w-4.5 place-items-center rounded-full border px-1 text-[0.6875rem] tracking-normal tabular-nums',
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
