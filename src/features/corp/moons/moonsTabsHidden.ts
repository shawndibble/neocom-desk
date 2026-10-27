import { useSyncExternalStore } from 'react';
import { tabPath } from '@/lib/pageTabs';
import { MOONS_TABS } from './moonsPaths';

/** Every Moons tab's path: what the nav and the page title leave out while no mode is chosen. */
export const MOONS_TAB_PATHS: readonly string[] = MOONS_TABS.tabs.map((tab) =>
  tabPath(MOONS_TABS, tab.id)
);

/**
 * Whether Moons' tabs are left out of the rail and the page title: true while the
 * corporation has no book mode chosen yet (each tab would open the same setup screen).
 * The Moons page sets it once it has read the book; until then the tabs show as before.
 */
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
