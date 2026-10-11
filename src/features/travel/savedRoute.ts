/**
 * The route Route Safety last drew, kept on this device so the Overview's
 * Route safety widget has something to read without planning a trip itself.
 *
 * Route Safety keeps its start and Stops only in the link, so "the saved
 * route" is this snapshot: the start, the Stops in the order typed, and the
 * systems the drawn trip crosses, in flight order. Device-local on purpose:
 * it is what this device last looked at, not a preference.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const SAVED_ROUTE_KEY = 'travel.savedRoute';

export interface SavedRoute {
  fromId: number;
  stops: number[];
  /** Each system the trip crosses once, in flight order. */
  systems: number[];
}

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/** A stored route, or `null` when it is not a usable one (never a half-route). */
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

/** Whether two routes are the same one, so a redraw of an unchanged route writes nothing. */
export function sameSavedRoute(a: SavedRoute | null, b: SavedRoute | null): boolean {
  if (a === null || b === null) return a === b;
  const same = (x: readonly number[], y: readonly number[]) =>
    x.length === y.length && x.every((id, i) => id === y[i]);
  return a.fromId === b.fromId && same(a.stops, b.stops) && same(a.systems, b.systems);
}
