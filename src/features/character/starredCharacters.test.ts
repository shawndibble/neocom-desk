import { describe, it, expect } from 'vitest';
import {
  NO_STARRED_CHARACTERS,
  isCharacterStarred,
  parseStarredCharacters,
  partitionStarredFirst,
  pruneStarredCharacters,
  starredCharactersNeedPruning,
  withToggledStar,
} from './starredCharacters';

const PILOT_A = 91;
const PILOT_B = 92;
const PILOT_C = 93;

describe('withToggledStar / isCharacterStarred', () => {
  it('has nothing starred to start with', () => {
    expect(isCharacterStarred(NO_STARRED_CHARACTERS, PILOT_A)).toBe(false);
  });

  it('stars a character the first time it is toggled', () => {
    const next = withToggledStar(NO_STARRED_CHARACTERS, PILOT_A);
    expect(isCharacterStarred(next, PILOT_A)).toBe(true);
  });

  it('unstars it again the second time', () => {
    const starred = withToggledStar(NO_STARRED_CHARACTERS, PILOT_A);
    expect(isCharacterStarred(withToggledStar(starred, PILOT_A), PILOT_A)).toBe(false);
  });

  it('leaves every other character alone', () => {
    const starred = withToggledStar(withToggledStar(NO_STARRED_CHARACTERS, PILOT_A), PILOT_B);
    const next = withToggledStar(starred, PILOT_A);
    expect(next).toEqual([PILOT_B]);
  });

  it('never mutates the value it was given', () => {
    const starred: readonly number[] = [PILOT_A];
    withToggledStar(starred, PILOT_B);
    expect(starred).toEqual([PILOT_A]);
  });
});

describe('partitionStarredFirst', () => {
  it('floats starred ids to the top', () => {
    expect(partitionStarredFirst([PILOT_A, PILOT_B, PILOT_C], [PILOT_C])).toEqual([
      PILOT_C,
      PILOT_A,
      PILOT_B,
    ]);
  });

  /**
   * The whole point of partitioning rather than sorting: the chosen sort key
   * still decides the order inside both halves, so a star raises one card
   * without scrambling the rest of the list.
   */
  it('preserves the incoming order within both halves', () => {
    expect(partitionStarredFirst([PILOT_C, PILOT_A, PILOT_B], [PILOT_B, PILOT_C])).toEqual([
      PILOT_C,
      PILOT_B,
      PILOT_A,
    ]);
  });

  it('changes nothing when nothing is starred', () => {
    expect(partitionStarredFirst([PILOT_A, PILOT_B], NO_STARRED_CHARACTERS)).toEqual([
      PILOT_A,
      PILOT_B,
    ]);
  });

  /** A star on a character filtered out of this list (search, or another group) adds no phantom row. */
  it('ignores starred ids that are not in the list', () => {
    expect(partitionStarredFirst([PILOT_A], [PILOT_C])).toEqual([PILOT_A]);
  });
});

describe('pruneStarredCharacters / starredCharactersNeedPruning', () => {
  it('drops ids whose character is no longer on the device', () => {
    expect(pruneStarredCharacters([PILOT_A, PILOT_C], new Set([PILOT_A, PILOT_B]))).toEqual([
      PILOT_A,
    ]);
  });

  it('reports whether pruning would change anything', () => {
    expect(starredCharactersNeedPruning([PILOT_A], new Set([PILOT_A]))).toBe(false);
    expect(starredCharactersNeedPruning([PILOT_A, PILOT_C], new Set([PILOT_A]))).toBe(true);
  });
});

describe('parseStarredCharacters', () => {
  it('accepts a well-formed stored value and round-trips a toggle through it', () => {
    const stored = withToggledStar(NO_STARRED_CHARACTERS, PILOT_A);
    expect(parseStarredCharacters(stored)).toEqual([PILOT_A]);
    expect(parseStarredCharacters([])).toEqual([]);
  });

  it('rejects a value that is not an array', () => {
    expect(parseStarredCharacters('nope')).toBeNull();
    expect(parseStarredCharacters(null)).toBeNull();
    expect(parseStarredCharacters(undefined)).toBeNull();
    expect(parseStarredCharacters({ starred: [PILOT_A] })).toBeNull();
    expect(parseStarredCharacters(PILOT_A)).toBeNull();
  });

  it('rejects an array holding anything but whole character ids', () => {
    expect(parseStarredCharacters(['91'])).toBeNull();
    expect(parseStarredCharacters([PILOT_A, null])).toBeNull();
    expect(parseStarredCharacters([1.5])).toBeNull();
    expect(parseStarredCharacters([Number.NaN])).toBeNull();
  });
});
