import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { planClosedDayFix, type ClosedDay } from '@/engine/corpTaxBook/closedDayFix';
import { ClosedDayConflictNotice, type ConflictNames } from './ClosedDayConflict';

const ZEO = 45490;
const CORP = 98000001;
const names: ConflictNames = {
  payee: (id) => ({ own: 'Brass Corp', buddy: 'Rock Hound' })[id] ?? id,
  corp: () => 'Brass',
  typeNames: new Map([[ZEO, 'Zeolites']]),
};

const day = (over: Partial<ClosedDay> = {}): ClosedDay => ({
  characterId: 1,
  date: '2026-11-20',
  solarSystemId: 30003838,
  oreLines: [{ typeId: ZEO, quantity: 100 }],
  allocations: [
    {
      id: 'c',
      payeeId: 'own',
      taxPct: 10,
      oreLines: [{ typeId: ZEO, quantity: 40 }],
      status: 'paid',
    },
    {
      id: 'x',
      payeeId: 'buddy',
      taxPct: 5,
      oreLines: [{ typeId: ZEO, quantity: 60 }],
      status: 'outstanding',
    },
  ],
  books: [
    {
      corporationId: CORP,
      minerId: 'solo:1',
      ownPayeeIds: ['own'],
      share: [{ typeId: ZEO, quantity: 70 }],
      taxPct: 10,
      unitPrices: { [ZEO]: 100 },
      oreForm: 'compressed',
      moneyApplied: true,
    },
  ],
  ...over,
});

describe('ClosedDayConflictNotice', () => {
  it('says what differs and why nothing was changed on its own', () => {
    const plan = planClosedDayFix(day(), new Set());
    render(<ClosedDayConflictNotice plan={plan} names={names} onFix={vi.fn()} />);
    expect(
      screen.getByText("Brass's book recorded 30 Zeolites that you gave to Rock Hound.")
    ).toBeInTheDocument();
    expect(screen.getByText(/Brass's book already has money on this day/)).toBeInTheDocument();
    expect(screen.queryByText(/claimed twice|also recorded it/)).toBeNull();
  });

  it('says the miner recorded more than the book, not that it was claimed twice', () => {
    const plan = planClosedDayFix(
      day({
        allocations: [
          {
            id: 'c',
            payeeId: 'own',
            taxPct: 10,
            oreLines: [{ typeId: ZEO, quantity: 100 }],
            status: 'paid',
          },
        ],
      }),
      new Set()
    );
    render(<ClosedDayConflictNotice plan={plan} names={names} onFix={vi.fn()} />);
    expect(
      screen.getByText("You recorded 30 Zeolites for Brass Corp that Brass's book did not record.")
    ).toBeInTheDocument();
  });

  it('shows what Fix my records changes before applying it', async () => {
    const user = userEvent.setup();
    const onFix = vi.fn();
    const plan = planClosedDayFix(day(), new Set());
    render(<ClosedDayConflictNotice plan={plan} names={names} onFix={onFix} />);
    await user.click(screen.getByRole('button', { name: 'Fix my records' }));
    expect(onFix).not.toHaveBeenCalled();
    expect(
      screen.getByText('Brass Corp: 40 Zeolites at 10% → 70 Zeolites at 10%')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Rock Hound: 60 Zeolites at 5% → 30 Zeolites at 5%')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fix my records' }));
    expect(onFix).toHaveBeenCalledTimes(1);
  });
});
