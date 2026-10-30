import { useCallback, useId, useRef, type HTMLAttributes } from 'react';
import { useFadeOnChange } from '@/lib/useFadeOnChange';
import { focusRingInsetClassName } from './controlStyles';

/**
 * A fresh id base for one tab bar and its panel. Pass it to both `Tabs` and
 * `TabPanel` (or `useTabPanelProps`) so the tab's `aria-controls` and the
 * panel's `id` meet.
 */
export function useTabsId(): string {
  return useId().replace(/[^A-Za-z0-9_-]/g, '');
}

const safe = (id: string) => id.replace(/\s+/g, '_');
export const tabDomId = (tabsId: string, tabId: string) => `${tabsId}-tab-${safe(tabId)}`;
export const panelDomId = (tabsId: string, tabId: string) => `${tabsId}-panel-${safe(tabId)}`;

/**
 * Attributes that make an existing content container the tab's panel. Use it
 * where a wrapper `<div>` would disturb the parent's flex/grid layout.
 *
 * The `ref` fades the panel's content in on a tab switch (DESIGN.md §6b), so
 * spread every prop: the tab bar above it stays put.
 */
export function useTabPanelProps(
  tabsId: string,
  tabId: string
): Required<Pick<HTMLAttributes<HTMLElement>, 'role' | 'id' | 'tabIndex' | 'className'>> & {
  'aria-labelledby': string;
  ref: (node: HTMLElement | null) => void;
} {
  const panel = useRef<HTMLElement | null>(null);
  // Not on mount: the panel arrives with its page, which fades in already.
  useFadeOnChange(panel, tabId, { onFirstRender: false });
  const ref = useCallback((node: HTMLElement | null) => {
    panel.current = node;
  }, []);
  return {
    ref,
    role: 'tabpanel',
    id: panelDomId(tabsId, tabId),
    'aria-labelledby': tabDomId(tabsId, tabId),
    tabIndex: 0,
    className: focusRingInsetClassName,
  };
}
