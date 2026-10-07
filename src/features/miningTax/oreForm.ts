/**
 * "Ore Form" setting (decision 20261006-185915): value and name mined ore,
 * moon ore and ice as their Compressed type (default) or the raw one. Synced,
 * like `oreValueMode.ts`: it is how the pilot sells, not a per-device choice.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { loadTypeNames } from '@/features/character/typeNames';
import { oreFormTypeId } from '@/engine/miningTax/oreForm';
import { loadCompressedOreTypeIds } from '@/sde/loadSde';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const MINING_TAX_COMPRESSED_ORE_KEY = 'sync.miningTaxCompressedOre';

/** `true` = Compressed. */
export const useMiningTaxCompressedOre = createSyncedSetting<boolean>({
  key: MINING_TAX_COMPRESSED_ORE_KEY,
  defaultValue: true,
});

/**
 * The current value, synchronously: for code that runs inside a Dexie
 * transaction (a ledger action), where awaiting a hydrate read would let the
 * transaction close. The Tax and Overview loaders hydrate first
 * (`readCompressedOre`), so by the time anything acts it holds the stored value.
 */
export function currentCompressedOre(): boolean {
  return useMiningTaxCompressedOre.getState().value;
}

/** The current value outside React, hydrating first so a loader never reads the pre-hydrate default. */
export async function readCompressedOre(): Promise<boolean> {
  const store = useMiningTaxCompressedOre.getState();
  if (!store.hydrated) await store.hydrate();
  return useMiningTaxCompressedOre.getState().value;
}

/**
 * Names for raw ore type ids, keyed by those same raw ids but reading as the
 * Compressed type's name when `compressed`, so every `typeNames.get(rawId)`
 * already in the Tax and Overview views follows the setting unchanged.
 */
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
        // No SDE map: icons keep the raw type, which is only a lookalike.
        mapRequested = false;
      });
  }
  return () => {
    mapListeners.delete(listener);
  };
}

/** Maps a raw ore id to the type it shows as (icon, market link), following the setting. Identity until the SDE map loads. */
export function useOreFormTypeId(): (rawTypeId: number) => number {
  const compressed = useMiningTaxCompressedOre((state) => state.value);
  const map = useSyncExternalStore(subscribeMap, () => compressedMap);
  return useCallback((rawTypeId) => oreFormTypeId(rawTypeId, map, compressed), [map, compressed]);
}

/** Sets or clears `rawOrePriced` for a value priced under `compressed`. */
export function withOreFormMarker<T extends { rawOrePriced?: boolean }>(
  record: T,
  compressed: boolean
): T {
  const next = { ...record };
  if (compressed) delete next.rawOrePriced;
  else next.rawOrePriced = true;
  return next;
}

/**
 * Reloads a view when the setting flips while it is open (the Tax tab's
 * settings modal). A view mounted after the flip loads fresh anyway.
 */
export function useRefreshOnOreFormChange(refresh: () => void): void {
  const compressed = useMiningTaxCompressedOre((state) => state.value);
  const last = useRef(compressed);
  useEffect(() => {
    if (last.current === compressed) return;
    last.current = compressed;
    refresh();
  }, [compressed, refresh]);
}
