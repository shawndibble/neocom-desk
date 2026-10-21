import { describe, it, expect } from 'vitest';
import { findCaseCollisions } from './caseCollisions.mjs';

describe('findCaseCollisions', () => {
  it('returns nothing when no paths differ only by case', () => {
    expect(findCaseCollisions(['src/a.ts', 'src/b.ts', 'README.md'])).toEqual([]);
  });

  it('groups two files that differ only in case', () => {
    expect(findCaseCollisions(['src/Foo.ts', 'src/foo.ts', 'src/x.ts'])).toEqual([
      ['src/Foo.ts', 'src/foo.ts'],
    ]);
  });

  it('flags a directory component that differs in case', () => {
    expect(findCaseCollisions(['src/Foo/a.ts', 'src/foo/b.ts'])).toEqual([['src/Foo', 'src/foo']]);
  });

  it('does not flag the same directory repeated across files', () => {
    expect(findCaseCollisions(['src/foo/a.ts', 'src/foo/b.ts'])).toEqual([]);
  });

  it('flags a file vs a directory of the same name in another case', () => {
    expect(findCaseCollisions(['src/Foo', 'src/foo/a.ts'])).toEqual([['src/Foo', 'src/foo']]);
  });

  it('flags files in one folder that differ only in case once the extension is dropped', () => {
    expect(findCaseCollisions(['src/LandingFaq.tsx', 'src/landingFaq.ts'])).toEqual([
      ['src/LandingFaq.tsx', 'src/landingFaq.ts'],
    ]);
  });

  it('reports a source pair and its test pair as separate groups', () => {
    expect(
      findCaseCollisions(['a/Foo.tsx', 'a/Foo.test.tsx', 'a/foo.ts', 'a/foo.test.ts'])
    ).toEqual([
      ['a/Foo.test.tsx', 'a/foo.test.ts'],
      ['a/Foo.tsx', 'a/foo.ts'],
    ]);
  });

  it('does not flag same-case names with different extensions', () => {
    expect(findCaseCollisions(['src/foo.ts', 'src/foo.tsx', 'src/foo.test.ts'])).toEqual([]);
  });

  it('does not flag same-case stems in different folders', () => {
    expect(findCaseCollisions(['a/Foo.ts', 'b/foo.tsx'])).toEqual([]);
  });

  it('does not report a stem group twice when full paths already collide', () => {
    expect(findCaseCollisions(['src/Foo.ts', 'src/foo.ts'])).toEqual([
      ['src/Foo.ts', 'src/foo.ts'],
    ]);
  });

  it('ignores dotfiles when working out the stem', () => {
    expect(findCaseCollisions(['.gitignore', '.GitIgnore'])).toEqual([
      ['.GitIgnore', '.gitignore'],
    ]);
  });

  it('reports each colliding group once, sorted', () => {
    expect(findCaseCollisions(['b/X', 'a/y', 'b/x', 'a/Y', 'a/y'])).toEqual([
      ['a/Y', 'a/y'],
      ['b/X', 'b/x'],
    ]);
  });

  it('treats NFC and NFD spellings as the same path (APFS/HFS+)', () => {
    const nfc = 'src/Caf\u00e9.ts';
    const nfd = 'src/Cafe\u0301.ts';
    expect(findCaseCollisions([nfc, nfd])).toEqual([[nfc, nfd].sort()]);
  });

  it('reports only the shallowest colliding prefix', () => {
    expect(findCaseCollisions(['Foo/a.ts', 'foo/a.ts'])).toEqual([['Foo', 'foo']]);
  });
});
