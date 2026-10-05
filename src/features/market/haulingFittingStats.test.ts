import { describe, expect, it, vi } from 'vitest';
import { NO_HOLDS } from '@/engine/fittings/__fixtures__/fittingStats';
import { newFitting } from '@/engine/fittings/fittingEdit';
import type { PilotProfile } from '@/engine/fittings/types';
import { computeCargoHolds } from './haulingFittingStats';

const computeFittingStats = vi.hoisted(() => vi.fn());
vi.mock('@/features/fittings/dogmaFittingEngine', () => ({ computeFittingStats }));

describe('computeCargoHolds', () => {
  it('folds the fleet hangar into the general hold', async () => {
    // A Deep Space Transport: most of what it hauls rides in the fleet hangar.
    computeFittingStats.mockResolvedValue({
      holds: { ...NO_HOLDS, cargo: 4_500, fleetHangar: 50_000 },
    });
    await expect(computeCargoHolds(newFitting(12_747, ''), {} as PilotProfile)).resolves.toEqual([
      { kind: 'general', capacityM3: 54_500 },
    ]);
  });

  it("lists a Hoarder's ammo and gas holds beside its cargo hold", async () => {
    computeFittingStats.mockResolvedValue({
      holds: { ...NO_HOLDS, cargo: 300, ammoHold: 41_000, gasHold: 5_000 },
    });
    await expect(computeCargoHolds(newFitting(19_744, ''), {} as PilotProfile)).resolves.toEqual([
      { kind: 'general', capacityM3: 300 },
      { kind: 'gas', capacityM3: 5_000 },
      { kind: 'ammo', capacityM3: 41_000 },
    ]);
  });
});
