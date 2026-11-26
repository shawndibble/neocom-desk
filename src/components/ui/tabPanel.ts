import { useCallback, useId, useRef, type HTMLAttributes } from 'react';
import { useFadeOnChange } from '@/lib/useFadeOnChange';
import { focusRingInsetClassName } from './controlStyles';

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
