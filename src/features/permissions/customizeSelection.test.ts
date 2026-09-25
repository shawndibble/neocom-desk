import { describe, expect, it } from 'vitest';
import { DEFAULT_ON_GROUPS } from '@/esi/scopes';
import { parseCustomizeSelection } from './customizeSelection';

describe('parseCustomizeSelection', () => {
  it('accepts a full set of known groups', () => {
    expect(parseCustomizeSelection(['wallet', 'mail', 'corp'])).toEqual(['wallet', 'mail', 'corp']);
  });

  it('accepts an empty array — Select none is a real, storable choice', () => {
    expect(parseCustomizeSelection([])).toEqual([]);
  });

  it('deduplicates repeats', () => {
    expect(parseCustomizeSelection(['wallet', 'wallet'])).toEqual(['wallet']);
  });

  it.each([
    ['an unknown group', ['wallet', 'notAGroup']],
    ['a non-string entry', ['wallet', 7]],
  ])('rejects %s, so the dialog falls back to the default selection', (_case, raw) => {
    expect(parseCustomizeSelection(raw)).toBeNull();
  });

  it.each([
    ['a non-array', 'wallet'],
    ['null', null],
    ['undefined — the cold-device case', undefined],
  ])('rejects %s', (_case, raw) => {
    expect(parseCustomizeSelection(raw)).toBeNull();
  });

  it('DEFAULT_ON_GROUPS itself parses back unchanged, since the dialog starts from it', () => {
    expect(parseCustomizeSelection([...DEFAULT_ON_GROUPS])).toEqual([...DEFAULT_ON_GROUPS]);
  });
});
