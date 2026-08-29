import { describe, it, expect } from 'vitest';
import { parseSkillPlanPaste } from '@/engine/import/skillPlanPaste';
import { exportPlanToClipboard } from '@/engine/clipboardExport';
import type { EngineSkill, PlanStep } from '@/engine/types';

const CATALOG = new Map([
  ['gunnery', { typeID: 3300 }],
  ['spaceship command', { typeID: 3327 }],
  ['caldari frigate', { typeID: 3335 }],
]);

describe('parseSkillPlanPaste', () => {
  it('parses "Skill Name <Roman>" lines', () => {
    const result = parseSkillPlanPaste('Gunnery IV\nSpaceship Command I', CATALOG);
    expect(result.entries).toEqual([
      { skillTypeID: 3300, targetLevel: 4 },
      { skillTypeID: 3327, targetLevel: 1 },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('parses "Skill Name <arabic>" lines (EVEMon/EveLens variant)', () => {
    const result = parseSkillPlanPaste('Gunnery 4\nSpaceship Command 1', CATALOG);
    expect(result.entries).toEqual([
      { skillTypeID: 3300, targetLevel: 4 },
      { skillTypeID: 3327, targetLevel: 1 },
    ]);
  });

  it('tolerates trailing SP counts in parentheses', () => {
    const result = parseSkillPlanPaste('Gunnery IV (1,256,000 sp)', CATALOG);
    expect(result.entries).toEqual([{ skillTypeID: 3300, targetLevel: 4 }]);
  });

  it('tolerates blank lines', () => {
    const result = parseSkillPlanPaste('Gunnery IV\n\n\nSpaceship Command I\n', CATALOG);
    expect(result.entries).toEqual([
      { skillTypeID: 3300, targetLevel: 4 },
      { skillTypeID: 3327, targetLevel: 1 },
    ]);
  });

  it('tolerates bullet chars', () => {
    const result = parseSkillPlanPaste(
      '- Gunnery IV\n* Spaceship Command I\n• Caldari Frigate II',
      CATALOG
    );
    expect(result.entries).toEqual([
      { skillTypeID: 3300, targetLevel: 4 },
      { skillTypeID: 3327, targetLevel: 1 },
      { skillTypeID: 3335, targetLevel: 2 },
    ]);
  });

  it('tolerates Windows line endings (CRLF)', () => {
    const result = parseSkillPlanPaste('Gunnery IV\r\nSpaceship Command I\r\n', CATALOG);
    expect(result.entries).toEqual([
      { skillTypeID: 3300, targetLevel: 4 },
      { skillTypeID: 3327, targetLevel: 1 },
    ]);
  });

  it('is case-insensitive on skill name lookup', () => {
    const result = parseSkillPlanPaste('gunnery iv', CATALOG);
    expect(result.entries).toEqual([{ skillTypeID: 3300, targetLevel: 4 }]);
  });

  it('reports an error for unknown skill names instead of throwing', () => {
    const result = parseSkillPlanPaste('Not A Real Skill IV', CATALOG);
    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([
      { line: 1, text: 'Not A Real Skill IV', reason: 'unknown skill: Not A Real Skill' },
    ]);
  });

  it('reports an error for lines with no recognizable level', () => {
    const result = parseSkillPlanPaste('Gunnery', CATALOG);
    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([
      {
        line: 1,
        text: 'Gunnery',
        reason: 'no skill level found (expected roman numeral I-V or 1-5)',
      },
    ]);
  });

  it('reports an error for arabic levels outside 1..5', () => {
    const result = parseSkillPlanPaste('Gunnery 9', CATALOG);
    expect(result.errors).toEqual([
      { line: 1, text: 'Gunnery 9', reason: 'level out of range 1..5: 9' },
    ]);
  });

  it('keeps the highest level when a skill line is duplicated', () => {
    const result = parseSkillPlanPaste('Gunnery I\nGunnery IV\nGunnery II', CATALOG);
    expect(result.entries).toEqual([{ skillTypeID: 3300, targetLevel: 4 }]);
  });

  it('handles an empty paste', () => {
    const result = parseSkillPlanPaste('', CATALOG);
    expect(result).toEqual({ entries: [], errors: [] });
  });

  it('handles garbage text: all errors, no throw', () => {
    expect(() => parseSkillPlanPaste('asdf;;;\n####\n1234', CATALOG)).not.toThrow();
    const result = parseSkillPlanPaste('asdf;;;\n####\n1234', CATALOG);
    expect(result.entries).toEqual([]);
    expect(result.errors).toHaveLength(3);
  });

  it('round-trips with exportPlanToClipboard output', () => {
    const skills = new Map<number, EngineSkill>([
      [
        3300,
        {
          typeID: 3300,
          name: 'Gunnery',
          rank: 1,
          primary: 'perception',
          secondary: 'willpower',
          prereqs: [],
        },
      ],
      [
        3327,
        {
          typeID: 3327,
          name: 'Spaceship Command',
          rank: 1,
          primary: 'perception',
          secondary: 'willpower',
          prereqs: [],
        },
      ],
    ]);
    const steps: PlanStep[] = [
      { skillTypeID: 3327, level: 1 },
      { skillTypeID: 3327, level: 2 },
      { skillTypeID: 3300, level: 1 },
      { skillTypeID: 3300, level: 2 },
      { skillTypeID: 3300, level: 3 },
      { skillTypeID: 3300, level: 4 },
    ];
    const pasted = exportPlanToClipboard(steps, skills);
    const result = parseSkillPlanPaste(pasted, CATALOG);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      { skillTypeID: 3327, targetLevel: 2 },
      { skillTypeID: 3300, targetLevel: 4 },
    ]);
  });
});
