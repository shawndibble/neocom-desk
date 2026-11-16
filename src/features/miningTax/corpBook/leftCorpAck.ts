import { useCallback, useMemo } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { isId } from '@/engine/guards';

/**
 * "Stop showing {corp}" for a corporation the member has left: kept on this device so the Tax tab
 * stops listing its book. Nothing is deleted or settled; "Show" brings it back.
 */
export const useLeftCorpSetting = createLocalSetting<number[]>({
  key: 'corpLeftHidden',
  defaultValue: [],
  parse: (raw) => (Array.isArray(raw) ? raw.filter(isId) : null),
});

function changeLeftCorps(update: (held: Set<number>) => void) {
  const held = new Set(useLeftCorpSetting.getState().value);
  update(held);
  void useLeftCorpSetting
    .getState()
    .setValue([...held])
    .catch(() => {});
}

/** The hidden set, and the two ways to change it; a failed write leaves the page as it was. */
export function useHiddenLeftCorps() {
  useHydratedStore(useLeftCorpSetting);
  const list = useLeftCorpSetting((s) => s.value);
  const hidden = useMemo<ReadonlySet<number>>(() => new Set(list), [list]);
  const hide = useCallback((id: number) => changeLeftCorps((held) => void held.add(id)), []);
  const show = useCallback((id: number) => changeLeftCorps((held) => void held.delete(id)), []);
  return useMemo(() => ({ hidden, hide, show }), [hidden, hide, show]);
}
