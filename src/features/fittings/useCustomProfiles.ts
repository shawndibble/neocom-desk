import { useCallback, useMemo } from 'react';
import type { LocalSettingStore } from '@/lib/useLocalSetting';
import { useHydratedStore } from '@/lib/useHydratedStore';

export interface CustomProfilesConfig<C extends { id: string }, N> {
  useCustom: LocalSettingStore<C[]>;
  useSelectedId: LocalSettingStore<string>;
  defaultId: string;
  resolve: (selectedId: string, custom: C[]) => N;
}

export interface CustomProfiles<C, N> {
  hydrated: boolean;
  custom: C[];
  selected: N;
  select: (id: string) => void;
  saveCustom: (profile: C) => void;
  deleteCustom: (id: string) => void;
}

export function useCustomProfiles<C extends { id: string }, N>({
  useCustom,
  useSelectedId,
  defaultId,
  resolve,
}: CustomProfilesConfig<C, N>): CustomProfiles<C, N> {
  const custom = useCustom((s) => s.value);
  const setCustom = useCustom((s) => s.setValue);
  const selectedId = useSelectedId((s) => s.value);
  const select = useSelectedId((s) => s.setValue);

  const hydrated = useHydratedStore(useCustom, useSelectedId);

  const selected = useMemo(() => resolve(selectedId, custom), [resolve, selectedId, custom]);

  const saveCustom = useCallback(
    (profile: C) => {
      const current = useCustom.getState().value;
      const exists = current.some((p) => p.id === profile.id);
      void setCustom(
        exists ? current.map((p) => (p.id === profile.id ? profile : p)) : [...current, profile]
      );
    },
    [useCustom, setCustom]
  );

  const deleteCustom = useCallback(
    (id: string) => {
      void setCustom(useCustom.getState().value.filter((p) => p.id !== id));
      if (useSelectedId.getState().value === id) void select(defaultId);
    },
    [useCustom, useSelectedId, setCustom, select, defaultId]
  );

  return {
    hydrated,
    custom,
    selected,
    select: (id) => void select(id),
    saveCustom,
    deleteCustom,
  };
}
