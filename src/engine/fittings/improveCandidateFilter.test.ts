import { describe, expect, it } from 'vitest';
import { candidateFilter } from './improveCandidateFilter';
import { jobSettingOf, swapLimitsOf } from './improveJob';
import { coveringFreed } from './improvePairSeed';
import type { FittingModule } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

const mod = (slot: FittingModule['slot'], slotIndex: number, typeId: number) =>
  ({ slot, slotIndex, typeId, state: 'online' }) as FittingModule;

describe('swapLimitsOf', () => {
  it('is the tank part of the drop limits, and only where tank modules are held', () => {
    expect(swapLimitsOf('overall', jobSettingOf('explore', 'dangerous'))).toEqual({
      ehp: 0.1,
      sustained: 0.1,
    });
    expect(swapLimitsOf('tank', jobSettingOf('explore', 'dangerous'))).toEqual({ sustained: 0.1 });
    expect(swapLimitsOf('overall', jobSettingOf('explore', 'safe'))).toEqual({});
    expect(swapLimitsOf('overall', jobSettingOf('pvp'))).toEqual({});
    expect(swapLimitsOf('overall', undefined)).toEqual({});
  });
});

describe('candidateFilter', () => {
  // Types 1 and 2 are groups 10 and 60 (a unique module); 3 is group 11.
  const groupOf = (typeId: number) => ({ 1: 10, 2: 60, 3: 11 })[typeId];
  const filter = candidateFilter([mod('low', 0, 2), mod('low', 1, 1)], groupOf, {
    goal: 'overall',
    defense: 'keep',
    includeRigs: false,
  });

  it('searches no subsystem and no rig unless included', () => {
    expect(filter.usesRack('subsystem')).toBe(false);
    expect(filter.usesRack('rig')).toBe(false);
    expect(filter.usesRack('low')).toBe(true);
  });

  it('refuses a second unique module unless the fitted one leaves', () => {
    expect(filter.uniqueBlocks(60, undefined, 1)).toBe(true);
    expect(filter.uniqueBlocks(60, 60, 1)).toBe(false);
    expect(filter.uniqueBlocks(10, undefined, 1)).toBe(false);
  });

  it('finds the first free slot of a rack, null when full', () => {
    const counts = { high: 2, medium: 2, low: 2, rig: 3, subsystem: 0 };
    expect(filter.firstFreeSlot('low', counts)).toBeNull();
    expect(filter.firstFreeSlot('medium', counts)).toBe(0);
  });
});

describe('coveringFreed', () => {
  const over = (cpu: number) => ({
    ...baseFittingStats(),
    cpuUsed: 100 + cpu,
    cpuTotal: 100,
    powergridUsed: 50,
    powergridTotal: 100,
  });
  it('is null unless the freed resources cover every overrun', () => {
    const freed = { cpu: 5, powergrid: 0, calibration: 0 };
    expect(coveringFreed(over(5), freed)).toBe(5);
    expect(coveringFreed(over(6), freed)).toBeNull();
  });
});
