import { describe, expect, it } from 'vitest';
import type { CommunityRequest } from '@/engine/communities/requests';
import { requestHeadline, standingRateLine } from './requestFormat';

// A stub that echoes the key and its numbers, so the test pins what is asked for, not the wording.
const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}${JSON.stringify(opts)}` : key;

const base: CommunityRequest = {
  id: 'r',
  ownerUid: 'char:1',
  ownerName: 'A',
  location: '',
  terms: '',
  lines: [],
  createdAt: 0,
  lastActivityAt: 0,
  expiresAt: 0,
  closed: false,
  notify: { app: true, mail: false },
};

describe('requestHeadline', () => {
  it('names the first line of an ordinary Request and counts the rest', () => {
    const lines = [
      { typeId: 1, name: 'Tritanium', quantity: 1, kind: 'item' as const },
      { typeId: 2, name: 'Pyerite', quantity: 1, kind: 'item' as const },
    ];
    expect(requestHeadline({ ...base, lines }, t)).toBe(
      'Tritanium communities.board.more{"count":1}'
    );
  });

  it('names a buyback by its first group or item', () => {
    const standing = {
      rate: 90,
      rateBasis: 'buy' as const,
      hubId: 'jita' as const,
      buyerCharacterId: null,
      buyLines: [{ kind: 'group' as const, group: 'ore' as const }],
    };
    expect(requestHeadline({ ...base, standing }, t)).toBe('communities.board.buyback.group.ore');
  });
});

describe('standingRateLine', () => {
  it('says the rate, the hub system and the basis', () => {
    const line = standingRateLine(
      {
        rate: 92.5,
        rateBasis: 'sell',
        hubId: 'amarr',
        buyerCharacterId: null,
        buyLines: [{ kind: 'group', group: 'ore' }],
      },
      t
    );
    expect(line).toContain('"rate":92.5');
    expect(line).toContain('"hub":"Amarr"');
    expect(line).toContain('basisWordSell');
  });
});
