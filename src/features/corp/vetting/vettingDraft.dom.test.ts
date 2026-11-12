import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearVettingDraft,
  isBlankVettingDraft,
  parseVettingDraft,
  readVettingDraft,
  writeVettingDraft,
  type VettingDraft,
} from './vettingDraft';

const draft: VettingDraft = {
  answers: { q1: 'EU, most evenings.', q2: '' },
  note: 'Flew with Ilse.',
  allMine: true,
};

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('parseVettingDraft', () => {
  it('reads back what was stored', () => {
    expect(parseVettingDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it('is null for nothing, for text that is not JSON, and for another shape', () => {
    expect(parseVettingDraft(null)).toBeNull();
    expect(parseVettingDraft('{')).toBeNull();
    expect(parseVettingDraft('[]')).toBeNull();
    expect(parseVettingDraft(JSON.stringify({ ...draft, note: 4 }))).toBeNull();
    expect(parseVettingDraft(JSON.stringify({ ...draft, allMine: 'yes' }))).toBeNull();
    expect(parseVettingDraft(JSON.stringify({ note: '', allMine: false }))).toBeNull();
  });

  it('drops an answer that is not text and keeps the rest', () => {
    expect(
      parseVettingDraft(JSON.stringify({ ...draft, answers: { q1: 'Yes', q2: 7, q3: null } }))
    ).toEqual({ ...draft, answers: { q1: 'Yes' } });
  });
});

describe('isBlankVettingDraft', () => {
  it('is blank only with no tick, no note and no answer typed', () => {
    expect(isBlankVettingDraft({ answers: { q1: '' }, note: '', allMine: false })).toBe(true);
    expect(isBlankVettingDraft({ answers: {}, note: '', allMine: true })).toBe(false);
    expect(isBlankVettingDraft({ answers: {}, note: 'x', allMine: false })).toBe(false);
    expect(isBlankVettingDraft({ answers: { q1: 'x' }, note: '', allMine: false })).toBe(false);
  });
});

describe('the stored draft', () => {
  it('is kept per review, for this tab only, and forgotten when cleared', () => {
    writeVettingDraft('v-1', draft);
    expect(readVettingDraft('v-1')).toEqual(draft);
    expect(readVettingDraft('v-2')).toBeNull();
    expect(JSON.stringify({ ...localStorage })).not.toContain('Flew with Ilse');
    clearVettingDraft('v-1');
    expect(readVettingDraft('v-1')).toBeNull();
  });

  it('stores nothing for a blank draft, and forgets an earlier one', () => {
    writeVettingDraft('v-1', draft);
    writeVettingDraft('v-1', { answers: {}, note: '', allMine: false });
    expect(sessionStorage.length).toBe(0);
  });

  it('never throws when storage is refused', () => {
    const refuse = () => {
      throw new Error('denied');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse);
    expect(() => writeVettingDraft('v-1', draft)).not.toThrow();
    expect(readVettingDraft('v-1')).toBeNull();
    expect(() => clearVettingDraft('v-1')).not.toThrow();
  });
});
