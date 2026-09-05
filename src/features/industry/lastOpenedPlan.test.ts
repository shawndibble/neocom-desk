import { describe, it, expect } from 'vitest';
import {
  parseLastOpenedPlan,
  lastOpenedPlanFor,
  withLastOpenedPlan,
  type LastOpenedPlanValue,
} from './lastOpenedPlan';

describe('lastOpenedPlan', () => {
  it('remembers one plan per character', () => {
    const value = withLastOpenedPlan(withLastOpenedPlan({}, 91, 'plan-a'), 92, 'plan-b');

    expect(lastOpenedPlanFor(value, 91)).toBe('plan-a');
    expect(lastOpenedPlanFor(value, 92)).toBe('plan-b');
  });

  it('replaces only the character being written, never the others', () => {
    const before: LastOpenedPlanValue = { 91: 'plan-a', 92: 'plan-b' };

    expect(withLastOpenedPlan(before, 91, 'plan-c')).toEqual({ 91: 'plan-c', 92: 'plan-b' });
  });

  it('has no memory for a character that has not opened a plan', () => {
    expect(lastOpenedPlanFor({ 91: 'plan-a' }, 92)).toBeNull();
  });

  it('keeps the readable entries of a damaged row and drops only the rest', () => {
    expect(parseLastOpenedPlan({ 91: 'plan-a', 92: 7, notANumber: 'plan-c' })).toEqual({
      91: 'plan-a',
    });
  });

  it('falls back to no memory at all when the stored value is not a map', () => {
    expect(parseLastOpenedPlan(['plan-a'])).toBeNull();
    expect(parseLastOpenedPlan('plan-a')).toBeNull();
  });
});
