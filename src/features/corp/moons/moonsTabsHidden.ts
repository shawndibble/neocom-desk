import { useSyncExternalStore } from 'react';
import { tabPath } from '@/lib/pageTabs';
import { MOONS_TABS } from './moonsPaths';

export const MOONS_TAB_PATHS: readonly string[] = MOONS_TABS.tabs.map((tab) =>
  tabPath(MOONS_TABS, tab.id)
);

let hidden = false;
const listeners = new Set<() => void>();

export function setMoonsTabsHidden(next: boolean): void {
  if (hidden === next) return;
  hidden = next;
  for (const listener of listeners) listener();
}

export function useMoonsTabsHidden(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => hidden,
    () => false
  );
}
