import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { RowDetailModal } from './RowDetailModal';
import type { MoonMiningTaxRow } from './snapshot';

const VELDSPAR = 1230;
const SCORDITE = 1228;

const typeNames = new Map([
  [VELDSPAR, 'Veldspar'],
  [SCORDITE, 'Scordite'],
]);

const row: MoonMiningTaxRow = {
  characterId: 1,
  characterName: 'Miner Alt',
  entry: {
    characterId: 1,
    date: '2026-09-08',
    solarSystemId: 30000142,
    oreLines: [{ typeId: VELDSPAR, quantity: 250 }],
  },
  assignments: [],
  unassignedOreLines: [{ typeId: VELDSPAR, quantity: 250 }],
};

const payees: PayeeRecord[] = [
  { id: 'p1', characterId: 1, name: 'Corp One', defaultTaxPct: 10, updatedAt: 1 },
];

function renderModal(
  status: 'unassigned' | 'needs-review' | 'paid' | 'outstanding',
  assignment: MiningTaxAssignmentRecord | null,
  onSplit?: () => void,
  onEdit: () => void = vi.fn(),
  extra: Partial<Parameters<typeof RowDetailModal>[0]> = {}
) {
  const noop = vi.fn();
  render(
    <MemoryRouter>
      <RowDetailModal
        open
        onClose={noop}
        row={row}
        assignment={assignment}
        status={status}
        systemName="Jita"
        systemSecurity={0.9}
        typeNames={typeNames}
        payees={payees}
        pricesFor={() => new Map()}
        busy={false}
        onAssigned={noop}
        onDismiss={noop}
        onMarkPaid={noop}
        onResolve={noop}
        onUndo={noop}
        onSplit={onSplit}
        onEdit={onEdit}
        {...extra}
      />
    </MemoryRouter>
  );
}

describe('RowDetailModal item names', () => {
  it('links each ore-line name to the Market', () => {
    renderModal('unassigned', null);
    const link = screen.getByRole('link', { name: 'Veldspar' });
    expect(link.getAttribute('href')).toContain(`/market/browser?`);
    expect(link.getAttribute('href')).toContain(String(VELDSPAR));
  });

  it('links each resolve-diff name to the Market', () => {
    renderModal('needs-review', {
      id: 'a1',
      characterId: 1,
      date: '2026-09-08',
      solarSystemId: 30000142,
      payeeId: 'p1',
      oreLines: [{ typeId: SCORDITE, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 100,
      taxOwed: 10,
      status: 'needs-review',
      reviewDiff: [{ typeId: SCORDITE, before: 10, after: 12 }],
    } as MiningTaxAssignmentRecord);
    const links = screen.getAllByRole('link', { name: 'Scordite' });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(link.getAttribute('href')).toContain(String(SCORDITE));
  });
});

describe('RowDetailModal split', () => {
  it('offers Split on a needs-review row', async () => {
    const onSplit = vi.fn();
    renderModal(
      'needs-review',
      {
        id: 'a1',
        characterId: 1,
        date: '2026-09-08',
        solarSystemId: 30000142,
        payeeId: 'p1',
        oreLines: [{ typeId: SCORDITE, quantity: 10 }],
        taxPct: 10,
        estimatedValue: 100,
        taxOwed: 10,
        status: 'needs-review',
        reviewDiff: [{ typeId: SCORDITE, before: 10, after: 12 }],
      } as MiningTaxAssignmentRecord,
      onSplit
    );
    await userEvent.click(screen.getByRole('button', { name: 'More actions for this entry' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Split between Payees…' }));
    expect(onSplit).toHaveBeenCalledTimes(1);
  });
});

describe('RowDetailModal payment', () => {
  const paidAssignment: MiningTaxAssignmentRecord = {
    id: 'a1',
    characterId: 1,
    date: '2026-09-08',
    solarSystemId: 30000142,
    payeeId: 'p1',
    oreLines: [{ typeId: VELDSPAR, quantity: 250 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'paid',
    paidAt: Date.parse('2026-09-10T00:00:00Z'),
    payment: {
      paymentId: 'pay1',
      paidOn: '2026-09-10',
      method: 'donation',
      amount: 100,
      journalLinks: [{ refId: 42, source: 'manual' }],
    },
    updatedAt: 1,
  };

  function renderPaid(overrides: Partial<Parameters<typeof RowDetailModal>[0]> = {}) {
    const noop = vi.fn();
    render(
      <MemoryRouter>
        <RowDetailModal
          open
          onClose={noop}
          row={row}
          assignment={paidAssignment}
          status="paid"
          systemName="Jita"
          systemSecurity={0.9}
          typeNames={typeNames}
          payees={payees}
          pricesFor={() => new Map()}
          busy={false}
          onAssigned={noop}
          onEdit={noop}
          onDismiss={noop}
          onMarkPaid={noop}
          onResolve={noop}
          onUndo={noop}
          {...overrides}
        />
      </MemoryRouter>
    );
  }

  it('shows when the row was marked paid', () => {
    renderPaid();
    expect(screen.getByText(/Paid on 2026-09-10/)).toBeInTheDocument();
  });

  it('links a linked transaction to the Wallet Journal, highlighting it', () => {
    renderPaid({
      linkedTransactions: [
        {
          kind: 'journal',
          refId: 42,
          source: 'manual',
          label: '100 ISK · 2026-09-10 — Player donation',
        },
      ],
    });
    const link = screen.getByRole('link', { name: /Player donation/ });
    expect(link.getAttribute('href')).toBe('/wallet/journal?highlight=42');
  });

  it('flags an auto-matched link without claiming the pilot verified it', () => {
    renderPaid({
      linkedTransactions: [
        {
          kind: 'journal',
          refId: 42,
          source: 'auto',
          label: '100 ISK · 2026-09-10 — Player donation',
        },
      ],
    });
    expect(screen.getByText(/auto-linked/)).toBeInTheDocument();
  });

  it('calls onUnlinkTransaction with the clicked transaction', async () => {
    const onUnlink = vi.fn();
    const transaction = {
      kind: 'journal' as const,
      refId: 42,
      source: 'manual' as const,
      label: '100 ISK · 2026-09-10 — Player donation',
    };
    renderPaid({ linkedTransactions: [transaction], onUnlinkTransaction: onUnlink });
    await userEvent.click(screen.getByRole('button', { name: 'Unlink this transaction' }));
    expect(onUnlink).toHaveBeenCalledWith(transaction);
  });

  it('offers Link a transaction whenever the row is paid, even with no payment recorded yet', async () => {
    const onLink = vi.fn();
    renderPaid({
      assignment: { ...paidAssignment, payment: undefined },
      onLinkTransaction: onLink,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Link a transaction…' }));
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it('never shows the payment card for a non-paid row', () => {
    renderModal('unassigned', null);
    expect(screen.queryByText('Payment')).not.toBeInTheDocument();
  });
});

describe('RowDetailModal edit', () => {
  it('hands a paid entry straight to the edit form, with no unlock step here', () => {
    const onEdit = vi.fn();
    renderModal(
      'paid',
      {
        id: 'a1',
        characterId: 1,
        date: '2026-09-08',
        solarSystemId: 30000142,
        payeeId: 'p1',
        oreLines: [{ typeId: VELDSPAR, quantity: 250 }],
        taxPct: 10,
        estimatedValue: 1_000,
        taxOwed: 100,
        status: 'paid',
        paidAt: 1,
        updatedAt: 1,
      } as MiningTaxAssignmentRecord,
      undefined,
      onEdit
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit…' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /unlock/i })).not.toBeInTheDocument();
  });
});

describe('RowDetailModal owed entry', () => {
  const owed = {
    id: 'a1',
    characterId: 1,
    date: '2026-09-08',
    solarSystemId: 30000142,
    payeeId: 'p1',
    oreLines: [{ typeId: VELDSPAR, quantity: 250 }],
    taxPct: 10,
    estimatedValue: 1_000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
  } as MiningTaxAssignmentRecord;

  it('leads with settling up its Payee, and opens as a summary rather than the form', () => {
    const onSettleUp = vi.fn();
    renderModal('outstanding', owed, undefined, undefined, { onSettleUp });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Settle up…' }));
    expect(onSettleUp).toHaveBeenCalledTimes(1);
  });

  it('asks before unassigning', async () => {
    const onUndo = vi.fn();
    renderModal('outstanding', owed, undefined, undefined, { onUndo });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for this entry' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unassign…' }));
    expect(onUndo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('offers linking a wallet payment from the More menu', async () => {
    const onLinkWalletPayment = vi.fn();
    renderModal('outstanding', owed, undefined, undefined, { onLinkWalletPayment });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for this entry' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Link a wallet payment…' }));
    expect(onLinkWalletPayment).toHaveBeenCalledTimes(1);
  });
});

describe('RowDetailModal — a failed action', () => {
  it('shows the save error it is handed', () => {
    renderModal('unassigned', null, undefined, vi.fn(), {
      saveError: 'Couldn’t save — nothing was changed. Try again.',
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t save/);
  });

  it('shows no alert while nothing has failed', () => {
    renderModal('unassigned', null);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
