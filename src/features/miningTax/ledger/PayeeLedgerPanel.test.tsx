import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { payeeLedger, type PayeeLedgerSource } from '@/engine/miningTax/payeeLedger';
import { formatIsk } from '@/lib/isk';
import { PayeeLedgerPanel } from './PayeeLedgerPanel';
import { ledgerCsvColumns } from './ledgerCsv';
import i18n from '@/i18n';
import {
  CORP_BOOK_LEDGER,
  CREDIT_LEDGER,
  EMPTY_LEDGER,
  LEDGER_TYPE_NAMES,
} from './payeeLedgerFixture';

const renderPanel = (source: PayeeLedgerSource | null, lockDate?: string) =>
  render(
    <MemoryRouter>
      <PayeeLedgerPanel
        open
        onClose={() => {}}
        payeeName="Bureau of Unified Harvesting"
        source={source}
        typeNames={LEDGER_TYPE_NAMES}
        {...(lockDate ? { lockDate } : {})}
      />
    </MemoryRouter>
  );

const table = () => screen.getByRole('table', { name: 'Ledger' });
const bodyRows = () => within(table()).getAllByRole('row').slice(1);

describe('PayeeLedgerPanel', () => {
  it('shows what is owed and every entry newest first, the top row at the balance', () => {
    renderPanel(CORP_BOOK_LEDGER);
    expect(screen.getByText('Ledger, newest first')).toBeInTheDocument();
    expect(screen.getByText('Owes')).toBeInTheDocument();
    expect(screen.getByText('−10,595,000 ISK')).toBeInTheDocument();
    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent('10,595,000');
    expect(rows.at(-1)).toHaveTextContent('2026-10-03');
    expect(rows.at(-1)).toHaveTextContent('Mined at Hakonen - Moon 4 Athanor');
    expect(screen.getByText('Late notice sent')).toBeInTheDocument();
    expect(screen.getByText('Written off by an officer')).toBeInTheDocument();
    expect(screen.getByText('Shortfall forgiven')).toBeInTheDocument();
    expect(within(table()).getByRole('columnheader', { name: 'Credited' })).toBeInTheDocument();
  });

  it("keeps each row's balance the one after it in date order, only displayed in reverse", () => {
    renderPanel(CORP_BOOK_LEDGER);
    const shown = bodyRows().map((r) => within(r).getAllByRole('cell').at(-1)?.textContent);
    const inDateOrder = payeeLedger(CORP_BOOK_LEDGER).rows.map((r) =>
      r.balance > 0.005
        ? `−${formatIsk(r.balance)}`
        : r.balance < -0.005
          ? formatIsk(-r.balance)
          : '0'
    );
    expect(shown.reverse()).toEqual(inDateOrder);
  });

  it('writes every date, the status line included, the way its rows do', () => {
    renderPanel(CORP_BOOK_LEDGER);
    expect(screen.getByText('Oldest unpaid').parentElement).toHaveTextContent(/\d{4}-\d{2}-\d{2}/);
    expect(document.body).not.toHaveTextContent(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);
  });

  it('opens a row in place to say what it was', async () => {
    const user = userEvent.setup();
    renderPanel(CORP_BOOK_LEDGER);
    await user.click(screen.getAllByText('Payment from Varro Kestane')[0]!);
    expect(screen.getByText('Days it paid')).toBeInTheDocument();
    await user.click(screen.getAllByText('Mined at Hakonen - Moon 4 Athanor')[0]!);
    expect(screen.getByText('Zeolites')).toBeInTheDocument();
  });

  it('unlinks a payment from its opened row, for a personal Payee only', async () => {
    const user = userEvent.setup();
    const onUnlinkPayment = vi.fn();
    const { unmount } = render(
      <MemoryRouter>
        <PayeeLedgerPanel
          open
          onClose={() => {}}
          payeeName="Varro"
          source={CORP_BOOK_LEDGER}
          onUnlinkPayment={onUnlinkPayment}
        />
      </MemoryRouter>
    );
    await user.click(screen.getAllByText('Payment from Varro Kestane')[0]!);
    expect(await screen.findByText(/Unlinking frees this payment/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Unlink' }));
    expect(onUnlinkPayment).toHaveBeenCalledWith(expect.any(String));
    unmount();
    renderPanel(CORP_BOOK_LEDGER);
    await user.click(screen.getAllByText('Payment from Varro Kestane')[0]!);
    expect(screen.getByText('Days it paid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlink' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Unlinking frees this payment/)).not.toBeInTheDocument();
  });

  it('filters by kind, and offers a reset when nothing is left', async () => {
    const user = userEvent.setup();
    renderPanel(CORP_BOOK_LEDGER);
    await user.click(screen.getByRole('button', { name: /filters/i }));
    for (const name of ['Charges', 'Payments', 'Write-offs'])
      await user.click(screen.getByRole('button', { name }));
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('Late notice sent');
    await user.click(screen.getByRole('button', { name: 'Late notices' }));
    expect(screen.getByText('No entries match these filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(bodyRows().length).toBeGreaterThan(1);
  });

  describe('lock divider', () => {
    const divider = () => screen.queryByText(/^Locked before/);

    it('sits at the boundary between locked and open rows, once', () => {
      renderPanel(CORP_BOOK_LEDGER, '2026-10-10');
      expect(screen.getAllByText(/^Locked before/)).toHaveLength(1);
      expect(divider()).toHaveTextContent(
        /Locked before .* · fix with a correction dated .* or later/
      );
      const rows = bodyRows();
      const at = rows.findIndex((r) => r.textContent?.includes('Locked before'));
      expect(rows[at - 1]).toHaveTextContent('2026-10-1');
      expect(rows[at + 1]).toHaveTextContent('2026-10-0');
    });

    it('explains itself in a hint', () => {
      renderPanel(CORP_BOOK_LEDGER, '2026-10-10');
      fireEvent.focus(screen.getByRole('button', { name: 'Lock date' }));
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        /History before the lock date can't be changed.*A correction dated on or after .* puts an old mistake right\./
      );
    });

    it('sits at the top when every row is older', () => {
      renderPanel(CORP_BOOK_LEDGER, '2027-01-01');
      expect(bodyRows()[0]).toHaveTextContent('Locked before');
    });

    it('is absent when every row is on or after the lock date', () => {
      renderPanel(CORP_BOOK_LEDGER, '2026-10-01');
      expect(divider()).toBeNull();
    });

    it('is absent for a personal ledger, which has no lock date', () => {
      renderPanel(CORP_BOOK_LEDGER);
      expect(divider()).toBeNull();
    });
  });

  it('reads Paid through with credit for a Payee paid ahead', () => {
    renderPanel(CREDIT_LEDGER);
    expect(screen.getByText('Paid through')).toBeInTheDocument();
    expect(screen.queryByText('Credit')).toBeNull();
    expect(screen.getByText('4,150,000 ISK')).toBeInTheDocument();
  });

  it('shows owed as red with a minus and money ahead as plain green, never the word credit', () => {
    renderPanel(CREDIT_LEDGER);
    const cells = bodyRows().map((r) => within(r).getAllByRole('cell').at(-1)!);
    const balances = cells.map((c) => c.textContent);
    expect(balances.some((b) => /credit/i.test(b ?? ''))).toBe(false);
    expect(balances[0]).toBe('4,150,000');
    expect(cells[0]).toHaveClass('text-isk-pos');
    const owed = cells.find((c) => c.textContent?.startsWith('−'));
    expect(owed).toHaveClass('text-isk-neg');
  });

  it("shows an officer's note on a payment, on its row", () => {
    renderPanel({
      ...CORP_BOOK_LEDGER,
      payments: (CORP_BOOK_LEDGER.payments ?? []).map((p, i) =>
        i === 0 ? { ...p, note: 'Handed over in person' } : p
      ),
    });
    expect(within(table()).getByText('Handed over in person')).toBeInTheDocument();
  });

  it('links a payment to where it sits in a wallet, from its detail', async () => {
    const user = userEvent.setup();
    renderPanel({
      ...CORP_BOOK_LEDGER,
      payments: (CORP_BOOK_LEDGER.payments ?? []).map((p, i) =>
        i === 0 ? { ...p, href: '/wallet/journal?highlight=42' } : p
      ),
    });
    await user.click(screen.getAllByText('Payment from Varro Kestane').at(-1)!);
    expect(screen.getByRole('link', { name: 'View the payment' })).toHaveAttribute(
      'href',
      '/wallet/journal?highlight=42'
    );
  });

  it("shows a pick between a pilot's Miners above the ledger (N7)", () => {
    render(
      <MemoryRouter>
        <PayeeLedgerPanel
          open
          onClose={() => {}}
          payeeName="Brass Meridian"
          source={CORP_BOOK_LEDGER}
          picker={<div role="group" aria-label="Whose account" />}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('group', { name: 'Whose account' })).toBeInTheDocument();
  });

  it('says so when nothing is billed yet, and spins while loading', () => {
    const { unmount } = renderPanel(EMPTY_LEDGER);
    expect(screen.getByText('Nothing on this ledger yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    unmount();
    renderPanel(null);
    expect(screen.getByRole('status', { name: 'Loading the ledger' })).toBeInTheDocument();
  });
});

describe('ledgerCsvColumns', () => {
  const t = i18n.t.bind(i18n);
  it('has a balance column on a normal ledger, none on an old history', () => {
    const balance = t('miningTax.ledger.column.balance');
    expect(ledgerCsvColumns(t).map((c) => c.header)).toContain(balance);
    expect(ledgerCsvColumns(t, true).map((c) => c.header)).not.toContain(balance);
  });
});
