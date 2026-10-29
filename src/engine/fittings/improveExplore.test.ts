import { describe, expect, it } from 'vitest';
import { findImprovements, goalAvailability, type ImproveCandidate } from './improve';
import { reworkGroups, scoredJobs } from './improveGroups';
import type { Fitting, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

const base = baseFittingStats();

interface Figures {
  coherence?: number;
  probe?: number;
  cpuUsed?: number;
  velocity?: number;
}
const stats = ({ coherence = 0, probe = 0, cpuUsed = 100, velocity = 300 }: Figures) =>
  ({
    ...base,
    cpuUsed,
    cpuTotal: 150,
    navigation: { ...base.navigation, maxVelocity: velocity },
    explore: {
      hacking: { coherence, strength: coherence > 0 ? 35 : 0, access: 0 },
      probeStrength: probe,
    },
  }) as FittingStats;

describe('the Explore better goal', () => {
  it('is available only on a fit with a running analyzer or a loaded probe', () => {
    expect(goalAvailability('explore', stats({}))).toEqual({
      available: false,
      reason: 'noExplore',
    });
    expect(goalAvailability('explore', stats({ coherence: 110 }))).toEqual({ available: true });
    expect(goalAvailability('explore', stats({ probe: 70 }))).toEqual({ available: true });
  });

  it('searches the analyzers, scan arrays, scanning rigs and speed groups', () => {
    const groups = reworkGroups('explore', []);
    expect(groups).toEqual(expect.arrayContaining([538, 1223, 1233, 46, 782]));
  });

  it('scores the analyzer, probe launcher and scan array jobs, so Rework cannot drop them free', () => {
    expect(scoredJobs('explore')).toEqual(
      expect.arrayContaining(['analyzer', 'probeLauncher', 'scanArray'])
    );
  });

  // Type 1 is the fitted rig; 2 trades it for a hacking rig; 3 for a speed rig; 4 for nothing useful.
  const figures: Record<number, Figures> = {
    1: { coherence: 110, probe: 70, cpuUsed: 140 },
    2: { coherence: 130, probe: 70, cpuUsed: 100 },
    3: { coherence: 110, probe: 70, cpuUsed: 100, velocity: 330 },
    4: { coherence: 110, probe: 70, cpuUsed: 100 },
    5: { coherence: 130, probe: 70, cpuUsed: 160 },
    6: { coherence: 0, probe: 70, cpuUsed: 100 },
  };
  const of = async (f: Fitting) => stats(figures[f.modules[0]!.typeId]!);
  const fitting = {
    shipTypeId: 1,
    name: 'Heron',
    modules: [{ slot: 'rig', slotIndex: 0, typeId: 1 }],
  } as unknown as Fitting;
  const swap = (toTypeId: number): ImproveCandidate => ({
    fromTypeId: 1,
    toTypeId,
    at: [{ slot: 'rig', slotIndex: 0 }],
  });
  const run = async (toTypeIds: number[]) =>
    findImprovements({
      fitting,
      before: await of(fitting),
      goal: 'explore',
      candidates: toTypeIds.map(swap),
      stats: of,
      priceOf: () => null,
    });

  it('offers a hacking rig and a speed rig in place of a CPU rig the fit does not need', async () => {
    const result = await run([2, 3]);
    expect([...result!.noDownside, ...result!.tradeOffs].map((o) => o.candidate.toTypeId)).toEqual(
      expect.arrayContaining([2, 3])
    );
  });

  it('offers nothing that changes neither hacking, scanning nor speed', async () => {
    const result = await run([4]);
    expect([...result!.noDownside, ...result!.tradeOffs]).toEqual([]);
  });

  it('refuses a hacking rig that leaves the fit short of CPU', async () => {
    const result = await run([5]);
    expect(result!.noDownside).toEqual([]);
    expect(result!.rejected.map((o) => o.candidate.toTypeId)).toEqual([5]);
  });

  it('counts a swap that drops the analyzer as a loss, never a gain', async () => {
    const result = await run([6]);
    expect([...result!.noDownside, ...result!.tradeOffs]).toEqual([]);
  });

  it('never lets a big speed gain pay for a lost analyzer', async () => {
    figures[7] = { coherence: 0, probe: 70, cpuUsed: 100, velocity: 3000 };
    const result = await run([7]);
    expect([...result!.noDownside, ...result!.tradeOffs]).toEqual([]);
  });

  it('keeps a hacking gain that costs a little speed', async () => {
    figures[8] = { coherence: 130, probe: 70, cpuUsed: 100, velocity: 290 };
    const result = await run([8]);
    expect([...result!.noDownside, ...result!.tradeOffs].map((o) => o.candidate.toTypeId)).toEqual([
      8,
    ]);
  });
});
