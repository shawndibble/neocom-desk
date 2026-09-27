import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  status: 'unassigned' | 'needs-review' | 'paid',
  assignment: MiningTaxAssignmentRecord | null,
  onSplit?: () => void,
  onUnlock?: () => void
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
        onUnlock={onUnlock}
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
  it('offers Split on a needs-review row', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
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
    expect(screen.getByText('2026-09-10')).toBeInTheDocument();
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
    expect(screen.getByText(/linked automatically/)).toBeInTheDocument();
  });

  it('calls onUnlinkTransaction with the clicked transaction', () => {
    const onUnlink = vi.fn();
    const transaction = {
      kind: 'journal' as const,
      refId: 42,
      source: 'manual' as const,
      label: '100 ISK · 2026-09-10 — Player donation',
    };
    renderPaid({ linkedTransactions: [transaction], onUnlinkTransaction: onUnlink });
    fireEvent.click(screen.getByRole('button', { name: 'Unlink this transaction' }));
    expect(onUnlink).toHaveBeenCalledWith(transaction);
  });

  it('offers Link a transaction whenever the row is paid, even with no payment recorded yet', () => {
    const onLink = vi.fn();
    renderPaid({
      assignment: { ...paidAssignment, payment: undefined },
      onLinkTransaction: onLink,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link a transaction' }));
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it('never shows the payment card for a non-paid row', () => {
    renderModal('unassigned', null);
    expect(screen.queryByText('Payment')).not.toBeInTheDocument();
  });
});

describe('RowDetailModal paid lock', () => {
  it('passes onUnlock through to the Assign form, which fires it from its unlock button', () => {
    const onUnlock = vi.fn();
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
      onUnlock
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unlock to edit' }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});
