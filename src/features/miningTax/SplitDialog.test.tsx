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
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { SplitDialog } from './SplitDialog';
import type { MoonMiningTaxRow } from './snapshot';

vi.mock('./assignments', () => ({ splitAssignment: vi.fn(async () => ({})) }));

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

function renderDialog() {
  return render(
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
    />
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
