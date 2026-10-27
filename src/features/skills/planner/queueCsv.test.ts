import { describe, it, expect } from 'vitest';
import { queueCsvColumns } from './queueCsv';
import { toCsv } from '@/lib/csv';
import type { ScheduledStep } from '@/engine/types';

const identityT = (k: string) => k;
const nameFor = (skillTypeID: number) => `Skill #${skillTypeID}`;

const steps: ScheduledStep[] = [
  { skillTypeID: 1, level: 4, sp: 256000, seconds: 3600, cumulativeSeconds: 3600 },
  { skillTypeID: 2, level: 1, sp: 250, seconds: 300, cumulativeSeconds: 3900 },
];

describe('queueCsvColumns', () => {
  it('uses the five csv i18n keys, in order, as headers', () => {
    const columns = queueCsvColumns(identityT, nameFor, new Set());
    expect(columns.map((c) => c.header)).toEqual([
      'plans.csvSkill',
      'plans.csvLevel',
      'plans.csvSeconds',
      'plans.csvCumulativeSeconds',
      'plans.csvPrereq',
    ]);
  });

  it('uses nameFor for the skill name column', () => {
    const columns = queueCsvColumns(identityT, nameFor, new Set());
    expect(columns[0].value(steps[0])).toBe('Skill #1');
  });

  it('emits level as a raw integer, not a roman numeral', () => {
    const columns = queueCsvColumns(identityT, nameFor, new Set());
    expect(columns[1].value(steps[0])).toBe(4);
  });

  it('emits seconds and cumulativeSeconds as raw numbers, not formatDuration output', () => {
    const columns = queueCsvColumns(identityT, nameFor, new Set());
    expect(columns[2].value(steps[0])).toBe(3600);
    expect(columns[3].value(steps[0])).toBe(3600);
    expect(columns[3].value(steps[1])).toBe(3900);
    expect(typeof columns[2].value(steps[0])).toBe('number');
    expect(typeof columns[3].value(steps[0])).toBe('number');
  });

  it('marks a step absent from userSkillTypeIDs as a prerequisite (yes)', () => {
    const columns = queueCsvColumns(identityT, nameFor, new Set());
    expect(columns[4].value(steps[0])).toBe('plans.csvYes');
  });

  it('marks a step present in userSkillTypeIDs as not a prerequisite (no)', () => {
    const columns = queueCsvColumns(identityT, nameFor, new Set([1]));
    expect(columns[4].value(steps[0])).toBe('plans.csvNo');
  });

  it('produces raw numeric cells in the rendered CSV, not localized strings', () => {
    const columns = queueCsvColumns(identityT, nameFor, new Set([1]));
    const csv = toCsv(steps, columns);
    expect(csv).toContain('3600');
    expect(csv).not.toContain('3,600');
  });
});
