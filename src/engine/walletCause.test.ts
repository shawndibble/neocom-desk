import { describe, expect, it } from 'vitest';
import { absorbWalletFires, contractCauseOf } from './walletCause';
import type { ContractNotificationFire, WalletNotificationFire } from './notificationDiffs';

const CHAR = 7;

function wallet(
  journalEntryId: number,
  amount: number | null,
  cause: Partial<WalletNotificationFire> = {}
): WalletNotificationFire {
  return {
    eventId: 'walletBalanceChanged',
    characterId: CHAR,
    amount,
    journalEntryId,
    dateMs: 1_000,
    ...cause,
  };
}

function contract(
  eventId: ContractNotificationFire['eventId'],
  contractId: number,
  characterId = CHAR
): ContractNotificationFire {
  return { eventId, characterId, contractId };
}

const price = (id: number, amount: number, contractId = 55) =>
  wallet(id, amount, {
    refType: 'contract_price',
    contextId: contractId,
    contextIdType: 'contract_id',
  });

const all = () => true;
const none = () => false;
const rowExists = () => true;

describe('contractCauseOf', () => {
  it('maps a completion line to contractCompleted', () => {
    expect(
      contractCauseOf({
        refType: 'contract_price',
        contextId: 9,
        contextIdType: 'contract_id',
      })
    ).toEqual({ contractId: 9, eventId: 'contractCompleted' });
  });

  it('maps an escrow-on-accept line to contractAccepted and a refund to contractFailed', () => {
    expect(
      contractCauseOf({
        refType: 'contract_collateral',
        contextId: 1,
        contextIdType: 'contract_id',
      })
    ).toEqual({ contractId: 1, eventId: 'contractAccepted' });
    expect(
      contractCauseOf({
        refType: 'contract_collateral_payout',
        contextId: 1,
        contextIdType: 'contract_id',
      })
    ).toEqual({ contractId: 1, eventId: 'contractFailed' });
  });

  it('is null for a non-contract line, an unmapped contract type, or a missing/other context', () => {
    expect(contractCauseOf({ refType: 'bounty_prizes' })).toBeNull();
    expect(
      contractCauseOf({
        refType: 'contract_reward_refund',
        contextId: 1,
        contextIdType: 'contract_id',
      })
    ).toBeNull();
    expect(contractCauseOf({ refType: 'contract_price' })).toBeNull();
    expect(
      contractCauseOf({ refType: 'contract_price', contextId: 1, contextIdType: 'station_id' })
    ).toBeNull();
  });
});

describe('absorbWalletFires', () => {
  it('folds the amount into the same-poll contract fire and drops the wallet fire', () => {
    const result = absorbWalletFires(
      [contract('contractCompleted', 55), price(10, 476_740_542)],
      all,
      none
    );
    expect(result.fires).toEqual([
      { ...contract('contractCompleted', 55), walletChangeIsk: 476_740_542 },
    ]);
    expect(result.revisions).toEqual([]);
  });

  it('sums every line behind one contract', () => {
    const result = absorbWalletFires(
      [contract('contractCompleted', 55), price(10, 500), price(11, -20)],
      all,
      none
    );
    expect(result.fires).toEqual([{ ...contract('contractCompleted', 55), walletChangeIsk: 480 }]);
  });

  it('asks for a revision when the contract alert fired in an earlier poll and its row exists', () => {
    const result = absorbWalletFires([price(10, 300), price(11, -10)], all, rowExists);
    expect(result.fires).toEqual([]);
    expect(result.revisions).toEqual([
      { characterId: CHAR, contractId: 55, eventId: 'contractCompleted', amountIsk: 290 },
    ]);
  });

  it('keeps the wallet fire when no contract alert carries it — no row, no same-poll fire', () => {
    const fires = [price(10, 300)];
    expect(absorbWalletFires(fires, all, none)).toEqual({ fires, revisions: [] });
  });

  it('does not fold into a same-poll contract fire whose event is not enabled', () => {
    const fires = [contract('contractCompleted', 55), price(10, 300)];
    const off = (eventId: string) => eventId !== 'contractCompleted';
    expect(absorbWalletFires(fires, off, none)).toEqual({ fires, revisions: [] });
  });

  it('keeps wallet fires that no contract explains, and other characters', () => {
    const plain = wallet(12, 5_000_000);
    const otherChar = { ...price(13, 100, 55), characterId: 99 };
    const result = absorbWalletFires(
      [contract('contractCompleted', 55), plain, otherChar],
      all,
      none
    );
    expect(result.fires).toEqual([contract('contractCompleted', 55), plain, otherChar]);
    expect(result.revisions).toEqual([]);
  });

  it('only folds a line into the contract event that its ref_type names', () => {
    const fires = [contract('contractAccepted', 55), price(10, 300)];
    expect(absorbWalletFires(fires, all, none)).toEqual({ fires, revisions: [] });
  });
});
