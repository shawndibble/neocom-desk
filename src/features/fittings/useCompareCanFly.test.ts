import { describe, expect, it, vi } from 'vitest';
import type { Fitting } from '@/engine/fittings/types';

// The baked typeInfo shard lacks every type here, so reads take the ESI fallback.
vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn(async () => null) }));
const UNREADABLE_TYPE_ID = 99999;
vi.mock('@/features/skills/data', () => ({
  loadUniverseType: async (typeId: number) =>
    typeId === UNREADABLE_TYPE_ID
      ? null
      : {
          data: {
            dogma_attributes:
              typeId === 587
                ? [
                    { attribute_id: 182, value: 3300 },
                    { attribute_id: 277, value: 5 },
                  ]
                : [],
          },
        },
}));

const { fittingCanFly } = await import('./useCompareCanFly');

const fit = (shipTypeId: number, moduleTypeId: number): Fitting => ({
  name: 'Fit',
  shipTypeId,
  modules: [{ slot: 'high', slotIndex: 0, typeId: moduleTypeId, state: 'active' }],
  drones: [],
  cargo: [],
});

describe('fittingCanFly', () => {
  it('is true when every requirement is read and met', async () => {
    expect(await fittingCanFly(fit(587, 2889), new Map([[3300, 5]]))).toBe(true);
  });

  it('is false on a confirmed gap, even if another type is unreadable', async () => {
    expect(await fittingCanFly(fit(587, UNREADABLE_TYPE_ID), new Map())).toBe(false);
  });

  it('is null rather than true when a type could not be read', async () => {
    expect(await fittingCanFly(fit(600, UNREADABLE_TYPE_ID), new Map())).toBeNull();
  });
});
