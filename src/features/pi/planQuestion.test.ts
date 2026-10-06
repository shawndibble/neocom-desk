import { describe, it, expect } from 'vitest';
import { openingQuestion, pickedQuestion } from './planQuestion';

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
  const pick = { question: 'make-more' as const, key: 'k1' };
  it('keeps a pick when there is no hash, whatever the key', () => {
    expect(pickedQuestion(pick, '', 'k2')).toBe('make-more');
    expect(pickedQuestion(null, '', 'k1')).toBeNull();
  });
  it('#customs opens the Goal Planner', () => {
    expect(pickedQuestion(null, '#customs', 'k1')).toBe('product');
  });
  it('a pick made on this #customs visit wins; one from an earlier visit does not', () => {
    expect(pickedQuestion(pick, '#customs', 'k1')).toBe('make-more');
    expect(pickedQuestion(pick, '#customs', 'k2')).toBe('product');
  });
});
