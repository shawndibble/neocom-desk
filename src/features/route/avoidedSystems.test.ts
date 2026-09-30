import { describe, expect, it } from 'vitest';
import { addAvoidedSystem, parseAvoidedSystems, removeAvoidedSystem } from './avoidedSystems';

describe('parseAvoidedSystems', () => {
  it('keeps a list of solar system ids', () => {
    expect(parseAvoidedSystems([30002813, 30045328])).toEqual([30002813, 30045328]);
  });

  /*
   * Another device, possibly an older build, wrote what comes back from sync.
   * A bad entry costs only itself, not the whole list.
   */
  it('drops duplicates and anything that is not a positive integer id', () => {
    expect(parseAvoidedSystems([30002813, 30002813, 'Uedama', -1, 0, 1.5, null, 30045328])).toEqual(
      [30002813, 30045328]
    );
  });

  it('rejects a value that is not a list', () => {
    expect(parseAvoidedSystems(30002813)).toBeNull();
    expect(parseAvoidedSystems({ 30002813: true })).toBeNull();
    expect(parseAvoidedSystems(null)).toBeNull();
  });
});

describe('addAvoidedSystem', () => {
  it('appends a system not already avoided', () => {
    expect(addAvoidedSystem([30002813], 30045328)).toEqual([30002813, 30045328]);
  });

  it('leaves the list alone when the system is already avoided', () => {
    const list = [30002813];
    expect(addAvoidedSystem(list, 30002813)).toBe(list);
  });
});

describe('removeAvoidedSystem', () => {
  it('drops the system', () => {
    expect(removeAvoidedSystem([30002813, 30045328], 30002813)).toEqual([30045328]);
  });

  it('writes an empty list rather than nothing once the last one goes', () => {
    expect(removeAvoidedSystem([30002813], 30002813)).toEqual([]);
  });
});
