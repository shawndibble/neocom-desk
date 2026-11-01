import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import type { AppraisalSnapshot } from '@/engine/market/appraisalSnapshot';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { AppraisalShareScreen } from './AppraisalShareScreen';
import { appraisalShareViewFromSnapshot } from './appraisalShareData';

vi.mock('@/sde/loadSde', () => ({
  loadReprocessing: () =>
    Promise.resolve({
      '1': { portionSize: 100, materials: [{ typeID: 35, quantity: 16_000 }] },
    }),
}));
vi.mock('@/features/character/characterModifiers', () => ({
  loadCharacterModifiers: () => Promise.resolve(NO_CHARACTER_MODIFIERS),
}));
vi.mock('@/features/refining/useRefiningSetup', () => ({
  useRefiningSetup: () => ({
    setup: { stationRate: 0.6, taxRate: 0 },
    hydrated: true,
    setYieldRate: vi.fn(),
    setTaxRate: vi.fn(),
  }),
}));

/** 1,000 units at 1,000 ISK is 1M as is; 90% efficiency refines to 14,400 x 10 x 10 portions. */
const snapshot: AppraisalSnapshot = {
  v: 1,
  hub: 'jita',
  pricePercent: 100,
  generatedAt: 1_790_000_000,
  items: [
    {
      typeId: 1,
      name: 'Zeolites',
      quantity: 1000,
      buy: 1000,
      sell: 1200,
      unitVolume: 10,
      refine: { portionSize: 100, materials: [{ typeId: 35, quantity: 16_000 }], efficiency: 0.9 },
    },
  ],
  refine: { yieldRate: 0.66, taxRate: 0, minerals: [{ typeId: 35, name: 'Pyerite', price: 10 }] },
};

function renderShared() {
  const result = appraisalShareViewFromSnapshot(snapshot);
  if (!result.ok) throw new Error('view');
  render(
    <MemoryRouter>
      <AppraisalShareScreen
        state={{ status: 'ready', view: result.value }}
        expiresAt={Date.UTC(2026, 10, 8)}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
});
afterEach(cleanup);

describe('a Shared Appraisal with refine figures', () => {
  it("shows the sharer's Refine total with the efficiency it was worked out at", () => {
    renderShared();
    expect(screen.getByText('@ 90%')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Refine/ })).toBeInTheDocument();
  });

  it('opens the breakdown on the sharer numbers, and a visitor with no Character is told to log in', async () => {
    const user = userEvent.setup();
    renderShared();
    await user.click(
      screen.getByRole('button', { name: /Show how the Refine figure is worked out/ })
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Shared with you')).toBeInTheDocument();
    expect(within(dialog).getByText('Pyerite')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Use my numbers' })).toBeDisabled();
    expect(within(dialog).getByText(/Log in with a Character/)).toBeInTheDocument();
  });

  it('opens one item from its Refine figure in the table', async () => {
    const user = userEvent.setup();
    renderShared();
    await user.click(screen.getByRole('button', { name: /Refine breakdown for Zeolites/ }));
    expect(screen.getByText('Refine breakdown, Zeolites')).toBeInTheDocument();
  });

  it('recomputes at the visitor own setup, at the shared prices, and goes back', async () => {
    useActiveCharacter.setState({ activeCharacterId: 91_000_001, hydrated: true });
    const user = userEvent.setup();
    renderShared();
    await user.click(
      screen.getByRole('button', { name: /Show how the Refine figure is worked out/ })
    );
    const dialog = screen.getByRole('dialog');
    // The button is replaced while it loads, so look it up again on every try.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Use my numbers' })).toBeEnabled()
    );
    await user.click(within(dialog).getByRole('button', { name: 'Use my numbers' }));
    expect(within(dialog).getByText('Using your numbers')).toBeInTheDocument();
    // 60% yield, no skills: 10 portions x floor(16,000 x 0.6) = 96,000 Pyerite at 10 ISK.
    expect(within(dialog).getByRole('cell', { name: '96,000' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Back to shared numbers' }));
    expect(within(dialog).getByText('Shared with you')).toBeInTheDocument();
    // The sharer's 90%: 10 portions x floor(16,000 x 0.9).
    expect(within(dialog).getByRole('cell', { name: '144,000' })).toBeInTheDocument();
  });
});

describe('a Shared Appraisal from before refine travelled with the link', () => {
  it('has no Refine chip, column or breakdown', () => {
    const old = structuredClone(snapshot);
    delete old.refine;
    for (const item of old.items) delete item.refine;
    const result = appraisalShareViewFromSnapshot(old);
    if (!result.ok) throw new Error('view');
    render(
      <MemoryRouter>
        <AppraisalShareScreen
          state={{ status: 'ready', view: result.value }}
          expiresAt={Date.UTC(2026, 10, 8)}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('columnheader', { name: /Refine/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Show how the Refine figure is worked out/ })
    ).not.toBeInTheDocument();
  });
});
