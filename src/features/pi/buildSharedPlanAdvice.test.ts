import { describe, expect, it } from 'vitest';
import { buildPlanAdvice, buildSharedPlanAdvice } from './planAdviceModel';
import { adviceInput } from './map/mapFixtures.testutil';

describe('buildSharedPlanAdvice', () => {
  it('answers like the model and runs it once per input object', () => {
    const input = adviceInput('lean');
    const first = buildSharedPlanAdvice(input);
    expect(buildSharedPlanAdvice(input)).toBe(first);
    expect(first).toEqual(buildPlanAdvice(input));
  });

  it('runs again for another input, even an equal one', () => {
    const a = buildSharedPlanAdvice(adviceInput('lean'));
    const b = buildSharedPlanAdvice(adviceInput('lean'));
    expect(b).not.toBe(a);
  });

  it('remembers a throw and rethrows it', () => {
    const bad = { ...adviceInput('lean'), snapshot: null } as never;
    expect(() => buildSharedPlanAdvice(bad)).toThrow();
    expect(() => buildSharedPlanAdvice(bad)).toThrow();
  });
});
