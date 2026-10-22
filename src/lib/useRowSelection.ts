import { useState } from 'react';

/**
 * Bulk-selection state for a list (DESIGN.md §6c "Bulk selection"). Ticks belong
 * to the context they were made in: `contextKey` names it (the Character, the
 * list, the filters), and a different key drops them. `visibleKeys` bounds
 * Select all, and a tick on a row that is no longer visible stops counting.
 */
export function useRowSelection<K>(contextKey: string, visibleKeys: readonly K[]) {
  const [state, setState] = useState<{ contextKey: string; keys: ReadonlySet<K> }>({
    contextKey,
    keys: new Set(),
  });
  // Tagged with its context so a change drops the ticks, even if the context later comes back.
  if (state.contextKey !== contextKey) setState({ contextKey, keys: new Set() });
  const visible = new Set(visibleKeys);
  const current = state.contextKey === contextKey ? state.keys : new Set<K>();
  const selected: ReadonlySet<K> = new Set([...current].filter((key) => visible.has(key)));

  return {
    selected,
    toggle(key: K) {
      const next = new Set(selected);
      if (!next.delete(key)) next.add(key);
      setState({ contextKey, keys: next });
    },
    selectAll() {
      setState({ contextKey, keys: new Set(visibleKeys) });
    },
    clear() {
      setState({ contextKey, keys: new Set() });
    },
  };
}
