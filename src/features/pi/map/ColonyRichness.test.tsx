import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { ColonyRichness } from './ColonyRichness';

const sync = vi.hoisted(() => ({
  setPlanetRichness: vi.fn(() => Promise.resolve()),
  clearPlanetRichness: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/sync', () => sync);

const PLANET = 40000001;
const RESOURCES = [
  { typeId: 2073, name: 'Microorganisms' },
  { typeId: 2268, name: 'Aqueous Liquids' },
  { typeId: 2305, name: 'Autotrophs' },
];

beforeEach(async () => {
  await db.planetRichness.clear();
  vi.clearAllMocks();
});
afterEach(() => db.planetRichness.clear());

const renderIt = () =>
  render(<ColonyRichness planetId={PLANET} type="temperate" resources={RESOURCES} />);

describe('ColonyRichness', () => {
  it('says it is optional and what it does, in one line', () => {
    renderIt();
    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(screen.getByText(/Skip it and every resource counts/)).toBeInTheDocument();
    for (const resource of RESOURCES) {
      expect(screen.getByRole('button', { name: resource.name })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    }
  });

  it('saves a tick, and shows a saved override on open', async () => {
    const user = userEvent.setup();
    renderIt();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Aqueous Liquids' })).toBeEnabled()
    );
    await user.click(screen.getByRole('button', { name: 'Aqueous Liquids' }));
    await waitFor(() => expect(sync.setPlanetRichness).toHaveBeenCalledWith(PLANET, [2268]));

    await db.planetRichness.put({
      id: `1:${PLANET}`,
      characterId: 1,
      planetId: PLANET,
      order: [2305, 999_999],
      updatedAt: 1,
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Autotrophs' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
    await user.click(screen.getByRole('button', { name: 'Microorganisms' }));
    await waitFor(() =>
      expect(sync.setPlanetRichness).toHaveBeenLastCalledWith(PLANET, [2305, 2073])
    );
  });

  it('clears the override when the last pick is unticked, or on Clear picks', async () => {
    const user = userEvent.setup();
    await db.planetRichness.put({
      id: `1:${PLANET}`,
      characterId: 1,
      planetId: PLANET,
      order: [2305],
      updatedAt: 1,
    });
    renderIt();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Autotrophs' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
    await user.click(screen.getByRole('button', { name: 'Autotrophs' }));
    await waitFor(() => expect(sync.clearPlanetRichness).toHaveBeenCalledWith(PLANET));
  });

  it('keeps both picks when two chips are tapped before the first save lands', async () => {
    const user = userEvent.setup();
    renderIt();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Aqueous Liquids' })).toBeEnabled()
    );
    await user.click(screen.getByRole('button', { name: 'Aqueous Liquids' }));
    await user.click(screen.getByRole('button', { name: 'Autotrophs' }));
    await waitFor(() =>
      expect(sync.setPlanetRichness).toHaveBeenLastCalledWith(PLANET, [2268, 2305])
    );
  });
});
