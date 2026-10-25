import { describe, expect, it } from 'vitest';
import { newRuleBreaks } from './ruleBreaks';
import type { RuleBreak } from './types';

const damageControls = (used: number): RuleBreak => ({
  kind: 'max_group',
  groupId: 60,
  limit: 'fitted',
  used,
  allowed: 1,
});
const hardpoints = (used: number): RuleBreak => ({
  kind: 'slots',
  slot: 'turret',
  used,
  available: 2,
});
const wrongSlot = (typeId: number): RuleBreak => ({ kind: 'wrong_slot', typeId });

describe('newRuleBreaks', () => {
  it('is empty when the after-fit breaks nothing', () => {
    expect(newRuleBreaks([damageControls(2)], [])).toEqual([]);
  });

  it('lists a break the before-fit did not have', () => {
    expect(newRuleBreaks([], [damageControls(2)])).toEqual([damageControls(2)]);
  });

  it('ignores a break the before-fit already had', () => {
    expect(newRuleBreaks([damageControls(2)], [damageControls(2)])).toEqual([]);
    expect(newRuleBreaks([wrongSlot(5)], [wrongSlot(5)])).toEqual([]);
  });

  it('counts a limit that is passed further as new', () => {
    expect(newRuleBreaks([hardpoints(3)], [hardpoints(4)])).toEqual([hardpoints(4)]);
  });

  it('does not count a limit that is passed less as new', () => {
    expect(newRuleBreaks([hardpoints(4)], [hardpoints(3)])).toEqual([]);
  });

  it('tells two items that break the same rule apart', () => {
    expect(newRuleBreaks([wrongSlot(5)], [wrongSlot(5), wrongSlot(6)])).toEqual([wrongSlot(6)]);
  });

  it('tells two group limits apart', () => {
    const other: RuleBreak = {
      kind: 'max_group',
      groupId: 330,
      limit: 'fitted',
      used: 2,
      allowed: 1,
    };
    expect(newRuleBreaks([damageControls(2)], [damageControls(2), other])).toEqual([other]);
  });
});
