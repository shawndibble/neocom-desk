import { create, type StoreApi, type UseBoundStore } from 'zustand';

export interface SettingState<T> {
  value: T;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setValue: (value: T) => Promise<void>;
}

export type SettingStore<T> = UseBoundStore<StoreApi<SettingState<T>>>;

export interface StoredRow {
  value: unknown;
}

export interface SettingStoreConfig<T> {
  defaultValue: T;
  coerce: (raw: unknown) => T;
  read: () => Promise<StoredRow | undefined>;
  write: (value: T) => Promise<void>;
  onApply?: (value: T) => void;
  subscribeExternal?: (reread: () => void) => void;
}

export function createSettingStore<T>(config: SettingStoreConfig<T>): SettingStore<T> {
  const { defaultValue, coerce, read, write, onApply, subscribeExternal } = config;

  return create<SettingState<T>>((set, get) => {
    let generation = 0;
    let subscribed = false;

    const apply = (value: T, forGeneration: number) => {
      if (forGeneration !== generation) return;
      generation += 1;
      onApply?.(value);
      set({ value, hydrated: true });
    };

    const reread = async () => {
      const forGeneration = generation;
      try {
        const row = await read();
        apply(row === undefined ? defaultValue : coerce(row.value), forGeneration);
      } catch {
        if (!get().hydrated) apply(defaultValue, forGeneration);
      }
    };

    return {
      value: defaultValue,
      hydrated: false,
      hydrate: async () => {
        if (!subscribed) {
          subscribed = true;
          subscribeExternal?.(() => void reread());
        }
        if (get().hydrated) return;
        await reread();
      },
      setValue: async (value) => {
        apply(value, generation);
        await write(value);
      },
    };
  });
}
