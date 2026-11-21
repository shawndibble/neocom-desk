import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { PayeeRecord } from '@/db';
import { PayeeAccount } from '@/engine/miningTax/payeeAccount';
import type { LedgerActionResult } from './ledgerActions';
import type { MadePayment } from './paymentLinks';
import { LinkWalletPaymentDialog } from './LinkWalletPaymentDialog';
import type { MadePaymentSources } from './madePayments';
import { db } from '@/db';
import { beginEveLogin } from '@/app/loginFlow';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const linkPayment = vi.fn<(...args: unknown[]) => Promise<LedgerActionResult>>();
const rememberPayeeEntity = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('./ledgerActions', () => ({
  linkPayment: (...args: unknown[]) => linkPayment(...args),
}));
vi.mock('./payees', () => ({
  rememberPayeeEntity: (...args: unknown[]) => rememberPayeeEntity(...args),
}));

const PAYEE = { id: 'p-1', characterId: 1, name: 'Moon Corp', defaultTaxPct: 10 } as PayeeRecord;

// Owes 600,000 over three days.
const ACCOUNT = PayeeAccount.build({
  payeeId: 'p-1',
  charges: [
    { id: 'a-3', date: '2026-09-06', tax: 300_000 },
    { id: 'a-1', date: '2026-09-04', tax: 100_000 },
    { id: 'a-2', date: '2026-09-05', tax: 200_000 },
  ],
  links: [],
});

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

const EXACT: MadePayment = { ...DONATION, key: 'journal:78', refId: 78, amount: 600_000 };

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

function renderDialog(
  candidates: readonly MadePayment[] = [DONATION, IN_KIND],
  paymentSources?: readonly MadePaymentSources[]
) {
  const onLinked = vi.fn();
  const onClose = vi.fn();
  render(
    <LinkWalletPaymentDialog
      open
      onClose={onClose}
      payee={PAYEE}
      account={ACCOUNT}
      candidates={candidates}
      characters={[{ characterId: 1, characterName: 'Pilot One' }]}
      paymentSources={paymentSources}
      onLinked={onLinked}
    />
  );
  return { onLinked, onClose };
}

describe('LinkWalletPaymentDialog', () => {
  beforeEach(() => {
    linkPayment.mockReset();
    linkPayment.mockResolvedValue({ ok: true, value: undefined });
    rememberPayeeEntity.mockReset();
    rememberPayeeEntity.mockResolvedValue();
  });

  it('names the payee and what it owes, with nothing to tick', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Link a wallet payment' })).toBeInTheDocument();
    expect(screen.getByText(/Moon Corp \(600,000 ISK owed now\)/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Include/ })).not.toBeInTheDocument();
  });

  it('shows an empty state when no unlinked payments exist', () => {
    renderDialog([]);
    expect(screen.getByText(/No unlinked wallet payments found/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('filters payments by search', async () => {
    renderDialog();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search wallet payments' }), 'Ore');
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByText('Paid in kind · 2026-09-11')).toBeInTheDocument();
  });

  it('says what the payment pays, oldest day first, and links it to the Payee', async () => {
    const { onLinked, onClose } = renderDialog();
    await userEvent.click(screen.getByText('350,000 ISK · 2026-09-10'));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('2026-09-04');
    expect(status).toHaveTextContent(/2026-09-0650,000 ISK · 250,000 ISK still owed/);

    await userEvent.click(screen.getByRole('button', { name: 'Link payment' }));

    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(linkPayment).toHaveBeenCalledWith(
      {
        payeeId: 'p-1',
        kind: 'journal',
        refId: 77,
        amount: 350_000,
        paidOn: '2026-09-10',
        source: 'manual',
      },
      1
    );
    expect(rememberPayeeEntity).toHaveBeenCalledWith(PAYEE, 9001);
  });

  // Audit bug 7: picking the payment the dialog offered first was recorded as `auto`.
  it('records a payment the pilot confirms as their own link, even the one it picked first', async () => {
    renderDialog([EXACT, DONATION]);
    expect(screen.getByRole('radio', { name: /600,000 ISK/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Link payment' }));
    await waitFor(() => expect(linkPayment).toHaveBeenCalled());
    expect(linkPayment.mock.calls[0]![0]).toMatchObject({ refId: 78, source: 'manual' });
  });

  it('does not remember the recipient when that box is unticked', async () => {
    const { onLinked } = renderDialog();
    await userEvent.click(screen.getByText('350,000 ISK · 2026-09-10'));
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Remember Landlord Alt as who Moon Corp is paid' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Link payment' }));
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(rememberPayeeEntity).not.toHaveBeenCalled();
  });

  it("links a payment in kind at the pilot's figure for what was handed over", async () => {
    const { onLinked } = renderDialog();
    await userEvent.click(screen.getByText('Paid in kind · 2026-09-11'));
    expect(screen.queryByRole('checkbox', { name: /^Remember/ })).not.toBeInTheDocument();
    // Left blank it links nothing: a cargo is never assumed to be the whole balance (N4).
    expect(screen.getByRole('button', { name: 'Link payment' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Value handed over' }), '500,000');
    await userEvent.click(screen.getByRole('button', { name: 'Link payment' }));
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(linkPayment.mock.calls[0]![0]).toMatchObject({
      kind: 'contract',
      refId: 5,
      amount: 500_000,
    });
  });
});

describe('LinkWalletPaymentDialog grant note', () => {
  const SOURCES = (over: Partial<MadePaymentSources>): MadePaymentSources[] => [
    { characterId: 1, journal: 'ok', contracts: 'ok', ...over },
  ];

  beforeEach(async () => {
    await db.tokens.clear();
    vi.mocked(beginEveLogin).mockClear();
  });

  it('offers the grant when the journal permission is missing', async () => {
    renderDialog([], SOURCES({ journal: 'skipped-no-permission' }));

    expect(await screen.findByText(/Some payments can’t be seen/)).toBeInTheDocument();
    // Names the journal's Permission only: the contracts read went through.
    expect(screen.getByText('Pilot One: grant Wallet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant in EVE' }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: 1, groups: ['wallet'] });
  });

  it('shows nothing when both permissions loaded', async () => {
    renderDialog([], SOURCES({}));
    // No source was skipped for a permission, so no Grant note is even mounted to load.
    expect(screen.queryByText(/Some payments can’t be seen/)).toBeNull();
  });

  it('shows nothing for a transient failure', async () => {
    renderDialog([], SOURCES({ journal: 'failed' }));
    // No source was skipped for a permission, so no Grant note is even mounted to load.
    expect(screen.queryByText(/Some payments can’t be seen/)).toBeNull();
  });
});
