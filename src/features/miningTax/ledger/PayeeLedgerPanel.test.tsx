import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { PayeeLedgerSource } from '@/engine/miningTax/payeeLedger';
import { PayeeLedgerPanel } from './PayeeLedgerPanel';
import {
  CORP_BOOK_LEDGER,
  CREDIT_LEDGER,
  EMPTY_LEDGER,
  LEDGER_TYPE_NAMES,
} from './payeeLedgerFixture';

const renderPanel = (source: PayeeLedgerSource | null, lockDate?: string) =>
  render(
    // An ore name links to its Market listing, so the panel needs a router.
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
  it('shows what is owed and every entry oldest first, ending at the balance', () => {
    renderPanel(CORP_BOOK_LEDGER);
    expect(screen.getByText('Owes')).toBeInTheDocument();
    expect(screen.getByText('10,595,000 ISK')).toBeInTheDocument();
    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent('2026-10-03');
    expect(rows[0]).toHaveTextContent('Mined at Hakonen - Moon 4 Athanor');
    expect(rows.at(-1)).toHaveTextContent('10,595,000');
    expect(screen.getByText('Late notice sent')).toBeInTheDocument();
    expect(screen.getByText('Written off by an officer')).toBeInTheDocument();
    expect(screen.getByText('Shortfall forgiven')).toBeInTheDocument();
    expect(within(table()).getByRole('columnheader', { name: 'Credited' })).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: 'Unlink' }));
    expect(onUnlinkPayment).toHaveBeenCalledWith(expect.any(String));
    unmount();
    renderPanel(CORP_BOOK_LEDGER);
    await user.click(screen.getAllByText('Payment from Varro Kestane')[0]!);
    expect(screen.getByText('Days it paid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlink' })).not.toBeInTheDocument();
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
      expect(rows[at - 1]).toHaveTextContent('2026-10-0');
      expect(rows[at + 1]).toHaveTextContent('2026-10-1');
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
    expect(screen.getByText('Credit')).toBeInTheDocument();
    expect(screen.getByText('4,150,000 ISK')).toBeInTheDocument();
  });

  it('shows owed as a positive balance, and money ahead as credit, never negative', () => {
    renderPanel(CREDIT_LEDGER);
    const balances = bodyRows().map((r) => within(r).getAllByRole('cell').at(-1)?.textContent);
    expect(balances.some((b) => b?.startsWith('-'))).toBe(false);
    expect(balances.at(-1)).toMatch(/credit$/);
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
    await user.click(screen.getAllByText('Payment from Varro Kestane')[0]!);
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
