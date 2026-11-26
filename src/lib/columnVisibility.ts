import { useCallback, useMemo } from 'react';
import { useHydratedStore } from './useHydratedStore';
import { useIsPhone } from './useIsPhone';
import { createLocalSetting, type LocalSettingStore } from './useLocalSetting';

export interface ColumnVisibilityOptions<Id extends string> {
  key: string;
  ids: readonly Id[];
  defaultVisible?: readonly Id[];
  allowEmpty?: boolean;
  dropUnknown?: boolean;
  retired?: readonly string[];
}

export function createColumnVisibilitySetting<Id extends string>({
  key,
  ids,
  defaultVisible = ids,
  allowEmpty = false,
  dropUnknown = false,
  retired = [],
}: ColumnVisibilityOptions<Id>): LocalSettingStore<readonly Id[]> {
  const known = new Set<string>(ids);
  const isKnown = (id: unknown) => typeof id === 'string' && known.has(id);
  return createLocalSetting<readonly Id[]>({
    key,
    defaultValue: defaultVisible,
    parse: (raw) => {
      if (!Array.isArray(raw)) return null;
      const kept = raw.filter((id) => !retired.includes(id));
      const ok = dropUnknown ? kept.filter(isKnown) : kept;
      if (!dropUnknown && !ok.every(isKnown)) return null;
      return allowEmpty || ok.length > 0 ? (ok as Id[]) : null;
    },
  });
}

const NONE: readonly never[] = [];

export interface ColumnVisibility<Id extends string> {
  visible: readonly Id[];
  isVisible: (id: Id) => boolean;
  toggle: (id: Id) => void;
  reset: () => void;
}

export function useColumnVisibility<Id extends string>(
  store: LocalSettingStore<readonly Id[]>,
  defaultVisible: readonly Id[],
  phoneOffByDefault: readonly Id[] = NONE,
  compact = false
): ColumnVisibility<Id> {
  const stored = store((state) => state.value);
  const isPhone = useIsPhone() || compact;
  const phoneDefault = useMemo(
    () => defaultVisible.filter((id) => !phoneOffByDefault.includes(id)),
    [defaultVisible, phoneOffByDefault]
  );
  const resetTo = isPhone ? phoneDefault : defaultVisible;
  const visible = isPhone && stored === defaultVisible ? phoneDefault : stored;
  const setValue = store((state) => state.setValue);
  useHydratedStore(store);

  const isVisible = useCallback((id: Id) => visible.includes(id), [visible]);
  const toggle = useCallback(
    (id: Id) => {
      void setValue(
        visible.includes(id) ? visible.filter((existing) => existing !== id) : [...visible, id]
      );
    },
    [visible, setValue]
  );
  const reset = useCallback(() => {
    void setValue(resetTo);
  }, [resetTo, setValue]);

  return { visible, isVisible, toggle, reset };
}
