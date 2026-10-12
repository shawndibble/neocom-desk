import { describe, expect, it } from 'vitest';
import {
  addShared,
  effectiveSelection,
  noneShared,
  shareAll,
  stopSharing,
  type ShareChoice,
} from './shareMode';

const owned = [10, 20, 30];

describe('effectiveSelection', () => {
  it('shares only the allowed owned types when not sharing all', () => {
    const choice: ShareChoice = { all: false, allowed: new Set([20, 99]) };
    expect([...effectiveSelection(owned, choice)]).toEqual([20]);
  });

  it('shares every owned type but the excluded ones when sharing all', () => {
    const choice: ShareChoice = { all: true, excluded: new Set([20]) };
    expect([...effectiveSelection(owned, choice)]).toEqual([10, 30]);
  });

  it('includes a blueprint acquired after share-all was turned on', () => {
    const choice = shareAll();
    expect(effectiveSelection([...owned, 40], choice).has(40)).toBe(true);
  });
});

describe('stopSharing and addShared', () => {
  it('revoking under share-all adds an exclusion', () => {
    const next = stopSharing(shareAll(), 20);
    expect(next).toEqual({ all: true, excluded: new Set([20]) });
  });

  it('revoking when not sharing all drops the allowed entry', () => {
    const next = stopSharing({ all: false, allowed: new Set([10, 20]) }, 20);
    expect(next).toEqual({ all: false, allowed: new Set([10]) });
  });

  it('adding under share-all lifts the exclusion', () => {
    const next = addShared({ all: true, excluded: new Set([20, 30]) }, 20);
    expect(next).toEqual({ all: true, excluded: new Set([30]) });
  });

  it('adding when not sharing all grows the allowed set', () => {
    expect(addShared(noneShared(), 10)).toEqual({ all: false, allowed: new Set([10]) });
  });

  it('does not mutate the choice it was given', () => {
    const before: ShareChoice = { all: false, allowed: new Set([10]) };
    addShared(before, 20);
    expect(before).toEqual({ all: false, allowed: new Set([10]) });
  });
});

describe('a choice over string keys (Fittings)', () => {
  it('revokes and re-adds by key under share-all', () => {
    const stopped = stopSharing<string>(shareAll<string>(), 'saved-a');
    expect([...effectiveSelection(['saved-a', 'saved-b'], stopped)]).toEqual(['saved-b']);
    const again = addShared(stopped, 'saved-a');
    expect([...effectiveSelection(['saved-a', 'saved-b'], again)]).toEqual(['saved-a', 'saved-b']);
  });
});
