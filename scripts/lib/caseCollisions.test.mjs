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

  it('does not flag different extensions or names', () => {
    expect(findCaseCollisions(['src/LandingFaq.tsx', 'src/landingFaq.ts'])).toEqual([]);
  });

  it('reports each colliding group once, sorted', () => {
    expect(findCaseCollisions(['b/X', 'a/y', 'b/x', 'a/Y', 'a/y'])).toEqual([
      ['a/Y', 'a/y'],
      ['b/X', 'b/x'],
    ]);
  });
});
