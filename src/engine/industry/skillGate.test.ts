import { describe, it, expect } from 'vitest';
import { evaluateSkillGate, type BlueprintSkillRequirement } from './skillGate';
import type { SkillLevels } from './types';

const CAPITAL_SHIP_CONSTRUCTION = 20334;
const INDUSTRY = 3380;
const MOLECULAR_ENGINEERING = 45746;

describe('evaluateSkillGate', () => {
  it('never gates a blueprint with no skill requirements', () => {
    expect(evaluateSkillGate([], new Map([[1, {}]]))).toEqual({ gated: false });
  });

  it('never gates when no character skills are loaded (unknown, not blocked)', () => {
    const requirements: BlueprintSkillRequirement[] = [{ typeID: INDUSTRY, level: 5 }];
    expect(evaluateSkillGate(requirements, new Map())).toEqual({ gated: false });
  });

  it('is not gated when one character on the account meets every requirement', () => {
    const requirements: BlueprintSkillRequirement[] = [{ typeID: INDUSTRY, level: 5 }];
    const skills: ReadonlyMap<number, SkillLevels> = new Map([
      [1, { [INDUSTRY]: 2 }],
      [2, { [INDUSTRY]: 5 }],
    ]);
    expect(evaluateSkillGate(requirements, skills)).toEqual({ gated: false });
  });

  it('gates when every loaded character falls short, naming the shortfall', () => {
    const requirements: BlueprintSkillRequirement[] = [{ typeID: INDUSTRY, level: 5 }];
    const skills: ReadonlyMap<number, SkillLevels> = new Map([[1, { [INDUSTRY]: 2 }]]);
    expect(evaluateSkillGate(requirements, skills)).toEqual({
      gated: true,
      shortfall: [{ typeID: INDUSTRY, haveLevel: 2, needLevel: 5 }],
      bestCharacterId: 1,
    });
  });

  it('treats an untrained skill as level 0 in the shortfall', () => {
    const requirements: BlueprintSkillRequirement[] = [{ typeID: MOLECULAR_ENGINEERING, level: 3 }];
    const skills: ReadonlyMap<number, SkillLevels> = new Map([[7, {}]]);
    expect(evaluateSkillGate(requirements, skills)).toEqual({
      gated: true,
      shortfall: [{ typeID: MOLECULAR_ENGINEERING, haveLevel: 0, needLevel: 3 }],
      bestCharacterId: 7,
    });
  });

  it('lists every unmet requirement for the closest character, not just one', () => {
    const requirements: BlueprintSkillRequirement[] = [
      { typeID: INDUSTRY, level: 5 },
      { typeID: MOLECULAR_ENGINEERING, level: 3 },
    ];
    const skills: ReadonlyMap<number, SkillLevels> = new Map([
      [1, { [INDUSTRY]: 2, [MOLECULAR_ENGINEERING]: 0 }],
    ]);
    expect(evaluateSkillGate(requirements, skills)).toEqual({
      gated: true,
      shortfall: [
        { typeID: INDUSTRY, haveLevel: 2, needLevel: 5 },
        { typeID: MOLECULAR_ENGINEERING, haveLevel: 0, needLevel: 3 },
      ],
      bestCharacterId: 1,
    });
  });

  it('picks the character with fewer unmet requirements as closest', () => {
    const requirements: BlueprintSkillRequirement[] = [
      { typeID: INDUSTRY, level: 5 },
      { typeID: MOLECULAR_ENGINEERING, level: 3 },
    ];
    const skills: ReadonlyMap<number, SkillLevels> = new Map([
      // Character 1: both unmet.
      [1, { [INDUSTRY]: 1, [MOLECULAR_ENGINEERING]: 0 }],
      // Character 2: only one unmet.
      [2, { [INDUSTRY]: 5, [MOLECULAR_ENGINEERING]: 1 }],
    ]);
    const result = evaluateSkillGate(requirements, skills);
    expect(result.gated).toBe(true);
    if (result.gated) {
      expect(result.bestCharacterId).toBe(2);
      expect(result.shortfall).toEqual([
        { typeID: MOLECULAR_ENGINEERING, haveLevel: 1, needLevel: 3 },
      ]);
    }
  });

  it('breaks a tied unmet-count by the smallest total level gap', () => {
    const requirements: BlueprintSkillRequirement[] = [
      { typeID: CAPITAL_SHIP_CONSTRUCTION, level: 5 },
    ];
    const skills: ReadonlyMap<number, SkillLevels> = new Map([
      [1, { [CAPITAL_SHIP_CONSTRUCTION]: 1 }], // gap 4
      [2, { [CAPITAL_SHIP_CONSTRUCTION]: 3 }], // gap 2
    ]);
    const result = evaluateSkillGate(requirements, skills);
    expect(result.gated).toBe(true);
    if (result.gated) expect(result.bestCharacterId).toBe(2);
  });

  it('breaks a full tie by the lowest character id, stably', () => {
    const requirements: BlueprintSkillRequirement[] = [{ typeID: INDUSTRY, level: 5 }];
    const skills: ReadonlyMap<number, SkillLevels> = new Map([
      [42, { [INDUSTRY]: 2 }],
      [3, { [INDUSTRY]: 2 }],
    ]);
    const result = evaluateSkillGate(requirements, skills);
    expect(result.gated).toBe(true);
    if (result.gated) expect(result.bestCharacterId).toBe(3);
  });
});
