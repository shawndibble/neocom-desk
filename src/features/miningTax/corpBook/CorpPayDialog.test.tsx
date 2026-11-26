import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MinerRunningAccount } from '@/engine/corpTaxBook/minerRunningAccount';
import type { DisplayRow } from '../groupRows';
import { CorpPayDialog } from './CorpPayDialog';
import type { CorpBookViewBook } from './corpBookView';

vi.mock('@/features/openInEve/OpenInEveButton', () => ({
  OpenInEveButton: () => null,
}));

const account = MinerRunningAccount.build({
  days: [
    { date: '2026-11-24', tax: 4_708_748 },
    { date: '2026-11-25', tax: 10_927_349 },
  ],
  payments: [],
});

const book = {
  corpName: 'Brass Meridian Logistics',
  left: false,
  estimateFrom: '2026-11-26',
  payee: { id: 'corp:98000001' },
  loaded: {
    corporationId: 98000001,
    graceHours: 0.5,
    divisions: [1, 3],
    primaryDivision: 1,
    divisionNames: { 1: 'Mining Tax', 3: 'Moon Fund' },
    miners: [],
    characterIds: [1],
    adjustments: [],
  },
  summary: {
    corporationId: 98000001,
    corpName: 'Brass Meridian Logistics',
    startDate: '2026-10-01',
    lastSyncedAt: new Date().toISOString(),
    closedThrough: '2026-11-25',
    credit: 0,
    estimate: 4_807_643,
    account: { paidThrough: '2026-11-23', owes: account.owes },
    miners: [
      {
        minerId: 'solo:1',
        account,
        estimate: 4_807_643,
        estimateDays: [{ date: '2026-11-26', amount: 4_807_643 }],
        code: 'BM7',
      },
    ],
    hubId: 'jita',
    oreForm: 'compressed',
  },
} as unknown as CorpBookViewBook;

const rows = [
  {
    row: { characterName: 'Mero Otichoda' },
    assignment: {
      id: 'a1',
      characterId: 1,
      date: '2026-11-25',
      solarSystemId: 30000142,
      payeeId: 'corp:98000001',
      oreLines: [],
      taxPct: 10,
      estimatedValue: 0,
      taxOwed: 0,
      status: 'outstanding',
      updatedAt: 1,
    },
  },
] as unknown as DisplayRow[];

const renderDialog = () =>
  render(
    <CorpPayDialog
      onClose={vi.fn()}
      onPaid={vi.fn()}
      book={book}
      rows={rows}
      codes={[{ code: 'BM7', character: 'Mero Otichoda', characterIds: [1] }]}
    />
  );

const lines = () =>
  within(screen.getByRole('status'))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('CorpPayDialog', () => {
  it("offers the billed days plus the open day's estimate, each on its own line, with no credit", () => {
    renderDialog();
    expect(screen.getByText('20,443,740 ISK')).toBeInTheDocument();
    expect(lines()).toEqual([
      '2026-11-244,708,748 ISK',
      '2026-11-2510,927,349 ISK',
      '2026-11-26, Estimate until the day closes4,807,643 ISK',
    ]);
    expect(screen.getByText('BM7 11-24/11-26')).toBeInTheDocument();
  });

  it('keeps as credit only what is beyond the billed days and the estimate', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /different amount/i }));
    await user.type(screen.getByRole('textbox', { name: /amount you sent/i }), '21443740');
    expect(lines().at(-1)).toBe('Credit for your next days1,000,000 ISK');
  });

  it('names the account to pay into beside the other divisions the book counts, once', () => {
    renderDialog();
    expect(screen.getByText('Mining Tax')).toBeInTheDocument();
    expect(screen.getByText('or Moon Fund')).toBeInTheDocument();
    expect(screen.queryByText(/of it is/)).not.toBeInTheDocument();
  });
});
