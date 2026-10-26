/**
 * The split preview's tax-owed figure (issue #1143): it used to print in the
 * `isk-neg` loss tone with no sign, which docs/DESIGN.md §7 forbids — a
 * status-toned ISK figure must carry its own `+`/`−`, since color alone is
 * the sole signal for colorblind and grayscale readers. `taxOwed` is
 * non-negative by construction here, so there is no sign to add; the fix
 * drops the tone, matching how the same value already renders on the ledger
 * table, the group summary, Settle Up and Link Payment.
 *
 * Asserted at the component level rather than in `e2e/miningTaxNarrow.spec.ts`:
 * the preview line carries no `md:` (or any other) responsive variant, so one
 * rendering covers 390px and every width above it, and an e2e run would have
 * to seed a second Payee and an Assignment for no extra coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { split } from './ledgerActions';
import { SplitDialog } from './SplitDialog';
import type { MoonMiningTaxRow } from './snapshot';

vi.mock('./ledgerActions', () => ({ split: vi.fn(async () => ({ ok: true, value: {} })) }));

const CHAR = 1;
const SYSTEM = 30000142;
const ZEOLITES = 45490;
const DATE = '2026-09-04';

const PRICES: ReadonlyMap<number, number> = new Map([[ZEOLITES, 1000]]);
const pricesFor = () => PRICES;

const assignment: MiningTaxAssignmentRecord = {
  id: 'a-1',
  characterId: CHAR,
  date: DATE,
  solarSystemId: SYSTEM,
  payeeId: 'p-jita',
  oreLines: [{ typeId: ZEOLITES, quantity: 100 }],
  taxPct: 10,
  estimatedValue: 100_000,
  taxOwed: 10_000,
  status: 'outstanding',
  updatedAt: 1,
};

const row: MoonMiningTaxRow = {
  characterId: CHAR,
  characterName: 'Miner Alt',
  entry: {
    characterId: CHAR,
    date: DATE,
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ZEOLITES, quantity: 100 }],
  },
  assignments: [assignment],
  unassignedOreLines: [],
};

const payees: PayeeRecord[] = [
  {
    id: 'p-jita',
    characterId: CHAR,
    name: 'Jita landlord',
    defaultTaxPct: 10,
    systemId: SYSTEM,
    hubId: 'jita',
    updatedAt: 1,
  },
  {
    id: 'p-hek',
    characterId: CHAR,
    name: 'Hek landlord',
    defaultTaxPct: 5,
    systemId: SYSTEM,
    hubId: 'hek',
    updatedAt: 1,
  },
];

function renderDialog(extra: Partial<React.ComponentProps<typeof SplitDialog>> = {}) {
  return render(
    <MemoryRouter>
      <SplitDialog
        open
        onClose={vi.fn()}
        assignment={assignment}
        row={row}
        systemName="Jita"
        payees={payees}
        typeNames={new Map([[ZEOLITES, 'Zeolites']])}
        pricesFor={pricesFor}
        busy={false}
        onSplit={vi.fn()}
        {...extra}
      />
    </MemoryRouter>
  );
}

describe('SplitDialog — the split preview', () => {
  it('prints the kept side’s value, tax owed and rate in one unbroken line', () => {
    renderDialog();

    // The whole line, not just the number: dropping the tone collapses three
    // JSX nodes into one text run, so the separators are exactly what a
    // reformat could silently eat.
    expect(screen.getByText('100,000 ISK · 10,000 ISK at 10%')).toBeInTheDocument();
  });

  it('tones no ISK figure in the preview, so none needs a sign it cannot carry', () => {
    const { container } = renderDialog();

    expect(container.querySelectorAll('.text-isk-neg, .text-isk-pos')).toHaveLength(0);
  });
});

describe('SplitDialog — a needs-review Assignment', () => {
  it('starts with the ore it grew by already moved to the second Payee', () => {
    const grown: MiningTaxAssignmentRecord = {
      ...assignment,
      status: 'needs-review',
      reviewDiff: [{ typeId: ZEOLITES, before: 100, after: 130 }],
      oreLines: [{ typeId: ZEOLITES, quantity: 130 }],
    };
    renderDialog({ assignment: grown });

    expect(screen.getByRole('textbox', { name: /zeolites/i })).toHaveValue('30');
    // The original keeps what it was assigned.
    expect(screen.getByText('100,000 ISK · 10,000 ISK at 10%')).toBeInTheDocument();
  });
});

describe('SplitDialog — a failed save', () => {
  it('says so and stays open', async () => {
    vi.mocked(split).mockResolvedValueOnce({
      ok: false,
      reason: 'save-failed',
      cause: new Error('quota'),
    });
    const onSplit = vi.fn();
    render(
      <MemoryRouter>
        <SplitDialog
          open
          onClose={vi.fn()}
          assignment={assignment}
          row={row}
          systemName="Jita"
          payees={payees}
          typeNames={new Map([[ZEOLITES, 'Zeolites']])}
          pricesFor={pricesFor}
          busy={false}
          onSplit={onSplit}
        />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Move part of this day to' }));
    await userEvent.click(screen.getByRole('option', { name: 'Hek landlord' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Units of Zeolites to move' }), {
      target: { value: '40' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Split · move 40 units' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t save/);
    expect(onSplit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Split · move 40 units' })).toBeEnabled();
  });
});

describe('SplitDialog — the same Payee at a second rate', () => {
  async function pickJita() {
    await userEvent.click(screen.getByRole('combobox', { name: 'Move part of this day to' }));
    await userEvent.click(screen.getByRole('option', { name: 'Jita landlord' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Units of Zeolites to move' }), {
      target: { value: '40' },
    });
  }

  it('offers the current Payee and splits to it at a different rate', async () => {
    renderDialog();
    await pickJita();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Tax %' }), {
      target: { value: '8' },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Split · move 40 units' }));

    expect(split).toHaveBeenLastCalledWith(
      assignment,
      expect.objectContaining({ payeeId: 'p-jita', taxPct: 8 }),
      expect.anything()
    );
  });

  it('warns and disables the split while Payee and rate both match', async () => {
    renderDialog();
    await pickJita();

    expect(screen.getByRole('alert')).toHaveTextContent(/merge straight back/);
    expect(screen.getByRole('button', { name: 'Split · move 40 units' })).toBeDisabled();
  });

  it('fills the rate box from a rate chip built from earlier Assignments', async () => {
    renderDialog({ assignments: [assignment, { ...assignment, id: 'a-2', taxPct: 8 }] });
    await pickJita();

    await userEvent.click(screen.getByRole('button', { name: '8%' }));

    expect(screen.getByRole('spinbutton', { name: 'Tax %' })).toHaveValue(8);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sends the Moon / structure label for the new slice and suggests labels used before', async () => {
    renderDialog({
      assignments: [{ ...assignment, id: 'a-2', label: 'Moon 1' }],
    });
    await pickJita();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Tax %' }), {
      target: { value: '8' },
    });
    const input = screen.getByRole('combobox', { name: 'Moon / structure (optional)' });
    expect(document.querySelector(`datalist option[value="Moon 1"]`)).not.toBeNull();
    await userEvent.type(input, 'Moon 2');

    await userEvent.click(screen.getByRole('button', { name: 'Split · move 40 units' }));

    expect(split).toHaveBeenLastCalledWith(
      assignment,
      expect.objectContaining({ label: 'Moon 2' }),
      expect.anything()
    );
  });
});

describe('SplitDialog — typing a quantity', () => {
  it('keeps every digit typed past the first grouping mark', async () => {
    const big = { ...assignment, oreLines: [{ typeId: ZEOLITES, quantity: 100_000 }] };
    renderDialog({ assignment: big });

    const input = screen.getByRole('textbox', { name: /Zeolites/ });
    await userEvent.type(input, '54930');

    expect(input).toHaveValue('54,930');
  });
});

describe('SplitDialog — dismissal', () => {
  it('ignores a backdrop click, so a half-made split is not lost', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes from Cancel', async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
