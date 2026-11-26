import { useState } from 'react';

export function useRowSelection<K>(contextKey: string, visibleKeys: readonly K[]) {
  const [state, setState] = useState<{ contextKey: string; keys: ReadonlySet<K> }>({
    contextKey,
    keys: new Set(),
  });
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
