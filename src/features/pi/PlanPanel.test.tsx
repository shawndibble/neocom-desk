import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { PiData } from '@/sde/types';
import { expandChain, type PiTier } from '@/engine/pi/chain';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const BROADCAST_NODE = 2867;

/** Flat per tier, as in `engine/pi/chain.test.ts`: enough to preserve the inversions. */
const UNIT_PRICE: Record<PiTier, number> = {
  0: 5,
  1: 760,
  2: 14_000,
  3: 100_000,
  4: 1_900_000,
};

const fullPrices = Object.fromEntries(
  expandChain(BROADCAST_NODE, pi, { unitsPerHour: 1 }).nodes.map((node) => [
    node.typeId,
    UNIT_PRICE[node.tier],
  ])
);

const loadPlanPrices = vi.fn();
const loadCustomsCodeExpertise = vi.fn();

vi.mock('@/sde/loadSde', () => ({
  loadPi: vi.fn(async () => pi),
}));

vi.mock('./planPrices', () => ({
  loadPlanPrices: (...args: unknown[]) => loadPlanPrices(...args),
}));

vi.mock('./customsRate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./customsRate')>()),
  loadCustomsCodeExpertise: (...args: unknown[]) => loadCustomsCodeExpertise(...args),
}));

const { PlanPanel } = await import('./PlanPanel');

beforeEach(() => {
  loadPlanPrices.mockReset();
  loadPlanPrices.mockResolvedValue({
    prices: fullPrices,
    unpriced: [],
    failed: false,
    fetchedAt: new Date(),
  });
  loadCustomsCodeExpertise.mockReset();
  loadCustomsCodeExpertise.mockResolvedValue(4);
});

function renderPanel(typeId: number | null = BROADCAST_NODE) {
  const onTypeIdChange = vi.fn();
  render(<PlanPanel characterId={91} typeId={typeId} onTypeIdChange={onTypeIdChange} />);
  return { onTypeIdChange };
}

/** The verdict's own panel, so a `getByText` can't wander into the rate table. */
async function verdict(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: 'Verdict' });
  const panel = heading.closest('section');
  if (!(panel instanceof HTMLElement)) throw new Error('no verdict panel');
  return panel;
}

function ledgerValue(panel: HTMLElement, label: string): string {
  const row = within(panel).getByText(label).closest('div');
  return row?.lastElementChild?.textContent?.trim() ?? '';
}

/** Margins are formatted with a leading minus, which is the sign the ticket cares about. */
function isNegative(text: string): boolean {
  return text.trim().startsWith('-');
}

async function setCustomsRate(percent: string) {
  const user = userEvent.setup();
  const field = screen.getByLabelText('Customs rate (%)');
  await user.clear(field);
  await user.type(field, percent);
}

describe('PlanPanel', () => {
  it('gives a real verdict for a character with no colonies at all, off the P1 floor', async () => {
    renderPanel();
    const panel = await verdict();
    // 16 factory pins, the ticket's worked example.
    expect(within(panel).getByText('16 factory pins')).toBeInTheDocument();
    expect(isNegative(ledgerValue(panel, 'Margin per unit'))).toBe(false);
  });

  it('turns the margin negative on one planet per tier, from the layout alone', async () => {
    const user = userEvent.setup();
    renderPanel();
    await verdict();
    await setCustomsRate('15');
    expect(isNegative(ledgerValue(await verdict(), 'Margin per unit'))).toBe(false);

    await user.selectOptions(screen.getByLabelText('Factory layout'), 'planet-per-tier');

    const after = await verdict();
    expect(isNegative(ledgerValue(after, 'Margin per unit'))).toBe(true);
    // And the layout penalty is visible where it is actually charged.
    expect(isNegative(ledgerValue(after, 'Customs between planets'))).toBe(true);
  });

  it('charges nothing between planets when every made tier shares one', async () => {
    renderPanel();
    const panel = await verdict();
    expect(ledgerValue(panel, 'Customs between planets')).toMatch(/^0/);
  });

  it('shows the needs-a-yield-assumption state with an editable rate, never a zero', async () => {
    const user = userEvent.setup();
    renderPanel();
    await verdict();

    await user.click(screen.getByRole('button', { name: 'Extract P0' }));

    const panel = await verdict();
    expect(within(panel).getByText('Needs a yield assumption')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Extractor yield (units/hour)')).toBeInTheDocument();
    expect(within(panel).queryByText('Margin per unit')).not.toBeInTheDocument();
    // The P0 tiers it would have to cover are named, so the assumption can be made precisely.
    expect(within(panel).getByText(/Noble Metals/)).toBeInTheDocument();
  });

  it('costs the P0 floor once a yield is given, and says P0 is not free', async () => {
    const user = userEvent.setup();
    renderPanel();
    await verdict();
    await user.click(screen.getByRole('button', { name: 'Extract P0' }));
    await user.type(
      within(await verdict()).getByLabelText('Extractor yield (units/hour)'),
      '1000000'
    );

    const panel = await verdict();
    expect(within(panel).getByText(/9 extractors/)).toBeInTheDocument();
    expect(within(panel).getByText(/valued at the hub, not at zero/)).toBeInTheDocument();
    // The tax-boundary count keeps its own labelled row rather than riding in
    // the footprint, where it would read as "40 pins fit on 1 planet".
    expect(ledgerValue(panel, 'Planets taxed across')).toBe('1');
  });

  it("prefills the highsec rate from the character's Customs Code Expertise and says so", async () => {
    renderPanel();
    await verdict();
    expect(screen.getByLabelText('Customs rate (%)')).toHaveValue(6);
    expect(screen.getByText(/less 1% per level of Customs Code Expertise/)).toHaveTextContent(
      'level 4'
    );
  });

  it('says the skill could not be applied rather than presenting 10% as measured', async () => {
    loadCustomsCodeExpertise.mockResolvedValue(null);
    renderPanel();
    await verdict();
    expect(screen.getByLabelText('Customs rate (%)')).toHaveValue(10);
    expect(screen.getByText(/skills haven't loaded/)).toBeInTheDocument();
  });

  it('drops to 0% outside highsec, where the skill reduces nothing', async () => {
    const user = userEvent.setup();
    renderPanel();
    await verdict();
    await user.selectOptions(screen.getByLabelText('Colony space'), 'nullsec');
    expect(screen.getByLabelText('Customs rate (%)')).toHaveValue(0);
    expect(screen.getByText(/player POCO has no NPC component/)).toBeInTheDocument();
  });

  it('moves the winning floor to P0 at a 0% rate, and back to P1 at 10%', async () => {
    const user = userEvent.setup();
    renderPanel();
    await verdict();
    await user.click(screen.getByRole('button', { name: 'Extract P0' }));
    await user.type(
      within(await verdict()).getByLabelText('Extractor yield (units/hour)'),
      '1000000'
    );

    const table = screen.getByRole('table', {
      name: /Margin per unit for each sourcing floor/,
    });
    const rowFor = (name: string) =>
      within(table)
        .getAllByRole('row')
        .find((row) => within(row).queryByText(name) !== null);

    const p0 = rowFor('Extract P0');
    const p1 = rowFor('Buy P1');
    if (!p0 || !p1) throw new Error('sourcing floor rows missing');

    // Columns are the swept rates in ascending order: 0%, 5%, 10%, 15%, 20%.
    const best = (row: HTMLElement) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent ?? '')
        .map((text) => text.includes('★'));

    expect(best(p0)[2]).toBe(true); // 0% column: first two cells are floor + footprint
    expect(best(p1)[4]).toBe(true); // 10%
  });

  it("folds the user's own rate into the sweep, so the control moves the answer", async () => {
    const user = userEvent.setup();
    renderPanel();
    await verdict();
    await user.click(screen.getByRole('button', { name: 'Extract P0' }));
    await user.type(
      within(await verdict()).getByLabelText('Extractor yield (units/hour)'),
      '1000000'
    );

    // 3% is not one of the fixed columns, so a column only exists here because
    // the control was driven — and P0 still wins below the ~5.7% crossover.
    await setCustomsRate('3');

    const table = await screen.findByRole('table', {
      name: /Margin per unit for each sourcing floor/,
    });
    const header = within(table).getAllByRole('columnheader');
    const rateIndex = header.findIndex((cell) => cell.textContent?.trim() === '3%');
    expect(rateIndex).toBeGreaterThan(-1);

    const p0Row = within(table)
      .getAllByRole('row')
      .find((row) => within(row).queryByText('Extract P0') !== null);
    if (!p0Row) throw new Error('no P0 row');
    expect(within(p0Row).getAllByRole('cell')[rateIndex].textContent).toContain('★');
  });

  it('gives no verdict at all, and no chain table, until an output rate is given', async () => {
    const user = userEvent.setup();
    renderPanel();
    await verdict();

    await user.clear(screen.getByLabelText('Output per day'));

    expect(await screen.findByText('Enter an output rate')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Verdict' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chain' })).not.toBeInTheDocument();
    // And the controls are still there to type into.
    expect(screen.getByLabelText('Output per day')).toBeInTheDocument();
  });

  it('writes the selected commodity back out, so the route can hold it in the URL', async () => {
    const user = userEvent.setup();
    const { onTypeIdChange } = renderPanel();
    await verdict();

    await user.selectOptions(screen.getByLabelText('Product'), '9828');

    expect(onTypeIdChange).toHaveBeenCalledWith(9828);
  });

  it('shows what the P0 floor really costs in planets, not just in ISK', async () => {
    const user = userEvent.setup();
    renderPanel();
    await verdict();
    await user.click(screen.getByRole('button', { name: 'Extract P0' }));
    await user.type(
      within(await verdict()).getByLabelText('Extractor yield (units/hour)'),
      '1000000'
    );
    // 40 factory pins plus 9 extractors, against the six planets a character has.
    expect(within(await verdict()).getByText('40 factory pins, 9 extractors')).toBeInTheDocument();
  });

  it('gives no verdict at all when the hub does not quote the product', async () => {
    const withoutTarget = { ...fullPrices };
    delete withoutTarget[BROADCAST_NODE];
    loadPlanPrices.mockResolvedValue({
      prices: withoutTarget,
      unpriced: [BROADCAST_NODE],
      failed: false,
      fetchedAt: new Date(),
    });

    renderPanel();
    const panel = await verdict();
    expect(within(panel).getByText('No verdict: not priceable at this hub')).toBeInTheDocument();
    expect(within(panel).queryByText('Margin per unit')).not.toBeInTheDocument();
  });

  it('offers only the floors below the product, so the engine is never asked for an impossible one', async () => {
    renderPanel(9828); // Silicon, a P1
    await screen.findByRole('button', { name: 'Extract P0' });
    expect(screen.queryByRole('button', { name: 'Buy P1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buy P2' })).not.toBeInTheDocument();
  });

  it('titles each stacked chain card by the commodity, not by its tier', async () => {
    renderPanel();
    const table = await screen.findByRole('table', { name: /Production chain for Broadcast Node/ });
    // `dt-primary` is the cell `.dt-stack` hoists as the card title below `sm`
    // (docs/DESIGN.md §4a) — the tier chip carries the hierarchy instead.
    expect(within(table).getByText('Broadcast Node').closest('td')).toHaveClass('dt-primary');
    expect(within(table).getAllByText('P4')[0].closest('td')).not.toHaveClass('dt-primary');
  });
});
