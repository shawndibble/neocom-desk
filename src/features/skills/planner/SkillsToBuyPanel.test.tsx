import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import { SkillsToBuyPanel } from './SkillsToBuyPanel';

const pricesMock = vi.hoisted(() => ({
  getHubPricesWithStatus: vi.fn(async () => ({
    prices: new Map([[1, { sellMin: 1000 }]]),
    unreachable: false,
  })),
  getRegionSellPrices: vi.fn(async () => new Map([[2, 500]])),
}));
vi.mock('@/market/prices', () => pricesMock);

const nameFor = (id: number) => `Skill ${id}`;
const entries = [{ skillTypeID: 1 }, { skillTypeID: 1 }, { skillTypeID: 2 }, { skillTypeID: 3 }];

function renderPanel(known = true, collapsible = false) {
  return render(
    <MemoryRouter>
      <SkillsToBuyPanel
        entries={entries}
        trainedSkills={new Map([[3, {}]])}
        trainedSkillsKnown={known}
        nameFor={nameFor}
        collapsible={collapsible}
      />
    </MemoryRouter>
  );
}

describe('SkillsToBuyPanel', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => configureClipboard(null));

  it('lists unowned skills and totals them', async () => {
    renderPanel();
    expect(await screen.findByText(/Total cost/)).toBeInTheDocument();
    expect(screen.getByText('Skill 1')).toBeInTheDocument();
    expect(screen.getByText('Skill 2')).toBeInTheDocument();
    expect(screen.queryByText('Skill 3')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy multibuy/i })).toBeInTheDocument();
  });

  it('says unknown until trained skills load', () => {
    renderPanel(false);
    expect(screen.getByText(/Unknown until your skills load/)).toBeInTheDocument();
  });
  it('collapsible: a closed row with the total beside the title, expanding to the same list', async () => {
    const user = userEvent.setup();
    renderPanel(true, true);

    // Skill 1 sells for 1000 at the hub; Skill 2 falls back to the 500 region price.
    const row = await screen.findByRole('button', { name: /^skills to buy.*1\.5K ISK/i });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Skill 1')).toBeNull();
    expect(screen.getByText('2 priced · 0 without a price')).toBeInTheDocument();

    await user.click(row);

    expect(screen.queryByText(/without a price/)).toBeNull();
    expect(screen.getByText('Skill 1')).toBeInTheDocument();
    expect(screen.getByText(/Total cost/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy multibuy/i })).toBeInTheDocument();
  });
});

describe('SkillsToBuyPanel with an unreachable price source (offline)', () => {
  it('says prices are unavailable right now instead of "No sell orders", and shows no total', async () => {
    pricesMock.getHubPricesWithStatus.mockResolvedValueOnce({
      prices: new Map(),
      unreachable: true,
    });
    pricesMock.getRegionSellPrices.mockResolvedValueOnce(new Map());
    renderPanel();

    expect(await screen.findAllByText('Prices unavailable right now')).toHaveLength(2);
    expect(screen.queryByText(/No sell orders/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Total cost/)).not.toBeInTheDocument();
    expect(screen.queryByText(/without a price/)).not.toBeInTheDocument();
  });
});

describe('SkillsToBuyPanel copy status', () => {
  it('announces the copy result in a status region', async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('x'));
    configureClipboard(writeText);
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(/Total cost/);
    await user.click(screen.getByRole('button', { name: /copy multibuy/i }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Multibuy list copied')
    );
    await user.click(screen.getByRole('button', { name: /copy multibuy|copied/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/couldn.t copy/i));
  });
});
