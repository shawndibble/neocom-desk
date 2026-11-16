import { describe, expect, it, vi } from 'vitest';
import { decodeFittingShare, encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput, shareToFitting } from '@/engine/fittings/shareMapper';
import type { MemberDoctrineFit } from '@/features/corp/srpTypes';
import { doctrineRows } from './corpDoctrineFittings';

const slots = { 10: 'high', 12: 'medium', 20: 'rig' } as const;
const hullName = (typeId: number) => (typeId === 587 ? 'Rifter' : `Hull ${typeId}`);
const snapshot = { hullTypeId: 587, name: 'Fleet Rifter', modules: [10, 12], rigs: [20] };

describe('doctrineRows', () => {
  it('opens a fit saved with its share code as that code, whole', async () => {
    const encoded = await encodeFittingShare(
      fittingToShareInput({
        name: 'Fleet Rifter',
        shipTypeId: 587,
        modules: [{ slot: 'high', slotIndex: 0, typeId: 10, state: 'active', chargeTypeId: 30 }],
        drones: [{ typeId: 60, quantity: 2, state: 'online' }],
        cargo: [],
      })
    );
    if (!encoded.ok) throw new Error('encode');
    const loadSlots = vi.fn(async () => slots);
    const rows = await doctrineRows(
      [{ id: 'a', name: 'Fleet Rifter', snapshot, shareCode: encoded.payload }],
      hullName,
      loadSlots
    );
    expect(rows).toEqual([
      {
        id: 'doctrine-a',
        name: 'Fleet Rifter',
        hull: 'Rifter',
        source: 'doctrine',
        code: encoded.payload,
        legacy: false,
      },
    ]);
    expect(loadSlots).not.toHaveBeenCalled();
  });

  it('rebuilds an older fit from its snapshot alone and marks it legacy', async () => {
    const [row] = await doctrineRows(
      [{ id: 'b', name: 'Old Rifter', snapshot }],
      hullName,
      async () => slots
    );
    expect(row).toMatchObject({ id: 'doctrine-b', hull: 'Rifter', legacy: true });
    const decoded = await decodeFittingShare(row!.code);
    if (!decoded.ok) throw new Error('decode');
    const fitting = shareToFitting(decoded.value, 'x');
    expect(fitting.name).toBe('Old Rifter');
    expect(fitting.shipTypeId).toBe(587);
    expect(fitting.modules.map((m) => [m.slot, m.typeId])).toEqual([
      ['high', 10],
      ['medium', 12],
      ['rig', 20],
    ]);
    expect(fitting.drones).toEqual([]);
  });

  it('sorts by name and lists nothing for no fits', async () => {
    const fits: MemberDoctrineFit[] = [
      { id: 'z', name: 'Zealot fleet', snapshot },
      { id: 'a', name: 'Arty Rifter', snapshot },
    ];
    expect((await doctrineRows(fits, hullName, async () => slots)).map((r) => r.name)).toEqual([
      'Arty Rifter',
      'Zealot fleet',
    ]);
    expect(await doctrineRows([], hullName, async () => slots)).toEqual([]);
  });
});
