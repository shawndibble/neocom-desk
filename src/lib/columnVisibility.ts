/**
 * A table's device-local visible-columns preference, for `ColumnPickerMenu`.
 *
 * The shape `courierColumns.ts`, `bpcSearchColumns.ts` and friends each
 * hand-roll — an id catalog, a `createLocalSetting` store that rejects a stored
 * list naming an id the catalog no longer has, and toggle/reset wiring — so a
 * new picker is one call here plus one hook call in the component.
 *
 * Leave the table's identity column (item name, character name) out of `ids`:
 * a table that can lose the column naming its rows has lost its rows.
 */
import { useCallback, useEffect } from 'react';
import { createLocalSetting, type LocalSettingStore } from './useLocalSetting';

export interface ColumnVisibilityOptions<Id extends string> {
  /** Dexie `settings` key. */
  key: string;
  /** Every optional column, in table order. */
  ids: readonly Id[];
  /**
   * Shown until the pilot picks. Defaults to all of `ids`, so shipping a picker
   * on an existing table hides nothing on its own.
   */
  defaultVisible?: readonly Id[];
}

/** Call once per key at module scope, like `createLocalSetting`. */
export function createColumnVisibilitySetting<Id extends string>({
  key,
  ids,
  defaultVisible = ids,
}: ColumnVisibilityOptions<Id>): LocalSettingStore<readonly Id[]> {
  const known = new Set<string>(ids);
  return createLocalSetting<readonly Id[]>({
    key,
    defaultValue: defaultVisible,
    parse: (raw) =>
      Array.isArray(raw) &&
      raw.length > 0 &&
      raw.every((id) => typeof id === 'string' && known.has(id))
        ? (raw as Id[])
        : null,
  });
}

export interface ColumnVisibility<Id extends string> {
  visible: readonly Id[];
  isVisible: (id: Id) => boolean;
  toggle: (id: Id) => void;
  reset: () => void;
}

/**
 * Hydrates the store on mount and hands back what `ColumnPickerMenu` and the
 * table's column filter need. `defaultVisible` is what `reset` restores — the
 * same list given to `createColumnVisibilitySetting`.
 */
export function useColumnVisibility<Id extends string>(
  store: LocalSettingStore<readonly Id[]>,
  defaultVisible: readonly Id[]
): ColumnVisibility<Id> {
  const visible = store((state) => state.value);
  const setValue = store((state) => state.setValue);
  const hydrate = store((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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
    void setValue(defaultVisible);
  }, [defaultVisible, setValue]);

  return { visible, isVisible, toggle, reset };
}
