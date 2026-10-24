import { describe, expect, it } from 'vitest';
import {
  MOVE_PLAN_URL_SCHEMA,
  movePlanKey,
  planFromUrl,
  type MovePlanUrlValues,
} from './movePlanUrl';

const EMPTY: MovePlanUrlValues = { mv: [], mvd: null, mvp: [], mvh: null, mvr: false };

function parse(search: string): MovePlanUrlValues {
  const params = new URLSearchParams(search);
  return Object.fromEntries(
    Object.entries(MOVE_PLAN_URL_SCHEMA).map(([k, c]) => [k, c.parse(params.get(k))])
  ) as unknown as MovePlanUrlValues;
}

function write(values: MovePlanUrlValues): string {
  const params = new URLSearchParams();
  for (const [k, c] of Object.entries(MOVE_PLAN_URL_SCHEMA)) {
    const v = (c.serialize as (x: unknown) => string | null)(values[k as keyof MovePlanUrlValues]);
    if (v !== null) params.set(k, v);
  }
  return params.toString();
}

const FULL: MovePlanUrlValues = {
  mv: ['1:60003760:34:loose', '2:60003760:587:ship'],
  mvd: { kind: 'station', id: 60008494 },
  mvp: [11, 12],
  mvh: { customM3: 12500 },
  mvr: true,
};

describe('move plan URL', () => {
  it('round-trips a full plan', () => {
    expect(parse(write(FULL))).toEqual(FULL);
  });

  it('round-trips a system destination and a hull override', () => {
    const values: MovePlanUrlValues = {
      ...FULL,
      mvd: { kind: 'system', id: 30000142 },
      mvh: { hullTypeId: 648 },
    };
    expect(parse(write(values))).toEqual(values);
  });

  it('writes nothing for the empty state', () => {
    expect(write(EMPTY)).toBe('');
    expect(parse('')).toEqual(EMPTY);
  });

  it('reads garbage as the default', () => {
    const values = parse('mv=%2C%2C&mvd=x9&mvp=a,b&mvh=c-5&mvr=maybe');
    expect(values).toEqual(EMPTY);
  });

  it('drops a malformed stack key list whole', () => {
    expect(parse('mv=1:2:3:loose,nonsense').mv).toEqual([]);
  });

  it('rejects a non-positive or non-finite custom hold', () => {
    expect(parse('mvh=c0').mvh).toBeNull();
    expect(parse('mvh=cInfinity').mvh).toBeNull();
    expect(parse('mvh=h0').mvh).toBeNull();
  });

  describe('planFromUrl', () => {
    it('is null without a selection or without a destination', () => {
      expect(planFromUrl(EMPTY)).toBeNull();
      expect(planFromUrl({ ...FULL, mv: [] })).toBeNull();
      expect(planFromUrl({ ...FULL, mvd: null })).toBeNull();
    });

    it('is the values when a plan can be rebuilt', () => {
      expect(planFromUrl(FULL)).toEqual(FULL);
    });
  });

  it('keys the same plan the same way and different plans differently', () => {
    expect(movePlanKey(FULL)).toBe(movePlanKey({ ...FULL, mvp: [11, 12] }));
    expect(movePlanKey(FULL)).not.toBe(movePlanKey({ ...FULL, mvp: [11] }));
    expect(movePlanKey(EMPTY)).toBeNull();
  });
});
