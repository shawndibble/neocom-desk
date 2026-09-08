import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Appraisal } from '@/engine/market/appraisal';
import { AppraisalPanel } from './AppraisalPanel';
import type { AppraisalController } from './useAppraisal';
import type { AppraisalOutcome } from './appraisalData';

function controller(overrides: Partial<AppraisalController> = {}): AppraisalController {
  return {
    text: '',
    setText: vi.fn(),
    result: null,
    loading: false,
    failed: false,
    canAppraise: false,
    appraise: vi.fn(),
    clear: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

const APPRAISAL: Appraisal = {
  rows: [
    {
      typeId: 2048,
      name: 'Damage Control II',
      quantity: 3,
      buyEach: 448_650,
      sellEach: 460_800,
      buyTotal: 1_345_950,
      sellTotal: 1_382_400,
    },
    {
      typeId: 999,
      name: 'Civilian Gatling Railgun',
      quantity: 4,
      buyEach: null,
      sellEach: 1_000,
      buyTotal: null,
      sellTotal: 4_000,
    },
  ],
  totals: { buy: 1_345_950, sell: 1_386_400, spread: 40_450, unpricedRows: 1 },
};

function outcome(overrides: Partial<AppraisalOutcome> = {}): AppraisalOutcome {
  return { appraisal: APPRAISAL, unmatched: [], entryCount: 2, ...overrides };
}

function renderPanel(props: Partial<Parameters<typeof AppraisalPanel>[0]> = {}) {
  const onPricePercentChange = vi.fn();
  render(
    <AppraisalPanel
      controller={controller()}
      pricePercent={90}
      onPricePercentChange={onPricePercentChange}
      hubName="Jita"
      {...props}
    />
  );
  return { onPricePercentChange };
}

describe('AppraisalPanel', () => {
  it('prompts for a paste before anything has been appraised', () => {
    renderPanel();
    expect(screen.getByText('Nothing appraised yet')).toBeInTheDocument();
  });

  it('renders a priced row with both sides', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    const row = screen.getByRole('row', { name: /Damage Control II/ });
    expect(within(row).getByText('1,345,950')).toBeInTheDocument();
    expect(within(row).getByText('1,382,400')).toBeInTheDocument();
  });

  /** A null price is "nobody is trading this", not "this is free". */
  it('shows a dash, not a zero, where a side has no orders', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    const row = screen.getByRole('row', { name: /Civilian Gatling Railgun/ });
    expect(within(row).getAllByText('—')).toHaveLength(2);
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
  });

  it('says how many rows were left out of a total', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    expect(screen.getByText(/1 item has no orders on one side at this hub/)).toBeInTheDocument();
  });

  it('reports unmatched lines beside the paste box, by line number', () => {
    renderPanel({
      controller: controller({
        result: outcome({ unmatched: [{ name: 'Nanite Repair Past', lines: [3, 7] }] }),
      }),
    });
    expect(screen.getByText('1 line not matched')).toBeInTheDocument();
    expect(screen.getByText('line 3, 7 · Nanite Repair Past')).toBeInTheDocument();
  });

  it('names the hub and percentage the figures are quoted at', () => {
    renderPanel({ controller: controller({ result: outcome() }) });
    expect(screen.getByText('Jita')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('commits a valid percentage as it is typed', async () => {
    const user = userEvent.setup();
    const { onPricePercentChange } = renderPanel();
    const field = screen.getByLabelText('Price %');
    await user.clear(field);
    await user.type(field, '85');
    expect(onPricePercentChange).toHaveBeenLastCalledWith(85);
  });

  /**
   * Clearing the box to retype must not snap the value back — a field that
   * rewrites itself mid-edit cannot be edited.
   */
  it('does not commit an empty or out-of-range percentage', async () => {
    const user = userEvent.setup();
    const { onPricePercentChange } = renderPanel();
    const field = screen.getByLabelText('Price %');
    await user.clear(field);
    expect(onPricePercentChange).not.toHaveBeenCalled();
    await user.type(field, '99999');
    expect(onPricePercentChange).not.toHaveBeenCalledWith(99999);
  });

  it('appraises on the button, and only with something to appraise', async () => {
    const user = userEvent.setup();
    const appraise = vi.fn();
    renderPanel({ controller: controller({ text: 'Tritanium 5', canAppraise: true, appraise }) });
    await user.click(screen.getByRole('button', { name: 'Appraise' }));
    expect(appraise).toHaveBeenCalledOnce();
  });

  it('disables Appraise with an empty box', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Appraise' })).toBeDisabled();
  });

  it('says so when nothing in the paste named a real item', () => {
    renderPanel({
      controller: controller({
        result: outcome({
          appraisal: { rows: [], totals: { buy: 0, sell: 0, spread: 0, unpricedRows: 0 } },
          unmatched: [{ name: 'Nope', lines: [1] }],
        }),
      }),
    });
    expect(screen.getByText('No items recognised')).toBeInTheDocument();
  });

  it('reports a catalogue that would not load', () => {
    renderPanel({ controller: controller({ failed: true }) });
    expect(screen.getByText("Couldn't load the market catalogue")).toBeInTheDocument();
  });
});
