import { describe, expect, it } from 'vitest';
import type { Fit, Violation } from '@eveshipfit/dogma-engine';
import { ruleBreaksOf } from './dogmaFittingEngine';

const fit = {
  ship: { type_id: 1 },
  items: [
    { type_id: 11, slot: { type: 'high', index: 0 }, state: 'online' },
    { type_id: 22, slot: { type: 'rig', index: 0 }, state: 'online' },
  ],
  character: { skills: new Map() },
} as unknown as Fit;

describe('ruleBreaksOf', () => {
  it('leaves out skills and resources', () => {
    const violations: Violation[] = [
      {
        target: { type: 'item', index: 0 },
        rule: { type: 'skill', type_id: 3, required: 4, level: 1 },
      },
      {
        target: { type: 'ship' },
        rule: { type: 'resource', resource: 'cpu', used: 9, available: 5 },
      },
    ];
    expect(ruleBreaksOf(fit, violations)).toEqual([]);
    expect(ruleBreaksOf(fit, undefined)).toEqual([]);
  });

  it('maps the counted rules', () => {
    const violations: Violation[] = [
      {
        target: { type: 'item', index: 0 },
        rule: { type: 'max_group', group_id: 60, limit: 'online', used: 2, allowed: 1 },
      },
      {
        target: { type: 'item', index: 0 },
        rule: { type: 'max_type', type_id: 11, used: 3, allowed: 2 },
      },
      { target: { type: 'ship' }, rule: { type: 'slots', slot: 'turret', used: 3, available: 2 } },
    ];
    expect(ruleBreaksOf(fit, violations)).toEqual([
      { kind: 'max_group', groupId: 60, limit: 'online', used: 2, allowed: 1 },
      { kind: 'max_type', typeId: 11, used: 3, allowed: 2 },
      { kind: 'slots', slot: 'turret', used: 3, available: 2 },
    ]);
  });

  it('names the fitted type for an item-level rule, none for the ship', () => {
    const violations: Violation[] = [
      { target: { type: 'item', index: 1 }, rule: { type: 'rig_size', ship: 2, item: 3 } },
      { target: { type: 'ship' }, rule: { type: 'ship_restricted' } },
    ];
    expect(ruleBreaksOf(fit, violations)).toEqual([
      { kind: 'rig_size', typeId: 22 },
      { kind: 'ship_restricted', typeId: null },
    ]);
  });
});
