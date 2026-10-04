import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { CombinedEditDialog } from './CombinedEditDialog';
import type { GroupMember } from './groupRows';
import type { MoonMiningTaxRow } from './snapshot';

const assignmentsMock = vi.hoisted(() => ({ updateCombinedAssignments: vi.fn() }));
vi.mock('./assignments', () => assignmentsMock);

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
      <CombinedEditDialog
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
  assignmentsMock.updateCombinedAssignments.mockResolvedValue([]);
});

describe('CombinedEditDialog', () => {
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
    const [records, input] = assignmentsMock.updateCombinedAssignments.mock.calls[0];
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

  it('opens a paid entry locked, and unlocking only opens the fields', () => {
    renderDialog([
      member('d3', '2026-10-03', { status: 'paid', paidAt: 1 }),
      member('d4', '2026-10-04', { status: 'paid', paidAt: 1 }),
    ]);
    expect(screen.getByRole('button', { name: 'Save all 2 days' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock to edit' }));
    expect(screen.getByRole('button', { name: 'Save all 2 days' })).toBeEnabled();
    expect(assignmentsMock.updateCombinedAssignments).not.toHaveBeenCalled();
  });
});
