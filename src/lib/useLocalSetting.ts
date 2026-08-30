/**
 * Factory for a **device-local** preference: a zustand store backed by one
 * Dexie `settings` key. Generalizes the shape `stores/activeCharacter.ts` and
 * `features/market/hub.ts` already hand-roll — value + `hydrated` + `hydrate` +
 * a setter that persists.
 *
 * A store rather than a `useState`/`useEffect` hook for two reasons: two
 * components on the same key must see each other's writes, and a preference
 * that changes the document (a CSS custom property, say) needs one place to
 * apply that on hydration as well as on every set — `onApply`.
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
  /** True once the Dexie setting has been read (or written) at least once. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setValue: (value: T) => Promise<void>;
}

export type LocalSettingStore<T> = UseBoundStore<StoreApi<LocalSettingState<T>>>;

// One store per key, for the life of the module: two consumers of the same
// preference must share state, or one would never see the other's write.
const stores = new Map<string, unknown>();

export function createLocalSetting<T>(options: LocalSettingOptions<T>): LocalSettingStore<T> {
  const { key, defaultValue, parse, onApply } = options;

  if (key.startsWith(SYNCED_PREFIX)) {
    throw new Error(
      `Local settings keys must not start with '${SYNCED_PREFIX}' — that prefix syncs (got '${key}')`
    );
  }

  const cached = stores.get(key);
  // First caller wins: later options for the same key are ignored, which is
  // what makes the store shared rather than silently forked.
  if (cached) return cached as LocalSettingStore<T>;

  function coerce(raw: unknown): T {
    const parsed = parse ? parse(raw) : typeof raw === typeof defaultValue ? (raw as T) : null;
    return parsed === null ? defaultValue : parsed;
  }

  const store = create<LocalSettingState<T>>((set) => {
    // onApply before the state write, so anything it touches on the document is
    // already correct by the time subscribers re-render.
    const apply = (value: T) => {
      onApply?.(value);
      set({ value, hydrated: true });
    };

    return {
      value: defaultValue,
      hydrated: false,
      hydrate: async () => {
        const record = await db.settings.get(key);
        apply(record === undefined ? defaultValue : coerce(record.value));
      },
      setValue: async (value) => {
        await db.settings.put({ key, value });
        apply(value);
      },
    };
  });

  stores.set(key, store);
  return store;
}
