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
        onTakeOut={noop}
        onUncombine={noop}
        onResolve={noop}
        onUnassignAll={noop}
        {...overrides}
      />
    </MemoryRouter>
  );
}

describe('GroupSummaryModal ledger link', () => {
  it("opens its Payee's ledger from one link, with no paid-by card", async () => {
    const onOpenLedger = vi.fn();
    renderGroup({
      members: [member('2026-09-08', { status: 'outstanding' }), member('2026-09-09')],
      onOpenLedger,
    });
    expect(screen.queryByText('Paid by')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Open .* ledger$/ }));
    expect(onOpenLedger).toHaveBeenCalledOnce();
  });
});

describe('GroupSummaryModal as one entry', () => {
  it('shows every day with its own figures but offers one Edit for the whole entry', () => {
    const onEdit = vi.fn();
    renderGroup({ onEdit });
    expect(screen.getByText('2026-09-08')).toBeInTheDocument();
    expect(screen.getByText('2026-09-09')).toBeInTheDocument();
    const edits = screen.getAllByRole('button', { name: 'Edit' });
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

  it('keeps the More menu beside Edit, not in the title, even when every day is paid', () => {
    renderGroup();
    const edit = screen.getByRole('button', { name: 'Edit' });
    const more = screen.getByRole('button', { name: 'More actions for this combined entry' });
    expect(more.parentElement).toBe(edit.parentElement);
    expect(more.closest('header')).toBeNull();
  });

  it('settles up while a day is still owed, and closes with Close', () => {
    const onSettleUp = vi.fn();
    const onClose = vi.fn();
    renderGroup({
      members: [member('2026-09-08', { status: 'outstanding' }), member('2026-09-09')],
      onSettleUp,
      onClose,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Settle up' }));
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
