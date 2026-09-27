import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
        onEditMember={noop}
        onMarkAllPaid={noop}
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

  it('offers Link a transaction once every member is paid', () => {
    const onLink = vi.fn();
    renderGroup({ onLinkTransaction: onLink });
    fireEvent.click(screen.getByRole('button', { name: 'Link a transaction' }));
    expect(onLink).toHaveBeenCalledTimes(1);
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
    renderGroup({ linkedTransactions: [transaction], onUnlinkTransaction: onUnlink });
    fireEvent.click(screen.getByRole('button', { name: 'Unlink this transaction' }));
    expect(onUnlink).toHaveBeenCalledWith(transaction);
  });
});
