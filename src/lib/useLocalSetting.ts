/**
 * Factory for a **device-local** preference: a zustand store backed by one
 * Dexie `settings` key. Generalizes the shape `stores/activeCharacter.ts` and
 * `features/market/hub.ts` hand-roll — value + `hydrated` + `hydrate` + a
 * setter that persists.
 *
 * A store rather than a `useState`/`useEffect` hook for two reasons: two
 * components on the same key must see each other's writes, and a preference
 * that changes the document (a CSS custom property, say) needs one place to
 * apply that on hydration as well as on every set — `onApply`.
 *
 * **Call once per key, at module scope, and export the result.** Two calls
 * with the same key build two stores that then drift apart; the fix is to
 * import the first one, so this deliberately does not memoize and hand back a
 * store configured with somebody else's `parse` and `onApply`.
 *
 * Local only. Keys here are never Editable Data (CONTEXT.md); the `sync.`
 * prefix belongs to `setSyncedSetting` and is rejected outright.
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { db } from '@/db';

/** The `sync.` namespace — including `sync.__` internals — is planSync's. */
const SYNCED_PREFIX = 'sync.';

export interface LocalSettingOptions<T> {
  /** Dexie `settings` key. Must not start with `sync.`. */
  key: string;
  defaultValue: T;
  /**
   * Returns the stored value if usable, or null to fall back to `defaultValue`.
   * Without it the stored value is accepted only when its `typeof` matches the
   * default's — enough for the string/number/boolean preferences this exists
   * for, and the reason structured values need to supply one.
   */
  parse?: (raw: unknown) => T | null;
  /** Side effect on every applied value, hydration included. */
  onApply?: (value: T) => void;
}

export interface LocalSettingState<T> {
  value: T;
  /** True once the Dexie read has settled — successfully or not. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setValue: (value: T) => Promise<void>;
}

export type LocalSettingStore<T> = UseBoundStore<StoreApi<LocalSettingState<T>>>;

export function createLocalSetting<T>(options: LocalSettingOptions<T>): LocalSettingStore<T> {
  const { key, defaultValue, parse, onApply } = options;

  if (key.startsWith(SYNCED_PREFIX)) {
    throw new Error(
      `Local settings keys must not start with '${SYNCED_PREFIX}' — that prefix syncs (got '${key}')`
    );
  }

  function coerce(raw: unknown): T {
    const parsed = parse ? parse(raw) : typeof raw === typeof defaultValue ? (raw as T) : null;
    return parsed ?? defaultValue;
  }

  return create<LocalSettingState<T>>((set, get) => {
    // Counts applied values, so a slow hydrate landing after a set cannot
    // overwrite the newer value with the row it read before the write.
    let generation = 0;

    const apply = (value: T, forGeneration: number) => {
      if (forGeneration !== generation) return;
      generation += 1;
      onApply?.(value);
      set({ value, hydrated: true });
    };

    return {
      value: defaultValue,
      hydrated: false,
      hydrate: async () => {
        if (get().hydrated) return;
        const forGeneration = generation;
        try {
          const record = await db.settings.get(key);
          apply(record === undefined ? defaultValue : coerce(record.value), forGeneration);
        } catch {
          // Private browsing, over quota, damaged store: a preference is not
          // worth stranding consumers that gate rendering on `hydrated`.
          apply(defaultValue, forGeneration);
        }
      },
      setValue: async (value) => {
        await db.settings.put({ key, value });
        apply(value, generation);
      },
    };
  });
}
