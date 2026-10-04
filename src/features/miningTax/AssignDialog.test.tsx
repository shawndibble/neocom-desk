import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { AssignDialog } from './AssignDialog';
import { createAssignment, updateAssignment } from './assignments';
import { useMiningTaxOreValueMode } from './oreValueMode';
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
const VELDSPAR = 1230;

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

/**
 * Deliberately a claim about the Payee, not about the number above it: when
 * editing, that number stays on the stored figure until cleared, so a
 * "valued at X" reading would contradict the field it sits under.
 */
const HEK_HINT = "This Payee's ore is priced at Hek buy orders.";

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

function renderDialog(
  payees: PayeeRecord[],
  assignment: MiningTaxAssignmentRecord | null = null,
  onAddPayee?: () => void,
  onUnlock?: () => void,
  targetRow: MoonMiningTaxRow = row
) {
  render(
    <MemoryRouter>
      <AssignDialog
        row={targetRow}
        assignment={assignment}
        payees={payees}
        systemName="Jita"
        typeNames={
          new Map([
            [ZEOLITES, 'Zeolites'],
            [VELDSPAR, 'Veldspar'],
          ])
        }
        pricesFor={pricesFor}
        busy={false}
        onAssigned={vi.fn()}
        onCancel={vi.fn()}
        onAddPayee={onAddPayee}
        onUnlock={onUnlock}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useMiningTaxOreValueMode.setState({ value: false, hydrated: true });
});

describe('AssignDialog — no Payees yet', () => {
  it('offers an Add Payee button that hands off to the Payee manager', async () => {
    const onAddPayee = vi.fn();
    renderDialog([], null, onAddPayee);

    await userEvent.click(screen.getByRole('button', { name: 'Add Payee' }));

    expect(onAddPayee).toHaveBeenCalledTimes(1);
  });

  it('shows only the hint when there is no way to open the manager', () => {
    renderDialog([]);

    expect(screen.queryByRole('button', { name: 'Add Payee' })).not.toBeInTheDocument();
  });
});

describe('AssignDialog — ore line checkbox and Market link', () => {
  const twoLineRow: MoonMiningTaxRow = {
    ...row,
    entry: {
      ...row.entry,
      oreLines: [
        { typeId: ZEOLITES, quantity: 100 },
        { typeId: VELDSPAR, quantity: 50 },
      ],
    },
    unassignedOreLines: [
      { typeId: ZEOLITES, quantity: 100 },
      { typeId: VELDSPAR, quantity: 50 },
    ],
  };

  it('links each ore name to its Market listing', () => {
    renderDialog([payee()], null, undefined, undefined, twoLineRow);

    const link = screen.getByRole('link', { name: 'Zeolites' });
    expect(link.getAttribute('href')).toContain(`type=${ZEOLITES}`);
  });

  it('keeps the checkbox independently operable, unchecking a line without following the nested link', async () => {
    renderDialog([payee()], null, undefined, undefined, twoLineRow);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Include Veldspar' }));
    await userEvent.click(screen.getByRole('button', { name: /^Assign( to |$)/ }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ oreLines: [{ typeId: ZEOLITES, quantity: 100 }] })
    );
  });
});

describe('AssignDialog — the money path', () => {
  it('snapshots the value computed at the selected Payee’s hub, not at Jita', async () => {
    renderDialog([payee()]);

    await userEvent.click(screen.getByRole('button', { name: /^Assign( to |$)/ }));

    // 100 units at Hek's 400, not at Jita's 1000: the bill is the landlord's,
    // so it is priced at the book the landlord bills against.
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedValue: 40_000, taxOwed: 4_000, payeeId: 'p-hek' })
    );
  });

  it('prices at Jita for a Payee that names no hub of its own', async () => {
    renderDialog([payee({ hubId: undefined })]);

    await userEvent.click(screen.getByRole('button', { name: /^Assign( to |$)/ }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedValue: 100_000, taxOwed: 10_000 })
    );
  });

  it('names the Payee’s hub only when it is not the default', () => {
    renderDialog([payee()]);
    expect(screen.getByText(HEK_HINT)).toBeInTheDocument();
  });

  it('says nothing about the hub for a Payee priced at the default', () => {
    renderDialog([payee({ hubId: undefined })]);
    expect(screen.queryByText(/priced at .* buy orders./)).not.toBeInTheDocument();
  });

  it('re-prices when the pilot changes the Payee selection', async () => {
    const jitaPayee = payee({ id: 'p-jita', name: 'Jita landlord', hubId: undefined, systemId: 1 });
    renderDialog([payee(), jitaPayee]);

    // Opens auto-matched on the Hek Payee (its systemId matches the entry).
    expect(screen.getByText(HEK_HINT)).toBeInTheDocument();
    const estimated = screen.getByLabelText('Estimated value');
    expect(estimated).toHaveValue('40,000');

    await userEvent.click(screen.getByRole('combobox', { name: 'Payee' }));
    await userEvent.click(screen.getByRole('option', { name: 'Jita landlord' }));

    expect(screen.queryByText(HEK_HINT)).not.toBeInTheDocument();
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

function existingAssignment(
  overrides: Partial<MiningTaxAssignmentRecord> = {}
): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: CHAR,
    date: '2026-09-04',
    solarSystemId: SYSTEM,
    payeeId: 'p-hek',
    oreLines: [{ typeId: ZEOLITES, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 40_000,
    taxOwed: 4_000,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  };
}

describe('AssignDialog — edit ore values individually', () => {
  it('shows no per-ore boxes when the setting is off, even when editing', () => {
    renderDialog([payee()], existingAssignment());
    expect(screen.queryByLabelText('Zeolites value')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Estimated value')).not.toBeDisabled();
  });

  it('shows no per-ore boxes when creating, even with the setting on', () => {
    useMiningTaxOreValueMode.setState({ value: true, hydrated: true });
    renderDialog([payee()]);
    expect(screen.queryByLabelText('Zeolites value')).not.toBeInTheDocument();
  });

  it('replaces the whole-row inputs with one box per ore line, deriving Estimated Value/Tax Owed from it', async () => {
    useMiningTaxOreValueMode.setState({ value: true, hydrated: true });
    renderDialog([payee()], existingAssignment());

    const oreValue = screen.getByLabelText('Zeolites value');
    expect(oreValue).toHaveValue('40,000');
    // Estimated Value/Tax Owed are plain calculated text, not inputs, in this mode.
    expect(screen.getByLabelText('Estimated value').tagName).toBe('P');
    expect(screen.getByLabelText('Tax owed').tagName).toBe('P');

    fireEvent.change(oreValue, { target: { value: '30000' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockedUpdate).toHaveBeenCalledWith(
      existingAssignment(),
      expect.objectContaining({
        estimatedValue: 30_000,
        taxOwed: 3_000,
        oreLineValues: { [ZEOLITES]: 30_000 },
      })
    );
  });

  it('rejects a negative or non-numeric entry, snapping back to the computed default', async () => {
    useMiningTaxOreValueMode.setState({ value: true, hydrated: true });
    renderDialog([payee()], existingAssignment());

    const oreValue = screen.getByLabelText('Zeolites value');
    // A single change event (a paste, or the end result of any keystroke
    // sequence) carrying a negative number outright — not typed character by
    // character, since a leading '-' alone would already be rejected and
    // reset before a following digit lands.
    fireEvent.change(oreValue, { target: { value: '-5' } });

    // Rejected outright: the field never shows the invalid text, unlike the
    // whole-row fields' "leave it, disable Save" behavior.
    expect(oreValue).not.toHaveValue('-5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockedUpdate).toHaveBeenCalledWith(
      existingAssignment(),
      // Untouched — the rejected keystroke never became a real override.
      expect.objectContaining({ oreLineValues: {} })
    );
  });

  it('clears oreLineValues when saving with the setting off, even if a prior edit had set some', async () => {
    renderDialog([payee()], existingAssignment({ oreLineValues: { [ZEOLITES]: 30_000 } }));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      expect.objectContaining({ oreLineValues: undefined })
    );
  });
});

describe('AssignDialog — paid lock', () => {
  it('disables every field and offers an unlock prompt instead of a working Save', () => {
    renderDialog([payee()], existingAssignment({ status: 'paid' }));

    expect(screen.getByText(/marked paid/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Estimated value')).toBeDisabled();
    expect(screen.getByLabelText('Tax owed')).toBeDisabled();
    expect(screen.getByLabelText('Tax %')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('calls onUnlock when the unlock button is pressed', async () => {
    const onUnlock = vi.fn();
    renderDialog([payee()], existingAssignment({ status: 'paid' }), undefined, onUnlock);

    await userEvent.click(screen.getByRole('button', { name: 'Unlock to edit' }));

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('locks the per-ore boxes too, when the setting is on', () => {
    useMiningTaxOreValueMode.setState({ value: true, hydrated: true });
    renderDialog([payee()], existingAssignment({ status: 'paid' }));

    expect(screen.getByLabelText('Zeolites value')).toBeDisabled();
  });
});
