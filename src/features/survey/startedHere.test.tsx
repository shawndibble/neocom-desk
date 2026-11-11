import { beforeEach, describe, expect, it } from 'vitest';
import { noteStartedHere, startedHere } from './startedHere';

beforeEach(() => localStorage.clear());

describe('startedHere', () => {
  it('knows a survey this device started, and not another', () => {
    noteStartedHere('abc234');
    expect(startedHere('abc234')).toBe(true);
    expect(startedHere('zzz999')).toBe(false);
  });

  it('forgets one after a survey’s lifetime', () => {
    noteStartedHere('abc234', 1_000);
    expect(startedHere('abc234', 1_000 + 9 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it('survives unreadable storage', () => {
    localStorage.setItem('miningSurveysStarted', '{oops');
    expect(startedHere('abc234')).toBe(false);
    noteStartedHere('abc234');
    expect(startedHere('abc234')).toBe(true);
  });
});
