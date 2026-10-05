import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { LedgerActionResult } from './ledgerActions';
import type { GroupMember } from './groupRows';
import type { MadePayment } from './paymentLinks';
import { LinkWalletPaymentDialog } from './LinkWalletPaymentDialog';

const settle = vi.fn<(...args: unknown[]) => Promise<LedgerActionResult>>();
const rememberPayeeEntity = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('./ledgerActions', () => ({
  settle: (...args: unknown[]) => settle(...args),
}));
vi.mock('./payees', () => ({
  rememberPayeeEntity: (...args: unknown[]) => rememberPayeeEntity(...args),
}));

const PAYEE = { id: 'p-1', characterId: 1, name: 'Moon Corp', defaultTaxPct: 10 } as PayeeRecord;

function member(id: string, date: string, taxOwed: number): GroupMember {
  return {
    assignment: { id, date, solarSystemId: 30000142, taxOwed } as MiningTaxAssignmentRecord,
    row: { characterName: 'Pilot One' },
  } as unknown as GroupMember;
}

// Deliberately out of date order: allocation must still pay the oldest first.
const OWED = [
  member('a-3', '2026-09-06', 300_000),
  member('a-1', '2026-09-04', 100_000),
  member('a-2', '2026-09-05', 200_000),
];

const DONATION: MadePayment = {
  key: 'journal:77',
  kind: 'journal',
  refId: 77,
  characterId: 1,
  date: '2026-09-10T12:00:00Z',
  amount: 350_000,
  method: 'donation',
  counterpartyId: 9001,
  counterpartyName: 'Landlord Alt',
  label: 'Player donation',
};

const IN_KIND: MadePayment = {
  key: 'contract:5',
  kind: 'contract',
  refId: 5,
  characterId: 1,
  date: '2026-09-11T08:00:00Z',
  amount: null,
  method: 'contract',
  label: 'Ore',
};

function renderDialog(candidates: readonly MadePayment[] = [DONATION, IN_KIND]) {
  const onLinked = vi.fn();
  const onClose = vi.fn();
  render(
    <LinkWalletPaymentDialog
      open
      onClose={onClose}
      payee={PAYEE}
      owed={OWED}
      candidates={candidates}
      systemNames={new Map([[30000142, 'Jita']])}
      onLinked={onLinked}
    />
  );
  return { onLinked, onClose };
}

function paidIds(): string[] {
  const [assignments] = settle.mock.calls[0] as [MiningTaxAssignmentRecord[]];
  return assignments.map((a) => a.id).sort();
}

describe('LinkWalletPaymentDialog', () => {
  beforeEach(() => {
    settle.mockReset();
    settle.mockResolvedValue({ ok: true, value: undefined });
    rememberPayeeEntity.mockReset();
    rememberPayeeEntity.mockResolvedValue();
  });

  it('names the payee and how many entries it owes', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Link a wallet payment' })).toBeInTheDocument();
    expect(screen.getByText('Moon Corp · 3 entries owed')).toBeInTheDocument();
  });

  it('shows an empty state when no unlinked payments exist', () => {
    renderDialog([]);

    expect(screen.getByText(/No unlinked wallet payments found/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('filters payments by search', async () => {
    renderDialog();

    await userEvent.type(screen.getByRole('textbox', { name: 'Search wallet payments' }), 'Ore');

    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByText('Paid in kind · 2026-09-11')).toBeInTheDocument();
  });

  it('pre-ticks the oldest entries an ISK payment covers and links it manually', async () => {
    const { onLinked, onClose } = renderDialog();

    await userEvent.click(screen.getByText('350,000 ISK · 2026-09-10'));

    expect(screen.getByRole('checkbox', { name: 'Include 2026-09-04' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Include 2026-09-05' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Include 2026-09-06' })).not.toBeChecked();
    expect(
      screen.getByText('50,000 ISK more than owed — leave as overpayment')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Mark 2 paid with this payment' }));

    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(paidIds()).toEqual(['a-1', 'a-2']);
    expect(settle.mock.calls[0][1]).toEqual({
      paidOn: expect.stringMatching(/^2026-09-1[01]$/),
      method: 'donation',
      amount: 350_000,
      journalLinks: [{ refId: 77, source: 'manual' }],
    });
    expect(rememberPayeeEntity).toHaveBeenCalledWith(PAYEE, 9001);
  });

  it('reports a short payment when more is ticked than it covers', async () => {
    renderDialog();
    await userEvent.click(screen.getByText('350,000 ISK · 2026-09-10'));

    await userEvent.click(screen.getByRole('checkbox', { name: 'Include 2026-09-06' }));

    expect(screen.getByText('250,000 ISK short — the rest stays owed')).toBeInTheDocument();
  });

  it('does not remember the recipient when that box is unticked', async () => {
    const { onLinked } = renderDialog();
    await userEvent.click(screen.getByText('350,000 ISK · 2026-09-10'));

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Remember Landlord Alt as who Moon Corp is paid' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mark 2 paid with this payment' }));

    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(rememberPayeeEntity).not.toHaveBeenCalled();
  });

  it('pre-ticks every entry for a payment in kind and records the value handed over', async () => {
    const { onLinked } = renderDialog();
    await userEvent.click(screen.getByText('Paid in kind · 2026-09-11'));

    expect(screen.getByText('Matches exactly ✓')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^Remember/ })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Value handed over' }), '500,000');
    await userEvent.click(screen.getByRole('button', { name: 'Mark 3 paid with this payment' }));

    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(paidIds()).toEqual(['a-1', 'a-2', 'a-3']);
    expect(settle.mock.calls[0][1]).toMatchObject({
      method: 'contract',
      amount: 500_000,
      contractLinks: [{ refId: 5, source: 'manual' }],
    });
    expect(rememberPayeeEntity).not.toHaveBeenCalled();
  });
});
