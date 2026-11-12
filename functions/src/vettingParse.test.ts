import { describe, expect, it } from 'vitest';
import {
  parseVettingCorp,
  parseVettingDecide,
  parseVettingHandle,
  parseVettingInviteCode,
  parseVettingInviteLabel,
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

  it('takes an invite code with the corp and the start, and none as none', () => {
    expect(parseVettingCorp({ corporationId: 98000001 })).toEqual({ corporationId: 98000001 });
    expect(parseVettingCorp({ corporationId: 98000001, invite: 'abcDEF123_-x' })).toEqual({
      corporationId: 98000001,
      invite: 'abcDEF123_-x',
    });
    expect(parseVettingCorp({ corporationId: 98000001, invite: '' })).toEqual({
      corporationId: 98000001,
    });
    expect(
      parseVettingStart({ corporationId: 98000001, accessToken: 'tok', invite: 'abcDEF123_-x' })
    ).toEqual({ corporationId: 98000001, accessToken: 'tok', invite: 'abcDEF123_-x' });
    expect(() => parseVettingCorp({ corporationId: 98000001, invite: 5 })).toThrow();
    expect(() => parseVettingCorp({ corporationId: 98000001, invite: 'x'.repeat(65) })).toThrow();
  });

  it('takes answers with a submit: at most 8, none over 500 characters', () => {
    expect(parseVettingSubmit(handle).answers).toEqual([]);
    expect(
      parseVettingSubmit({ ...handle, answers: [{ questionId: 'q1', answer: '  yes ' }] }).answers
    ).toEqual([{ questionId: 'q1', answer: 'yes' }]);
    const answer = (text: string) => ({ questionId: 'q1', answer: text });
    expect(
      parseVettingSubmit({ ...handle, answers: [answer('x'.repeat(500))] }).answers
    ).toHaveLength(1);
    expect(() => parseVettingSubmit({ ...handle, answers: [answer('x'.repeat(501))] })).toThrow();
    expect(() => parseVettingSubmit({ ...handle, answers: Array(9).fill(answer('a')) })).toThrow();
    expect(() =>
      parseVettingSubmit({ ...handle, answers: [{ questionId: 5, answer: 'a' }] })
    ).toThrow();
    expect(() =>
      parseVettingSubmit({ ...handle, answers: [{ questionId: 'q1', answer: 5 }] })
    ).toThrow();
    expect(() => parseVettingSubmit({ ...handle, answers: 'no' })).toThrow();
  });

  it('trims an invite label to 1-40 characters and takes a 12-character code', () => {
    expect(parseVettingInviteLabel({ label: '  Reddit post ' })).toEqual({ label: 'Reddit post' });
    expect(() => parseVettingInviteLabel({ label: ' ' })).toThrow();
    expect(() => parseVettingInviteLabel({ label: 'x'.repeat(41) })).toThrow();
    expect(() => parseVettingInviteLabel({})).toThrow();
    expect(parseVettingInviteCode({ code: 'abcDEF123_-x' })).toEqual({ code: 'abcDEF123_-x' });
    expect(() => parseVettingInviteCode({ code: 'short' })).toThrow();
    expect(() => parseVettingInviteCode({ code: 'abcDEF123_/x' })).toThrow();
  });

  it('reads the new settings of a patch', () => {
    expect(
      parseVettingSettingsPatch({
        patch: {
          welcome: '  Hello ',
          contact: ' Ask Bob ',
          questions: [
            { id: 'q1', label: ' Why us? ', required: true },
            { label: 'Timezone?', required: false },
            { label: 'Anything else?' },
          ],
          minimums: { ageDays: 30, skillPoints: 5_000_000, characters: 2 },
          rejection: { wording: 'notNow', showReason: true },
          inviteOnly: true,
          notifyReviewers: false,
          mailDecision: false,
        },
      })
    ).toEqual({
      removeWatch: [],
      addWatchNames: [],
      welcome: 'Hello',
      contact: 'Ask Bob',
      questions: [
        { id: 'q1', label: 'Why us?', required: true },
        { label: 'Timezone?', required: false },
        { label: 'Anything else?', required: false },
      ],
      minimums: { ageDays: 30, skillPoints: 5_000_000, characters: 2 },
      rejection: { wording: 'notNow', showReason: true },
      inviteOnly: true,
      notifyReviewers: false,
      mailDecision: false,
    });
    expect(parseVettingSettingsPatch({ patch: { welcome: '', questions: [] } })).toMatchObject({
      welcome: '',
      questions: [],
    });
  });

  it('refuses over-long text, a blank or over-long question and too many questions', () => {
    const bad = (patch: Record<string, unknown>) => () => parseVettingSettingsPatch({ patch });
    expect(bad({ welcome: 'x'.repeat(601) })).toThrow();
    expect(bad({ welcome: 5 })).toThrow();
    expect(bad({ contact: 'x'.repeat(201) })).toThrow();
    expect(bad({ questions: [{ label: ' ', required: true }] })).toThrow();
    expect(bad({ questions: [{ label: 'x'.repeat(121), required: true }] })).toThrow();
    expect(bad({ questions: [{ label: 'ok', required: 'yes' }] })).toThrow();
    expect(bad({ questions: [{ id: 5, label: 'ok', required: true }] })).toThrow();
    expect(bad({ questions: Array(9).fill({ label: 'ok', required: false }) })).toThrow();
    expect(bad({ questions: 'none' })).toThrow();
    expect(bad({ minimums: { ageDays: 1, skillPoints: 'lots', characters: 1 } })).toThrow();
    expect(bad({ minimums: { ageDays: 1 } })).toThrow();
    expect(bad({ rejection: { wording: 'maybe', showReason: true } })).toThrow();
    expect(bad({ rejection: { wording: 'rejected', showReason: 'yes' } })).toThrow();
    expect(bad({ inviteOnly: 'yes' })).toThrow();
    expect(bad({ notifyReviewers: 1 })).toThrow();
    expect(bad({ mailDecision: null })).toThrow();
  });
});
