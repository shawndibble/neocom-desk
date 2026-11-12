import { describe, expect, it } from 'vitest';
import {
  parseVettingDecide,
  parseVettingHandle,
  parseVettingRequest,
  parseVettingSettingsPatch,
  parseVettingStart,
  parseVettingSubmit,
} from './vettingParse.js';

const handle = { corporationId: 98000001, reviewId: 'r'.repeat(22), key: 'k'.repeat(43) };

describe('vetting input parsing', () => {
  it('reads a handle and refuses a malformed one', () => {
    expect(parseVettingHandle(handle)).toEqual(handle);
    expect(() => parseVettingHandle({ ...handle, reviewId: 'a/b/c/d/e/f/g' })).toThrow();
    expect(() => parseVettingHandle({ ...handle, key: 'short' })).toThrow();
    expect(() => parseVettingHandle({ ...handle, corporationId: '98000001' })).toThrow();
    expect(() => parseVettingHandle(null)).toThrow();
  });

  it('needs a token to start', () => {
    expect(parseVettingStart({ corporationId: 98000001, accessToken: 'tok' })).toEqual({
      corporationId: 98000001,
      accessToken: 'tok',
    });
    expect(() => parseVettingStart({ corporationId: 98000001 })).toThrow();
  });

  it('trims a note, takes none as empty, and refuses one over the limit', () => {
    expect(parseVettingSubmit({ ...handle, note: '  hello ' }).note).toBe('hello');
    expect(parseVettingSubmit(handle).note).toBe('');
    expect(() => parseVettingSubmit({ ...handle, note: 'x'.repeat(1001) })).toThrow();
    expect(() => parseVettingSubmit({ ...handle, note: 5 })).toThrow();
  });

  it('takes only yes or no as a decision', () => {
    expect(parseVettingDecide({ reviewId: handle.reviewId, decision: 'yes', note: 'ok' })).toEqual({
      reviewId: handle.reviewId,
      decision: 'yes',
      note: 'ok',
    });
    expect(() => parseVettingDecide({ reviewId: handle.reviewId, decision: 'maybe' })).toThrow();
  });

  it('trims the role of a request and caps it at 40 characters', () => {
    expect(parseVettingRequest({ memberName: ' Some Pilot ', role: ' Director ' })).toEqual({
      memberName: 'Some Pilot',
      role: 'Director',
    });
    expect(() => parseVettingRequest({ memberName: 'Some Pilot', role: 'x'.repeat(41) })).toThrow();
    expect(() => parseVettingRequest({ memberName: ' ', role: 'x' })).toThrow();
  });

  it('clamps sign-offs to 1-3 and dedupes names', () => {
    expect(
      parseVettingSettingsPatch({
        patch: {
          on: true,
          signOffs: { application: 0, promotion: 9 },
          removeWatch: [99000001],
          addWatchNames: ['Bad Corp', ' Bad Corp ', 'Worse Alliance'],
        },
      })
    ).toEqual({
      on: true,
      signOffs: { application: 1, promotion: 3 },
      removeWatch: [99000001],
      addWatchNames: ['Bad Corp', 'Worse Alliance'],
    });
    expect(parseVettingSettingsPatch({ patch: {} })).toEqual({
      removeWatch: [],
      addWatchNames: [],
    });
  });

  it('refuses a malformed patch', () => {
    expect(() => parseVettingSettingsPatch({})).toThrow();
    expect(() => parseVettingSettingsPatch({ patch: { on: 'yes' } })).toThrow();
    expect(() => parseVettingSettingsPatch({ patch: { signOffs: { application: 1 } } })).toThrow();
    expect(() => parseVettingSettingsPatch({ patch: { removeWatch: ['x'] } })).toThrow();
    expect(() =>
      parseVettingSettingsPatch({ patch: { addWatchNames: Array(51).fill('a') } })
    ).toThrow();
  });
});
