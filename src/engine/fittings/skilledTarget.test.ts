import { describe, expect, it } from 'vitest';
import { skilledTargetOf } from './skilledTarget';

const sde = {
  types: {
    12003: { groupID: 358 },
    3530: { groupID: 62 },
    2488: { groupID: 100 },
    34: { groupID: 18 },
  },
  categories: { '358': 6, '62': 7, '100': 18, '18': 4 },
  slots: { '3530': 'low', '2488': 'drone', '2048': 'low', '30000': 'subsystem' } as const,
};

describe('skilledTargetOf', () => {
  it('reads a ship as a hull', () => {
    expect(skilledTargetOf(12003, sde)).toEqual({ kind: 'ship', typeId: 12003 });
  });

  it('reads a fittable module as a module in its rack', () => {
    expect(skilledTargetOf(3530, sde)).toEqual({ kind: 'module', typeId: 3530, slot: 'low' });
  });

  it('looks a mutated module up under its base type, keeping the mutation', () => {
    const mutation = { baseTypeId: 2048, mutaplasmidTypeId: 52224, attributes: { 50: 20 } };
    expect(skilledTargetOf(52227, sde, mutation)).toEqual({
      kind: 'module',
      typeId: 52227,
      slot: 'low',
      mutation,
    });
  });

  it('has nothing to say for drones, subsystems and anything not fitted', () => {
    expect(skilledTargetOf(2488, sde)).toBeNull();
    expect(skilledTargetOf(30000, sde)).toBeNull();
    expect(skilledTargetOf(34, sde)).toBeNull();
    expect(skilledTargetOf(999999, sde)).toBeNull();
  });
});
