import { describe, expect, it } from 'vitest';
import { matchDonation, resolveDonations } from './corpTaxBookSyncEngine.js';
import { minerPaymentCode } from './corpTaxBookLateNotice.js';
import { recognisedCodes, withoutNotice } from './corpTaxBookPaymentCodes.js';

const book = (codes: ReturnType<typeof recognisedCodes>) => ({
  miners: [{ id: 'g1', characterIds: [10, 11] }],
  statements: codes,
  knownCharacterIds: new Set([10, 11, 20]),
  openBalance: new Map<string, number>(),
  unbilled: new Set<string>(),
});

describe('recognisedCodes: whose money a Reason code says a donation is', () => {
  const notices = [
    { id: 'n1', minerId: 'solo:30', code: 'MTOLD001' },
    { id: 'n2', minerId: 'g1' },
  ];

  it('names a Miner by their own code, grouped or not', () => {
    const codes = recognisedCodes(notices, ['g1', 'solo:20']);
    const by = (reason: string, characterId = 99) =>
      matchDonation({ characterId, reason }, book(codes));
    expect(by(`tax ${minerPaymentCode('g1')}`)).toMatchObject({ minerId: 'g1' });
    expect(by(minerPaymentCode('solo:20'))).toMatchObject({ minerId: 'solo:20' });
  });

  it('still names a Miner by a code a notice already mailed', () => {
    const codes = recognisedCodes(notices, []);
    expect(matchDonation({ characterId: 99, reason: 'MTOLD001' }, book(codes))).toMatchObject({
      minerId: 'solo:30',
    });
  });

  it('lists each code once', () => {
    const codes = recognisedCodes([...notices, { id: 'n3', minerId: 'g1' }], ['g1', 'g1']);
    expect(codes.map((c) => c.code)).toEqual([
      'MTOLD001',
      minerPaymentCode('solo:30'),
      minerPaymentCode('g1'),
    ]);
  });

  it('a code only says whose money it is: no notice is pinned to the payment', () => {
    const codes = recognisedCodes(notices, ['g1']);
    const resolved = resolveDonations(
      [
        {
          refId: 1,
          division: 1,
          characterId: 99,
          amount: 5,
          at: '2026-11-01T00:00:00Z',
          reason: 'MTOLD001',
        },
      ],
      book(codes)
    ).map(withoutNotice);
    expect(resolved).toEqual([
      {
        refId: 1,
        division: 1,
        characterId: 99,
        amount: 5,
        at: '2026-11-01T00:00:00Z',
        reason: 'MTOLD001',
        minerId: 'solo:30',
      },
    ]);
  });
});
