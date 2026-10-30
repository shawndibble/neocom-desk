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

describe('candidateFilter, propulsion kinds', () => {
  // 1 a hardener (group 77); 20 an afterburner and 21 an MWD (group 46); 22 a micro jump drive (group 1189).
  const groupOf = (typeId: number) => ({ 1: 77, 20: 46, 21: 46, 22: 1189 })[typeId];
  const nameOf = (typeId: number) =>
    ({ 20: '10MN Afterburner II', 21: '50MN Microwarpdrive II', 22: 'Large Micro Jump Drive' })[
      typeId
    ];
  const filterFor = (jobSetting: ReturnType<typeof jobSettingOf>) =>
    candidateFilter([mod('medium', 0, 1)], groupOf, {
      goal: 'overall',
      defense: 'keep',
      includeRigs: false,
      jobSetting,
      nameOf,
    });

  it('with "No propulsion needed" never adds propulsion, as a swap or a fill', () => {
    const optOut = filterFor(jobSettingOf('pve', 'dangerous', true));
    expect(optOut.kindBlocks(21, 1)).toBe(true);
    expect(optOut.kindBlocks(22, null)).toBe(true);
    // A fitted propulsion module may still become another one.
    expect(optOut.kindBlocks(21, 20)).toBe(false);
  });

  it('otherwise lets the score add propulsion, under PvE and PvP', () => {
    expect(filterFor(jobSettingOf('pve')).kindBlocks(21, 1)).toBe(false);
    expect(filterFor(jobSettingOf('pvp')).kindBlocks(20, null)).toBe(false);
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
