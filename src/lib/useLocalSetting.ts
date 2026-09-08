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
 * Local only. A preference that should follow the pilot to their other devices
 * uses `createSyncedSetting` (`useSyncedSetting.ts`) instead — same store
 * shape, so a consumer cannot tell the two apart. The `sync.` prefix belongs
 * to that path and is rejected here outright.
 */
import { db } from '@/db';
import { createSettingStore, type SettingState, type SettingStore } from './settingStore';

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

/** The store shape, shared with `createSyncedSetting`. */
export type LocalSettingState<T> = SettingState<T>;
export type LocalSettingStore<T> = SettingStore<T>;

/**
 * The guard both factories apply to a stored value: the caller's `parse` where
 * they gave one, and a `typeof` match against the default otherwise.
 */
export function settingCoercer<T>(
  defaultValue: T,
  parse?: (raw: unknown) => T | null
): (raw: unknown) => T {
  return (raw) => {
    const parsed = parse ? parse(raw) : typeof raw === typeof defaultValue ? (raw as T) : null;
    return parsed ?? defaultValue;
  };
}

export function createLocalSetting<T>(options: LocalSettingOptions<T>): LocalSettingStore<T> {
  const { key, defaultValue, parse, onApply } = options;

  if (key.startsWith(SYNCED_PREFIX)) {
    throw new Error(
      `Local settings keys must not start with '${SYNCED_PREFIX}' — that prefix syncs (got '${key}')`
    );
  }

  return createSettingStore<T>({
    defaultValue,
    onApply,
    coerce: settingCoercer(defaultValue, parse),
    read: () => db.settings.get(key),
    write: async (value) => {
      await db.settings.put({ key, value });
    },
    // No `subscribeExternal`: nothing but this store writes the row, so the
    // value on screen is the value on disk.
  });
}
