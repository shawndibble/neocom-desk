import { describe, expect, it } from 'vitest';
import { minerPaymentCode, paymentCode } from './corpTaxBookLateNotice.js';
import {
  codeOwners,
  codesIn,
  currentMinerOf,
  donationOwner,
  matchBookOf,
  minerIdFor,
  rematchUnmatched,
  resolveDonationOwners,
  noteUncountedDonations,
} from './corpTaxBookDonationMatch.js';

const miners = [
  { id: 'g1', characterIds: [10, 11], aliases: ['g-old'] },
  { id: 'g2', characterIds: [20] },
];

describe('codesIn', () => {
  it('finds each MT code standing on its own, in any case, once', () => {
    expect(codesIn('tax MT00AB12 and mt00ab12, MTZZZZZZ.')).toEqual(['MT00AB12', 'MTZZZZZZ']);
    expect(codesIn('XMT00AB12 MT00AB123 MT00AB1')).toEqual([]);
    expect(codesIn(undefined)).toEqual([]);
  });
});

describe('minerIdFor: the earliest grouping a Character is in wins', () => {
  it('picks by when each grouping was made, whatever order they are listed in', () => {
    const twice = [
      { id: 'late', characterIds: [7], createdAt: '2026-11-02T00:00:00Z' },
      { id: 'early', characterIds: [7], createdAt: '2026-11-01T00:00:00Z' },
    ];
    expect(minerIdFor(7, twice)).toBe('early');
    expect(minerIdFor(7, [...twice].reverse())).toBe('early');
    expect(minerIdFor(8, twice)).toBe('solo:8');
  });
});

describe('currentMinerOf: a stored Miner id read through the current grouping', () => {
  it('keeps a grouping, folds a grouped Character’s solo id and an absorbed id into it', () => {
    expect(currentMinerOf('g2', miners)).toBe('g2');
    expect(currentMinerOf('solo:11', miners)).toBe('g1');
    expect(currentMinerOf('g-old', miners)).toBe('g1');
    expect(currentMinerOf('solo:99', miners)).toBe('solo:99');
  });
});

describe('codeOwners', () => {
  it('names each Miner’s own code, its aliases’ and its Characters’ solo codes, and each notice’s', () => {
    const owners = codeOwners([{ id: 'n1', minerId: 'solo:10', code: 'MTOLD001' }], miners, [
      'solo:30',
    ]);
    expect(owners.get('MTOLD001')).toEqual(['g1']);
    expect(owners.get(minerPaymentCode('g1'))).toEqual(['g1']);
    expect(owners.get(minerPaymentCode('g-old'))).toEqual(['g1']);
    expect(owners.get(minerPaymentCode('solo:11'))).toEqual(['g1']);
    expect(owners.get(minerPaymentCode('solo:30'))).toEqual(['solo:30']);
  });

  it('a notice without a stored code is known by the code its id hashes to', () => {
    expect(codeOwners([{ id: 'n2', minerId: 'g2' }], miners, []).get(paymentCode('n2'))).toEqual([
      'g2',
    ]);
  });

  it('a code two Miners hold names both, so it is no one’s alone', () => {
    const owners = codeOwners(
      [
        { id: 'n1', minerId: 'g1', code: 'MTSAME01' },
        { id: 'n2', minerId: 'g2', code: 'MTSAME01' },
      ],
      miners,
      []
    );
    expect(owners.get('MTSAME01')).toEqual(['g1', 'g2']);
  });
});

describe('donationOwner', () => {
  const book = {
    miners,
    codes: codeOwners(
      [
        { id: 'n1', minerId: 'g2', code: 'MTOLD001' },
        { id: 'n2', minerId: 'g1', code: 'MTSAME01' },
        { id: 'n3', minerId: 'g2', code: 'MTSAME01' },
      ],
      miners,
      []
    ),
    minedCharacterIds: new Set([30]),
    paidBefore: new Map([
      [40, ['g2']],
      [41, ['g1', 'solo:11']],
      [42, ['g1', 'g2']],
    ]),
  };

  it('is the sender’s own Miner when they are grouped or seen mining, whatever code it names', () => {
    expect(donationOwner({ characterId: 10, reason: 'MTOLD001' }, book)).toEqual({
      kind: 'miner',
      minerId: 'g1',
      by: 'sender',
    });
    expect(donationOwner({ characterId: 30 }, book)).toMatchObject({ minerId: 'solo:30' });
  });

  it('names a stranger’s Miner by the code, and sends an ambiguous one to review', () => {
    expect(donationOwner({ characterId: 99, reason: 'for MTOLD001' }, book)).toEqual({
      kind: 'miner',
      minerId: 'g2',
      by: 'code',
    });
    expect(donationOwner({ characterId: 99, reason: 'MTSAME01' }, book)).toEqual({
      kind: 'ambiguous',
      minerIds: ['g1', 'g2'],
    });
    expect(
      donationOwner({ characterId: 99, reason: `MTOLD001 ${minerPaymentCode('g1')}` }, book)
    ).toEqual({ kind: 'ambiguous', minerIds: ['g1', 'g2'] });
    expect(donationOwner({ characterId: 99, reason: 'thanks' }, book)).toEqual({
      kind: 'unmatched',
    });
  });

  it('a payer known only by an earlier payment keeps the Miner it named, never a solo id', () => {
    expect(donationOwner({ characterId: 40 }, book)).toEqual({
      kind: 'miner',
      minerId: 'g2',
      by: 'payer',
    });
    // Two earlier names for one grouping are one Miner; two Miners are for an officer.
    expect(donationOwner({ characterId: 41 }, book)).toMatchObject({ minerId: 'g1' });
    expect(donationOwner({ characterId: 42 }, book)).toEqual({
      kind: 'ambiguous',
      minerIds: ['g1', 'g2'],
    });
    // A code still says more than an old payment does.
    expect(donationOwner({ characterId: 40, reason: minerPaymentCode('g1') }, book)).toMatchObject({
      minerId: 'g1',
      by: 'code',
    });
  });

  it('resolves a batch: only a Miner, never a notice, goes on the payment', () => {
    const out = resolveDonationOwners(
      [
        { characterId: 99, reason: 'MTOLD001', amount: 1 },
        { characterId: 99, reason: 'MTSAME01', amount: 2 },
      ],
      book
    );
    expect(out).toEqual([
      { characterId: 99, reason: 'MTOLD001', amount: 1, minerId: 'g2' },
      {
        characterId: 99,
        reason: 'MTSAME01',
        amount: 2,
        reviewReason: 'ambiguous',
        ambiguousMinerIds: ['g1', 'g2'],
      },
    ]);
  });

  it('notes a donation into an unread division that carries a code, or whose sender owes', () => {
    const d = (characterId: number, reason?: string, refId = characterId) => ({
      refId,
      division: 3,
      characterId,
      amount: 5,
      at: `2026-11-0${refId % 9}T00:00:00.000Z`,
      ...(reason ? { reason } : {}),
    });
    const noted = noteUncountedDonations(
      [d(99, 'MTOLD001', 1), d(99, undefined, 2), d(10, undefined, 3), d(20, undefined, 4)],
      book,
      new Set(['g1'])
    );
    expect(noted.map((u) => u.refId).sort()).toEqual([1, 3]);
  });
});

describe('matchBookOf: the book the resolver reads, from what either side loaded', () => {
  it('knows each grouped and mined Miner’s code, each recorded one’s, and each notice’s', () => {
    const book = matchBookOf({
      miners,
      notices: [{ id: 'n1', minerId: 'solo:30', code: 'MTOLD001' }],
      minedCharacterIds: [10, 40],
      recordedMinerIds: ['solo:50'],
    });
    expect(book.minedCharacterIds).toEqual(new Set([10, 40]));
    for (const [minerId, owner] of [
      ['g1', 'g1'],
      ['solo:40', 'solo:40'],
      ['solo:50', 'solo:50'],
    ])
      expect(book.codes.get(minerPaymentCode(minerId))).toEqual([owner]);
    expect(book.codes.get('MTOLD001')).toEqual(['solo:30']);
  });
});

describe('rematchUnmatched: which Unmatched payments now have a Miner', () => {
  const book = matchBookOf({ miners, notices: [], minedCharacterIds: [20] });
  const p = (id: string, characterId: number, extra: Record<string, unknown> = {}) => ({
    id,
    characterId,
    amount: 5,
    at: `2026-11-0${id.length}T00:00:00Z`,
    ...extra,
  });

  it('places each one a known sender sent, oldest first', () => {
    expect(rematchUnmatched([p('bb', 20), p('a', 10), p('ccc', 99)], book)).toEqual([
      { paymentId: 'a', minerId: 'g1' },
      { paymentId: 'bb', minerId: 'g2' },
    ]);
  });

  it('leaves one already placed, marked not tax, or waiting for an officer as ambiguous', () => {
    expect(
      rematchUnmatched(
        [
          p('a', 10, { minerId: 'g1' }),
          p('b', 10, { notTaxAmount: 1 }),
          p('c', 10, { reviewReason: 'ambiguous' }),
        ],
        book
      )
    ).toEqual([]);
  });
});
