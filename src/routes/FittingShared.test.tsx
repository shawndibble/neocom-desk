import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { configureClipboard } from '@/lib/clipboard';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { FittingShared } from './FittingShared';

const sde = vi.hoisted(() => ({
  loadSkills: vi.fn(async () => [{ typeID: 3300, name: 'Gunnery' }]),
}));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({
    '587': { name: 'Rifter', groupID: 25, volume: 0 },
    '484': { name: '125mm Gatling AutoCannon I', groupID: 55, volume: 5 },
    '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  }),
  loadSkills: sde.loadSkills,
}));
vi.mock('@/features/fittings/fittingPrice', () => ({ loadFittingPrice: async () => null }));
// No engine in tests: every calculation fails, which the stats sections show
// as their own error rather than needing a full `FittingStats` here.
const computeFittingStats = vi.fn(async (): Promise<FittingStats> => {
  throw new Error('no dogma engine in tests');
});
vi.mock('@/features/fittings/dogmaFittingEngine', () => ({
  isDogmaEngineReady: () => false,
  computeFittingStats: () => computeFittingStats(),
}));

const RIFTER: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 484, state: 'active' }],
  drones: [],
  cargo: [],
};

let clipboardText: string | null;

beforeEach(async () => {
  clipboardText = null;
  configureClipboard((text) => {
    clipboardText = text;
    return Promise.resolve();
  });
  await db.characters.clear();
  computeFittingStats.mockClear();
  sde.loadSkills.mockClear();
  sde.loadSkills.mockImplementation(async () => [{ typeID: 3300, name: 'Gunnery' }]);
});

afterEach(() => {
  configureClipboard(null);
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/share/fitting" element={<FittingShared />} />
        <Route path="/fittings/edit" element={<div>fittings editor</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FittingShared', () => {
  it('shows an invalid-link message with no code', async () => {
    renderAt('/share/fitting');
    expect(await screen.findByText("This link isn't valid")).toBeInTheDocument();
  });

  it('shows an invalid-link message when the code does not decode', async () => {
    renderAt('/share/fitting?f=garbage');
    expect(await screen.findByText("This link isn't valid")).toBeInTheDocument();
  });

  it('renders the read-only view at All V with no session, and Copy EFT writes the fit as text', async () => {
    const encoded = await encodeFittingShare(fittingToShareInput(RIFTER));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    renderAt(`/share/fitting?f=${encodeURIComponent(encoded.payload)}`);

    expect(
      await screen.findByText(
        'Shown at every skill level V, with no clone — log in to see this fit under your own pilot.'
      )
    ).toBeInTheDocument();
    expect(await screen.findByText('125mm Gatling AutoCannon I')).toBeInTheDocument();
    await waitFor(() => expect(computeFittingStats).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Open in Neocom Desk' })).toHaveAttribute(
      'href',
      '/login'
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Copy EFT' }));
    expect(clipboardText).toContain('[Rifter, Rifter]');
    expect(clipboardText).toContain('125mm Gatling AutoCannon I');
  });

  it('redirects into the editor instead, for a visitor who already has a Character, without computing stats first', async () => {
    await db.characters.put({
      characterId: 1,
      name: 'Existing Pilot',
      ownerHash: 'owner-hash-0',
      addedAt: 1,
    });
    const encoded = await encodeFittingShare(fittingToShareInput(RIFTER));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    renderAt(`/share/fitting?f=${encodeURIComponent(encoded.payload)}`);

    expect(await screen.findByText('fittings editor')).toBeInTheDocument();
    expect(computeFittingStats).not.toHaveBeenCalled();
  });

  it('shows a load-failed message when resolving the share code throws', async () => {
    sde.loadSkills.mockRejectedValueOnce(new Error('sde fetch failed'));
    const encoded = await encodeFittingShare(fittingToShareInput(RIFTER));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    renderAt(`/share/fitting?f=${encodeURIComponent(encoded.payload)}`);

    expect(await screen.findByText('Could not load this fitting')).toBeInTheDocument();
  });

  it('names the hull above the Ring and lists cargo in the module list', async () => {
    const encoded = await encodeFittingShare(
      fittingToShareInput({ ...RIFTER, cargo: [{ typeId: 34, quantity: 500 }] })
    );
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    renderAt(`/share/fitting?f=${encodeURIComponent(encoded.payload)}`);

    expect(await screen.findByRole('heading', { level: 2, name: 'Rifter' })).toBeInTheDocument();
    expect(await screen.findByText('Tritanium x500')).toBeInTheDocument();
  });
});
