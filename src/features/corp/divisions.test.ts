import { describe, it, expect } from 'vitest';
import { hangarDivisions, walletDivisions } from './divisions';

const WALLETS = [
  { division: 3, balance: 300 },
  { division: 1, balance: 100 },
  { division: 2, balance: 200 },
];

describe('walletDivisions', () => {
  it('joins each wallet to the name the corporation gave it, in division order', () => {
    const result = walletDivisions(WALLETS, {
      wallet: [
        { division: 1, name: 'Master Wallet' },
        { division: 3, name: 'SRP' },
      ],
    });

    expect(result).toEqual([
      { division: 1, name: 'Master Wallet', balance: 100 },
      { division: 2, name: null, balance: 200 },
      { division: 3, name: 'SRP', balance: 300 },
    ]);
  });

  /**
   * `read_divisions` is a separate scope and its own read: it can be missing
   * or fail while the balances load fine. Every division must still be
   * selectable — a missing name costs a label, a missing division would hide
   * a wallet.
   */
  it('keeps every division when the names are unavailable', () => {
    expect(walletDivisions(WALLETS, null).map((d) => d.division)).toEqual([1, 2, 3]);
    expect(walletDivisions(WALLETS, null).every((d) => d.name === null)).toBe(true);
  });

  /** ESI omits `name` for a division still on its default, and sends blanks besides. */
  it('treats an omitted or blank name as no name at all', () => {
    const result = walletDivisions([{ division: 1, balance: 1 }], {
      wallet: [{ division: 1, name: '   ' }, { division: 2 }],
    });

    expect(result).toEqual([{ division: 1, name: null, balance: 1 }]);
  });

  /** The hangar divisions share the payload and are not wallets. */
  it('ignores hangar division names', () => {
    const result = walletDivisions([{ division: 1, balance: 1 }], {
      hangar: [{ division: 1, name: 'Ships' }],
    });

    expect(result[0].name).toBeNull();
  });
});

describe('hangarDivisions', () => {
  /**
   * Unlike `walletDivisions`, there is no "the wallets read" list to drive
   * which divisions exist — a corp-assets surface groups by division number
   * derived straight from `location_flag`, so all seven must be addressable
   * whether or not the corporation ever renamed any of them.
   */
  it('always returns all seven divisions, named where the corp named them', () => {
    const result = hangarDivisions({
      hangar: [
        { division: 1, name: 'Ships' },
        { division: 5, name: 'BPOs' },
      ],
    });

    expect(result).toEqual([
      { division: 1, name: 'Ships' },
      { division: 2, name: null },
      { division: 3, name: null },
      { division: 4, name: null },
      { division: 5, name: 'BPOs' },
      { division: 6, name: null },
      { division: 7, name: null },
    ]);
  });

  /** `read_divisions` can be missing or fail on its own — the numbered fallback still works. */
  it('keeps every division when the names are unavailable', () => {
    expect(hangarDivisions(null).map((d) => d.division)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(hangarDivisions(null).every((d) => d.name === null)).toBe(true);
  });

  /** ESI omits `name` for a division still on its default, and sends blanks besides. */
  it('treats an omitted or blank name as no name at all', () => {
    const result = hangarDivisions({
      hangar: [{ division: 1, name: '   ' }, { division: 2 }],
    });

    expect(result[0]).toEqual({ division: 1, name: null });
    expect(result[1]).toEqual({ division: 2, name: null });
  });

  /** The wallet divisions share the payload and are not hangars. */
  it('ignores wallet division names', () => {
    const result = hangarDivisions({ wallet: [{ division: 1, name: 'Master Wallet' }] });
    expect(result[0].name).toBeNull();
  });
});
