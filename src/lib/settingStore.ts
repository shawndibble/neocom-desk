/**
 * The state machine every preference store shares: a value, a `hydrated` flag,
 * and the generation counter that stops a slow read from landing on top of a
 * newer press.
 *
 * `createLocalSetting` (device-local, one plain Dexie key) and
 * `createSyncedSetting` (cross-device, one `sync.` key) differ only in where
 * the value is read from, what a write does besides putting a row, and whether
 * anything can change that row behind the store's back. Those are the three
 * knobs here, so the race handling — the part that is easy to get subtly wrong
 * and impossible to notice — exists once rather than twice.
 *
 * Not exported from anywhere else: components use one of the two factories.
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand';

export interface SettingState<T> {
  value: T;
  /** True once the read has settled — successfully or not. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /**
   * Applies the value first and persists it second, so subscribers see the
   * new choice in the same tick and a control repaints on the press. The
   * returned promise settles when the write does — await it only when you
   * need the row on disk, never to read the value back.
   */
  setValue: (value: T) => Promise<void>;
}

export type SettingStore<T> = UseBoundStore<StoreApi<SettingState<T>>>;

/** What a read found: the stored row, or nothing at all. */
export interface StoredRow {
  value: unknown;
}

export interface SettingStoreConfig<T> {
  defaultValue: T;
  /** Stored value to usable value. Never throws — falls back to the default. */
  coerce: (raw: unknown) => T;
  /**
   * Reads the stored row, or `undefined` when nothing is stored. A row rather
   * than a bare value, so "no row" stays distinguishable from "a row holding
   * `undefined`".
   */
  read: () => Promise<StoredRow | undefined>;
  /** Persists an applied value. */
  write: (value: T) => Promise<void>;
  /** Side effect on every applied value, hydration and external reads included. */
  onApply?: (value: T) => void;
  /**
   * Registered once, on the first `hydrate`, for a store whose row can change
   * behind its back — today that means a sync pull. The callback re-reads
   * through `read`, and is discarded if a local press lands while that read is
   * in flight, so an incoming value can never revert a choice made after it.
   *
   * Omitted for a store nothing else writes.
   */
  subscribeExternal?: (reread: () => void) => void;
}

export function createSettingStore<T>(config: SettingStoreConfig<T>): SettingStore<T> {
  const { defaultValue, coerce, read, write, onApply, subscribeExternal } = config;

  return create<SettingState<T>>((set, get) => {
    // Counts applied values, so a slow read landing after a set cannot
    // overwrite the newer choice with the row it saw before that set.
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
        // Private browsing, over quota, damaged store: a preference is not
        // worth stranding consumers that gate rendering on `hydrated`. Once a
        // value is on screen, though, a failed *re-read* leaves it there —
        // reverting a working preference to the default over a transient read
        // error would be worse than showing a value one cycle stale.
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
        // Applied now, persisted after. A preference is the user's own choice,
        // already made — nothing about it needs IndexedDB's blessing to be
        // shown, and waiting for one leaves the control looking dead for a
        // round-trip. It also closes the window this used to leave open: a
        // read settling between the click and the write would apply the
        // *stored* value on top of the newer choice, flicking the control back
        // before it flicked forward. Applying now takes the generation, so
        // that late read is discarded instead.
        //
        // The cost is that a write which then fails (private browsing, over
        // quota) leaves a choice that won't survive a reload. That is the
        // better half of the trade: the alternative is a control that ignores
        // the press, and `reread` already takes the same view of a broken
        // store.
        apply(value, generation);
        await write(value);
      },
    };
  });
}
