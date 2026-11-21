import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { MiningTaxAssignmentRecord } from '@/db';
import { PayeeAccount } from '@/engine/miningTax/payeeAccount';
import type { LedgerActionResult } from './ledgerActions';
import { SettleUpDialog, type SettlePayment, type SettleUpRow } from './SettleUpDialog';

vi.mock('@/features/openInEve/OpenInEveButton', () => ({
  OpenInEveButton: ({ kind, characterId }: { kind: string; characterId?: number }) => (
    <button type="button" data-from={characterId}>{`Open ${kind}`}</button>
  ),
}));

function assignment(id: string, date: string, taxOwed: number, characterId = 1) {
  return {
    id,
    characterId,
    date,
    solarSystemId: 30000142,
    payeeId: 'p-jita',
    oreLines: [],
    taxPct: 10,
    estimatedValue: taxOwed * 10,
    taxOwed,
    status: 'outstanding',
    updatedAt: 1,
  } satisfies MiningTaxAssignmentRecord;
}

const row = (a: MiningTaxAssignmentRecord, characterName = 'Miner Alt'): SettleUpRow => ({
  assignment: a,
  characterName,
  payeeName: 'Corp Wallet',
});

const ROWS = [
  row(assignment('a-1', '2026-09-04', 100_000)),
  row(assignment('a-2', '2026-09-05', 200_000)),
  row(assignment('a-3', '2026-09-06', 300_000)),
];

const accountOf = (rows: readonly SettleUpRow[]) =>
  PayeeAccount.build({
    payeeId: 'p-jita',
    charges: rows.map((r) => ({
      id: r.assignment.id,
      date: r.assignment.date,
      tax: r.assignment.taxOwed,
    })),
    links: [],
  });

function renderDialog(
  extra: {
    rows?: readonly SettleUpRow[];
    record?: (p: SettlePayment) => Promise<LedgerActionResult>;
    onPaid?: () => void;
    onPickFromWallet?: () => void;
    reason?: string | ((payerId: number | null) => string | undefined);
  } = {}
) {
  const rows = extra.rows ?? ROWS;
  const account = accountOf(rows);
  return render(
    <SettleUpDialog
      open
      onClose={vi.fn()}
      rows={rows}
      onPaid={extra.onPaid ?? vi.fn()}
      owedFor={() => account.owes?.amount ?? 0}
      preview={(amount, paidOn) => account.preview(amount, paidOn)}
      reason={extra.reason ?? 'Moon tax · Jita · 2026-09-04 – 2026-09-06'}
      {...(extra.record ? { record: extra.record } : {})}
      {...(extra.onPickFromWallet ? { onPickFromWallet: extra.onPickFromWallet } : {})}
    />
  );
}

describe('SettleUpDialog', () => {
  it("offers what the Payee's account owes, with no entries to tick", () => {
    renderDialog({ record: vi.fn() });
    expect(screen.getByText('600,000 ISK')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('says what the amount pays, oldest day first', () => {
    renderDialog({ record: vi.fn() });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('2026-09-04');
    expect(status).toHaveTextContent('2026-09-06');
  });

  it('a smaller amount part-pays the next day, and says what is left', async () => {
    const user = userEvent.setup();
    renderDialog({ record: vi.fn() });
    await user.click(screen.getByRole('button', { name: /different amount/i }));
    await user.type(screen.getByRole('textbox', { name: /amount you sent/i }), '150000');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('2026-09-05');
    expect(status).toHaveTextContent(/150,000 ISK still owed/);
    expect(status).not.toHaveTextContent('2026-09-06');
  });

  it('keeps what is over as credit', async () => {
    const user = userEvent.setup();
    renderDialog({ record: vi.fn() });
    await user.click(screen.getByRole('button', { name: /different amount/i }));
    await user.type(screen.getByRole('textbox', { name: /amount you sent/i }), '700000');
    expect(screen.getByRole('status')).toHaveTextContent(/100,000 ISK more than is owed/);
  });

  it('records one payment for the Payee: the amount sent and the day', async () => {
    const user = userEvent.setup();
    const record = vi.fn(async (): Promise<LedgerActionResult> => ({ ok: true, value: undefined }));
    const onPaid = vi.fn();
    renderDialog({ record, onPaid });
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(onPaid).toHaveBeenCalledOnce());
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 600_000, method: 'donation' })
    );
  });

  it('hands the contract id of a payment in kind to the record', async () => {
    const user = userEvent.setup();
    const record = vi.fn<(payment: SettlePayment) => Promise<LedgerActionResult>>(async () => ({
      ok: true,
      value: undefined,
    }));
    renderDialog({ record });
    await user.click(screen.getByRole('button', { name: 'Contract' }));
    await user.type(screen.getByRole('textbox', { name: 'Contract id' }), '42');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(record).toHaveBeenCalled());
    expect(record.mock.calls[0]![0]).toMatchObject({ method: 'contract', contractId: 42 });
  });

  it('records nothing for a Corp Tax Book: it only says how to send the money', () => {
    renderDialog({ reason: () => 'MTABC123' });
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
    expect(screen.queryByText('Paid on')).not.toBeInTheDocument();
    expect(screen.getByText('MTABC123')).toBeInTheDocument();
  });

  it('asks who is paying when the entries are more than one Character’s', () => {
    renderDialog({
      record: vi.fn(),
      rows: [
        row(assignment('a-1', '2026-09-04', 100_000, 1), 'Main'),
        row(assignment('a-2', '2026-09-05', 200_000, 2), 'Alt'),
      ],
    });
    expect(screen.getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed');
    expect(screen.getByRole('button', { name: 'Alt' })).toHaveAttribute('aria-pressed');
  });

  it('hands off to the wallet picker when the payment already shows', async () => {
    const user = userEvent.setup();
    const onPickFromWallet = vi.fn();
    renderDialog({ record: vi.fn(), onPickFromWallet });
    await user.click(screen.getByRole('button', { name: /already in my wallet/i }));
    expect(onPickFromWallet).toHaveBeenCalledOnce();
  });
});
