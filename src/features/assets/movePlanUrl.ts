import type { HaulerOverride } from '@/engine/assets/movePlan';
import { parsePositiveInt } from '@/engine/market/urlState';
import { boolParam, idListParam, type UrlParamCodec } from '@/lib/urlState';

export type MovePlanDestination = { kind: 'system'; id: number } | { kind: 'station'; id: number };

export interface MovePlanUrlValues {
  mv: readonly string[];
  mvd: MovePlanDestination | null;
  mvp: readonly number[];
  mvh: HaulerOverride | null;
  mvr: boolean;
  mvc: boolean;
}

const STACK_KEY = /^\d+:\d+:\d+:(?:ship|loose)$/;

const stackKeysParam: UrlParamCodec<readonly string[]> = {
  parse: (raw) => {
    if (raw === null || raw === '') return [];
    const keys = raw.split(',');
    return keys.every((k) => STACK_KEY.test(k)) ? [...new Set(keys)].sort() : [];
  },
  serialize: (keys) => (keys.length === 0 ? null : [...new Set(keys)].sort().join(',')),
};

const destinationParam: UrlParamCodec<MovePlanDestination | null> = {
  parse: (raw) => {
    const id = parsePositiveInt(raw?.slice(1) ?? null);
    if (id === null) return null;
    if (raw![0] === 's') return { kind: 'system', id };
    if (raw![0] === 't') return { kind: 'station', id };
    return null;
  },
  serialize: (dest) => (dest ? `${dest.kind === 'system' ? 's' : 't'}${dest.id}` : null),
};

const haulerParam: UrlParamCodec<HaulerOverride | null> = {
  parse: (raw) => {
    if (raw === null || raw.length < 2) return null;
    const rest = raw.slice(1);
    if (raw[0] === 'h') {
      const hullTypeId = parsePositiveInt(rest);
      return hullTypeId === null ? null : { hullTypeId };
    }
    if (raw[0] === 'c' && /^\d+(\.\d+)?$/.test(rest)) {
      const customM3 = Number(rest);
      return Number.isFinite(customM3) && customM3 > 0 ? { customM3 } : null;
    }
    return null;
  },
  serialize: (pick) =>
    pick === null ? null : 'hullTypeId' in pick ? `h${pick.hullTypeId}` : `c${pick.customM3}`,
};

const packedShipsParam = idListParam();

export const MOVE_PLAN_URL_SCHEMA = {
  mv: stackKeysParam,
  mvd: destinationParam,
  mvp: packedShipsParam,
  mvh: haulerParam,
  mvr: boolParam(),
  mvc: boolParam(),
};

export const NO_MOVE_PLAN: MovePlanUrlValues = {
  mv: [],
  mvd: null,
  mvp: [],
  mvh: null,
  mvr: false,
  mvc: false,
};

export function planFromUrl(values: MovePlanUrlValues, corp = false): MovePlanUrlValues | null {
  return values.mvc === corp && values.mv.length > 0 && values.mvd !== null ? values : null;
}

export function movePlanKey(values: MovePlanUrlValues, corp = false): string | null {
  const plan = planFromUrl(values, corp);
  if (!plan) return null;
  return [
    stackKeysParam.serialize(plan.mv),
    destinationParam.serialize(plan.mvd),
    packedShipsParam.serialize(plan.mvp),
    haulerParam.serialize(plan.mvh),
  ].join('|');
}
