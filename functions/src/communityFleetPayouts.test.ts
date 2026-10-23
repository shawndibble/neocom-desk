import { describe, expect, it } from 'vitest';
import {
  FLEET_PAYOUT_EXPIRED_RETENTION_MS,
  MAX_FLEET_SHARES,
  MAX_OPEN_PAYOUTS_PER_MEMBER,
  MAX_PAYOUT_ISK,
  decideCreate,
  decideFleetPayoutSweep,
  decideOwnerAction,
  distributableIsk,
  parseCreateFleetPayoutInput,
  parseFleetPayoutIdInput,
  parseSetFleetShareDoneInput,
  type FleetPayoutDraft,
} from './communityFleetPayouts.js';

const share = (over: Record<string, unknown> = {}) => ({
  pilotName: 'Alice',
  characterId: 11,
  weight: 1,
  isk: 45,
  ...over,
});
const input = (over: Record<string, unknown> = {}) => ({
  communityId: 'c1',
  name: ' Roam loot ',
  totalIsk: 100,
  holdBackPct: 10,
  rule: 'equal',
  shares: [share(), share({ pilotName: 'Bob', characterId: 12, isk: 45 })],
  ...over,
});
const draft = (over: Partial<FleetPayoutDraft> = {}): FleetPayoutDraft => ({
  ...parseCreateFleetPayoutInput(input()),
  ...over,
});

describe('parseCreateFleetPayoutInput', () => {
  it('trims and returns the draft', () => {
    const parsed = parseCreateFleetPayoutInput(input());
    expect(parsed.name).toBe('Roam loot');
    expect(parsed.shares).toHaveLength(2);
  });

  it.each([
    ['empty name', { name: '  ' }],
    ['long name', { name: 'x'.repeat(61) }],
    ['fractional total', { totalIsk: 1.5 }],
    ['negative total', { totalIsk: -1 }],
    ['huge total', { totalIsk: MAX_PAYOUT_ISK + 1 }],
    ['hold-back over 50', { holdBackPct: 51 }],
    ['fractional hold-back', { holdBackPct: 5.5 }],
    ['bad rule', { rule: 'random' }],
    ['no shares', { shares: [] }],
    ['not an array', { shares: 'x' }],
    ['empty pilot', { shares: [share({ pilotName: ' ' })] }],
    ['long pilot', { shares: [share({ pilotName: 'x'.repeat(41) })] }],
    ['zero characterId', { shares: [share({ characterId: 0 })] }],
    ['weight 0', { shares: [share({ weight: 0 })] }],
    ['weight 1001', { shares: [share({ weight: 1001 })] }],
    ['negative isk', { shares: [share({ isk: -1 })] }],
    ['fractional isk', { shares: [share({ isk: 0.5 })] }],
  ])('rejects %s', (_label, over) => {
    expect(() => parseCreateFleetPayoutInput(input(over))).toThrow();
  });

  it('accepts a null characterId and rejects too many shares as resource-exhausted', () => {
    expect(
      parseCreateFleetPayoutInput(input({ shares: [share({ characterId: null })] })).shares[0]
        .characterId
    ).toBeNull();
    const many = Array.from({ length: MAX_FLEET_SHARES + 1 }, (_, i) =>
      share({ pilotName: `P${i}`, characterId: i + 1, isk: 0 })
    );
    expect(() => parseCreateFleetPayoutInput(input({ shares: many }))).toThrowError(
      expect.objectContaining({ code: 'resource-exhausted' })
    );
  });
});

describe('decideCreate', () => {
  it('accepts shares up to the distributable amount', () => {
    expect(distributableIsk(100, 10)).toBe(90);
    expect(decideCreate(draft(), 0)).toBe('ok');
  });

  it('rounds the distributable amount down', () => {
    expect(distributableIsk(101, 10)).toBe(90);
  });

  it('rejects shares that exceed the pile after the hold-back', () => {
    expect(decideCreate(draft({ shares: [share({ isk: 91 })] }), 0)).toBe('shares-exceed-total');
  });

  it('rejects the same Character twice, and the same unresolved name case-insensitively', () => {
    expect(
      decideCreate(draft({ shares: [share(), share({ pilotName: 'Other', isk: 1 })] }), 0)
    ).toBe('duplicate-pilot');
    expect(
      decideCreate(
        draft({
          shares: [
            share({ characterId: null, isk: 1 }),
            share({ characterId: null, pilotName: 'ALICE', isk: 1 }),
          ],
        }),
        0
      )
    ).toBe('duplicate-pilot');
  });

  it('caps open Fleet Payouts per Member', () => {
    expect(decideCreate(draft(), MAX_OPEN_PAYOUTS_PER_MEMBER - 1)).toBe('ok');
    expect(decideCreate(draft(), MAX_OPEN_PAYOUTS_PER_MEMBER)).toBe('too-many-open-payouts');
  });
});

describe('id inputs and owner action', () => {
  it('parses ids and rejects bad ones', () => {
    expect(parseFleetPayoutIdInput({ communityId: 'c1', payoutId: 'p1' })).toEqual({
      communityId: 'c1',
      payoutId: 'p1',
    });
    expect(() => parseFleetPayoutIdInput({ communityId: 'c1', payoutId: 'a/b' })).toThrow();
    expect(
      parseSetFleetShareDoneInput({ communityId: 'c1', payoutId: 'p1', shareId: '3', paid: true })
    ).toMatchObject({ shareId: '3', paid: true });
    expect(() =>
      parseSetFleetShareDoneInput({ communityId: 'c1', payoutId: 'p1', shareId: '3', paid: 'yes' })
    ).toThrow();
  });

  it('only the owner acts', () => {
    expect(decideOwnerAction({ exists: false, ownerUid: null, callerUid: 'a' })).toBe('not-found');
    expect(decideOwnerAction({ exists: true, ownerUid: 'b', callerUid: 'a' })).toBe('not-owner');
    expect(decideOwnerAction({ exists: true, ownerUid: 'a', callerUid: 'a' })).toBe('ok');
  });
});

describe('decideFleetPayoutSweep', () => {
  const now = 10 * FLEET_PAYOUT_EXPIRED_RETENTION_MS;
  it('deletes a week after expiry, keeps sooner or malformed', () => {
    expect(
      decideFleetPayoutSweep({ expiresAt: now - FLEET_PAYOUT_EXPIRED_RETENTION_MS }, now)
    ).toBe('delete');
    expect(
      decideFleetPayoutSweep({ expiresAt: now - FLEET_PAYOUT_EXPIRED_RETENTION_MS + 1 }, now)
    ).toBe('keep');
    expect(decideFleetPayoutSweep({ expiresAt: NaN }, now)).toBe('keep');
  });
});
