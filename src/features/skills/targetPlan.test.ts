import { describe, expect, it } from 'vitest';
import { parseTargetSkillPlans, selectTargetPlanId, withTargetPlanId } from './targetPlan';

describe('selectTargetPlanId', () => {
  it('returns null when the character has no plans', () => {
    expect(selectTargetPlanId([], 'plan-a')).toBeNull();
  });

  it('auto-selects the only plan, ignoring any stored id', () => {
    expect(selectTargetPlanId([{ id: 'plan-a' }], 'plan-b')).toBe('plan-a');
    expect(selectTargetPlanId([{ id: 'plan-a' }], undefined)).toBe('plan-a');
  });

  it('honors the stored id when it names one of several plans', () => {
    expect(selectTargetPlanId([{ id: 'plan-a' }, { id: 'plan-b' }], 'plan-b')).toBe('plan-b');
  });

  it('falls back to the first plan when the stored id names none of them (deleted, or never set)', () => {
    expect(selectTargetPlanId([{ id: 'plan-a' }, { id: 'plan-b' }], 'plan-deleted')).toBe('plan-a');
    expect(selectTargetPlanId([{ id: 'plan-a' }, { id: 'plan-b' }], undefined)).toBe('plan-a');
  });
});

describe('parseTargetSkillPlans', () => {
  it('defaults a non-object to empty', () => {
    expect(parseTargetSkillPlans(null)).toEqual({});
    expect(parseTargetSkillPlans('nope')).toEqual({});
    expect(parseTargetSkillPlans([])).toEqual({});
  });

  it('keeps a character id -> plan id string map', () => {
    expect(parseTargetSkillPlans({ 123: 'plan-a', 456: 'plan-b' })).toEqual({
      123: 'plan-a',
      456: 'plan-b',
    });
  });

  it('drops an entry whose value is not a string, keeping the rest', () => {
    expect(parseTargetSkillPlans({ 123: 456, 789: 'plan-c' })).toEqual({ 789: 'plan-c' });
  });
});

describe('withTargetPlanId', () => {
  it('sets one character entry without disturbing the others', () => {
    expect(withTargetPlanId({ 123: 'plan-a' }, 456, 'plan-b')).toEqual({
      123: 'plan-a',
      456: 'plan-b',
    });
  });

  it('overwrites an existing entry for the same character', () => {
    expect(withTargetPlanId({ 123: 'plan-a' }, 123, 'plan-b')).toEqual({ 123: 'plan-b' });
  });
});
