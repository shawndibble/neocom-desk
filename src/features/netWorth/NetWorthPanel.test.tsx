import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { NetWorthSnapshotRow } from '@/engine/netWorth/snapshot';
import { NetWorthPanel, type NetWorthPanelProps } from './NetWorthPanel';
import { useNetWorthHiddenCharacters, useNetWorthHiddenLayers } from './netWorthSettings';
import { REQUIRED_SCOPES } from './recordSnapshots';

vi.mock('@/features/character/wallet', () => ({
  loadWalletJournal: vi.fn(async () => null),
}));
// Recharts draws nothing useful in jsdom; the chart's maths are tested in the engine.
vi.mock('./NetWorthChart', () => ({ default: () => <div data-testid="chart" /> }));

const A = { characterId: 1, name: 'Ava' };
const B = { characterId: 2, name: 'Bo' };
const C = { characterId: 3, name: 'Cy' };

const snap = (characterId: number, wallet: number): NetWorthSnapshotRow => ({
  id: `${characterId}:2026-10-07`,
  characterId,
  day: '2026-10-07',
  wallet,
  assetValue: 1000,
  plexValue: 200,
  escrow: 30,
  sellStock: 4,
  hubId: 'jita',
  updatedAt: 1,
});

async function seed(opts: { covered: number[]; ids?: number[] }) {
  for (const id of opts.ids ?? [1, 2, 3]) {
    await db.tokens.put({
      characterId: id,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 0,
      scopes: opts.covered.includes(id) ? [...REQUIRED_SCOPES] : [],
    });
  }
  await db.netWorthSnapshots.bulkPut([snap(1, 100), snap(2, 500), snap(3, 7)]);
}

function renderPanel(props: Partial<NetWorthPanelProps> = {}) {
  const onDrill = vi.fn();
  const onBack = vi.fn();
  render(
    <MemoryRouter>
      <NetWorthPanel
        mode="multi"
        characters={[A, B, C]}
        liveWallet={new Map()}
        onDrill={onDrill}
        onBack={onBack}
        {...props}
      />
    </MemoryRouter>
  );
  return { onDrill, onBack };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  useNetWorthHiddenLayers.setState({ value: [], hydrated: false });
  useNetWorthHiddenCharacters.setState({ value: [], hydrated: false });
});

describe('NetWorthPanel, several Characters', () => {
  it('totals only Characters with every permission, and names who is left out', async () => {
    await seed({ covered: [1, 2] });
    renderPanel();

    // (100 + 1000 + 200 + 30 + 4) + (500 + 1000 + 200 + 30 + 4) = 3068
    expect(await screen.findByText(/3,068\.00/)).toBeInTheDocument();
    expect(screen.getByLabelText(/All characters · 2 of 3/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Not included: Cy/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Balance by character' });
    expect(within(table).getByText(/hasn't granted wallet access/)).toBeInTheDocument();
  });

  it('shows the layer columns and a net worth per row', async () => {
    await seed({ covered: [1, 2, 3] });
    renderPanel();
    const table = await screen.findByRole('table', { name: 'Balance by character' });
    for (const name of ['ISK', 'Assets', 'PLEX', 'Order escrow', 'Sell orders', 'Net worth']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }
    const row = within(table).getByText('Ava').closest('tr')!;
    expect(await within(row).findByText(/^1,334/)).toBeInTheDocument();
  });

  it('switching a layer off changes the total and says what is excluded', async () => {
    const user = userEvent.setup();
    await seed({ covered: [1, 2, 3] });
    renderPanel();
    await screen.findByText(/4,309\.00/);
    await user.click(screen.getByRole('checkbox', { name: 'PLEX' }));
    expect(await screen.findByText(/3,709\.00/)).toBeInTheDocument();
    expect(screen.getByText('Excludes PLEX')).toBeInTheDocument();
  });

  it('cannot switch off the last layer', async () => {
    const user = userEvent.setup();
    await seed({ covered: [1, 2, 3] });
    renderPanel();
    await screen.findByText(/4,309\.00/);
    for (const name of ['Assets', 'PLEX', 'Order escrow', 'Sell orders']) {
      await user.click(screen.getByRole('checkbox', { name }));
    }
    expect(screen.getByRole('checkbox', { name: 'ISK' })).toBeDisabled();
  });

  it('a Character checkbox hides its line and total, and the last one cannot be unchecked', async () => {
    const user = userEvent.setup();
    await seed({ covered: [1, 2] });
    const { onDrill } = renderPanel();
    await screen.findByText(/3,068\.00/);
    await user.click(screen.getByRole('checkbox', { name: 'Show Bo on the chart' }));
    expect(await screen.findByText(/1,334\.00/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show Ava on the chart' })).toBeDisabled();
    // The checkbox is not a drill.
    expect(onDrill).not.toHaveBeenCalled();
  });

  it('clicking a row drills into that Character', async () => {
    const user = userEvent.setup();
    await seed({ covered: [1, 2, 3] });
    const { onDrill } = renderPanel();
    const table = await screen.findByRole('table', { name: 'Balance by character' });
    await user.click(within(table).getByText('Bo'));
    expect(onDrill).toHaveBeenCalledWith(2);
  });

  it('persists a hidden layer on the device', async () => {
    const user = userEvent.setup();
    await seed({ covered: [1, 2, 3] });
    renderPanel();
    await screen.findByText(/4,309\.00/);
    await user.click(screen.getByRole('checkbox', { name: 'Assets' }));
    await vi.waitFor(async () =>
      expect((await db.settings.get('netWorthHiddenLayers'))?.value).toEqual(['assets'])
    );
  });
});

describe('NetWorthPanel, one Character', () => {
  it('lists each layer with the right drill link, and a crumb back when drilled', async () => {
    const user = userEvent.setup();
    await seed({ covered: [1] });
    const { onBack } = renderPanel({ mode: 'single', characters: [A], drilled: true });

    const table = await screen.findByRole('table', { name: 'Net worth by layer' });
    const href = (name: string, index = 0) =>
      within(table).getAllByRole('link', { name })[index]!.getAttribute('href');
    expect(href('Journal')).toBe('/wallet/journal');
    expect(href('Assets')).toBe('/assets');
    expect(href('PLEX in assets')).toBe('/assets?q=PLEX');
    expect(href('Open orders', 0)).toBe('/market/orders');
    expect(href('Open orders', 1)).toBe('/market/orders');

    await user.click(screen.getByRole('button', { name: /All characters/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it('says the layers start on the first snapshot day while history is short', async () => {
    await seed({ covered: [1] });
    renderPanel({ mode: 'single', characters: [A] });
    expect(await screen.findByText(/Layers start on/)).toBeInTheDocument();
    expect(screen.getByText(/Hangar PLEX only/)).toBeInTheDocument();
  });
});
