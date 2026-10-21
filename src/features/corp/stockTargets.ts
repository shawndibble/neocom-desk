/**
 * Corp stock targets (issue #4671): the minimum quantity of an item type a
 * corporation should hold, set by a Director on the Corp assets page. One
 * synced setting for the whole account, `{corporationId: {typeId: quantity}}`
 * (see `sync.corpStockTargets` in `src/sync/syncedSettings.ts`).
 *
 * The edits are pure so they are testable without a store. `useCorpStockTargets`
 * binds them to one corporation for the page, the dialog and the widget.
 */
import { useCallback, useMemo } from 'react';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { useHydratedStore } from '@/lib/useHydratedStore';

export const CORP_STOCK_TARGETS_KEY = 'sync.corpStockTargets';

/** typeId (as a string key) → whole number of units to keep. */
export type TypeTargets = Record<string, number>;
/** corporationId (as a string key) → that corporation's targets. */
export type CorpStockTargets = Record<string, TypeTargets>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isTarget = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

/**
 * Runs on every value read back, including one another device wrote. Drops a
 * target that is not a whole number above zero (and a type id that is not a
 * number), but keeps every corporation id, even one with no targets left of
 * its own that this build cannot judge: a newer build may know more than this one.
 */
export function parseCorpStockTargets(raw: unknown): CorpStockTargets | null {
  if (!isRecord(raw)) return null;
  const out: CorpStockTargets = {};
  for (const [corporationId, targets] of Object.entries(raw)) {
    if (!isRecord(targets)) continue;
    const kept: TypeTargets = {};
    for (const [typeId, target] of Object.entries(targets)) {
      if (Number.isInteger(Number(typeId)) && isTarget(target)) kept[typeId] = target;
    }
    out[corporationId] = kept;
  }
  return out;
}

export const useCorpStockTargetsStore = createSyncedSetting<CorpStockTargets>({
  key: CORP_STOCK_TARGETS_KEY,
  defaultValue: {},
  parse: parseCorpStockTargets,
});

/** One corporation's targets as a map; empty for a corporation with none. */
export function targetsForCorp(
  all: CorpStockTargets,
  corporationId: number
): ReadonlyMap<number, number> {
  const map = new Map<number, number>();
  for (const [typeId, target] of Object.entries(all[String(corporationId)] ?? {})) {
    map.set(Number(typeId), target);
  }
  return map;
}

/**
 * Sets one type's target, rounding down. A target below 1 removes it, so
 * "empty" and "0" both mean no target. Other corporations are untouched.
 */
export function withTarget(
  all: CorpStockTargets,
  corporationId: number,
  typeId: number,
  target: number
): CorpStockTargets {
  const whole = Math.floor(target);
  if (!Number.isFinite(whole) || whole < 1) return withoutTarget(all, corporationId, typeId);
  const key = String(corporationId);
  return { ...all, [key]: { ...all[key], [String(typeId)]: whole } };
}

export function withoutTarget(
  all: CorpStockTargets,
  corporationId: number,
  typeId: number
): CorpStockTargets {
  const key = String(corporationId);
  const current = all[key];
  if (!current || !(String(typeId) in current)) return all;
  const rest = { ...current };
  delete rest[String(typeId)];
  return { ...all, [key]: rest };
}

export interface CorpStockTargetsApi {
  /** False until the stored value has loaded; a write before then would overwrite it. */
  hydrated: boolean;
  /** typeId → target. */
  targets: ReadonlyMap<number, number>;
  /** Sets a target (a value below 1 removes it). */
  setTarget: (typeId: number, target: number) => void;
  removeTarget: (typeId: number) => void;
}

export function useCorpStockTargets(corporationId: number | null): CorpStockTargetsApi {
  const hydrated = useHydratedStore(useCorpStockTargetsStore);
  const all = useCorpStockTargetsStore((state) => state.value);
  const setValue = useCorpStockTargetsStore((state) => state.setValue);

  const targets = useMemo(
    () => (corporationId === null ? new Map<number, number>() : targetsForCorp(all, corporationId)),
    [all, corporationId]
  );
  // Read the store at call time, so two quick edits compose rather than the
  // second overwriting the first from a stale render.
  const setTarget = useCallback(
    (typeId: number, target: number) => {
      if (corporationId === null || !hydrated) return;
      const current = useCorpStockTargetsStore.getState().value;
      void setValue(withTarget(current, corporationId, typeId, target));
    },
    [corporationId, hydrated, setValue]
  );
  const removeTarget = useCallback(
    (typeId: number) => {
      if (corporationId === null || !hydrated) return;
      const current = useCorpStockTargetsStore.getState().value;
      void setValue(withoutTarget(current, corporationId, typeId));
    },
    [corporationId, hydrated, setValue]
  );
  return { hydrated, targets, setTarget, removeTarget };
}
