import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { PayeeRecord } from '@/db';
import { AssignDialog } from './AssignDialog';
import { assign } from './ledgerActions';
import type { MoonMiningTaxRow } from './snapshot';

vi.mock('./ledgerActions', () => ({
  assign: vi.fn(async () => ({ ok: true, value: {} })),
}));
vi.mock('./payees', () => ({ updatePayee: vi.fn(async () => ({})) }));

const mockedCreate = vi.mocked(assign);

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
 * Deliberately a claim about the Payee, not about the number above it: once
 * the pilot types their own figure, a "valued at X" reading would contradict
 * the field it sits under.
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
  onAddPayee?: () => void,
  targetRow: MoonMiningTaxRow = row,
  onAssigned = vi.fn()
) {
  render(
    <MemoryRouter>
      <AssignDialog
        row={targetRow}
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
        onAssigned={onAssigned}
        onCancel={vi.fn()}
        onAddPayee={onAddPayee}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssignDialog — no Payees yet', () => {
  it('offers an Add Payee button that hands off to the Payee manager', async () => {
    const onAddPayee = vi.fn();
    renderDialog([], onAddPayee);

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
    renderDialog([payee()], undefined, twoLineRow);

    const link = screen.getByRole('link', { name: 'Zeolites' });
    expect(link.getAttribute('href')).toContain(`type=${ZEOLITES}`);
  });

  it('keeps the checkbox independently operable, unchecking a line without following the nested link', async () => {
    renderDialog([payee()], undefined, twoLineRow);

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
});

describe('AssignDialog — saving', () => {
  it('shows the failure and stays open when the save fails', async () => {
    mockedCreate.mockResolvedValueOnce({ ok: false, reason: 'save-failed', cause: null });
    const onAssigned = vi.fn();
    renderDialog([payee()], undefined, row, onAssigned);

    await userEvent.click(screen.getByRole('button', { name: /^Assign( to |$)/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save');
    expect(onAssigned).not.toHaveBeenCalled();
  });

  it('closes and reloads when the ore was claimed meanwhile', async () => {
    mockedCreate.mockResolvedValueOnce({ ok: false, reason: 'already-assigned', cause: null });
    const onAssigned = vi.fn();
    renderDialog([payee()], undefined, row, onAssigned);

    await userEvent.click(screen.getByRole('button', { name: /^Assign( to |$)/ }));

    expect(onAssigned).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
