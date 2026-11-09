import { describe, expect, it } from 'vitest';
import type { BuildGroupMember } from '@/engine/industry/groupRollup';
import type { MaterialCostLine } from '@/engine/industry/types';
import { groupMaterialConsumers } from './groupMaterialConsumers';

const TRITANIUM = 34;
const PYERITE = 35;

const line = (typeID: number, quantity: number) => ({ typeID, quantity }) as MaterialCostLine;
const member = (planId: string, lines: MaterialCostLine[]) =>
  ({ planId, planName: `Plan ${planId}`, tableMaterials: lines }) as unknown as BuildGroupMember;

describe('groupMaterialConsumers', () => {
  it('lists each plan that needs the material with its own quantity, in member order', () => {
    const consumers = groupMaterialConsumers(
      [
        member('a', [line(TRITANIUM, 100)]),
        member('b', [line(PYERITE, 5)]),
        member('c', [line(TRITANIUM, 250), line(PYERITE, 1)]),
      ],
      TRITANIUM
    );
    expect(consumers).toEqual([
      { planId: 'a', planName: 'Plan a', quantity: 100 },
      { planId: 'c', planName: 'Plan c', quantity: 250 },
    ]);
  });

  it('sums a plan whose table lists the material more than once', () => {
    const [only] = groupMaterialConsumers(
      [member('a', [line(TRITANIUM, 100), line(TRITANIUM, 20)])],
      TRITANIUM
    );
    expect(only!.quantity).toBe(120);
  });

  it('is empty when no plan needs it', () => {
    expect(groupMaterialConsumers([member('a', [line(PYERITE, 5)])], TRITANIUM)).toEqual([]);
  });
});
