import { describe, expect, it } from 'vitest';
import {
  dedupeSharedFittings,
  fittingChoiceKey,
  followsSave,
  parseSharedFittingId,
  shareMarker,
  shareMenuMode,
  sharedFittingId,
  type SharedFitting,
} from './sharedFittings';

const row = (over: Partial<SharedFitting> = {}): SharedFitting => ({
  communityId: 'c1',
  id: 'char:2~saved-a',
  ownerUid: 'char:2',
  source: 'saved',
  name: 'Rifter',
  hull: 'Rifter',
  code: 'CODE',
  updatedAt: 100,
  ...over,
});

describe('sharedFittingId', () => {
  it('keys a saved Fitting by its record id and an In-game one by its ESI id', () => {
    expect(sharedFittingId('char:2', { source: 'saved', key: 'a-b' })).toBe('char:2~saved-a-b');
    expect(sharedFittingId('char:2', { source: 'game', key: '987' })).toBe('char:2~game-987');
  });

  it('round-trips through parse', () => {
    expect(parseSharedFittingId('char:2~game-987')).toEqual({
      ownerUid: 'char:2',
      source: 'game',
      key: '987',
    });
  });

  it('rejects ids that are not <uid>~<source>-<key>', () => {
    expect(parseSharedFittingId('plain')).toBeNull();
    expect(parseSharedFittingId('char:2~other-1')).toBeNull();
    expect(parseSharedFittingId('char:2~saved-')).toBeNull();
  });
});

describe('shareMarker', () => {
  it('names a Community and a Fitting key', () => {
    expect(shareMarker('c1', { source: 'game', key: '9' })).toBe('c1|game-9');
  });
});

describe('shareMenuMode', () => {
  it('is absent with no Community, direct with one, a submenu with several', () => {
    expect(shareMenuMode(0)).toBe('none');
    expect(shareMenuMode(1)).toBe('direct');
    expect(shareMenuMode(2)).toBe('submenu');
  });
});

describe('dedupeSharedFittings', () => {
  it('drops Fittings the viewer owns', () => {
    expect(
      dedupeSharedFittings([row(), row({ id: 'char:1~saved-z', ownerUid: 'char:1' })], 'char:1')
    ).toHaveLength(1);
  });

  it('shows one row when the same Fitting is shared into several Communities, newest copy, every Community named', () => {
    const rows = dedupeSharedFittings(
      [
        row({ communityId: 'c1', updatedAt: 100, name: 'Old' }),
        row({ communityId: 'c2', updatedAt: 200, name: 'New' }),
      ],
      'char:1'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('New');
    expect(rows[0].communityIds).toEqual(['c1', 'c2']);
  });

  it('keeps different Fittings, and a saved and an In-game one with the same key, apart', () => {
    const rows = dedupeSharedFittings(
      [row(), row({ id: 'char:2~game-a', source: 'game' }), row({ id: 'char:2~saved-b' })],
      'char:1'
    );
    expect(rows).toHaveLength(3);
  });
});

describe('fittingChoiceKey', () => {
  it('is the id without its owner, so it stays the same in every Community', () => {
    expect(fittingChoiceKey({ source: 'saved', key: 'abc' })).toBe('saved-abc');
    expect(fittingChoiceKey({ source: 'game', key: '77' })).toBe('game-77');
  });
});

describe('followsSave', () => {
  const key = { source: 'saved', key: 'a' } as const;

  it('follows a save into a Community that already holds the Fitting', () => {
    expect(followsSave(true, null, key)).toBe(true);
  });

  it('does not follow into a Community that holds nothing when share-all is off', () => {
    expect(followsSave(false, null, key)).toBe(false);
  });

  it('shares a brand-new Fitting under share-all', () => {
    expect(followsSave(false, new Set(), key)).toBe(true);
  });

  it('leaves out a Fitting the Member stopped sharing under share-all', () => {
    expect(followsSave(false, new Set(['saved-a']), key)).toBe(false);
  });
});
