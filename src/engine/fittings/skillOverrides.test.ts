import { describe, expect, it } from 'vitest';
import {
  NO_SKILL_OVERRIDES,
  applySkillOverrides,
  hasSkillOverrides,
  withSkillLevel,
} from './skillOverrides';
import type { PilotProfile } from './types';

const pilot: PilotProfile = {
  skillLevels: new Map([
    [3300, 4],
    [3301, 2],
  ]),
  implantTypeIds: [19540],
  boosterTypeIds: [],
};
const ALL = [3300, 3301, 3302];

describe('applySkillOverrides', () => {
  it('leaves the pilot untouched — the same object — with nothing overridden', () => {
    expect(applySkillOverrides(pilot, NO_SKILL_OVERRIDES, ALL)).toBe(pilot);
  });

  it('starts from nothing trained for All 0, and every skill at V for All V, keeping the implants', () => {
    const none = applySkillOverrides(pilot, { base: 'all0', levels: {} }, ALL);
    expect([...none.skillLevels]).toEqual([]);
    expect(none.implantTypeIds).toEqual([19540]);

    const allV = applySkillOverrides(pilot, { base: 'allV', levels: {} }, ALL);
    expect([...allV.skillLevels]).toEqual([
      [3300, 5],
      [3301, 5],
      [3302, 5],
    ]);
  });

  it('sets single skills on top of the base, 0 untraining one', () => {
    const custom = applySkillOverrides(
      pilot,
      { base: 'character', levels: { 3301: 5, 3300: 0 } },
      ALL
    );
    expect([...custom.skillLevels]).toEqual([[3301, 5]]);
    // The Character's own map is never written to.
    expect(pilot.skillLevels.get(3300)).toBe(4);
  });

  it('clamps a level to 0-V, whole levels only', () => {
    const custom = applySkillOverrides(
      pilot,
      { base: 'all0', levels: { 3300: 9, 3301: 2.6 } },
      ALL
    );
    expect([...custom.skillLevels]).toEqual([
      [3300, 5],
      [3301, 3],
    ]);
  });
});

describe('skill override edits', () => {
  it('says whether anything differs from the Character', () => {
    expect(hasSkillOverrides(NO_SKILL_OVERRIDES)).toBe(false);
    expect(hasSkillOverrides({ base: 'allV', levels: {} })).toBe(true);
    expect(hasSkillOverrides({ base: 'character', levels: { 3300: 1 } })).toBe(true);
  });

  it('sets and clears one skill’s level', () => {
    const set = withSkillLevel(NO_SKILL_OVERRIDES, 3300, 3);
    expect(set.levels).toEqual({ 3300: 3 });
    expect(withSkillLevel(set, 3300, null).levels).toEqual({});
  });
});
