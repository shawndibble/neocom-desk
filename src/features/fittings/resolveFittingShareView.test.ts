import { describe, expect, it, vi } from 'vitest';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { resolveFittingShareView } from './resolveFittingShareView';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({
    '587': { name: 'Rifter', groupID: 25, volume: 0 },
  }),
  loadSkills: async () => [
    { typeID: 3300, name: 'Gunnery' },
    { typeID: 3301, name: 'Small Hybrid Turret' },
  ],
}));

const RIFTER: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 2889, state: 'active' }],
  drones: [],
  cargo: [],
};

describe('resolveFittingShareView', () => {
  it('decodes a share code into the hull-named Fitting, at every skill level V', async () => {
    const encoded = await encodeFittingShare(fittingToShareInput(RIFTER));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const result = await resolveFittingShareView(encoded.payload);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fitting).toEqual(RIFTER);
    expect(result.profile.skillLevels.get(3300)).toBe(5);
    expect(result.profile.skillLevels.get(3301)).toBe(5);
    expect(result.profile.implantTypeIds).toEqual([]);
  });

  it("layers in the Fitting's own carried implant set, not a clone's", async () => {
    const withImplants: Fitting = {
      ...RIFTER,
      implantSet: { implants: [19540], boosters: [] },
    };
    const encoded = await encodeFittingShare(fittingToShareInput(withImplants));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const result = await resolveFittingShareView(encoded.payload);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.implantTypeIds).toEqual([19540]);
  });

  it('reports an invalid code as its own reason rather than throwing', async () => {
    const result = await resolveFittingShareView('not-a-real-code');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });
});
