import { createLocalSetting } from '@/lib/useLocalSetting';

export const SAVED_ROUTE_KEY = 'travel.savedRoute';

export interface SavedRoute {
  fromId: number;
  stops: number[];
  systems: number[];
}

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export function parseSavedRoute(raw: unknown): SavedRoute | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { fromId, stops, systems } = raw as Record<string, unknown>;
  if (!isId(fromId) || !Array.isArray(stops) || !Array.isArray(systems)) return null;
  if (!stops.every(isId) || !systems.every(isId) || stops.length === 0 || systems.length === 0) {
    return null;
  }
  return { fromId, stops, systems };
}

export const useSavedRoute = createLocalSetting<SavedRoute | null>({
  key: SAVED_ROUTE_KEY,
  defaultValue: null,
  parse: parseSavedRoute,
});

export function sameSavedRoute(a: SavedRoute | null, b: SavedRoute | null): boolean {
  if (a === null || b === null) return a === b;
  const same = (x: readonly number[], y: readonly number[]) =>
    x.length === y.length && x.every((id, i) => id === y[i]);
  return a.fromId === b.fromId && same(a.stops, b.stops) && same(a.systems, b.systems);
}
