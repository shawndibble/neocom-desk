import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { loadTypeNames } from '@/features/character/typeNames';
import { oreFormTypeId } from '@/engine/miningTax/oreForm';
import { loadCompressedOreTypeIds } from '@/sde/loadSde';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const MINING_TAX_COMPRESSED_ORE_KEY = 'sync.miningTaxCompressedOre';

export const useMiningTaxCompressedOre = createSyncedSetting<boolean>({
  key: MINING_TAX_COMPRESSED_ORE_KEY,
  defaultValue: true,
});

export function currentCompressedOre(): boolean {
  return useMiningTaxCompressedOre.getState().value;
}

export async function readCompressedOre(): Promise<boolean> {
  const store = useMiningTaxCompressedOre.getState();
  if (!store.hydrated) await store.hydrate();
  return useMiningTaxCompressedOre.getState().value;
}

export async function loadOreFormNames(
  rawTypeIds: readonly number[],
  compressed: boolean
): Promise<Map<number, string>> {
  if (!compressed) return loadTypeNames(rawTypeIds);
  const compressedByRaw = await loadCompressedOreTypeIds();
  const shown = new Map(rawTypeIds.map((id) => [id, oreFormTypeId(id, compressedByRaw, true)]));
  const names = await loadTypeNames([...new Set(shown.values())]);
  const out = new Map<number, string>();
  for (const [raw, display] of shown) {
    const name = names.get(display);
    if (name !== undefined) out.set(raw, name);
  }
  return out;
}

let compressedMap: Record<string, number> = {};
let mapRequested = false;
const mapListeners = new Set<() => void>();

function subscribeMap(listener: () => void): () => void {
  mapListeners.add(listener);
  if (!mapRequested) {
    mapRequested = true;
    loadCompressedOreTypeIds()
      .then((map) => {
        compressedMap = map;
        mapListeners.forEach((notify) => notify());
      })
      .catch(() => {
        mapRequested = false;
      });
  }
  return () => {
    mapListeners.delete(listener);
  };
}

export function useOreFormTypeId(): (rawTypeId: number) => number {
  const compressed = useMiningTaxCompressedOre((state) => state.value);
  const map = useSyncExternalStore(subscribeMap, () => compressedMap);
  return useCallback((rawTypeId) => oreFormTypeId(rawTypeId, map, compressed), [map, compressed]);
}

export function withOreFormMarker<T extends { rawOrePriced?: boolean }>(
  record: T,
  compressed: boolean
): T {
  const next = { ...record };
  if (compressed) delete next.rawOrePriced;
  else next.rawOrePriced = true;
  return next;
}

export function useRefreshOnOreFormChange(refresh: () => void): void {
  const compressed = useMiningTaxCompressedOre((state) => state.value);
  const last = useRef(compressed);
  useEffect(() => {
    if (last.current === compressed) return;
    last.current = compressed;
    refresh();
  }, [compressed, refresh]);
}
