import { describe, expect, it, vi } from 'vitest';
import { newFitting } from '@/engine/fittings/fittingEdit';
import type { PilotProfile } from '@/engine/fittings/types';
import { computeCargoM3 } from './haulingFittingStats';

const computeFittingStats = vi.hoisted(() => vi.fn());
vi.mock('@/features/fittings/dogmaFittingEngine', () => ({ computeFittingStats }));

describe('computeCargoM3', () => {
  it('counts the fleet hangar as well as the cargo hold, but not an ore-only mining hold', async () => {
    // A Deep Space Transport: most of what it hauls rides in the fleet hangar.
    computeFittingStats.mockResolvedValue({
      holds: { cargo: 4_500, fleetHangar: 50_000, miningHold: 12_000 },
    });
    await expect(computeCargoM3(newFitting(12_747, ''), {} as PilotProfile)).resolves.toBe(54_500);
  });
});
