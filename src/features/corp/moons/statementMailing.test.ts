import { describe, expect, it } from 'vitest';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import type { Statement } from '@/engine/corpTaxBook/statements';
import { mailTarget } from './statementMailing';

const statement = {
  id: 's1',
  code: 'ABC',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  issuedAt: '2026-11-01T00:00:00Z',
  lines: [],
} as unknown as Statement;
const miner = { mainCharacterId: 1 } as MinerRow;
const ctx = (settings?: unknown) =>
  ({
    names: { character: () => 'Pilot' },
    view: { input: { overdueDays: 14 } },
    ...(settings !== undefined ? { settings } : {}),
  }) as unknown as Parameters<typeof mailTarget>[0];

describe('mailTarget (#6204)', () => {
  it("names the Accounts the book reads donations from, the corp's own name first", () => {
    const target = mailTarget(
      ctx({ divisions: [3], divisionNames: { 3: 'MOON TAXES' } }),
      statement,
      miner,
      {
        amountDue: 1,
        carried: 0,
      }
    );
    expect(target.accounts).toEqual(['MOON TAXES']);
  });

  it('names none for a book whose settings carry no divisions (older docs, fixtures)', () => {
    expect(
      mailTarget(ctx({}), statement, miner, { amountDue: 1, carried: 0 }).accounts
    ).toBeUndefined();
    expect(
      mailTarget(ctx(), statement, miner, { amountDue: 1, carried: 0 }).accounts
    ).toBeUndefined();
  });
});
