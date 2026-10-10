import { useId, type HTMLAttributes } from 'react';
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
 */
export function useTabPanelProps(
  tabsId: string,
  tabId: string
): Required<Pick<HTMLAttributes<HTMLElement>, 'role' | 'id' | 'tabIndex' | 'className'>> & {
  'aria-labelledby': string;
} {
  return {
    role: 'tabpanel',
    id: panelDomId(tabsId, tabId),
    'aria-labelledby': tabDomId(tabsId, tabId),
    tabIndex: 0,
    className: focusRingInsetClassName,
  };
}
