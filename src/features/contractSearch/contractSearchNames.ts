import { idSetKey } from '@/lib/idSetKey';
import { useEffect, useMemo, useState } from 'react';
import { loadMarketRegions } from '@/sde/loadMarketSde';
import { loadMarketTypesById } from '@/sde/marketTypesById';
import { loadRegionName } from '@/features/bpcContracts/regionNames';
import { loadTypeNames } from '@/features/character/typeNames';
import type { CourierEndpoint, PublicCourierContractRow } from '@/engine/contracts/courierSearch';
import { loadCourierEndpoints } from './courierEndpoints';

const EMPTY_NAMES: ReadonlyMap<number, string> = new Map();
const EMPTY_IDS: readonly number[] = [];
const EMPTY_ENDPOINTS: ReadonlyMap<number, CourierEndpoint> = new Map();

function useResolved<TInput, TValue>(
  input: TInput,
  resolve: (input: TInput) => Promise<TValue>,
  fallback: TValue
): { value: TValue; resolving: boolean } {
  const [answer, setAnswer] = useState<{ input: TInput; value: TValue } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolve(input)
      .catch(() => fallback)
      .then((value) => {
        if (!cancelled) setAnswer({ input, value });
      });
    return () => {
      cancelled = true;
    };
  }, [input, resolve, fallback]);

  const resolving = answer === null || answer.input !== input;
  return { value: answer?.value ?? fallback, resolving };
}

export function useListedTypeNames(rows: readonly { typeId: number }[]): {
  value: ReadonlyMap<number, string>;
  resolving: boolean;
} {
  const catalog = useResolved(rows, resolveCatalogNames, EMPTY_NAMES);
  const missing = useMemo<readonly number[]>(() => {
    if (catalog.resolving) return EMPTY_IDS;
    const ids = new Set<number>();
    for (const { typeId } of rows) if (!catalog.value.has(typeId)) ids.add(typeId);
    return ids.size === 0 ? EMPTY_IDS : [...ids];
  }, [rows, catalog.value, catalog.resolving]);
  const fallback = useResolved(missing, resolveFallbackNames, EMPTY_NAMES);
  const value = useMemo(
    () =>
      fallback.value.size === 0 ? catalog.value : new Map([...fallback.value, ...catalog.value]),
    [catalog.value, fallback.value]
  );
  return { value, resolving: catalog.resolving };
}

async function resolveCatalogNames(
  rows: readonly { typeId: number }[]
): Promise<ReadonlyMap<number, string>> {
  if (rows.length === 0) return EMPTY_NAMES;
  const catalog = await loadMarketTypesById();
  const names = new Map<number, string>();
  for (const { typeId } of rows) {
    const entry = catalog.get(typeId);
    if (entry) names.set(typeId, entry.name);
  }
  return names;
}

async function resolveFallbackNames(
  typeIds: readonly number[]
): Promise<ReadonlyMap<number, string>> {
  if (typeIds.length === 0) return EMPTY_NAMES;
  const names = new Map<number, string>();
  for (const [typeId, name] of await loadTypeNames(typeIds)) {
    if (name !== `Type #${typeId}`) names.set(typeId, name);
  }
  return names;
}

export function useCourierEndpoints(rows: readonly PublicCourierContractRow[]): {
  value: ReadonlyMap<number, CourierEndpoint>;
  resolving: boolean;
} {
  return useResolved(rows, resolveEndpoints, EMPTY_ENDPOINTS);
}

async function resolveEndpoints(
  rows: readonly PublicCourierContractRow[]
): Promise<ReadonlyMap<number, CourierEndpoint>> {
  if (rows.length === 0) return EMPTY_ENDPOINTS;
  return loadCourierEndpoints(rows);
}

export function useRegionNames(regionIds: readonly number[]): {
  value: ReadonlyMap<number, string>;
  resolving: boolean;
} {
  const key = useMemo(() => idSetKey(regionIds), [regionIds]);
  const ids = useMemo(() => (key === '' ? [] : key.split(',').map(Number)), [key]);
  return useResolved(ids, resolveRegionNames, EMPTY_NAMES);
}

async function resolveRegionNames(
  regionIds: readonly number[]
): Promise<ReadonlyMap<number, string>> {
  if (regionIds.length === 0) return EMPTY_NAMES;
  const catalog = await loadMarketRegions();
  const local = new Map(catalog.map((entry) => [entry.id, entry.name]));

  const names = new Map<number, string>();
  const missing: number[] = [];
  for (const regionId of regionIds) {
    const name = local.get(regionId);
    if (name === undefined) missing.push(regionId);
    else names.set(regionId, name);
  }

  await Promise.all(
    missing.map(async (regionId) => {
      const name = await loadRegionName(regionId);
      if (name !== null) names.set(regionId, name);
    })
  );
  return names;
}
