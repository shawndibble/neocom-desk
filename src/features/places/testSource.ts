import type { PlaceSource } from './types';

interface Entry {
  name?: string | null;
  systemId?: number | null;
}

/** An in-memory PlaceSource for tests, counting every read. */
export function memoryPlaceSource(data: {
  stations?: Record<number, Entry>;
  structures?: Record<string, Entry>; // `${characterId}:${structureId}`
  systems?: Record<number, { name?: string | null; security?: number | null }>;
}): PlaceSource & { calls: string[] } {
  const calls: string[] = [];
  const note = <T>(call: string, value: T): Promise<T> => {
    calls.push(call);
    return Promise.resolve(value);
  };
  return {
    calls,
    stationName: (id) => note(`stationName:${id}`, data.stations?.[id]?.name ?? null),
    stationSystemId: (id) => note(`stationSystemId:${id}`, data.stations?.[id]?.systemId ?? null),
    structureName: (c, id) =>
      note(`structureName:${c}:${id}`, data.structures?.[`${c}:${id}`]?.name ?? null),
    structureSystemId: (c, id) =>
      note(`structureSystemId:${c}:${id}`, data.structures?.[`${c}:${id}`]?.systemId ?? null),
    systemName: (id) => note(`systemName:${id}`, data.systems?.[id]?.name ?? null),
    systemSecurity: (id) => note(`systemSecurity:${id}`, data.systems?.[id]?.security ?? null),
  };
}
