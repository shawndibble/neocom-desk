import { describe, expect, it } from 'vitest';
import { foldWalletFires } from './walletFold';
import type { AnyNotificationFire } from './pollDomains';

const NOW = 1_700_000_000_000;
const wallet = (id: number, amount: number): AnyNotificationFire => ({
  eventId: 'walletBalanceChanged',
  characterId: 7,
  amount,
  journalEntryId: id,
  dateMs: NOW,
  refType: 'contract_price',
  contextId: 55,
  contextIdType: 'contract_id',
});
const completed: AnyNotificationFire = {
  eventId: 'contractCompleted',
  characterId: 7,
  contractId: 55,
};
const rowKey = '7:contractCompleted:55';

describe('foldWalletFires', () => {
  it('folds the amount into a same-poll contract fire on both channels', async () => {
    const result = await foldWalletFires({
      fires: [completed, wallet(1, 100)],
      isEnabled: () => true,
      rowExists: async () => false,
      nowMs: NOW,
    });
    const folded = [{ ...completed, walletChangeIsk: 100 }];
    expect(result.feedFires).toEqual(folded);
    expect(result.browserFires).toEqual(folded);
    expect(result.revisions).toEqual([]);
  });

  it('revises the contract row when the alert fired in an earlier poll', async () => {
    const result = await foldWalletFires({
      fires: [wallet(1, 100), wallet(2, -5)],
      isEnabled: () => true,
      rowExists: async (key) => key === rowKey,
      nowMs: NOW,
    });
    expect(result.feedFires).toEqual([]);
    expect(result.browserFires).toEqual([]);
    expect(result.revisions).toEqual([
      { eventId: 'contractCompleted', characterId: 7, contractId: 55, walletChangeIsk: 95 },
    ]);
  });

  it('keeps the wallet fire when no contract alert carries it', async () => {
    const fires = [wallet(1, 100)];
    const result = await foldWalletFires({
      fires,
      isEnabled: () => true,
      rowExists: async () => false,
      nowMs: NOW,
    });
    expect(result.feedFires).toEqual(fires);
    expect(result.browserFires).toEqual(fires);
  });

  it('folds per channel: a contract alert on the feed only leaves the browser wallet alert', async () => {
    const fires = [completed, wallet(1, 100)];
    const result = await foldWalletFires({
      fires,
      isEnabled: (channel) => channel === 'feed',
      rowExists: async () => false,
      nowMs: NOW,
    });
    expect(result.feedFires).toEqual([{ ...completed, walletChangeIsk: 100 }]);
    expect(result.browserFires).toEqual(fires);
  });
});
