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
      foldEnabled: true,
      walletStandalone: true,
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
      foldEnabled: true,
      walletStandalone: true,
    });
    expect(result.feedFires).toEqual([]);
    // A toast already shown cannot take the amount, so the browser keeps its own.
    expect(result.browserFires).toEqual([wallet(1, 100), wallet(2, -5)]);
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
      foldEnabled: true,
      walletStandalone: true,
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
      foldEnabled: true,
      walletStandalone: true,
    });
    expect(result.feedFires).toEqual([{ ...completed, walletChangeIsk: 100 }]);
    expect(result.browserFires).toEqual(fires);
  });
  it('drops a below-minimum line that nothing absorbs, but counts it when a contract carries it', async () => {
    const small = { ...wallet(1, 40), belowThreshold: true } as AnyNotificationFire;
    const alone = await foldWalletFires({
      fires: [small],
      isEnabled: () => true,
      rowExists: async () => false,
      nowMs: NOW,
      foldEnabled: true,
      walletStandalone: true,
    });
    expect(alone.feedFires).toEqual([]);
    expect(alone.browserFires).toEqual([]);

    const carried = await foldWalletFires({
      fires: [wallet(2, 100), small],
      isEnabled: () => true,
      rowExists: async (key) => key === rowKey,
      nowMs: NOW,
      foldEnabled: true,
      walletStandalone: true,
    });
    expect(carried.revisions).toEqual([
      { eventId: 'contractCompleted', characterId: 7, contractId: 55, walletChangeIsk: 140 },
    ]);
  });

  it('counts the lines for a contract even when Wallet Balance Changed itself is off', async () => {
    const lines = [wallet(1, 100), wallet(2, 5_000)];
    const result = await foldWalletFires({
      fires: lines,
      isEnabled: () => true,
      rowExists: async (key) => key === rowKey,
      nowMs: NOW,
      foldEnabled: true,
      walletStandalone: false,
    });
    expect(result.feedFires).toEqual([]);
    expect(result.revisions[0].walletChangeIsk).toBe(5_100);
    const orphan = await foldWalletFires({
      fires: [{ ...wallet(3, 7), refType: 'bounty_prizes' } as AnyNotificationFire],
      isEnabled: () => true,
      rowExists: async () => false,
      nowMs: NOW,
      foldEnabled: true,
      walletStandalone: false,
    });
    expect(orphan.feedFires).toEqual([]);
  });

  it('with folding off passes standalone wallet fires through and drops the rest', async () => {
    const small = { ...wallet(1, 40), belowThreshold: true } as AnyNotificationFire;
    const big = wallet(2, 900);
    const result = await foldWalletFires({
      fires: [small, big],
      isEnabled: () => true,
      rowExists: async () => true,
      nowMs: NOW,
      foldEnabled: false,
      walletStandalone: true,
    });
    expect(result.feedFires).toEqual([big]);
    expect(result.revisions).toEqual([]);
  });

  it('with folding off and the wallet event off, nothing is heard', async () => {
    const result = await foldWalletFires({
      fires: [wallet(1, 900)],
      isEnabled: () => true,
      rowExists: async () => true,
      nowMs: NOW,
      foldEnabled: false,
      walletStandalone: false,
    });
    expect(result.feedFires).toEqual([]);
    expect(result.browserFires).toEqual([]);
  });
});
