import { describe, it, expect } from 'vitest';
import { exportPlanToClipboard } from '@/engine/clipboardExport';
import type { EngineSkill, PlanStep } from '@/engine/types';

function skill(typeID: number, name: string): EngineSkill {
  return { typeID, name, rank: 1, primary: 'perception', secondary: 'willpower', prereqs: [] };
}

const skills = new Map([
  [3300, skill(3300, 'Gunnery')],
  [3327, skill(3327, 'Spaceship Command')],
]);

describe('exportPlanToClipboard', () => {
  it('emits one "Skill Name <Roman>" line per step', () => {
    const steps: PlanStep[] = [
      { skillTypeID: 3327, level: 1 },
      { skillTypeID: 3327, level: 2 },
      { skillTypeID: 3300, level: 4 },
    ];
    expect(exportPlanToClipboard(steps, skills)).toBe(
      'Spaceship Command I\nSpaceship Command II\nGunnery IV',
    );
  });

  it('uses roman numerals I..V', () => {
    const steps: PlanStep[] = [1, 2, 3, 4, 5].map((level) => ({ skillTypeID: 3300, level }));
    expect(exportPlanToClipboard(steps, skills).split('\n')).toEqual([
      'Gunnery I',
      'Gunnery II',
      'Gunnery III',
      'Gunnery IV',
      'Gunnery V',
    ]);
  });

  it('returns empty string for an empty plan', () => {
    expect(exportPlanToClipboard([], skills)).toBe('');
  });

  it('throws on unknown skill typeID', () => {
    expect(() => exportPlanToClipboard([{ skillTypeID: 42, level: 1 }], skills)).toThrow(/42/);
  });

  it('throws on level outside 1..5', () => {
    expect(() => exportPlanToClipboard([{ skillTypeID: 3300, level: 0 }], skills)).toThrow(RangeError);
    expect(() => exportPlanToClipboard([{ skillTypeID: 3300, level: 6 }], skills)).toThrow(RangeError);
  });
});
