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

type PanelRef = { ref: (node: HTMLElement | null) => void };
type PanelProps = Required<
  Pick<HTMLAttributes<HTMLElement>, 'role' | 'id' | 'tabIndex' | 'className'>
> & { 'aria-labelledby': string } & PanelRef;

/**
 * Attributes that make an existing content container the tab's panel. Use it
 * where a wrapper `<div>` would disturb the parent's flex/grid layout.
 *
 * Spread every prop: the `ref` fades and rises the panel in on a tab switch
 * (DESIGN.md §6b). A `null` `tabsId` (no bar showing: one view, or a phone's
 * stand-in control) keeps the motion but drops the tabpanel role, which would
 * name a tab that is not there.
 */
export function useTabPanelProps(tabsId: string, tabId: string): PanelProps;
export function useTabPanelProps(
  tabsId: string | null,
  tabId: string
): PanelProps | (PanelRef & { className: string });
export function useTabPanelProps(
  tabsId: string | null,
  tabId: string
): PanelProps | (PanelRef & { className: string }) {
  const panel = useRef<HTMLElement | null>(null);
  // On mount too: a page that renders each tab as its own component mounts a
  // fresh panel per switch.
  useFadeOnChange(panel, tabId, { rise: true });
  const ref = useCallback((node: HTMLElement | null) => {
    panel.current = node;
  }, []);
  if (tabsId === null) return { ref, className: '' };
  return {
    ref,
    role: 'tabpanel',
    id: panelDomId(tabsId, tabId),
    'aria-labelledby': tabDomId(tabsId, tabId),
    tabIndex: 0,
    className: focusRingInsetClassName,
  };
}
