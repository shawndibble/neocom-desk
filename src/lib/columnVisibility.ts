/**
 * A table's device-local visible-columns preference, for `ColumnPickerMenu`.
 *
 * An id catalog, a `createLocalSetting` store that rejects a stored list naming
 * an id the catalog no longer has (or an empty one), and toggle/reset wiring —
 * so a new picker is one call here plus one hook call in the component.
 *
 * Leave the table's identity column (item name, character name) out of `ids`:
 * a table that can lose the column naming its rows has lost its rows.
 */
import { useCallback, useMemo } from 'react';
import { useHydratedStore } from './useHydratedStore';
import { useIsPhone } from './useIsPhone';
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
  /** Honour a stored empty list. Default: reject it — a table with no optional columns and no explanation. */
  allowEmpty?: boolean;
  /** Drop unknown ids from a stored list instead of rejecting the whole list. */
  dropUnknown?: boolean;
  /**
   * Ids retired from the catalog: dropped from a stored list rather than
   * rejecting it, while any other unknown id still does.
   */
  retired?: readonly string[];
}

/** Call once per key at module scope, like `createLocalSetting`. */
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

/** Stable default, so an omitted argument doesn't re-run the memo every render. */
const NONE: readonly never[] = [];

export interface ColumnVisibility<Id extends string> {
  visible: readonly Id[];
  isVisible: (id: Id) => boolean;
  toggle: (id: Id) => void;
  reset: () => void;
}

/**
 * Hydrates the store on mount and hands back what `ColumnPickerMenu` and the
 * table's column filter need. `defaultVisible` is what `reset` restores — the
 * same list given to `createColumnVisibilitySetting` (the same array: "nothing
 * stored yet" is recognised by the store still holding that reference).
 *
 * `phoneOffByDefault` names columns that start unticked on a phone with no
 * stored selection — the compact default a wide table used to get from
 * `phoneHidden`. They are only a default: ticking one shows it, and a stored
 * selection is read exactly as saved at every width.
 */
export function useColumnVisibility<Id extends string>(
  store: LocalSettingStore<readonly Id[]>,
  defaultVisible: readonly Id[],
  phoneOffByDefault: readonly Id[] = NONE
): ColumnVisibility<Id> {
  const stored = store((state) => state.value);
  const isPhone = useIsPhone();
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
