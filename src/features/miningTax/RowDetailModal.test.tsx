import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
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

describe('RowDetailModal system link', () => {
  it('links the system to Route Safety, where the ledger row keeps it plain', () => {
    renderModal('unassigned', null);
    const link = screen.getByRole('link', { name: 'Jita' });
    expect(link.getAttribute('href')).toContain(String(row.entry.solarSystemId));
  });
});

describe('RowDetailModal split', () => {
  it('offers handing the new ore to another Payee on a needs-review row', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Give new ore to another Payee' }));
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
          onResolve={noop}
          onUndo={noop}
          {...overrides}
        />
      </MemoryRouter>
    );
  }

  it("opens the Payee's ledger from one link, with no paid-by card", async () => {
    const onOpenLedger = vi.fn();
    renderPaid({ onOpenLedger });
    expect(screen.queryByText('Paid by')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Open the ledger of / }));
    expect(onOpenLedger).toHaveBeenCalledOnce();
  });

  it('shows no payment card while no payment reached the day', () => {
    renderModal('unassigned', null);
    expect(screen.queryByText('Paid by')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Settle up' }));
    expect(onSettleUp).toHaveBeenCalledTimes(1);
  });

  it('attaches the More menu to the Edit button, not the title', () => {
    renderModal('outstanding', owed);
    const edit = screen.getByRole('button', { name: 'Edit' });
    const more = screen.getByRole('button', { name: 'More actions for this entry' });
    expect(more.parentElement).toBe(edit.parentElement);
    expect(edit.nextElementSibling).toBe(more);
    expect(
      within(screen.getByRole('dialog')).getAllByRole('button', { name: /More actions/ })
    ).toHaveLength(1);
  });

  it('asks before unassigning', async () => {
    const onUndo = vi.fn();
    renderModal('outstanding', owed, undefined, undefined, { onUndo });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for this entry' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unassign' }));
    expect(onUndo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('offers linking a wallet payment from the More menu', async () => {
    const onLinkWalletPayment = vi.fn();
    renderModal('outstanding', owed, undefined, undefined, { onLinkWalletPayment });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for this entry' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Link a payment' }));
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

describe('RowDetailModal — price breakdown', () => {
  const owed = {
    id: 'a1',
    characterId: 1,
    date: '2026-09-08',
    solarSystemId: 30000142,
    payeeId: 'p1',
    oreLines: [{ typeId: VELDSPAR, quantity: 250 }],
    taxPct: 10,
    estimatedValue: 2_500,
    taxOwed: 250,
    status: 'outstanding',
    updatedAt: 1,
  } as MiningTaxAssignmentRecord;

  it('shows unit price, source and hub, and copies them as text', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    configureClipboard(write);
    renderModal('outstanding', owed, undefined, undefined, {
      pricesFor: () => new Map([[VELDSPAR, 10]]),
      priceSourcesFor: () => new Map([[VELDSPAR, 'saved' as const]]),
    });
    // The day's own saved snapshot is the norm, so it is not repeated on every ore line.
    expect(screen.queryByText('Saved snapshot')).not.toBeInTheDocument();
    expect(screen.getByText(/× 10/)).toBeInTheDocument();
    expect(screen.getByText(/buy · .* ore$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy pricing as text' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'More actions for this entry' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy pricing as text' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied'));
    const text = write.mock.calls[0][0] as string;
    expect(text).toContain('Veldspar: 250 × 10 = 2,500 ISK (Saved snapshot)');
    expect(text).toContain('10% tax');
    configureClipboard(null);
  });

  it('offers no copy item when the row has no breakdown', async () => {
    renderModal('unassigned', null);
    expect(screen.queryByRole('button', { name: 'More actions for this entry' })).toBeNull();
  });
});

describe('RowDetailModal backdrop dismissal', () => {
  it('ignores a backdrop click while the Assign form is showing', () => {
    const onClose = vi.fn();
    renderModal('unassigned', null, undefined, vi.fn(), { onClose });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps backdrop dismissal for a summary view', () => {
    const onClose = vi.fn();
    renderModal('needs-review', null, undefined, vi.fn(), { onClose });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('RowDetailModal ore ESI has not reported yet (issue #6180)', () => {
  it('shows how much of a claimed line ESI has reported so far', () => {
    const claimed: MiningTaxAssignmentRecord = {
      id: 'a1',
      characterId: 1,
      date: '2026-09-08',
      solarSystemId: 30000142,
      payeeId: 'p1',
      oreLines: [{ typeId: VELDSPAR, quantity: 300 }],
      taxPct: 10,
      estimatedValue: 0,
      taxOwed: 0,
      status: 'outstanding',
      updatedAt: 1,
    };
    renderModal('outstanding', claimed, undefined, vi.fn(), {
      row: { ...row, assignments: [claimed], unassignedOreLines: [] },
    });

    expect(screen.getByText('250 of 300 reported')).toBeInTheDocument();
  });
});
