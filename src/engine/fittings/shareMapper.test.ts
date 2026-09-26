import { describe, expect, it } from 'vitest';
import { encodeFittingShare, decodeFittingShare } from '@/engine/fitting/fittingShare';
import { fittingToShareInput, shareToFitting } from './shareMapper';
import type { Fitting } from './types';

function fitting(overrides: Partial<Fitting> = {}): Fitting {
  return {
    name: 'Rifter',
    shipTypeId: 587,
    modules: [],
    drones: [],
    cargo: [],
    ...overrides,
  };
}

describe('fittingToShareInput / shareToFitting', () => {
  it('round-trips a plain hull with no items', () => {
    const original = fitting();
    const restored = shareToFitting(fittingToShareInput(original), original.name);
    expect(restored).toEqual(original);
  });

  it('round-trips modules across every slot category, including a loaded charge', () => {
    const original = fitting({
      modules: [
        { slot: 'high', slotIndex: 0, typeId: 2456, state: 'active', chargeTypeId: 12608 },
        { slot: 'medium', slotIndex: 1, typeId: 439, state: 'online' },
        { slot: 'low', slotIndex: 0, typeId: 2046, state: 'online' },
        { slot: 'rig', slotIndex: 0, typeId: 31105, state: 'online' },
        { slot: 'subsystem', slotIndex: 0, typeId: 32396, state: 'online' },
      ],
    });
    const restored = shareToFitting(fittingToShareInput(original), original.name);
    expect(restored).toEqual(original);
  });

  it('round-trips a fully-active drone stack and a bay-only stack', () => {
    const original = fitting({
      drones: [
        { typeId: 2454, quantity: 3, state: 'active' },
        { typeId: 2456, quantity: 2, state: 'online' },
      ],
    });
    const restored = shareToFitting(fittingToShareInput(original), original.name);
    expect(restored).toEqual(original);
  });

  it('round-trips one drone type split between space and bay through the real codec (the editor writes this)', async () => {
    const original = fitting({
      drones: [
        { typeId: 2454, quantity: 2, state: 'active' },
        { typeId: 2454, quantity: 3, state: 'online' },
      ],
    });
    const encoded = await encodeFittingShare(fittingToShareInput(original));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(shareToFitting(decoded.value, original.name)).toEqual(original);
  });

  it('round-trips cargo', () => {
    const original = fitting({ cargo: [{ typeId: 12608, quantity: 50 }] });
    const restored = shareToFitting(fittingToShareInput(original), original.name);
    expect(restored).toEqual(original);
  });

  it('round-trips a carried implant set', () => {
    const original = fitting({ implantSet: { implants: [19540, 19553], boosters: [30006] } });
    const restored = shareToFitting(fittingToShareInput(original), original.name);
    expect(restored).toEqual(original);
  });

  it('round-trips an explicitly empty implant set distinctly from no set at all', () => {
    const original = fitting({ implantSet: { implants: [], boosters: [] } });
    const restored = shareToFitting(fittingToShareInput(original), original.name);
    expect(restored.implantSet).toEqual({ implants: [], boosters: [] });
  });

  it('carries no implantSet key at all when the Fitting carries no set', () => {
    const original = fitting();
    const shareInput = fittingToShareInput(original);
    expect(shareInput.implantSet).toBeUndefined();
    const restored = shareToFitting(shareInput, original.name);
    expect(restored.implantSet).toBeUndefined();
  });

  it('round-trips through the real encode/decode codec, name aside (the payload never carries it)', async () => {
    const original = fitting({
      shipTypeId: 587,
      modules: [{ slot: 'high', slotIndex: 0, typeId: 2456, state: 'active' }],
      drones: [{ typeId: 2454, quantity: 1, state: 'active' }],
    });

    const encoded = await encodeFittingShare(fittingToShareInput(original));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const restored = shareToFitting(decoded.value, original.name);
    expect(restored).toEqual(original);
  });

  it('round-trips a carried implant set through the real encode/decode codec', async () => {
    const original = fitting({ implantSet: { implants: [19540], boosters: [30006, 30008] } });

    const encoded = await encodeFittingShare(fittingToShareInput(original));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = await decodeFittingShare(encoded.payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const restored = shareToFitting(decoded.value, original.name);
    expect(restored).toEqual(original);
  });
});

describe('fittingToShareInput / shareToFitting — mode and booster side effects', () => {
  it('round-trips a Tactical Destroyer mode and the side effects on its boosters', async () => {
    const original = fitting({
      shipTypeId: 34562,
      mode: 34566,
      implantSet: { implants: [], boosters: [9950], boosterSideEffects: [2737] },
    });
    const encoded = await encodeFittingShare(fittingToShareInput(original));
    if (!encoded.ok) throw new Error('encode failed');
    const decoded = await decodeFittingShare(encoded.payload);
    if (!decoded.ok) throw new Error('decode failed');
    expect(shareToFitting(decoded.value, original.name)).toEqual(original);
  });

  it('drops side effects that arrive with no boosters to carry them', () => {
    const input = { ...fittingToShareInput(fitting()), boosterSideEffects: [2737] };
    expect(shareToFitting(input, 'Rifter')).toEqual(fitting());
  });
});

describe('fittingToShareInput / shareToFitting — fighters', () => {
  it('round-trips launched fighter squadrons through the real codec', async () => {
    const original = fitting({
      shipTypeId: 23911,
      fighters: [
        { typeId: 23055, quantity: 6, state: 'active' },
        { typeId: 37599, quantity: 3, state: 'active' },
      ],
    });
    const encoded = await encodeFittingShare(fittingToShareInput(original));
    if (!encoded.ok) throw new Error('encode failed');
    const decoded = await decodeFittingShare(encoded.payload);
    if (!decoded.ok) throw new Error('decode failed');
    expect(shareToFitting(decoded.value, original.name)).toEqual(original);
  });

  it('brings a squadron back launched: the link has no bay/tube split to keep', () => {
    const input = fittingToShareInput(
      fitting({ fighters: [{ typeId: 23055, quantity: 6, state: 'online' }] })
    );
    expect(input.fighters).toEqual([{ typeId: 23055, count: 6 }]);
    expect(shareToFitting(input, 'Thanatos').fighters).toEqual([
      { typeId: 23055, quantity: 6, state: 'active' },
    ]);
  });

  it('carries no fighters key at all for a Fitting without fighters, as before', () => {
    expect(shareToFitting(fittingToShareInput(fitting()), 'Rifter')).not.toHaveProperty('fighters');
  });
});
