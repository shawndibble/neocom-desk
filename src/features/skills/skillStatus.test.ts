import { describe, expect, it } from 'vitest';
import { skillTrainingStatus } from './skillStatus';

describe('skillTrainingStatus', () => {
  it('is missing at level 0', () => {
    expect(skillTrainingStatus(0, 3)).toBe('missing');
  });

  it('is partial when some levels are trained but not enough', () => {
    expect(skillTrainingStatus(2, 4)).toBe('partial');
  });

  it('is trained once current meets the target', () => {
    expect(skillTrainingStatus(3, 3)).toBe('trained');
  });

  it('is trained when current exceeds the target', () => {
    expect(skillTrainingStatus(5, 2)).toBe('trained');
  });
});
