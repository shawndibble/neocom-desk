import { describe, it, expect } from 'vitest';
import { openingQuestion, pickedQuestion, PLAN_QUESTIONS, planQuestionParam } from './planQuestion';

describe('openingQuestion', () => {
  it('opens on the first question when the pilot has colonies', () => {
    expect(openingQuestion({ goalCount: 0, colonyCount: 3 })).toEqual({
      question: 'make-more',
      reason: 'colonies',
    });
  });
  it('opens on the second when there are none', () => {
    expect(openingQuestion({ goalCount: 0, colonyCount: 0 })).toEqual({
      question: 'find-best',
      reason: 'no-colonies',
    });
  });
  it('a link that names a product opens the Goal Planner, colonies or not', () => {
    expect(openingQuestion({ goalCount: 1, colonyCount: 4 }).question).toBe('product');
    expect(openingQuestion({ goalCount: 2, colonyCount: 0 }).question).toBe('product');
  });
});

describe('pickedQuestion', () => {
  it('is the URL question when there is no hash', () => {
    expect(pickedQuestion('make-more', '')).toBe('make-more');
    expect(pickedQuestion(null, '')).toBeNull();
  });
  it('#customs opens the Goal Planner over any URL question', () => {
    expect(pickedQuestion(null, '#customs')).toBe('product');
    expect(pickedQuestion('make-more', '#customs')).toBe('product');
  });
});

describe('planQuestionParam (?q=)', () => {
  it('round-trips every question', () => {
    for (const question of PLAN_QUESTIONS) {
      const raw = planQuestionParam.serialize(question);
      expect(raw).toBe(question);
      expect(planQuestionParam.parse(raw)).toBe(question);
    }
  });
  it('absent means no pick; the opening question applies', () => {
    expect(planQuestionParam.parse(null)).toBeNull();
    expect(planQuestionParam.serialize(null)).toBeNull();
  });
  it('reads junk as no pick', () => {
    expect(planQuestionParam.parse('nope')).toBeNull();
    expect(planQuestionParam.parse('')).toBeNull();
    expect(planQuestionParam.parse('MAKE-MORE')).toBeNull();
  });
});
