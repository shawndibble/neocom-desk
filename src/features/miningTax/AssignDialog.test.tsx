import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { AssignDialog } from './AssignDialog';
import { createAssignment, updateAssignment } from './assignments';
import type { MoonMiningTaxRow } from './snapshot';

vi.mock('./assignments', () => ({
  createAssignment: vi.fn(async () => ({})),
  updateAssignment: vi.fn(async () => ({})),
}));
vi.mock('./payees', () => ({ updatePayee: vi.fn(async () => ({})) }));

const mockedCreate = vi.mocked(createAssignment);
const mockedUpdate = vi.mocked(updateAssignment);

const CHAR = 1;
const SYSTEM = 30000142;
const ZEOLITES = 45490;

/**
 * The whole point of the feature: the same ore is worth different money at
 * different hubs, so a test that used one price everywhere could not tell a
 * per-Payee lookup from the old single map.
 */
const PRICES: Record<string, ReadonlyMap<number, number>> = {
  jita: new Map([[ZEOLITES, 1000]]),
  hek: new Map([[ZEOLITES, 400]]),
};
const pricesFor = (hubId: string | undefined) => PRICES[hubId ?? 'jita'] ?? PRICES.jita;

const row: MoonMiningTaxRow = {
  characterId: CHAR,
  characterName: 'Miner Alt',
  entry: {
    characterId: CHAR,
    date: '2026-09-04',
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ZEOLITES, quantity: 100 }],
  },
  assignments: [],
  unassignedOreLines: [{ typeId: ZEOLITES, quantity: 100 }],
};

function payee(overrides: Partial<PayeeRecord> = {}): PayeeRecord {
  return {
    id: 'p-hek',
    characterId: CHAR,
    name: 'Hek landlord',
    defaultTaxPct: 10,
    // Auto-matched by `AssignDialog` on open, so the money path is exercised
    // without driving the Radix Select.
    systemId: SYSTEM,
    hubId: 'hek',
    updatedAt: 1,
    ...overrides,
  };
}

function renderDialog(payees: PayeeRecord[], assignment: MiningTaxAssignmentRecord | null = null) {
  render(
    <AssignDialog
      row={row}
      assignment={assignment}
      payees={payees}
      systemName="Jita"
      typeNames={new Map([[ZEOLITES, 'Zeolites']])}
      pricesFor={pricesFor}
      busy={false}
      onAssigned={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssignDialog — the money path', () => {
  it('snapshots the value computed at the selected Payee’s hub, not at Jita', async () => {
    renderDialog([payee()]);

    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));

    // 100 units at Hek's 400, not at Jita's 1000: the bill is the landlord's,
    // so it is priced at the book the landlord bills against.
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedValue: 40_000, taxOwed: 4_000, payeeId: 'p-hek' })
    );
  });

  it('prices at Jita for a Payee that names no hub of its own', async () => {
    renderDialog([payee({ hubId: undefined })]);

    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedValue: 100_000, taxOwed: 10_000 })
    );
  });

  it('shows the hub the figure came from only when it is not the default', () => {
    renderDialog([payee()]);
    expect(screen.getByText('Valued at Hek buy orders.')).toBeInTheDocument();
  });

  it('says nothing about the hub for a Payee priced at the default', () => {
    renderDialog([payee({ hubId: undefined })]);
    expect(screen.queryByText(/Valued at .* buy orders\./)).not.toBeInTheDocument();
  });

  it('re-prices when the pilot changes the Payee selection', async () => {
    const jitaPayee = payee({ id: 'p-jita', name: 'Jita landlord', hubId: undefined, systemId: 1 });
    renderDialog([payee(), jitaPayee]);

    // Opens auto-matched on the Hek Payee (its systemId matches the entry).
    expect(screen.getByText('Valued at Hek buy orders.')).toBeInTheDocument();
    const estimated = screen.getByLabelText('Estimated value');
    expect(estimated).toHaveValue('40,000');

    await userEvent.click(screen.getByRole('combobox', { name: 'Payee' }));
    await userEvent.click(screen.getByRole('option', { name: 'Jita landlord' }));

    expect(screen.queryByText('Valued at Hek buy orders.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Estimated value')).toHaveValue('100,000');
  });

  it('re-prices an existing Assignment at its Payee’s hub once the stored figure is cleared', async () => {
    const assignment: MiningTaxAssignmentRecord = {
      id: 'a1',
      characterId: CHAR,
      date: '2026-09-04',
      solarSystemId: SYSTEM,
      payeeId: 'p-hek',
      oreLines: [{ typeId: ZEOLITES, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 12_345,
      taxOwed: 1_234.5,
      status: 'outstanding',
      updatedAt: 1,
    };
    renderDialog([payee()], assignment);

    // Editing starts on the stored figure — a considered value, not something
    // to silently restate the moment the row is opened.
    expect(screen.getByLabelText('Estimated value')).toHaveValue('12,345');

    await userEvent.clear(screen.getByLabelText('Estimated value'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockedUpdate).toHaveBeenCalledWith(
      assignment,
      expect.objectContaining({ estimatedValue: 40_000 })
    );
  });
});
