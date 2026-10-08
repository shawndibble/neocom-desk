import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db, type MiningTaxAssignmentRecord, type PayeeRecord } from '@/db';
import { EntryEditDialog } from './EntryEditDialog';
import { MINING_TAX_ORE_VALUE_MODE_KEY, useMiningTaxOreValueMode } from './oreValueMode';
import type { GroupMember } from './groupRows';
import type { MoonMiningTaxRow } from './snapshot';

const actionsMock = vi.hoisted(() => ({ editEntry: vi.fn() }));
vi.mock('./ledgerActions', () => actionsMock);

const ZEOLITES = 45490;
const BITUMENS = 45492;

const payees: PayeeRecord[] = [
  { id: 'st', characterId: 1, name: 'Star Tail Industries', defaultTaxPct: 5, updatedAt: 0 },
  {
    id: 'bu',
    characterId: 1,
    name: 'Bureau of Unified Harvesting',
    defaultTaxPct: 6,
    updatedAt: 0,
  },
];

function member(
  id: string,
  date: string,
  overrides: Partial<MiningTaxAssignmentRecord> = {}
): GroupMember {
  const row: MoonMiningTaxRow = {
    characterId: 1,
    characterName: 'Mero Otichoda',
    entry: { characterId: 1, date, solarSystemId: 1, oreLines: [] },
    assignments: [],
    unassignedOreLines: [],
  };
  return {
    row,
    assignment: {
      id,
      characterId: 1,
      date,
      solarSystemId: 1,
      payeeId: 'st',
      oreLines: [
        { typeId: ZEOLITES, quantity: 100 },
        { typeId: BITUMENS, quantity: 100 },
      ],
      taxPct: 5,
      estimatedValue: 2_000,
      taxOwed: 100,
      status: 'outstanding',
      groupId: 'g',
      updatedAt: 0,
      ...overrides,
    },
  };
}

function renderDialog(members: GroupMember[]) {
  const onSaved = vi.fn();
  render(
    <MemoryRouter>
      <EntryEditDialog
        open
        onClose={vi.fn()}
        members={members}
        systemName="Ainsan"
        systemSecurity={0.5}
        payees={payees}
        typeNames={
          new Map([
            [ZEOLITES, 'Zeolites'],
            [BITUMENS, 'Bitumens'],
          ])
        }
        pricesFor={() =>
          new Map([
            [ZEOLITES, 1],
            [BITUMENS, 1],
          ])
        }
        onSaved={onSaved}
      />
    </MemoryRouter>
  );
  return { onSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  actionsMock.editEntry.mockResolvedValue({ ok: true, value: [] });
  useMiningTaxOreValueMode.setState({ value: true, hydrated: true });
});

describe('EntryEditDialog', () => {
  it('edits every day in one form and saves them together', async () => {
    const d3 = member('d3', '2026-10-03');
    const d4 = member('d4', '2026-10-04');
    const { onSaved } = renderDialog([d4, d3]);

    // One box per ore line per day, each starting at its share of the billed value.
    const zeolitesOct4 = screen.getByRole('textbox', { name: 'Zeolites value on 2026-10-04' });
    expect(zeolitesOct4).toHaveAttribute('placeholder', '1,000');
    fireEvent.change(zeolitesOct4, { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save all 2 days' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [records, input] = actionsMock.editEntry.mock.calls[0];
    expect(records.map((a: MiningTaxAssignmentRecord) => a.id)).toEqual(['d3', 'd4']);
    expect(input.payeeId).toBe('st');
    expect(input.taxPct).toBe(5);
    // Untouched: keeps exactly what it was billed.
    expect(input.members.d3).toEqual({ estimatedValue: 2_000, taxOwed: 100 });
    // Edited: re-totalled from its lines, which it now remembers.
    expect(input.members.d4).toEqual({
      estimatedValue: 4_000,
      taxOwed: 200,
      oreLineValues: { [ZEOLITES]: 3_000, [BITUMENS]: 1_000 },
    });
  });

  it('opens a paid entry ready to edit, with no second unlock step', () => {
    renderDialog([
      member('d3', '2026-10-03', { status: 'paid', paidAt: 1 }),
      member('d4', '2026-10-04', { status: 'paid', paidAt: 1 }),
    ]);
    expect(screen.queryByRole('button', { name: /unlock/i })).not.toBeInTheDocument();
    expect(screen.getByText(/stays paid/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Zeolites value on 2026-10-03' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save all 2 days' })).toBeEnabled();
  });

  it('edits a single entry in the same form, saved as one day', async () => {
    const { onSaved } = renderDialog([member('d3', '2026-10-03', { groupId: undefined })]);
    expect(screen.getByRole('heading', { name: /Edit 2026-10-03 — Ainsan/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Bitumens value on 2026-10-03' }), {
      target: { value: '2000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [records, input] = actionsMock.editEntry.mock.calls[0];
    expect(records.map((a: MiningTaxAssignmentRecord) => a.id)).toEqual(['d3']);
    expect(input.members.d3).toEqual({
      estimatedValue: 3_000,
      taxOwed: 150,
      oreLineValues: { [ZEOLITES]: 1_000, [BITUMENS]: 2_000 },
    });
  });

  it('edits each day’s whole value when ore values aren’t edited individually', async () => {
    useMiningTaxOreValueMode.setState({ value: false, hydrated: true });
    const { onSaved } = renderDialog([
      member('d3', '2026-10-03', { oreLineValues: { [ZEOLITES]: 1_500, [BITUMENS]: 500 } }),
    ]);
    expect(screen.queryByRole('textbox', { name: /Zeolites value/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Estimated value on 2026-10-03' }), {
      target: { value: '4000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, input] = actionsMock.editEntry.mock.calls[0];
    expect(input.members.d3).toEqual({ estimatedValue: 4_000, taxOwed: 200 });
  });

  it('single-day entry: Estimated value is one editable tile, and clearing it restores the priced value', async () => {
    useMiningTaxOreValueMode.setState({ value: false, hydrated: true });
    const { onSaved } = renderDialog([member('d3', '2026-10-03', { groupId: undefined })]);
    expect(screen.getAllByText('Estimated value')).toHaveLength(1);
    const box = screen.getByRole('textbox', { name: 'Estimated value on 2026-10-03' });
    expect(box).toHaveAttribute('placeholder', '2,000');
    fireEvent.change(box, { target: { value: '4000' } });
    expect(screen.getByText('200')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, input] = actionsMock.editEntry.mock.calls[0];
    expect(input.members.d3.estimatedValue).toBe(2_000);
  });

  it('combined multi-day entry: a box per day, and the tile is a read-only total', () => {
    useMiningTaxOreValueMode.setState({ value: false, hydrated: true });
    renderDialog([member('d3', '2026-10-03'), member('d4', '2026-10-04')]);
    expect(screen.getAllByRole('textbox', { name: /^Estimated value on / })).toHaveLength(2);
    expect(screen.getByText('4,000')).toBeInTheDocument();
  });

  it('reads the stored ore-values setting itself, even when Settings was never opened', async () => {
    useMiningTaxOreValueMode.setState({ value: false, hydrated: false });
    await db.settings.put({ key: MINING_TAX_ORE_VALUE_MODE_KEY, value: true });
    renderDialog([member('d3', '2026-10-03')]);
    expect(
      await screen.findByRole('textbox', { name: 'Zeolites value on 2026-10-03' })
    ).toBeInTheDocument();
    await db.settings.delete(MINING_TAX_ORE_VALUE_MODE_KEY);
  });

  it('says so when the save fails, and stays open', async () => {
    actionsMock.editEntry.mockResolvedValue({
      ok: false,
      reason: 'save-failed',
      cause: new Error('quota'),
    });
    const { onSaved } = renderDialog([member('d3', '2026-10-03'), member('d4', '2026-10-04')]);
    fireEvent.click(screen.getByRole('button', { name: 'Save all 2 days' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t save/);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
