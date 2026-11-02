import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { buildAppraisal, type AppraisalItem } from '@/engine/market/appraisal';
import { RefineBreakdownModal } from './RefineBreakdownModal';

const PYERITE = 35;
const MEXALLON = 36;
const NAMES = new Map([
  [PYERITE, 'Pyerite'],
  [MEXALLON, 'Mexallon'],
]);

/**
 * A 100-portion ore returning 16,000 Pyerite and 800 Mexallon per portion. The minerals buy for 10 and
 * 50 and sell for 8 and 70; the ore buys for 1,000 and sells for `sell`.
 */
function ore(
  typeId: number,
  name: string,
  quantity: number,
  efficiency: number,
  { sell = 1200, withSellSide = true } = {}
): AppraisalItem {
  return {
    typeId,
    name,
    quantity,
    buy: 1000,
    sell,
    refine: {
      valueAtFullPrice: 0,
      pricedAll: true,
      unitsLeftOver: quantity % 100,
      detail: {
        portionSize: 100,
        materials: [
          { typeId: PYERITE, quantity: 16_000 },
          { typeId: MEXALLON, quantity: 800 },
        ],
        efficiency,
        materialPrices: { [PYERITE]: 10, [MEXALLON]: 50 },
        ...(withSellSide ? { materialSellPrices: { [PYERITE]: 8, [MEXALLON]: 70 } } : {}),
      },
    },
  };
}

const appraisal = buildAppraisal([ore(1, 'Zeolites', 1000, 0.9), ore(2, 'Coesite', 500, 0.9)], 100);

function open(props: Partial<React.ComponentProps<typeof RefineBreakdownModal>> = {}) {
  const onClose = vi.fn();
  const onBasisChange = vi.fn();
  render(
    <RefineBreakdownModal
      open
      onClose={onClose}
      appraisal={appraisal}
      pricePercent={100}
      hubName="Jita"
      setup={{ yieldRate: 0.66, taxRate: 0 }}
      mineralNames={NAMES}
      initialTypeId={null}
      basis="buy"
      onBasisChange={onBasisChange}
      {...props}
    />
  );
  return { onClose, onBasisChange };
}

afterEach(cleanup);

describe('RefineBreakdownModal', () => {
  it('compares refining with selling as is on every price basis, with the selected one marked', () => {
    open();
    const table = screen.getByRole('table', { name: 'Refine or sell as is, on each price basis' });
    for (const name of ['Buy orders', 'Split', 'Sell orders']) {
      expect(within(table).getByText(name)).toBeInTheDocument();
    }
    // 1,500 units, 90%: 1.0M + 0.5M sold as is on buy; refined 2.7M.
    expect(within(table).getAllByText('Selected')).toHaveLength(1);
    expect(within(table).getByRole('row', { name: /Buy orders/ })).toHaveTextContent('Selected');
    expect(within(table).getByRole('row', { name: /Sell orders/ })).not.toHaveTextContent(
      'Selected'
    );
  });

  it('says once what to do on the selected basis, and what the others say where they differ', () => {
    // The ore sells for 5,000: listing it as is beats refining on the sell side, though refining wins on buy.
    const lopsided = buildAppraisal(
      [ore(1, 'Zeolites', 1000, 0.9, { sell: 5000 }), ore(2, 'Coesite', 500, 0.9, { sell: 5000 })],
      100
    );
    open({ appraisal: lopsided });
    const action = screen.getByText('Suggested action:').parentElement as HTMLElement;
    expect(within(action).getByText('Refine')).toBeInTheDocument();
    expect(within(action).getByText(/sell as is on split and sell orders/)).toBeInTheDocument();
  });

  it('adds no note when every basis agrees', () => {
    open();
    const action = screen.getByText('Suggested action:').parentElement as HTMLElement;
    expect(within(action).getByText('Refine')).toBeInTheDocument();
    expect(action.querySelector('small')).toBeNull();
  });

  it('warns once when an item sells for many times its buy price', () => {
    open({
      appraisal: buildAppraisal(
        [ore(1, 'Zeolites', 1000, 0.9, { sell: 50_000 }), ore(2, 'Coesite', 500, 0.9)],
        100
      ),
    });
    expect(screen.getByText(/1 item sells for over 10× the buy price/)).toBeInTheDocument();
  });

  it('saves the basis you pick, so later appraisals use it', async () => {
    const user = userEvent.setup();
    const { onBasisChange } = open();
    await user.click(screen.getByRole('row', { name: /Sell orders/ }));
    expect(onBasisChange).toHaveBeenCalledWith('sell');
  });

  it('prices everything below on the selected basis', () => {
    open({ basis: 'sell' });
    const minerals = screen.getByRole('table', { name: 'Minerals you get' });
    // 15 portions refine into 216,000 Pyerite (x8) and 10,800 Mexallon (x70) on the sell side.
    expect(within(minerals).getByRole('cell', { name: '1,728,000' })).toBeInTheDocument();
    expect(within(minerals).getByRole('cell', { name: '756,000' })).toBeInTheDocument();
    expect(screen.getByText('Minerals you get, on sell orders')).toBeInTheDocument();
  });

  it('shows both unit prices on every mineral, and the totals in the same table', () => {
    open();
    const minerals = screen.getByRole('table', { name: 'Minerals you get' });
    const pyerite = within(minerals).getByRole('row', { name: /Pyerite/ });
    expect(pyerite).toHaveTextContent('10');
    expect(pyerite).toHaveTextContent('8');
    expect(within(minerals).getByRole('cell', { name: 'Refine total' })).toBeInTheDocument();
    expect(within(minerals).getByRole('cell', { name: 'Minerals' })).toBeInTheDocument();
  });

  it('leaves the sell and split bases out where the sell prices were never carried', async () => {
    const user = userEvent.setup();
    const { onBasisChange } = open({
      appraisal: buildAppraisal([ore(1, 'Zeolites', 1000, 0.9, { withSellSide: false })], 100),
    });
    expect(screen.getAllByText("Sell prices weren't saved with this link")).toHaveLength(2);
    await user.click(screen.getByRole('row', { name: /Sell orders/ }));
    expect(onBasisChange).not.toHaveBeenCalled();
  });

  it('falls back to the buy basis when the remembered one cannot be priced', () => {
    open({
      basis: 'sell',
      appraisal: buildAppraisal([ore(1, 'Zeolites', 1000, 0.9, { withSellSide: false })], 100),
    });
    expect(screen.getByRole('row', { name: /Buy orders/ })).toHaveTextContent('Selected');
  });

  it('opens on one item with its batch arithmetic, and goes back to all', async () => {
    const user = userEvent.setup();
    open({ initialTypeId: 1 });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Refine breakdown, Zeolites')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/1,000 units ÷ 100 per portion = 10 portions/)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Pyerite: 16,000 × 10 × 0\.9000 = 144,000\.0/)
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'All items' }));
    expect(within(dialog).getByText('Refine breakdown, 2 items')).toBeInTheDocument();
  });

  it('drills from the by-item table into one item', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('cell', { name: 'Coesite' }));
    expect(screen.getByText('Refine breakdown, Coesite')).toBeInTheDocument();
  });

  it('says so when the yield is the NPC default on the live tab, never silently', () => {
    open({
      setup: { yieldRate: 0.5, taxRate: 0 },
      editSetup: { onYield: vi.fn(), onTax: vi.fn() },
    });
    expect(screen.getByText(/Assuming an NPC station's 50% base yield/)).toBeInTheDocument();
  });

  it('names the NPC default on a shared link too, as the sharer numbers', () => {
    open({
      setup: { yieldRate: 0.5, taxRate: 0 },
      shared: {
        generatedAt: 1_790_000_000,
        source: 'shared',
        unavailable: null,
        onToggleSource: vi.fn(),
      },
    });
    expect(
      screen.getByText(/These numbers use an NPC station's 50% base yield/)
    ).toBeInTheDocument();
    expect(screen.getByText('Shared with you')).toBeInTheDocument();
  });

  it('swaps to the visitor numbers with the button, and back', async () => {
    const user = userEvent.setup();
    const onToggleSource = vi.fn();
    open({
      shared: { generatedAt: 1_790_000_000, source: 'shared', unavailable: null, onToggleSource },
    });
    await user.click(screen.getByRole('button', { name: 'Use my numbers' }));
    expect(onToggleSource).toHaveBeenCalledOnce();
  });

  it('explains why the visitor numbers are unavailable when nobody is logged in', () => {
    open({
      shared: {
        generatedAt: 1_790_000_000,
        source: 'shared',
        unavailable: 'signedOut',
        onToggleSource: vi.fn(),
      },
    });
    expect(screen.getByRole('button', { name: 'Use my numbers' })).toBeDisabled();
    expect(screen.getByText(/Log in with a Character/)).toBeInTheDocument();
  });

  it('labels the numbers as the visitor when they are in use', () => {
    open({
      shared: {
        generatedAt: 1_790_000_000,
        source: 'mine',
        unavailable: null,
        onToggleSource: vi.fn(),
      },
    });
    expect(screen.getByText('Using your numbers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to shared numbers' })).toBeEnabled();
  });

  it('says when nothing in the list refines', () => {
    open({
      appraisal: buildAppraisal([{ typeId: 9, name: 'Hull', quantity: 1, buy: 5, sell: 6 }], 100),
    });
    expect(screen.getByText(/Nothing in this list refines/)).toBeInTheDocument();
  });

  it('falls back to the whole pile when the chosen item stops refining', () => {
    open({ initialTypeId: 999 });
    expect(screen.getByText('Refine breakdown, 2 items')).toBeInTheDocument();
  });

  it('keeps the leftover apart from the figure the table and chip show', () => {
    open({ appraisal: buildAppraisal([ore(1, 'Zeolites', 1038, 0.9)], 100) });
    expect(screen.getByRole('cell', { name: 'Total with leftover' })).toBeInTheDocument();
    expect(
      screen.queryByRole('cell', { name: 'Refined minerals, less tax' })
    ).not.toBeInTheDocument();
  });
});

describe('RefineBreakdownModal, typing the reprocessing yield', () => {
  it('works the facility base yield out of the yield the EVE client shows', async () => {
    const user = userEvent.setup();
    const onYield = vi.fn();
    open({ editSetup: { onYield, onTax: vi.fn() } });
    // 0.9 efficiency over a 0.66 base yield is a x1.3636 skills multiplier.
    await user.click(screen.getByRole('button', { name: /Edit Reprocessing yield/ }));
    const field = screen.getByRole('textbox', { name: 'Reprocessing yield' });
    await user.clear(field);
    await user.type(field, '69.7{Enter}');
    expect(onYield).toHaveBeenCalledOnce();
    expect(onYield.mock.calls[0][0]).toBeCloseTo(0.697 / (0.9 / 0.66), 3);
  });

  it('leaves it as a readout when the ores carry different skills, with no single base to work out', () => {
    open({
      editSetup: { onYield: vi.fn(), onTax: vi.fn() },
      appraisal: buildAppraisal([ore(1, 'Zeolites', 1000, 0.9), ore(2, 'Coesite', 500, 0.8)], 100),
    });
    expect(
      screen.queryByRole('button', { name: /Edit Reprocessing yield/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('80% – 90%')).toBeInTheDocument();
  });

  it('is a readout on a shared link', () => {
    open({
      shared: {
        generatedAt: 1_790_000_000,
        source: 'shared',
        unavailable: null,
        onToggleSource: vi.fn(),
      },
    });
    expect(
      screen.queryByRole('button', { name: /Edit Reprocessing yield/ })
    ).not.toBeInTheDocument();
  });
});
