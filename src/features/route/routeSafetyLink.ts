/**
 * Route Safety's link: the URL parameters the page reads, and the Use in route
 * pin a Thera / Turnur row writes into it (issue #2477).
 *
 * Leg pins (`pin`): one token per Leg in flying order, comma-separated, an
 * empty token for a leg flown as the planner picks — `gates`, `thera`,
 * `turnur`, `ansiblex`, or an EVE-Scout hole id (`engine/route/legWays.ts`). A token the
 * page cannot read is dropped to "not pinned", never a broken page; a hole id
 * that has since closed is the page's to report.
 */
import { TRAVEL_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { parseLegPin } from '@/engine/route/legWays';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { WORMHOLE_SHIP_SIZES } from '@/engine/route/theraConnections';
import {
  MAX_ROUTE_HOLE_MIN_LIFE,
  MIN_ROUTE_HOLE_MIN_LIFE,
  ROUTE_HOLE_HUBS,
} from '@/features/route/routeHoleSettings';
import { ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import {
  boolParam,
  optionalBoolParam,
  optionalEnumParam,
  optionalIdParam,
  optionalIntParam,
  type UrlParamCodec,
} from '@/lib/urlState';
import { MAX_STOPS } from '@/engine/route/tripPlan';
import { parseStopRefs, serializeStopRefs, type StopRef } from '@/engine/route/stopRef';

/** Every leg's pin token, `''` where the leg is not pinned. */
export type LegPinTokens = readonly string[];

/** A trip has at most one leg per stop, plus the way home. */
const MAX_LEGS = MAX_STOPS + 1;

export function legPinsParam(): UrlParamCodec<LegPinTokens> {
  return {
    parse: (raw) => {
      if (raw === null || raw === '') return [];
      return raw
        .split(',')
        .slice(0, MAX_LEGS)
        .map((token) => (parseLegPin(token) === null ? '' : token));
    },
    serialize: (value) => {
      const tokens = [...value];
      while (tokens.length > 0 && tokens[tokens.length - 1] === '') tokens.pop();
      return tokens.length === 0 ? null : tokens.join(',');
    },
  };
}

/** The `stops` link parameter: a system id per stop, each optionally tagged `:station` (issue #4964). */
export function stopRefsParam(): UrlParamCodec<readonly StopRef[]> {
  return { parse: parseStopRefs, serialize: (value) => serializeStopRefs(value) };
}

export const ROUTE_PARAMS = {
  from: optionalIdParam(),
  // The stops in the order typed. `to` is the single-stop link from before
  // stops, still read so an old link opens; nothing writes it any more.
  stops: stopRefsParam(),
  to: optionalIdParam(),
  opt: boolParam(),
  ret: boolParam(),
  keep: boolParam(),
  // Absent means the pilot's Travel default (Settings → Travel).
  pref: optionalEnumParam(ROUTE_PREFERENCES),
  // Route Safety's wormhole settings; absent means the page's saved default.
  wh: optionalBoolParam(),
  whsize: optionalEnumParam(WORMHOLE_SHIP_SIZES),
  whlife: optionalIntParam({ min: MIN_ROUTE_HOLE_MIN_LIFE, max: MAX_ROUTE_HOLE_MIN_LIFE }),
  whhub: optionalEnumParam(ROUTE_HOLE_HUBS),
  // Use jump bridges (issue #2478); absent means the page's saved default.
  jb: optionalBoolParam(),
  pin: legPinsParam(),
};

/**
 * The leg pins with the first leg pinned to one hole: what Use in route on a
 * Thera / Turnur modal row writes. Later legs keep their pins.
 */
export function pinFirstLeg(pins: LegPinTokens, holeId: string): string[] {
  const next = [...pins];
  next[0] = holeId;
  return next;
}

/**
 * Route Safety to one system: what "View route" opens. With no `fromId` the
 * page starts from the Character's current system on its own; a `stationId`
 * labels the stop with the station the pilot named there; a courier
 * contract passes its pickup system, since that is where its jumps begin. A
 * page with its own route picker (Assets, Courier) passes the `preference` it
 * counted under, so the route opens the way the number was worked out.
 */
export function routeToHref(
  systemId: number,
  fromId?: number | null,
  preference?: RoutePreferenceKind | null,
  stationId?: number | null
): string {
  const params = new URLSearchParams();
  if (fromId != null) params.set('from', String(fromId));
  if (preference != null) params.set('pref', ROUTE_PARAMS.pref.serialize(preference) ?? '');
  params.set(
    'stops',
    ROUTE_PARAMS.stops.serialize([{ systemId, stationId: stationId ?? null }]) ?? ''
  );
  return `${tabPath(TRAVEL_TABS, 'route')}?${params.toString()}`;
}

/** Route Safety from `fromId` through `stops` in order: the saved route the Overview widget links back to. */
export function routeStopsHref(
  fromId: number | null,
  stops: readonly (number | StopRef)[],
  preference?: RoutePreferenceKind | null
): string {
  const params = new URLSearchParams();
  if (fromId !== null) params.set('from', String(fromId));
  if (preference != null) params.set('pref', ROUTE_PARAMS.pref.serialize(preference) ?? '');
  const serialized = ROUTE_PARAMS.stops.serialize(
    stops.map((stop) => (typeof stop === 'number' ? { systemId: stop, stationId: null } : stop))
  );
  if (serialized !== null) params.set('stops', serialized);
  const query = params.toString();
  return query === '' ? tabPath(TRAVEL_TABS, 'route') : `${tabPath(TRAVEL_TABS, 'route')}?${query}`;
}
