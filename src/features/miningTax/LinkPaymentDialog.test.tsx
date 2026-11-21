import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { PayeeRecord } from '@/db';
import { PayeeRunningAccount } from '@/engine/miningTax/payeeRunningAccount';
import type { LedgerActionResult } from './ledgerActions';
import type { LinkablePayee, LinkSuggestion, MadePayment } from './paymentLinks';
import { LinkPaymentDialog } from './LinkPaymentDialog';
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

const RECORD = { id: 'p-1', characterId: 1, name: 'Moon Corp', defaultTaxPct: 10 } as PayeeRecord;
const OTHER_RECORD = { id: 'p-2', characterId: 1, name: 'Fen Corvane' } as PayeeRecord;

// Owes 600,000 over three days.
const ACCOUNT = PayeeRunningAccount.build({
  payeeId: 'p-1',
  charges: [
    { id: 'a-3', date: '2026-09-06', tax: 300_000 },
    { id: 'a-1', date: '2026-09-04', tax: 100_000 },
    { id: 'a-2', date: '2026-09-05', tax: 200_000 },
  ],
  links: [],
});

const MOON: LinkablePayee = {
  id: 'p-1',
  name: 'Moon Corp',
  members: [RECORD],
  owed: 600_000,
  billed: true,
};
const FEN: LinkablePayee = {
  id: 'p-2',
  name: 'Fen Corvane',
  members: [OTHER_RECORD],
  owed: 100_000,
  billed: true,
};

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

const TO_FEN: MadePayment = {
  ...DONATION,
  key: 'journal:90',
  refId: 90,
  amount: 100_000,
  counterpartyId: 9002,
  counterpartyName: 'Fen Corvane',
};

const suggestion = (
  payment: MadePayment,
  payee: LinkablePayee = MOON,
  confidence: LinkSuggestion['confidence'] = 'entity'
): LinkSuggestion => ({ payment, payee, confidence });

function renderDialog(
  over: Partial<Parameters<typeof LinkPaymentDialog>[0]> & {
    paymentSources?: readonly MadePaymentSources[];
  } = {}
) {
  const onLinked = vi.fn();
  const onClose = vi.fn();
  render(
    <LinkPaymentDialog
      open
      onClose={onClose}
      scopeId="p-1"
      payees={[MOON, FEN]}
      suggestions={[]}
      candidates={[DONATION, IN_KIND]}
      accountOf={(id) => (id === 'p-1' ? ACCOUNT : undefined)}
      characters={[{ characterId: 1, characterName: 'Pilot One' }]}
      onLinked={onLinked}
      {...over}
    />
  );
  return { onLinked, onClose };
}

beforeEach(() => {
  linkPayment.mockReset();
  linkPayment.mockResolvedValue({ ok: true, value: undefined });
  rememberPayeeEntity.mockReset();
  rememberPayeeEntity.mockResolvedValue();
});

describe('LinkPaymentDialog for one Payee', () => {
  it('names the payee and what it owes, with nothing to tick', () => {
    renderDialog();
    expect(
      screen.getByRole('dialog', { name: 'Link a payment you already made' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Moon Corp \(600,000 ISK owed now\)/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Include/ })).not.toBeInTheDocument();
  });

  it('shows an empty state when no unlinked payments exist', () => {
    renderDialog({ candidates: [] });
    expect(screen.getByText(/No unlinked wallet payments found/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('filters the manual list by search', async () => {
    renderDialog();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search wallet payments' }), 'Ore');
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByText('Paid in kind · 2026-09-11')).toBeInTheDocument();
  });

  it('puts the payments sent to this Payee on top, picked, and the rest below', () => {
    renderDialog({
      suggestions: [suggestion(EXACT), suggestion(TO_FEN, FEN)],
      candidates: [EXACT, TO_FEN, DONATION],
    });
    const matches = screen.getByRole('region', { name: 'Likely matches' });
    // Only this Payee's own: the payment sent to another Payee is not a match here.
    expect(within(matches).getAllByRole('radio')).toHaveLength(1);
    expect(within(matches).getByRole('radio', { name: /600,000 ISK/ })).toBeChecked();
    expect(within(matches).getByText('Sent to Moon Corp')).toBeInTheDocument();
    // The manual list holds the others, and not the match a second time.
    const manual = screen.getByRole('list', { name: 'Wallet payments' });
    expect(within(manual).getAllByRole('radio')).toHaveLength(2);
    expect(within(manual).queryByText(/600,000 ISK/)).not.toBeInTheDocument();
  });

  it('says what the payment pays, oldest day first, and links it to the Payee', async () => {
    const { onLinked, onClose } = renderDialog();
    await userEvent.click(screen.getByText('350,000 ISK · 2026-09-10'));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('2026-09-04');
    expect(status).toHaveTextContent(/2026-09-0650,000 ISK · 250,000 ISK still owed/);

    await userEvent.click(screen.getByRole('button', { name: 'Link to Moon Corp' }));

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
    expect(rememberPayeeEntity).toHaveBeenCalledWith(RECORD, 9001);
  });

  // Audit bug 7: picking the payment the dialog offered first was recorded as `auto`.
  it('records a payment the pilot confirms as their own link, even the one offered first', async () => {
    renderDialog({ suggestions: [suggestion(EXACT)], candidates: [EXACT, DONATION] });
    await userEvent.click(screen.getByRole('button', { name: 'Link to Moon Corp' }));
    await waitFor(() => expect(linkPayment).toHaveBeenCalled());
    expect(linkPayment.mock.calls[0]![0]).toMatchObject({ refId: 78, source: 'manual' });
  });

  it('picks a lone payment of exactly what is owed when nothing is suggested', () => {
    renderDialog({ candidates: [EXACT, DONATION] });
    expect(screen.getByRole('radio', { name: /600,000 ISK/ })).toBeChecked();
  });

  it('does not remember the recipient when that box is unticked', async () => {
    const { onLinked } = renderDialog();
    await userEvent.click(screen.getByText('350,000 ISK · 2026-09-10'));
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Remember Landlord Alt as who Moon Corp is paid' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Link to Moon Corp' }));
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(rememberPayeeEntity).not.toHaveBeenCalled();
  });

  it("links a payment in kind at the pilot's figure for what was handed over", async () => {
    const { onLinked } = renderDialog();
    await userEvent.click(screen.getByText('Paid in kind · 2026-09-11'));
    expect(screen.queryByRole('checkbox', { name: /^Remember/ })).not.toBeInTheDocument();
    // Left blank it links nothing: a cargo is never assumed to be the whole balance (N4).
    expect(screen.getByRole('button', { name: 'Link to Moon Corp' })).toBeDisabled();
    const input = screen.getByRole('textbox', { name: 'Value handed over' });
    // Shorthand reads as the full amount (issue #2227), and a figure that does not parse saves nothing.
    await userEvent.type(input, '1x');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Link to Moon Corp' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, '500,000');
    await userEvent.click(screen.getByRole('button', { name: 'Link to Moon Corp' }));
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(linkPayment.mock.calls[0]![0]).toMatchObject({
      kind: 'contract',
      refId: 5,
      amount: 500_000,
    });
  });
});

describe('LinkPaymentDialog for every Payee', () => {
  const both = {
    scopeId: undefined,
    suggestions: [suggestion(EXACT), suggestion(TO_FEN, FEN)],
    candidates: [EXACT, TO_FEN, DONATION],
    accountOf: (id: string) => (id === 'p-1' ? ACCOUNT : undefined),
  };

  it('groups the suggestions by Payee', () => {
    renderDialog(both);
    const matches = screen.getByRole('region', { name: 'Likely matches' });
    expect(within(matches).getByText('Moon Corp')).toBeInTheDocument();
    expect(within(matches).getByText('Fen Corvane')).toBeInTheDocument();
    expect(within(matches).getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText(/that Payee’s oldest unpaid days/)).toBeInTheDocument();
  });

  it("links a suggestion to the Payee it names, and offers the first one's preview", async () => {
    const { onLinked } = renderDialog(both);
    // The first match is already picked.
    expect(screen.getByRole('status')).toHaveTextContent('2026-09-04');
    await userEvent.click(screen.getByRole('button', { name: 'Link to Moon Corp' }));
    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    expect(linkPayment.mock.calls[0]![0]).toMatchObject({ payeeId: 'p-1', refId: 78 });
  });

  it('asks which Payee a payment picked by hand paid', async () => {
    renderDialog(both);
    await userEvent.click(screen.getByText('350,000 ISK · 2026-09-10'));
    expect(screen.getByRole('button', { name: 'Link payment' })).toBeDisabled();
    await userEvent.click(screen.getByRole('combobox', { name: 'Which Payee did it pay?' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Fen Corvane' }));
    await userEvent.click(screen.getByRole('button', { name: 'Link to Fen Corvane' }));
    await waitFor(() => expect(linkPayment).toHaveBeenCalled());
    expect(linkPayment.mock.calls[0]![0]).toMatchObject({ payeeId: 'p-2', refId: 77 });
  });
});

describe('LinkPaymentDialog a failed save', () => {
  it('says so and stays open when linking fails', async () => {
    linkPayment.mockResolvedValueOnce({ ok: false, reason: 'save-failed', cause: new Error('q') });
    const { onLinked, onClose } = renderDialog({
      suggestions: [suggestion(EXACT)],
      candidates: [EXACT],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Link to Moon Corp' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t save/);
    expect(onLinked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Link to Moon Corp' })).toBeEnabled();
  });

  it('keeps the link, and says only remembering the recipient failed', async () => {
    rememberPayeeEntity.mockRejectedValueOnce(new Error('quota'));
    const { onLinked, onClose } = renderDialog({
      suggestions: [suggestion(EXACT)],
      candidates: [EXACT],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Link to Moon Corp' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Payment linked, but couldn’t remember who Moon Corp is paid.'
    );
    expect(onClose).not.toHaveBeenCalled();
    // Already linked: a second click must not link it twice.
    expect(screen.getByRole('button', { name: 'Link to Moon Corp' })).toBeDisabled();
    expect(linkPayment).toHaveBeenCalledTimes(1);
    // The reload waits for the close, so it can't unmount the message unread.
    expect(onLinked).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onLinked).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('LinkPaymentDialog grant note', () => {
  const SOURCES = (over: Partial<MadePaymentSources>): MadePaymentSources[] => [
    { characterId: 1, journal: 'ok', contracts: 'ok', ...over },
  ];

  beforeEach(async () => {
    await db.tokens.clear();
    vi.mocked(beginEveLogin).mockClear();
  });

  it('offers the grant when the journal permission is missing', async () => {
    renderDialog({
      candidates: [],
      paymentSources: SOURCES({ journal: 'skipped-no-permission' }),
    });

    expect(await screen.findByText(/Some payments can’t be seen/)).toBeInTheDocument();
    // Names the journal's Permission only: the contracts read went through.
    expect(screen.getByText('Pilot One: grant Wallet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant in EVE' }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: 1, groups: ['wallet'] });
  });

  it('shows nothing when both permissions loaded', () => {
    renderDialog({ candidates: [], paymentSources: SOURCES({}) });
    expect(screen.queryByText(/Some payments can’t be seen/)).toBeNull();
  });

  it('shows nothing for a transient failure', () => {
    renderDialog({ candidates: [], paymentSources: SOURCES({ journal: 'failed' }) });
    expect(screen.queryByText(/Some payments can’t be seen/)).toBeNull();
  });
});
