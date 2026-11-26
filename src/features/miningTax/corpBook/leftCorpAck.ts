import { useCallback, useMemo } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { isId } from '@/engine/guards';

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

export function useHiddenLeftCorps() {
  useHydratedStore(useLeftCorpSetting);
  const list = useLeftCorpSetting((s) => s.value);
  const hidden = useMemo<ReadonlySet<number>>(() => new Set(list), [list]);
  const hide = useCallback((id: number) => changeLeftCorps((held) => void held.add(id)), []);
  const show = useCallback((id: number) => changeLeftCorps((held) => void held.delete(id)), []);
  return useMemo(() => ({ hidden, hide, show }), [hidden, hide, show]);
}
