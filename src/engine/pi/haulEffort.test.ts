import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { JumpsFn } from './goalTypes';
import { haulEffortOf, legJumps, volumeOf } from './haulEffort';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073; // P0, 0.005 m3
const WATER = 3645; // P1, 0.19 m3
const COOLANT = 9832; // P2, 0.75 m3

/** A fixed distance table; anything not in it is unknown. */
function table(entries: Record<string, number>): JumpsFn {
  return (from, to) => entries[`${from}>${to}`] ?? null;
}

describe('volumeOf', () => {
  it('reads a made commodity off its schematic and a P0 off the raw list', () => {
    expect(volumeOf(COOLANT, pi)).toBe(0.75);
    expect(volumeOf(WATER, pi)).toBe(0.19);
    expect(volumeOf(MICROORGANISMS, pi)).toBe(0.005);
  });

  it('refuses a type that is not a planetary commodity', () => {
    expect(() => volumeOf(34, pi)).toThrow('34 is not a planetary commodity');
  });
});

describe('legJumps', () => {
  it('is 0 for a leg that stays put, with or without a distance function', () => {
    expect(legJumps(1, 1, undefined)).toBe(0);
    expect(legJumps('hub', 'hub', table({}))).toBe(0);
  });

  it('is unknown without a distance function', () => {
    expect(legJumps(1, 2, undefined)).toBeNull();
    expect(legJumps(1, 'hub', undefined)).toBeNull();
  });

  it("is the caller's figure colony to colony and colony to hub", () => {
    const jumps = table({ '1>2': 4, '1>hub': 7 });
    expect(legJumps(1, 2, jumps)).toBe(4);
    expect(legJumps(1, 'hub', jumps)).toBe(7);
    expect(legJumps(2, 1, jumps)).toBeNull();
  });

  it('measures a hub-to-colony leg from the colony', () => {
    const jumps = vi.fn<JumpsFn>(() => 9);
    expect(legJumps('hub', 3, jumps)).toBe(9);
    expect(jumps).toHaveBeenCalledWith(3, 'hub');
  });
});

describe('haulEffortOf', () => {
  it('weights m3 an hour by the jumps each leg covers', () => {
    const effort = haulEffortOf(
      [
        { from: 1, to: 2, typeId: WATER, unitsPerHour: 100 },
        { from: 2, to: 'hub', typeId: COOLANT, unitsPerHour: 10 },
      ],
      pi,
      table({ '1>2': 3, '2>hub': 5 })
    );
    // 100 × 0.19 × 3 + 10 × 0.75 × 5
    expect(effort.m3JumpsPerHour).toBeCloseTo(57 + 37.5);
    expect(effort.unknownLegs).toBe(0);
  });

  it('counts a hub leg from either side', () => {
    const effort = haulEffortOf(
      [{ from: 'hub', to: 4, typeId: WATER, unitsPerHour: 10 }],
      pi,
      table({ '4>hub': 2 })
    );
    expect(effort.m3JumpsPerHour).toBeCloseTo(10 * 0.19 * 2);
  });

  it('skips a leg that stays on its planet or moves nothing', () => {
    const jumps = vi.fn<JumpsFn>(() => 5);
    const effort = haulEffortOf(
      [
        { from: 1, to: 1, typeId: WATER, unitsPerHour: 100 },
        { from: 1, to: 2, typeId: WATER, unitsPerHour: 0 },
      ],
      pi,
      jumps
    );
    expect(effort).toEqual({ m3JumpsPerHour: 0, unknownLegs: 0 });
    expect(jumps).not.toHaveBeenCalled();
  });

  it('counts an unknown distance apart instead of guessing it', () => {
    const effort = haulEffortOf(
      [
        { from: 1, to: 2, typeId: WATER, unitsPerHour: 100 },
        { from: 1, to: 'hub', typeId: COOLANT, unitsPerHour: 10 },
      ],
      pi,
      table({ '1>2': 3 })
    );
    expect(effort.m3JumpsPerHour).toBeCloseTo(57);
    expect(effort.unknownLegs).toBe(1);
  });

  it('counts every moving leg unknown without a distance function', () => {
    const effort = haulEffortOf(
      [
        { from: 1, to: 2, typeId: WATER, unitsPerHour: 100 },
        { from: 2, to: 'hub', typeId: COOLANT, unitsPerHour: 10 },
        { from: 3, to: 3, typeId: WATER, unitsPerHour: 10 },
      ],
      pi,
      undefined
    );
    expect(effort).toEqual({ m3JumpsPerHour: 0, unknownLegs: 2 });
  });
});
