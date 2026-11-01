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

/** A 100-portion ore returning 16,000 Pyerite and 800 Mexallon per portion, priced 10 and 50 a unit. */
function ore(typeId: number, name: string, quantity: number, efficiency: number): AppraisalItem {
  return {
    typeId,
    name,
    quantity,
    buy: 1000,
    sell: 1200,
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
      },
    },
  };
}

const appraisal = buildAppraisal([ore(1, 'Zeolites', 1000, 0.9), ore(2, 'Coesite', 500, 0.9)], 100);

function open(props: Partial<React.ComponentProps<typeof RefineBreakdownModal>> = {}) {
  const onClose = vi.fn();
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
      {...props}
    />
  );
  return { onClose };
}

afterEach(cleanup);

describe('RefineBreakdownModal', () => {
  it('compares refining with selling as is and names the winner', () => {
    open();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Refine, then sell minerals')).toBeInTheDocument();
    // The label is also a column header and a verdict in the by-item table.
    expect(within(dialog).getAllByText('Sell as is').length).toBeGreaterThan(0);
    // 90% efficiency refines to far more than the 1.5M the pile sells for as is.
    expect(within(dialog).getByText(/Refining beats selling as is above/)).toBeInTheDocument();
    const refineCard = within(dialog).getByText('Refine, then sell minerals').closest('div');
    expect(refineCard).toHaveTextContent('Better');
    const asIsCard = within(dialog).getAllByText('Sell as is')[0].closest('div');
    expect(asIsCard).not.toHaveTextContent('Better');
  });

  it('lists the minerals with their quantities, prices and the total', () => {
    open();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('cell', { name: 'Pyerite' })).toBeInTheDocument();
    expect(within(dialog).getByRole('cell', { name: 'Mexallon' })).toBeInTheDocument();
    // 10 + 5 portions x floor(16,000 x 0.9) Pyerite
    expect(within(dialog).getByRole('cell', { name: '216,000' })).toBeInTheDocument();
    expect(within(dialog).getByText('Refine total')).toBeInTheDocument();
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
      within(dialog).getByText(/Pyerite: 16,000 × 10 × 0\.9000 = 144,000/)
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'All items' }));
    expect(within(dialog).getByText('Refine breakdown, 2 items')).toBeInTheDocument();
  });

  it('drills from the by-item table into one item', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: 'Coesite' }));
    expect(screen.getByText('Refine breakdown, Coesite')).toBeInTheDocument();
  });

  it('says so when the yield is the NPC default on the live tab, never silently', () => {
    open({ setup: { yieldRate: 0.5, taxRate: 0 }, setupFields: <span>fields</span> });
    expect(screen.getByText(/Assuming an NPC station's 50% yield/)).toBeInTheDocument();
  });

  it('does not assume anything on a shared link, where the numbers are the sharer', () => {
    open({
      setup: { yieldRate: 0.5, taxRate: 0 },
      shared: {
        generatedAt: 1_790_000_000,
        source: 'shared',
        unavailable: null,
        onToggleSource: vi.fn(),
      },
    });
    expect(screen.queryByText(/Assuming an NPC station/)).not.toBeInTheDocument();
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
});
