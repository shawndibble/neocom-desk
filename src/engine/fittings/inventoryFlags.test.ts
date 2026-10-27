import { describe, expect, it } from 'vitest';
import { fighterFlagState, fighterTubes, slotFlag, slotFromFlag } from './inventoryFlags';

describe('slotFromFlag / slotFlag', () => {
  it('reads a rack and position off a slot flag, and writes it back', () => {
    expect(slotFromFlag('HiSlot0')).toEqual({ slot: 'high', slotIndex: 0 });
    expect(slotFromFlag('MedSlot3')).toEqual({ slot: 'medium', slotIndex: 3 });
    expect(slotFromFlag('LoSlot7')).toEqual({ slot: 'low', slotIndex: 7 });
    expect(slotFromFlag('RigSlot2')).toEqual({ slot: 'rig', slotIndex: 2 });
    expect(slotFromFlag('SubSystemSlot1')).toEqual({ slot: 'subsystem', slotIndex: 1 });
    expect(slotFlag('medium', 3)).toBe('MedSlot3');
    expect(slotFlag('subsystem', 1)).toBe('SubSystemSlot1');
  });

  it('is null for anything that is not a rack slot', () => {
    for (const flag of [
      'DroneBay',
      'Cargo',
      'FighterTube0',
      'ServiceSlot0',
      'HiSlot',
      'xHiSlot0',
    ]) {
      expect(slotFromFlag(flag)).toBeNull();
    }
  });
});

describe('fighterFlagState', () => {
  it('reads a tube as launched and the fighter bay as waiting', () => {
    expect(fighterFlagState('FighterTube0')).toBe('active');
    expect(fighterFlagState('FighterTube4')).toBe('active');
    expect(fighterFlagState('FighterBay')).toBe('online');
    expect(fighterFlagState('DroneBay')).toBeNull();
  });
});

describe('fighterTubes', () => {
  const squadrons = [
    { state: 'active' as const },
    { state: 'online' as const },
    { state: 'active' as const },
    { state: 'active' as const },
  ];

  it('gives launched squadrons the tubes in order, and bay ones none', () => {
    expect(fighterTubes(squadrons)).toEqual([0, null, 1, 2]);
  });

  it('puts a launched squadron past the last tube back in the bay', () => {
    expect(fighterTubes(squadrons, 2)).toEqual([0, null, 1, null]);
  });
});
