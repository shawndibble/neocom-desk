import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { EVE_ALLOWED_TYPES } from './eventSelection';
import { eveTypeLabelKey, humanizeEveType } from './eveTypeLabel';

describe('humanizeEveType', () => {
  it('splits a CamelCase type into spaced words', () => {
    expect(humanizeEveType('StructureUnderAttack')).toBe('Structure Under Attack');
  });

  it("drops CCP's `Msg` suffix, which names nothing a reader needs", () => {
    expect(humanizeEveType('CorpAppNewMsg')).toBe('Corp App New');
    expect(humanizeEveType('AllWarDeclaredMsg')).toBe('All War Declared');
  });

  it('keeps a word that merely contains those letters', () => {
    expect(humanizeEveType('CorpKicked')).toBe('Corp Kicked');
  });

  it('splits an acronym run off the word that follows it', () => {
    expect(humanizeEveType('CorpAllBillMsg')).toBe('Corp All Bill');
    expect(humanizeEveType('IHubBillExpiring')).toBe('I Hub Bill Expiring');
  });

  it('splits a trailing number off its word', () => {
    expect(humanizeEveType('SomeBrandNewType6041')).toBe('Some Brand New Type 6041');
  });

  it('leaves a type that is already one word alone', () => {
    expect(humanizeEveType('Insurance')).toBe('Insurance');
  });

  it('never returns an empty string, so a body always has something to name', () => {
    expect(humanizeEveType('Msg')).toBe('Msg');
    expect(humanizeEveType('')).toBe('');
  });
});

describe('eveTypeLabelKey', () => {
  /**
   * The catalog is what keeps the two reinforcement types apart: their fired
   * titles are both "Structure reinforced", so reusing those as list labels
   * would render two separately-togglable rows identically.
   */
  it('resolves a distinct, human-readable name for every allow-listed type', () => {
    const names = EVE_ALLOWED_TYPES.map((type) => {
      const key = eveTypeLabelKey(type);
      const name = i18n.t(key);
      expect(name, `missing en.json entry for ${type}`).not.toBe(key);
      expect(name).not.toContain(type);
      return name;
    });
    expect(new Set(names).size).toBe(names.length);
  });

  it('falls back to the humanized type when no catalog entry exists', () => {
    expect(i18n.t(eveTypeLabelKey('SomeBrandNewMsgType6041'), { defaultValue: 'x' })).toBe('x');
  });
});
