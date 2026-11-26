import { describe, expect, it } from 'vitest';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { minerPaymentCode } from '../../../../functions/src/corpTaxBookLateNotice';
import { mailRecipientOf, mailTarget } from './lateNoticeMailing';

const notice = { id: 'n1' };
const miner = {
  id: 'solo:1',
  mainCharacterId: 1,
  characterIds: [1],
  owed: 1,
} as MinerRow;
const ctx = (settings?: unknown) =>
  ({
    names: { character: () => 'Pilot' },
    view: { input: { overdueDays: 14 }, internals: { byMiner: new Map() } },
    ...(settings !== undefined ? { settings } : {}),
  }) as unknown as Parameters<typeof mailTarget>[0];

describe('mailTarget (#6204)', () => {
  it("names the Accounts the book reads donations from, the corp's own name first", () => {
    const target = mailTarget(
      ctx({ divisions: [3], divisionNames: { 3: 'MOON TAXES' } }),
      notice,
      miner
    );
    expect(target.accounts).toEqual(['MOON TAXES']);
    expect(target.code).toBe(minerPaymentCode('solo:1'));
  });

  it('names none for a book whose settings carry no divisions (older docs, fixtures)', () => {
    expect(mailTarget(ctx({}), notice, miner).accounts).toBeUndefined();
    expect(mailTarget(ctx(), notice, miner).accounts).toBeUndefined();
  });
});

describe('mailRecipientOf (Player groups)', () => {
  const group = { mainCharacterId: 9, characterIds: [9, 4, 2] } as MinerRow;
  it('mails the main when it is in the corporation', () => {
    expect(mailRecipientOf(group, new Set([9, 4]))).toBe(9);
  });
  it('never mails an outsider main while a group member is in the corporation', () => {
    expect(mailRecipientOf(group, new Set([4, 2]))).toBe(2);
  });
  it('falls back to the main when no member is in the corporation, or membership is unknown', () => {
    expect(mailRecipientOf(group, new Set([77]))).toBe(9);
    expect(mailRecipientOf(group, undefined)).toBe(9);
  });
  it('mails a character in no group as itself', () => {
    expect(mailRecipientOf({ mainCharacterId: 5, characterIds: [5] } as MinerRow, new Set())).toBe(
      5
    );
  });
});
