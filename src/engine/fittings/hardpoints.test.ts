import { describe, expect, it } from 'vitest';
import { countHardpoints } from './hardpoints';
import type { Fitting } from './types';

const AUTOCANNON = 2889;
const ROCKET_LAUNCHER = 10631;
const WARP_DISRUPTOR = 3244;
const KIND: Record<number, 'turret' | 'launcher'> = {
  [AUTOCANNON]: 'turret',
  [ROCKET_LAUNCHER]: 'launcher',
};

const fitting: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [
    { slot: 'high', slotIndex: 0, typeId: AUTOCANNON, state: 'active' },
    { slot: 'high', slotIndex: 1, typeId: AUTOCANNON, state: 'offline' },
    { slot: 'high', slotIndex: 2, typeId: ROCKET_LAUNCHER, state: 'active' },
    { slot: 'medium', slotIndex: 0, typeId: WARP_DISRUPTOR, state: 'active' },
  ],
  drones: [],
  cargo: [],
};

describe('countHardpoints', () => {
  it('counts every fitted turret and launcher, online or not — a hardpoint is taken by fitting', () => {
    expect(countHardpoints(fitting, (typeId) => KIND[typeId] ?? null)).toEqual({
      turrets: 2,
      launchers: 1,
    });
  });

  it('is null until every high slot module is known, rather than undercounting', () => {
    expect(
      countHardpoints(fitting, (typeId) =>
        typeId === ROCKET_LAUNCHER ? undefined : (KIND[typeId] ?? null)
      )
    ).toBeNull();
  });
});
