import { describe, expect, it } from 'vitest';
import { LIBRARY_STALE_MS, type SharedBlueprint } from './sharedLibrary';
import { buildCommunityOffers, type CommunityOfferSource } from './communityOffers';

const NOW = 1_000_000_000_000;
const bp = (over: Partial<SharedBlueprint> = {}): SharedBlueprint => ({
  typeId: 100,
  me: 10,
  te: 20,
  runs: 5,
  locationName: 'Jita IV',
  systemName: 'Jita',
  ...over,
});
const source = (name: string, members: CommunityOfferSource['members']): CommunityOfferSource => ({
  communityId: `id-${name}`,
  communityName: name,
  members,
});

describe('buildCommunityOffers', () => {
  it('names the member and carries the blueprint', () => {
    const [offer] = buildCommunityOffers(
      [source('Alpha', [{ uid: 'u1', characterName: 'Ann', asOf: NOW, items: [bp()] }])],
      NOW
    );
    expect(offer).toMatchObject({
      uid: 'u1',
      memberName: 'Ann',
      typeId: 100,
      me: 10,
      te: 20,
      runs: 5,
      quantity: 1,
      stale: false,
    });
  });

  it('merges one sharer across Communities into one row, names sorted', () => {
    const member = { uid: 'u1', characterName: 'Ann', asOf: NOW, items: [bp()] };
    const offers = buildCommunityOffers([source('Zed', [member]), source('Alpha', [member])], NOW);
    expect(offers).toHaveLength(1);
    expect(offers[0].communities).toEqual([
      { id: 'id-Alpha', name: 'Alpha' },
      { id: 'id-Zed', name: 'Zed' },
    ]);
    expect(offers[0].quantity).toBe(1);
  });

  it('keeps identical copies inside one Community as quantity, not across-Community sums', () => {
    const items = [bp(), bp()];
    const offers = buildCommunityOffers(
      [
        source('A', [{ uid: 'u1', characterName: 'Ann', asOf: NOW, items }]),
        source('B', [{ uid: 'u1', characterName: 'Ann', asOf: NOW, items }]),
      ],
      NOW
    );
    expect(offers).toHaveLength(1);
    expect(offers[0].quantity).toBe(2);
  });

  it('keeps different sharers and different instances apart', () => {
    const offers = buildCommunityOffers(
      [
        source('A', [
          { uid: 'u1', characterName: 'Ann', asOf: NOW, items: [bp(), bp({ me: 8 })] },
          { uid: 'u2', characterName: 'Bob', asOf: NOW, items: [bp()] },
        ]),
      ],
      NOW
    );
    expect(offers).toHaveLength(3);
  });

  it('marks a library older than the stale window, never drops it', () => {
    const offers = buildCommunityOffers(
      [
        source('A', [
          { uid: 'u1', characterName: 'Ann', asOf: NOW - LIBRARY_STALE_MS - 1, items: [bp()] },
        ]),
      ],
      NOW
    );
    expect(offers).toHaveLength(1);
    expect(offers[0].stale).toBe(true);
  });

  it('is stale in every Community only when every stamp is; freshest stamp wins', () => {
    const old = NOW - LIBRARY_STALE_MS - 1;
    const offers = buildCommunityOffers(
      [
        source('A', [{ uid: 'u1', characterName: 'Ann', asOf: old, items: [bp()] }]),
        source('B', [{ uid: 'u1', characterName: 'Ann', asOf: NOW, items: [bp()] }]),
      ],
      NOW
    );
    expect(offers[0].stale).toBe(false);
    expect(offers[0].asOf).toBe(NOW);
  });

  it('skips excluded uids and treats BPO as runs -1', () => {
    const offers = buildCommunityOffers(
      [
        source('A', [
          { uid: 'me', characterName: 'Me', asOf: NOW, items: [bp()] },
          { uid: 'u2', characterName: 'Bob', asOf: NOW, items: [bp({ runs: -1 })] },
        ]),
      ],
      NOW,
      new Set(['me'])
    );
    expect(offers.map((o) => o.uid)).toEqual(['u2']);
    expect(offers[0].runs).toBe(-1);
  });

  it('drops malformed Member-written items instead of rendering them', () => {
    const bad = [
      { ...bp(), locationName: { x: 1 } },
      { ...bp(), runs: 'a' },
      { ...bp(), systemName: 5 },
      null,
    ] as unknown as SharedBlueprint[];
    const offers = buildCommunityOffers(
      [source('Alpha', [{ uid: 'u1', characterName: 'Ann', asOf: NOW, items: [...bad, bp()] }])],
      NOW
    );
    expect(offers).toHaveLength(1);
  });
});
