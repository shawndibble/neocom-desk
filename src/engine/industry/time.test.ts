import { describe, it, expect } from 'vitest';
import { timeModifier, jobDurationSeconds } from '@/engine/industry/time';
import { FACILITY_PRESETS, SKILL_IDS } from '@/engine/industry/types';
import type { FacilityContext, SkillLevels } from '@/engine/industry/types';

const npc: FacilityContext = {
  facility: FACILITY_PRESETS.npcStation,
  rig: 'none',
  security: 'highsec',
};
const raitaruT1Hi: FacilityContext = {
  facility: FACILITY_PRESETS.raitaru,
  rig: 't1',
  security: 'highsec',
};
const athanor: FacilityContext = {
  facility: FACILITY_PRESETS.athanor,
  rig: 'none',
  security: 'highsec',
};
const noSkills: SkillLevels = {};

describe('timeModifier', () => {
  it('is 1 with TE0, no skills, NPC station', () => {
    expect(timeModifier(0, noSkills, npc)).toBe(1);
  });

  it('applies TE as (1 - TE/100)', () => {
    expect(timeModifier(20, noSkills, npc)).toBeCloseTo(0.8, 12);
  });

  it('applies Industry at 4%/level and Advanced Industry at 3%/level', () => {
    const skills: SkillLevels = { [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 4 };
    expect(timeModifier(0, skills, npc)).toBeCloseTo(0.8 * 0.88, 12);
  });

  it('stacks TE, skills, structure and rig multiplicatively', () => {
    // 0.8 (TE20) * 0.8 (Industry V) * 0.88 (Adv IV) * 0.85 (Raitaru) * 0.8 (T1 TE rig hisec)
    const skills: SkillLevels = { [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 4 };
    expect(timeModifier(20, skills, raitaruT1Hi)).toBeCloseTo(0.8 * 0.8 * 0.88 * 0.85 * 0.8, 12);
  });

  it('scales rig time bonus by security band', () => {
    // T2 TE rig nullsec: 24% * 2.1 = 50.4% -> 0.496
    const ctx: FacilityContext = {
      facility: FACILITY_PRESETS.sotiyo,
      rig: 't2',
      security: 'nullsec',
    };
    expect(timeModifier(0, noSkills, ctx)).toBeCloseTo(0.7 * 0.496, 12);
  });

  it('ignores rigs at NPC stations', () => {
    expect(timeModifier(0, noSkills, { ...npc, rig: 't2' })).toBe(1);
  });

  it('scales reactor rig time bonus by the reaction security table, not the manufacturing one', () => {
    // Tatara T2 TE rig nullsec: 24% * 1.1 (reaction table) = 26.4% -> 0.736,
    // vs. manufacturing's 24% * 2.1 = 50.4% -> 0.496 for the same rig level.
    // Tatara also carries its own -25% structure time bonus (0.75).
    const tataraT2Null: FacilityContext = {
      facility: FACILITY_PRESETS.tatara,
      rig: 't2',
      security: 'nullsec',
    };
    expect(timeModifier(0, noSkills, tataraT2Null)).toBeCloseTo(0.75 * 0.736, 12);
  });

  it('rejects TE outside 0..20 and bad skill levels', () => {
    expect(() => timeModifier(-2, noSkills, npc)).toThrow(RangeError);
    expect(() => timeModifier(22, noSkills, npc)).toThrow(RangeError);
    expect(() => timeModifier(0, { [SKILL_IDS.industry]: 6 }, npc)).toThrow(RangeError);
  });

  it('ignores Industry and Advanced Industry under a reaction facility', () => {
    // Neither skill reduces reaction job time (issue #513); an unfitted
    // Athanor has no structure time bonus either, so the modifier is 1.
    const skills: SkillLevels = { [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 5 };
    expect(timeModifier(0, skills, athanor)).toBe(1);
  });

  it('applies Reactions at 4%/level under a reaction facility', () => {
    expect(timeModifier(0, { [SKILL_IDS.reactions]: 5 }, athanor)).toBeCloseTo(0.8, 12);
    expect(timeModifier(0, { [SKILL_IDS.reactions]: 3 }, athanor)).toBeCloseTo(0.88, 12);
  });

  it('ignores Reactions under a manufacturing facility', () => {
    expect(timeModifier(0, { [SKILL_IDS.reactions]: 5 }, npc)).toBe(1);
  });

  it('stacks Reactions with the reaction facility and reactor rig terms', () => {
    // Tatara -25% (0.75) * T2 TE rig 24% * 1.1 nullsec = 26.4% (0.736)
    // * Reactions V (0.8).
    const tataraT2Null: FacilityContext = {
      facility: FACILITY_PRESETS.tatara,
      rig: 't2',
      security: 'nullsec',
    };
    expect(timeModifier(0, { [SKILL_IDS.reactions]: 5 }, tataraT2Null)).toBeCloseTo(
      0.75 * 0.736 * 0.8,
      12
    );
  });

  it('still range-checks the skill it reads under a reaction facility', () => {
    expect(() => timeModifier(0, { [SKILL_IDS.reactions]: 6 }, athanor)).toThrow(RangeError);
  });
});

describe('jobDurationSeconds', () => {
  it('scales linearly with runs', () => {
    expect(jobDurationSeconds(600, 1, 0, noSkills, npc)).toBe(600);
    expect(jobDurationSeconds(600, 10, 0, noSkills, npc)).toBe(6000);
  });

  it('matches the hand-computed full-stack example', () => {
    const skills: SkillLevels = { [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 4 };
    // 600 * 10 * 0.8 * 0.8 * 0.88 * 0.85 * 0.8 = 2297.856
    expect(jobDurationSeconds(600, 10, 20, skills, raitaruT1Hi)).toBeCloseTo(2297.856, 6);
  });

  it('rejects invalid runs', () => {
    expect(() => jobDurationSeconds(600, 0, 0, noSkills, npc)).toThrow(RangeError);
  });
});
