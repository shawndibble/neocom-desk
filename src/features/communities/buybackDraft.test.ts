import { describe, expect, it } from 'vitest';
import {
  draftFromStanding,
  draftToStanding,
  emptyBuybackDraft,
  toggleGroup,
  addType,
  removeType,
} from './buybackDraft';

describe('draftToStanding', () => {
  const draft = {
    ...emptyBuybackDraft(),
    rate: '90',
    groups: ['ore' as const],
    types: [{ typeId: 34, name: 'Tritanium' }],
  };

  it('turns a filled draft into a standing Request, groups first', () => {
    expect(draftToStanding(draft)).toEqual({
      rate: 90,
      rateBasis: 'buy',
      hubId: 'jita',
      buyerCharacterId: null,
      buyLines: [
        { kind: 'group', group: 'ore' },
        { kind: 'type', typeId: 34, name: 'Tritanium' },
      ],
    });
  });

  it('reads a decimal comma and a trailing percent sign', () => {
    expect(draftToStanding({ ...draft, rate: '92,5 %' })?.rate).toBe(92.5);
  });

  it('is null for a rate out of range or in hundredths', () => {
    for (const rate of ['', '0', '201', '90.55', 'abc']) {
      expect(draftToStanding({ ...draft, rate })).toBeNull();
    }
  });

  it('is null with nothing to buy', () => {
    expect(draftToStanding({ ...draft, groups: [], types: [] })).toBeNull();
  });

  it('carries a named buyer Character', () => {
    expect(draftToStanding({ ...draft, buyerCharacterId: 77 })?.buyerCharacterId).toBe(77);
  });
});

describe('draftFromStanding', () => {
  it('round-trips a stored standing Request', () => {
    const standing = {
      rate: 92.5,
      rateBasis: 'sell' as const,
      hubId: 'amarr' as const,
      buyerCharacterId: 5,
      buyLines: [
        { kind: 'group' as const, group: 'ice' as const },
        { kind: 'type' as const, typeId: 1230, name: 'Veldspar' },
      ],
    };
    expect(draftToStanding(draftFromStanding(standing))).toEqual(standing);
  });
});

describe('editing the buy list', () => {
  it('toggles a group on and off', () => {
    const on = toggleGroup(emptyBuybackDraft(), 'gas');
    expect(on.groups).toEqual(['gas']);
    expect(toggleGroup(on, 'gas').groups).toEqual([]);
  });

  it('adds a type once and removes it by id', () => {
    const once = addType(emptyBuybackDraft(), { typeId: 34, name: 'Tritanium' });
    expect(addType(once, { typeId: 34, name: 'Tritanium' }).types).toHaveLength(1);
    expect(removeType(once, 34).types).toEqual([]);
  });
});
