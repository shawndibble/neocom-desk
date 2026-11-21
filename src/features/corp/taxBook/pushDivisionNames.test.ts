import { describe, expect, it, vi } from 'vitest';
import type { CorporationDivisions } from '@/esi/endpoints';
import {
  divisionNamesFor,
  pushDivisionNames,
  type PushDivisionNamesDeps,
} from './pushDivisionNames';

function deps(data: CorporationDivisions | null) {
  const calls: string[] = [];
  const edit = vi.fn(async () => {
    calls.push('edit');
    return {};
  });
  const verify = vi.fn(async () => {
    calls.push('verify');
    return { canEdit: true };
  });
  const load = vi
    .fn()
    .mockResolvedValue({ cached: data === null ? null : { data }, needsReauth: false });
  return {
    load,
    edit,
    verify,
    calls,
    deps: { load, edit, verify } as unknown as PushDivisionNamesDeps,
  };
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
    // The officer check comes first: the write rides on the role it caches, else a 403.
    expect(d.calls).toEqual(['verify', 'edit']);
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
    expect(same.verify).not.toHaveBeenCalled();
  });
});

describe('divisionNamesFor', () => {
  it('names the divisions a settings change is about to read, for the same patch', async () => {
    const d = deps({
      wallet: [
        { division: 2, name: 'Market Funds' },
        { division: 5, name: 'X' },
      ],
    });
    await expect(divisionNamesFor(1, 77, true, [1, 2], {}, d.load)).resolves.toEqual({
      2: 'Market Funds',
    });
    expect(d.load).toHaveBeenCalledWith(1, 77, true);
  });

  it('says nothing when the names are unchanged or could not be read', async () => {
    const same = deps({ wallet: [{ division: 2, name: 'Market Funds' }] });
    await expect(
      divisionNamesFor(1, 77, true, [2], { 2: 'Market Funds' }, same.load)
    ).resolves.toBeNull();
    await expect(divisionNamesFor(1, 77, false, [2], {}, deps(null).load)).resolves.toBeNull();
    // Only unnamed divisions read: the stored names stay rather than being cleared.
    const unnamed = deps({ wallet: [{ division: 2 }] });
    await expect(
      divisionNamesFor(1, 77, true, [2], { 2: 'Market Funds' }, unnamed.load)
    ).resolves.toBeNull();
    await expect(
      divisionNamesFor(1, 77, true, [2], {}, vi.fn().mockRejectedValue(new Error('down')))
    ).resolves.toBeNull();
  });
});
