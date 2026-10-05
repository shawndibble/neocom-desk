import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MiningTaxAssignmentRecord } from '@/db';
import { GroupSummaryModal, type GroupMember } from './GroupSummaryModal';
import type { MoonMiningTaxRow } from './snapshot';

const VELDSPAR = 1230;

function row(date: string): MoonMiningTaxRow {
  return {
    characterId: 1,
    characterName: 'Miner Alt',
    entry: { characterId: 1, date, solarSystemId: 30000142, oreLines: [] },
    assignments: [],
    unassignedOreLines: [],
  };
}

function assignment(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
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
    groupId: 'grp1',
    updatedAt: 1,
    ...overrides,
  };
}

function member(date: string, overrides: Partial<MiningTaxAssignmentRecord> = {}): GroupMember {
  return { row: row(date), assignment: assignment({ id: `a-${date}`, date, ...overrides }) };
}

function renderGroup(overrides: Partial<Parameters<typeof GroupSummaryModal>[0]> = {}) {
  const noop = vi.fn();
  render(
    <MemoryRouter>
      <GroupSummaryModal
        open
        onClose={noop}
        members={[member('2026-09-08'), member('2026-09-09')]}
        systemName="Jita"
        systemSecurity={0.9}
        typeNames={new Map()}
        payeeDisplayName="Corp One"
        busy={false}
        onEdit={noop}
        onMarkAllPaid={noop}
        onTakeOut={noop}
        onUncombine={noop}
        onResolve={noop}
        onUnassignAll={noop}
        {...overrides}
      />
    </MemoryRouter>
  );
}

describe('GroupSummaryModal payment', () => {
  it('never shows the payment card while any member is still outstanding', () => {
    renderGroup({
      members: [member('2026-09-08', { status: 'outstanding' }), member('2026-09-09')],
      onLinkTransaction: vi.fn(),
    });
    expect(screen.queryByText('Payment')).not.toBeInTheDocument();
  });

  it('offers Link a transaction once every member is paid', async () => {
    const onLink = vi.fn();
    renderGroup({ onLinkTransaction: onLink });
    await userEvent.click(screen.getByRole('button', { name: 'Payment actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Link a transaction…' }));
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it('reads the recorded payment as one line', () => {
    renderGroup({
      members: [
        member('2026-09-08', {
          payment: { paymentId: 'p', paidOn: '2026-09-10', method: 'donation', amount: 200 },
        }),
        member('2026-09-09'),
      ],
    });
    expect(screen.getByText('Paid 200 ISK · 2026-09-10')).toBeInTheDocument();
  });

  it('links a transaction to the Wallet Journal, highlighting it', () => {
    renderGroup({
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
    renderGroup({
      linkedTransactions: [
        { kind: 'journal', refId: 42, source: 'auto', label: '100 ISK · 2026-09-10 — donation' },
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
    renderGroup({ linkedTransactions: [transaction], onUnlinkTransaction: onUnlink });
    await userEvent.click(screen.getByRole('button', { name: 'Payment actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unlink this transaction' }));
    expect(onUnlink).toHaveBeenCalledWith(transaction);
  });
});

describe('GroupSummaryModal as one entry', () => {
  it('shows every day with its own figures but offers one Edit for the whole entry', () => {
    const onEdit = vi.fn();
    renderGroup({ onEdit });
    expect(screen.getByText('2026-09-08')).toBeInTheDocument();
    expect(screen.getByText('2026-09-09')).toBeInTheDocument();
    const edits = screen.getAllByRole('button', { name: 'Edit…' });
    expect(edits).toHaveLength(1);
    fireEvent.click(edits[0]);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('takes one day out, or uncombines all, from the More menu', async () => {
    const onTakeOut = vi.fn();
    const onUncombine = vi.fn();
    renderGroup({ onTakeOut, onUncombine });
    await userEvent.click(
      screen.getByRole('button', { name: 'More actions for this combined entry' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Take 2026-09-09 out of combined' })
    );
    expect(onTakeOut).toHaveBeenCalledWith(
      expect.objectContaining({ assignment: expect.objectContaining({ date: '2026-09-09' }) })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'More actions for this combined entry' })
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Uncombine all' }));
    expect(onUncombine).toHaveBeenCalledTimes(1);
  });

  it('settles up while a day is still owed, and closes with Close', () => {
    const onSettleUp = vi.fn();
    const onClose = vi.fn();
    renderGroup({
      members: [member('2026-09-08', { status: 'outstanding' }), member('2026-09-09')],
      onSettleUp,
      onClose,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Settle up…' }));
    expect(onSettleUp).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('GroupSummaryModal — a failed action', () => {
  it('shows the save error it is handed', () => {
    renderGroup({ saveError: 'Couldn’t save — nothing was changed. Try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t save/);
  });

  it('shows no alert while nothing has failed', () => {
    renderGroup();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
