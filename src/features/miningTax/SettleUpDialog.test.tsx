import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { MiningTaxAssignmentRecord } from '@/db';
import type { LedgerActionResult } from './ledgerActions';
import { SettleUpDialog, type SettleUpRow } from './SettleUpDialog';

const settle = vi.fn<(...args: unknown[]) => Promise<LedgerActionResult>>();
vi.mock('./ledgerActions', () => ({
  settle: (...args: unknown[]) => settle(...args),
}));

vi.mock('@/features/openInEve/OpenInEveButton', () => ({
  OpenInEveButton: ({
    id,
    kind,
    lookup,
    characterId,
    label,
  }: {
    id: number;
    kind: string;
    lookup?: unknown;
    characterId?: number;
    label?: string;
  }) => (
    <button type="button" data-from={characterId} title={label}>
      {`Open ${kind} ${lookup ? 'by name' : String(id)}`}
    </button>
  ),
}));

function assignment(
  id: string,
  date: string,
  taxOwed: number,
  payeeId = 'p-jita'
): MiningTaxAssignmentRecord {
  return {
    id,
    characterId: 1,
    date,
    solarSystemId: 30000142,
    payeeId,
    oreLines: [],
    taxPct: 10,
    estimatedValue: taxOwed * 10,
    taxOwed,
    status: 'outstanding',
    updatedAt: 1,
  };
}

const row = (a: MiningTaxAssignmentRecord, payeeName = 'Corp Wallet'): SettleUpRow => ({
  assignment: a,
  characterName: 'Miner Alt',
  payeeName,
});

const ONE_ROW = [row(assignment('a-1', '2026-09-30', 10_000))];
const THREE_ROWS = [
  row(assignment('a-3', '2026-09-06', 300_000)),
  row(assignment('a-1', '2026-09-04', 100_000)),
  row(assignment('a-2', '2026-09-05', 200_000)),
];

function renderDialog(
  rows: readonly SettleUpRow[],
  extra: {
    onPickFromWallet?: (tickedIds: ReadonlySet<string>) => void;
    onPaid?: () => void;
    payerId?: number;
    focusIds?: ReadonlySet<string>;
  } = {}
) {
  return render(
    <SettleUpDialog
      open
      onClose={vi.fn()}
      rows={rows}
      systemNames={new Map([[30000142, 'Jita']])}
      onPaid={extra.onPaid ?? vi.fn()}
      onPickFromWallet={extra.onPickFromWallet}
      payerId={extra.payerId}
      focusIds={extra.focusIds}
    />
  );
}

function paidIds(): string[] {
  const [assignments] = settle.mock.calls[0] as [MiningTaxAssignmentRecord[]];
  return assignments.map((a) => a.id).sort();
}

function recordedPayment(): Record<string, unknown> | undefined {
  return settle.mock.calls[0][1] as Record<string, unknown> | undefined;
}

const RECORD = 'I sent it · record payment';

describe('SettleUpDialog', () => {
  it('offers Open in EVE above To: by id for a verified Payee, by name lookup otherwise', () => {
    const { unmount } = renderDialog([{ ...ONE_ROW[0], payeeEntityId: 98_000_001 }]);
    expect(screen.getByRole('button', { name: 'Open information 98000001' })).toBeInTheDocument();
    unmount();

    renderDialog(ONE_ROW);
    expect(screen.getByRole('button', { name: 'Open information by name' })).toBeInTheDocument();
  });

  it('puts Open in EVE first, then the To and Amount copy rows below it', () => {
    renderDialog([{ ...ONE_ROW[0], payeeEntityId: 98_000_001 }]);
    const open = screen.getByRole('button', { name: 'Open information 98000001' });
    const copyTo = screen.getByRole('button', { name: 'Copy To' });
    const copyAmount = screen.getByRole('button', { name: 'Copy Amount' });
    expect(open.compareDocumentPosition(copyTo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      copyTo.compareDocumentPosition(copyAmount) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  beforeEach(() => {
    settle.mockReset();
    settle.mockResolvedValue({ ok: true, value: undefined });
  });

  it('is one screen: amount, payee and reason are copyable without a Next step', () => {
    renderDialog(THREE_ROWS);

    expect(screen.getByRole('dialog', { name: 'Settle up — Corp Wallet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next: pay in game' })).not.toBeInTheDocument();
    expect(screen.getAllByText('600,000 ISK').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Copy Amount' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy To' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Reason' })).toBeInTheDocument();
  });

  it('lists 2+ entries expanded, but folds a single entry into a one-line summary', async () => {
    const { unmount } = renderDialog(THREE_ROWS);
    expect(screen.getByRole('checkbox', { name: 'Include 2026-09-04' })).toBeInTheDocument();
    unmount();

    renderDialog(ONE_ROW);
    expect(screen.queryByRole('checkbox', { name: 'Include 2026-09-30' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /1 entry · 2026-09-30/ }));
    expect(screen.getByRole('checkbox', { name: 'Include 2026-09-30' })).toBeChecked();
  });

  it('gives each Payee its own amount and recipient when the entries span several', () => {
    renderDialog([
      row(assignment('a-1', '2026-09-04', 100_000, 'p-1'), 'Alpha Corp'),
      row(assignment('a-2', '2026-09-05', 250_000, 'p-2'), 'Beta Corp'),
    ]);

    expect(screen.getByRole('dialog', { name: 'Settle up — 2 payees' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copy Amount' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Copy To' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Copy Reason' })).toHaveLength(1);
    expect(screen.getAllByText('100,000 ISK').length).toBeGreaterThan(0);
    expect(screen.getAllByText('250,000 ISK').length).toBeGreaterThan(0);
  });

  it('records the whole total as the payment', async () => {
    const onPaid = vi.fn();
    renderDialog(THREE_ROWS, { onPaid });

    await userEvent.click(screen.getByRole('button', { name: RECORD }));

    await waitFor(() => expect(onPaid).toHaveBeenCalled());
    expect(paidIds()).toEqual(['a-1', 'a-2', 'a-3']);
    expect(recordedPayment()).toMatchObject({ method: 'donation', amount: 600_000 });
  });

  it('"Just mark paid" records no payment', async () => {
    renderDialog(THREE_ROWS);

    await userEvent.click(screen.getByRole('button', { name: 'Just mark paid' }));

    await waitFor(() => expect(settle).toHaveBeenCalled());
    expect(recordedPayment()).toBeUndefined();
  });

  it('pays the oldest entries a smaller amount covers and records the amount sent', async () => {
    renderDialog(THREE_ROWS);

    await userEvent.click(screen.getByRole('button', { name: 'Sent a different amount?' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Amount you sent' }), '350,000');

    expect(screen.getByRole('checkbox', { name: 'Include 2026-09-04' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Include 2026-09-05' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Include 2026-09-06' })).not.toBeChecked();
    expect(screen.getByText('Pays 2 of 3 entries · 50,000 ISK left over')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: RECORD }));

    await waitFor(() => expect(settle).toHaveBeenCalled());
    expect(paidIds()).toEqual(['a-1', 'a-2']);
    expect(recordedPayment()).toMatchObject({ amount: 350_000 });
  });

  it('says so when the amount is not enough for the oldest entry', async () => {
    renderDialog(THREE_ROWS);

    await userEvent.click(screen.getByRole('button', { name: 'Sent a different amount?' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Amount you sent' }), '50000');

    expect(screen.getByText('Not enough for the oldest entry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: RECORD })).toBeDisabled();
  });

  it('restores the ticks when the different amount is put away', async () => {
    renderDialog(THREE_ROWS);

    await userEvent.click(screen.getByRole('button', { name: 'Sent a different amount?' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Amount you sent' }), '100000');
    expect(screen.getByRole('checkbox', { name: 'Include 2026-09-06' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Sent the full amount' }));
    expect(screen.getByRole('checkbox', { name: 'Include 2026-09-06' })).toBeChecked();
  });

  it('records a contract id as a manual contract link, not the legacy field', async () => {
    renderDialog(THREE_ROWS);

    await userEvent.click(screen.getByRole('button', { name: 'Contract' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Contract id' }), '123456');
    await userEvent.click(screen.getByRole('button', { name: RECORD }));

    await waitFor(() => expect(settle).toHaveBeenCalled());
    const payment = recordedPayment();
    expect(payment).toMatchObject({
      method: 'contract',
      contractLinks: [{ refId: 123456, source: 'manual' }],
    });
    expect(payment).not.toHaveProperty('contractId');
  });

  it('offers the wallet picker only when given one', async () => {
    const onPickFromWallet = vi.fn();
    const { unmount } = renderDialog(THREE_ROWS);
    expect(
      screen.queryByRole('button', { name: 'Already in my wallet? Pick it' })
    ).not.toBeInTheDocument();
    unmount();

    renderDialog(THREE_ROWS, { onPickFromWallet });
    await userEvent.click(screen.getByRole('button', { name: 'Already in my wallet? Pick it' }));
    expect(onPickFromWallet).toHaveBeenCalledOnce();
    expect(onPickFromWallet).toHaveBeenCalledWith(new Set(['a-1', 'a-2', 'a-3']));
  });
});

describe('SettleUpDialog paying from one Character', () => {
  const ARCHANGEL = 1;
  const OTICHODA = 2;
  const by = (
    characterId: number,
    characterName: string,
    id: string,
    date: string,
    taxOwed: number
  ): SettleUpRow => ({
    assignment: { ...assignment(id, date, taxOwed), characterId },
    characterName,
    payeeName: 'Corp Wallet',
    payeeEntityId: 98_000_001,
  });
  const MIXED = [
    by(ARCHANGEL, 'Ashken Archangel', 'arch-1', '2026-10-20', 18_000_000),
    by(OTICHODA, 'Ashken Otichoda', 'oti-1', '2026-10-20', 1_300_000),
    by(OTICHODA, 'Ashken Otichoda', 'oti-2', '2026-10-21', 8_300_000),
  ];

  beforeEach(() => {
    settle.mockReset();
    settle.mockResolvedValue({ ok: true, value: undefined });
  });

  it("asks who pays when the entries span Characters, ticking only the payer's", async () => {
    renderDialog(MIXED, { payerId: OTICHODA });
    const from = screen.getByRole('group', { name: 'Paying from' });
    expect(from).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ashken Otichoda · 9,600,000 ISK/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await userEvent.click(screen.getByRole('button', { name: RECORD }));
    expect(paidIds()).toEqual(['oti-1', 'oti-2']);
  });

  it('opens the Payee in EVE from the paying Character, on its own row', () => {
    renderDialog(MIXED, { payerId: OTICHODA });
    const open = screen.getByRole('button', { name: 'Open information 98000001' });
    expect(open).toHaveAttribute('data-from', String(OTICHODA));
    expect(open).toHaveAttribute('title', 'Open in EVE · Ashken Otichoda');
  });

  it("switching the payer ticks exactly the new payer's entries and opens EVE from it", async () => {
    renderDialog(MIXED, { payerId: OTICHODA });
    await userEvent.click(screen.getByRole('button', { name: /Ashken Archangel · / }));
    expect(screen.getByRole('button', { name: 'Open information 98000001' })).toHaveAttribute(
      'data-from',
      String(ARCHANGEL)
    );
    await userEvent.click(screen.getByRole('button', { name: RECORD }));
    expect(paidIds()).toEqual(['arch-1']);
  });

  it("can tick in another Character's entries to pay on their behalf", async () => {
    renderDialog(MIXED, { payerId: ARCHANGEL });
    await userEvent.click(
      screen.getByRole('button', { name: /Also pay for other characters · 2 entries/ })
    );
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'Include 2026-10-21' })[0]);
    await userEvent.click(screen.getByRole('button', { name: RECORD }));
    expect(paidIds()).toEqual(['arch-1', 'oti-2']);
  });

  it("from one entry, ticks only it and offers the payer's other entries unticked", async () => {
    renderDialog(MIXED, { payerId: OTICHODA, focusIds: new Set(['oti-1']) });
    expect(screen.getByRole('button', { name: /1 entry · 2026-10-20/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Also pay 1 other entry/ }));
    await userEvent.click(screen.getByRole('button', { name: RECORD }));
    expect(paidIds()).toEqual(['oti-1']);
  });

  it('adds a held-back entry of the same payer when ticked in', async () => {
    renderDialog(MIXED, { payerId: OTICHODA, focusIds: new Set(['oti-1']) });
    await userEvent.click(screen.getByRole('button', { name: /Also pay 1 other entry/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include 2026-10-21' }));
    await userEvent.click(screen.getByRole('button', { name: RECORD }));
    expect(paidIds()).toEqual(['oti-1', 'oti-2']);
  });

  it('asks nothing when one Character owes it all', () => {
    renderDialog(THREE_ROWS);
    expect(screen.queryByRole('group', { name: 'Paying from' })).not.toBeInTheDocument();
  });
});
