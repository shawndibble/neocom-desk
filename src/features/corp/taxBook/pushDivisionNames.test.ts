import { describe, expect, it, vi } from 'vitest';
import type { CorporationDivisions } from '@/esi/endpoints';
import { pushDivisionNames, type PushDivisionNamesDeps } from './pushDivisionNames';

function deps(data: CorporationDivisions | null) {
  const edit = vi.fn().mockResolvedValue({});
  const load = vi
    .fn()
    .mockResolvedValue({ cached: data === null ? null : { data }, needsReauth: false });
  return { load, edit, deps: { load, edit } as unknown as PushDivisionNamesDeps };
}

describe('pushDivisionNames (#6161)', () => {
  it("stores the names of the book's divisions through updateSettings", async () => {
    const d = deps({ wallet: [{ division: 5, name: 'MOON TAXES' }] });
    await expect(pushDivisionNames(1, 77, { divisions: [5] }, d.deps)).resolves.toBe(true);
    expect(d.load).toHaveBeenCalledWith(1, 77, true);
    expect(d.edit).toHaveBeenCalledWith(1, 77, {
      action: 'updateSettings',
      patch: { divisionNames: { 5: 'MOON TAXES' } },
    });
  });

  it('writes nothing when the names are unchanged or ESI did not answer', async () => {
    const same = deps({ wallet: [{ division: 5, name: 'MOON TAXES' }] });
    const stored = { divisions: [5], divisionNames: { 5: 'MOON TAXES' } };
    await expect(pushDivisionNames(1, 77, stored, same.deps)).resolves.toBe(false);
    expect(same.edit).not.toHaveBeenCalled();

    const none = deps(null);
    await expect(pushDivisionNames(1, 77, stored, none.deps)).resolves.toBe(false);
    const noWallet = deps({ hangar: [] });
    await expect(pushDivisionNames(1, 77, stored, noWallet.deps)).resolves.toBe(false);
    expect(none.edit).not.toHaveBeenCalled();
    expect(noWallet.edit).not.toHaveBeenCalled();
  });
});
