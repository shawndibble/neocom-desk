import { useCallback, useMemo } from 'react';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { isPlainRecord } from '@/engine/guards';

export const CORP_STOCK_TARGETS_KEY = 'sync.corpStockTargets';

export type TypeTargets = Record<string, number>;
export type CorpStockTargets = Record<string, TypeTargets>;

const isTarget = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

export function parseCorpStockTargets(raw: unknown): CorpStockTargets | null {
  if (!isPlainRecord(raw)) return null;
  const out: CorpStockTargets = {};
  for (const [corporationId, targets] of Object.entries(raw)) {
    if (!isPlainRecord(targets)) continue;
    const kept: TypeTargets = {};
    for (const [typeId, target] of Object.entries(targets)) {
      if (/^[1-9]\d*$/.test(typeId) && isTarget(target)) kept[typeId] = target;
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
  hydrated: boolean;
  targets: ReadonlyMap<number, number>;
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
