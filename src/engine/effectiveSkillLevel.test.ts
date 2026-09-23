import { describe, expect, it } from 'vitest';
import { effectiveSkillLevel } from './effectiveSkillLevel';

describe('effectiveSkillLevel', () => {
  it('picks the trained level when a just-finished queue entry has raised both trained and active', () => {
    // A queue entry completing raises both the corrected trained level and
    // the corrected active level together, so once both read 5 there is no
    // cap to apply.
    expect(effectiveSkillLevel(5, 5)).toBe(5);
  });

  it('picks the active level when it reads below trained (alpha cap or lapsed omega)', () => {
    expect(effectiveSkillLevel(5, 3)).toBe(3);
  });

  it('is symmetric: whichever argument is lower wins', () => {
    expect(effectiveSkillLevel(2, 4)).toBe(2);
  });

  it('handles untrained skills', () => {
    expect(effectiveSkillLevel(0, 0)).toBe(0);
  });
});
