import { useCallback, useMemo } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { createLocalSetting } from '@/lib/useLocalSetting';

/**
 * "Stop showing {corp}" for a corporation the member has left: kept on this device so the Tax tab
 * stops listing its book. Nothing is deleted or settled; "Show" brings it back.
 */
export const useLeftCorpSetting = createLocalSetting<number[]>({
  key: 'corpLeftHidden',
  defaultValue: [],
  parse: (raw) =>
    Array.isArray(raw)
      ? raw.filter((x): x is number => Number.isInteger(x) && (x as number) > 0)
      : null,
});

/** The hidden set, and the two ways to change it; a failed write leaves the page as it was. */
export function useHiddenLeftCorps() {
  useHydratedStore(useLeftCorpSetting);
  const list = useLeftCorpSetting((s) => s.value);
  const hidden = useMemo<ReadonlySet<number>>(() => new Set(list), [list]);
  const change = (update: (held: Set<number>) => void) => {
    const held = new Set(useLeftCorpSetting.getState().value);
    update(held);
    void useLeftCorpSetting
      .getState()
      .setValue([...held])
      .catch(() => {});
  };
  const hide = useCallback((id: number) => change((held) => void held.add(id)), []);
  const show = useCallback((id: number) => change((held) => void held.delete(id)), []);
  return useMemo(() => ({ hidden, hide, show }), [hidden, hide, show]);
}
