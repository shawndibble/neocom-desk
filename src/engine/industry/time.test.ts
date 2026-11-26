import { describe, it, expect } from 'vitest';
import { timeModifier, jobDurationSeconds } from '@/engine/industry/time';
import { FACILITY_PRESETS, SKILL_IDS } from '@/engine/industry/types';
import type { FacilityContext, SkillLevels } from '@/engine/industry/types';
import { characterModifiers, NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';

const npc: FacilityContext = {
  facility: FACILITY_PRESETS.npcStation,
  rigFit: ['none', 'none', 'none'],
  security: 'highsec',
};
const raitaruT1Hi: FacilityContext = {
  facility: FACILITY_PRESETS.raitaru,
  rigFit: ['teT1', 'none', 'none'],
  security: 'highsec',
};
const athanor: FacilityContext = {
  facility: FACILITY_PRESETS.athanor,
  rigFit: ['none', 'none', 'none'],
  security: 'highsec',
};
const none = NO_CHARACTER_MODIFIERS;
const BX_804 = 27171;
function mods(skills: SkillLevels, implantTypeIds: number[] = []) {
  return characterModifiers({ skills, implantTypeIds });
}
const industryVAdvIV = mods({ [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 4 });

describe('timeModifier', () => {
  it('is 1 with TE0, no skills, NPC station', () => {
    expect(timeModifier(0, none, npc)).toBe(1);
  });

  it('applies TE as (1 - TE/100)', () => {
    expect(timeModifier(20, none, npc)).toBeCloseTo(0.8, 12);
  });

  it('stacks TE, skills, structure and rig multiplicatively', () => {
    expect(timeModifier(20, industryVAdvIV, raitaruT1Hi)).toBeCloseTo(
      0.8 * 0.8 * 0.88 * 0.85 * 0.8,
      12
    );
  });

  it('stacks the implant bonus with skills and facility/rig terms (issue #1229)', () => {
    const m = mods({ [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 4 }, [BX_804]);
    expect(timeModifier(20, m, raitaruT1Hi)).toBeCloseTo(0.8 * 0.8 * 0.88 * 0.85 * 0.8 * 0.96, 12);
  });

  it('scales rig time bonus by security band', () => {
    const ctx: FacilityContext = {
      facility: FACILITY_PRESETS.sotiyo,
      rigFit: ['teT2', 'none', 'none'],
      security: 'nullsec',
    };
    expect(timeModifier(0, none, ctx)).toBeCloseTo(0.7 * 0.496, 12);
  });

  it('ignores rigs at NPC stations', () => {
    expect(timeModifier(0, none, { ...npc, rigFit: ['teT2', 'none', 'none'] })).toBe(1);
  });

  it('an ME-only rig fit contributes nothing to the time bonus', () => {
    const meOnly: FacilityContext = {
      facility: FACILITY_PRESETS.raitaru,
      rigFit: ['meT2', 'none', 'none'],
      security: 'highsec',
    };
    expect(timeModifier(0, none, meOnly)).toBeCloseTo(0.85, 12);
  });

  it('scales reactor rig time bonus by the reaction security table, not the manufacturing one', () => {
    const tataraT2Null: FacilityContext = {
      facility: FACILITY_PRESETS.tatara,
      rigFit: ['teT2', 'none', 'none'],
      security: 'nullsec',
    };
    expect(timeModifier(0, none, tataraT2Null)).toBeCloseTo(0.75 * 0.736, 12);
  });

  it('scopes the Character share by the facility activity', () => {
    const m = mods({ [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 5 }, [BX_804]);
    expect(timeModifier(0, m, athanor)).toBe(1);
    expect(timeModifier(0, mods({ [SKILL_IDS.reactions]: 5 }), athanor)).toBeCloseTo(0.8, 12);
    expect(timeModifier(0, mods({ [SKILL_IDS.reactions]: 5 }), npc)).toBe(1);
  });

  it('stacks Reactions with the reaction facility and reactor rig terms', () => {
    const tataraT2Null: FacilityContext = {
      facility: FACILITY_PRESETS.tatara,
      rigFit: ['teT2', 'none', 'none'],
      security: 'nullsec',
    };
    expect(timeModifier(0, mods({ [SKILL_IDS.reactions]: 5 }), tataraT2Null)).toBeCloseTo(
      0.75 * 0.736 * 0.8,
      12
    );
  });

  it('forwards blueprintSkills to the Character share (issue #1228)', () => {
    const m = mods({ 11452: 4, 11453: 3 });
    const blueprintSkills = [
      { typeID: 11452, level: 1 },
      { typeID: 11453, level: 1 },
    ];
    expect(timeModifier(0, m, npc, blueprintSkills)).toBeCloseTo(0.96 * 0.97, 12);
  });

  it('rejects TE outside 0..20 and bad skill levels', () => {
    expect(() => timeModifier(-2, none, npc)).toThrow(RangeError);
    expect(() => timeModifier(22, none, npc)).toThrow(RangeError);
    expect(() => timeModifier(0, mods({ [SKILL_IDS.industry]: 6 }), npc)).toThrow(RangeError);
  });
});

describe('jobDurationSeconds', () => {
  it('scales linearly with runs', () => {
    expect(jobDurationSeconds(600, 1, 0, none, npc)).toBe(600);
    expect(jobDurationSeconds(600, 10, 0, none, npc)).toBe(6000);
  });

  it('matches the hand-computed full-stack example', () => {
    expect(jobDurationSeconds(600, 10, 20, industryVAdvIV, raitaruT1Hi)).toBeCloseTo(2297.856, 6);
  });

  it('rejects invalid runs', () => {
    expect(() => jobDurationSeconds(600, 0, 0, none, npc)).toThrow(RangeError);
  });

  it('applies qualifying blueprint science skills (issue #1228)', () => {
    const blueprintSkills = [{ typeID: 11452, level: 1 }];
    expect(jobDurationSeconds(600, 10, 0, mods({ 11452: 4 }), npc, blueprintSkills)).toBeCloseTo(
      5760,
      6
    );
  });

  it('applies a BX-80x manufacturing implant bonus (issue #1229)', () => {
    expect(jobDurationSeconds(600, 10, 0, mods({}, [BX_804]), npc)).toBeCloseTo(5760, 6);
  });
});
