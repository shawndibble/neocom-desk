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

export type LegPinTokens = readonly string[];

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

export function stopRefsParam(): UrlParamCodec<readonly StopRef[]> {
  return { parse: parseStopRefs, serialize: (value) => serializeStopRefs(value) };
}

export const ROUTE_PARAMS = {
  from: optionalIdParam(),
  stops: stopRefsParam(),
  to: optionalIdParam(),
  opt: boolParam(),
  ret: boolParam(),
  keep: boolParam(),
  pref: optionalEnumParam(ROUTE_PREFERENCES),
  wh: optionalBoolParam(),
  whsize: optionalEnumParam(WORMHOLE_SHIP_SIZES),
  whlife: optionalIntParam({ min: MIN_ROUTE_HOLE_MIN_LIFE, max: MAX_ROUTE_HOLE_MIN_LIFE }),
  whhub: optionalEnumParam(ROUTE_HOLE_HUBS),
  jb: optionalBoolParam(),
  pin: legPinsParam(),
};

export function pinFirstLeg(pins: LegPinTokens, holeId: string): string[] {
  const next = [...pins];
  next[0] = holeId;
  return next;
}

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
