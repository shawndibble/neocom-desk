import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import type { Fitting, ItemRuleBreak, RuleBreak } from '@/engine/fittings/types';
import { RuleBreakBadge } from './RuleBreakBadge';
import { RuleBreakFlags } from './ruleBreakFlags';
import { ruleBreakLine, ruleBreakLines, ruleBreakModuleKeys } from './ruleBreakText';

const t = i18n.t.bind(i18n);

const NAMES = {
  type: (typeId: number) => `Type ${typeId}`,
  group: (groupId: number) => (groupId === 60 ? 'Damage Control' : undefined),
};

const fitting: Fitting = {
  name: 'Test',
  shipTypeId: 1,
  modules: [
    { slot: 'low', slotIndex: 0, typeId: 11, state: 'online' },
    { slot: 'low', slotIndex: 1, typeId: 12, state: 'online' },
    { slot: 'high', slotIndex: 0, typeId: 21, state: 'active', chargeTypeId: 31 },
    { slot: 'rig', slotIndex: 0, typeId: 41, state: 'online' },
  ],
  drones: [],
  cargo: [],
};

describe('ruleBreakLine', () => {
  it('states a group limit in game terms', () => {
    const line = ruleBreakLine(
      t,
      fitting,
      { kind: 'max_group', groupId: 60, limit: 'fitted', used: 2, allowed: 1 },
      NAMES
    );
    expect(line).toBe('Only 1 Damage Control can be fitted (2 are).');
  });

  it('says an active limit, and falls back when the group has no name', () => {
    const rule: RuleBreak = {
      kind: 'max_group',
      groupId: 61,
      limit: 'active',
      used: 2,
      allowed: 1,
    };
    expect(ruleBreakLine(t, fitting, rule, NAMES)).toBe(
      'Only 1 of this kind of module can be active (2 are).'
    );
  });

  it('counts hardpoints with the right plural', () => {
    expect(
      ruleBreakLine(t, fitting, { kind: 'slots', slot: 'launcher', used: 3, available: 2 }, NAMES)
    ).toBe('3 launchers, 2 launcher hardpoints.');
    expect(
      ruleBreakLine(t, fitting, { kind: 'slots', slot: 'turret', used: 2, available: 1 }, NAMES)
    ).toBe('2 turrets, 1 turret hardpoint.');
  });

  it('counts a rack', () => {
    expect(
      ruleBreakLine(t, fitting, { kind: 'slots', slot: 'mid', used: 4, available: 3 }, NAMES)
    ).toBe('4 modules in 3 mid slots.');
  });

  it('names the charge that does not fit its module', () => {
    expect(ruleBreakLine(t, fitting, { kind: 'charge_group', typeId: 21 }, NAMES)).toBe(
      "Type 31 doesn't fit Type 21."
    );
  });

  it('gives every item-level rule kind its own sentence, never a raw key', () => {
    const kinds: ItemRuleBreak['kind'][] = [
      'wrong_slot',
      'slot_taken',
      'wrong_slot_index',
      'subsystem_taken',
      'rig_size',
      'ship_restricted',
      'capital_item',
      'structure_item',
      'ship_item',
      'charge_group',
      'charge_size',
    ];
    const lines = kinds.flatMap((kind) => [
      ruleBreakLine(t, fitting, { kind, typeId: 41 }, NAMES),
      ruleBreakLine(t, fitting, { kind, typeId: null }, NAMES),
    ]);
    for (const line of lines) {
      expect(line).not.toMatch(/fittings\.|\{\{/);
      expect(line.length).toBeGreaterThan(10);
    }
    expect(ruleBreakLine(t, fitting, { kind: 'rig_size', typeId: 41 }, NAMES)).toContain('Type 41');
  });

  it('drops repeated sentences', () => {
    const rule: RuleBreak = { kind: 'rig_size', typeId: 41 };
    expect(ruleBreakLines(t, fitting, [rule, rule], NAMES)).toHaveLength(1);
  });
});

describe('ruleBreakModuleKeys', () => {
  const groupOf = (typeId: number) => (typeId === 11 || typeId === 12 ? 60 : 70);
  const kindOf = (typeId: number) => (typeId === 21 ? ('launcher' as const) : null);

  it('flags both copies of an over-limit group, and nothing else', () => {
    const keys = ruleBreakModuleKeys(
      fitting,
      [{ kind: 'max_group', groupId: 60, limit: 'fitted', used: 2, allowed: 1 }],
      groupOf,
      kindOf
    );
    expect([...keys].sort()).toEqual(['low-0', 'low-1']);
  });

  it('flags the modules of a hardpoint kind, a rack, or an item rule', () => {
    expect([
      ...ruleBreakModuleKeys(
        fitting,
        [{ kind: 'slots', slot: 'launcher', used: 3, available: 2 }],
        groupOf,
        kindOf
      ),
    ]).toEqual(['high-0']);
    expect([
      ...ruleBreakModuleKeys(
        fitting,
        [{ kind: 'slots', slot: 'low', used: 3, available: 2 }],
        groupOf,
        kindOf
      ),
    ]).toEqual(['low-0', 'low-1']);
    expect([
      ...ruleBreakModuleKeys(fitting, [{ kind: 'rig_size', typeId: 41 }], groupOf, kindOf),
    ]).toEqual(['rig-0']);
  });

  it('flags nothing for a legal fit', () => {
    expect(ruleBreakModuleKeys(fitting, [], groupOf, kindOf).size).toBe(0);
  });
});

describe('RuleBreakBadge', () => {
  it('shows only on a flagged module', () => {
    render(
      <RuleBreakFlags.Provider value={new Set(['low-0'])}>
        <RuleBreakBadge module={{ slot: 'low', slotIndex: 0 }} />
        <RuleBreakBadge module={{ slot: 'low', slotIndex: 1 }} />
      </RuleBreakFlags.Provider>
    );
    expect(screen.getAllByText('Breaks a rule')).toHaveLength(1);
  });
});
