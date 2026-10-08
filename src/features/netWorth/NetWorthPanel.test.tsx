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

/** The Net worth figure in the stat row (the table's column header is a `th`, not a `p`). */
function netWorthFigure() {
  return screen.getByText('Net worth', { selector: 'p' }).nextElementSibling as HTMLElement;
}

async function openSeries(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Layers:/ }));
}

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
    await vi.waitFor(() => expect(netWorthFigure()).toHaveTextContent(/^3,068$/));
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
      expect(await within(table).findByRole('columnheader', { name })).toBeInTheDocument();
    }
    const row = within(table).getByText('Ava').closest('tr')!;
    expect(await within(row).findByText(/^1,334/)).toBeInTheDocument();
  });

  it('switching a layer off changes the total and says what is excluded', async () => {
    const user = userEvent.setup();
    await seed({ covered: [1, 2, 3] });
    renderPanel();
    await vi.waitFor(() => expect(netWorthFigure()).toHaveTextContent(/^4,309$/));
    await openSeries(user);
    await user.click(await screen.findByRole('option', { name: 'PLEX' }));
    await vi.waitFor(() => expect(netWorthFigure()).toHaveTextContent(/^3,709$/));
    expect(screen.getByText('Excludes PLEX')).toBeInTheDocument();
  });

  it('cannot switch off the last layer', async () => {
    const user = userEvent.setup();
    await seed({ covered: [1, 2, 3] });
    renderPanel();
    await vi.waitFor(() => expect(netWorthFigure()).toHaveTextContent(/^4,309$/));
    await openSeries(user);
    for (const name of ['Assets', 'PLEX', 'Order escrow', 'Sell orders', 'ISK']) {
      await user.click(await screen.findByRole('option', { name }));
    }
    // ISK was the last one standing, so the click on it changed nothing.
    expect(screen.getByRole('option', { name: 'ISK' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Layers: 1 of 5' })).toBeInTheDocument();
  });

  it('a Character checkbox hides its line and total, and the last one cannot be unchecked', async () => {
    const user = userEvent.setup();
    await seed({ covered: [1, 2] });
    const { onDrill } = renderPanel();
    await vi.waitFor(() => expect(netWorthFigure()).toHaveTextContent(/^3,068$/));
    await user.click(screen.getByRole('checkbox', { name: 'Show Bo on the chart' }));
    await vi.waitFor(() => expect(netWorthFigure()).toHaveTextContent(/^1,334$/));
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
    await vi.waitFor(() => expect(netWorthFigure()).toHaveTextContent(/^4,309$/));
    await openSeries(user);
    await user.click(await screen.findByRole('option', { name: 'Assets' }));
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

  it('shows one Worth panel: whole-number net worth, the series picker, no portrait or scope text', async () => {
    await seed({ covered: [1] });
    renderPanel({ mode: 'single', characters: [A], stats: <p>EverMarks</p> });
    expect(await screen.findByRole('heading', { name: 'Worth' })).toBeInTheDocument();
    await vi.waitFor(() => expect(netWorthFigure()).toHaveTextContent(/^1,334$/));
    expect(screen.getByText('EverMarks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Layers: 5 of 5' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/ only$/)).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows a dash, not 0, for a Character short of permissions', async () => {
    await seed({ covered: [] });
    renderPanel({ mode: 'single', characters: [A] });
    await vi.waitFor(() => expect(netWorthFigure()).toHaveTextContent('—'));
  });

  it('says the layers start on the first snapshot day while history is short', async () => {
    await seed({ covered: [1] });
    renderPanel({ mode: 'single', characters: [A] });
    expect(await screen.findByText(/Layers start on/)).toBeInTheDocument();
    expect(screen.getByText(/Hangar PLEX only/)).toBeInTheDocument();
  });
});

describe('NetWorthPanel, layers with no value', () => {
  const bare = (characterId: number): NetWorthSnapshotRow => ({
    ...snap(characterId, 100),
    plexValue: 0,
    escrow: 0,
    sellStock: 0,
  });

  async function seedBare() {
    await seed({ covered: [1, 2] });
    // Ava holds nothing optional; Bo has escrow.
    await db.netWorthSnapshots.bulkPut([bare(1), { ...bare(2), escrow: 30 }]);
  }

  it('pins the layer column on the panel surface, not the page background', async () => {
    await seedBare();
    renderPanel({ mode: 'single', characters: [A] });
    const iskCell = (await screen.findAllByText('ISK'))[0].closest('td')!;
    expect(iskCell).toHaveClass('sticky', 'left-0', 'bg-panel');
    expect(iskCell).not.toHaveClass('bg-bg');
  });

  it('leaves out layers that are zero everywhere, from the picker and the table', async () => {
    const user = userEvent.setup();
    await seedBare();
    renderPanel({ mode: 'single', characters: [A] });
    expect(await screen.findByRole('button', { name: 'Layers: 2 of 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Layers:/ }));
    expect(await screen.findByRole('option', { name: 'ISK' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Assets' })).toBeInTheDocument();
    for (const name of ['PLEX', 'Order escrow', 'Sell orders']) {
      expect(screen.queryByRole('option', { name })).toBeNull();
    }
    const table = screen.getByRole('table', { name: 'Net worth by layer' });
    expect(within(table).queryByText('PLEX')).toBeNull();
  });

  it('lists a layer when another Character in view holds it', async () => {
    await seedBare();
    renderPanel({ characters: [A, B] });
    await userEvent.click(await screen.findByRole('button', { name: 'Layers: 3 of 3' }));
    expect(await screen.findByRole('option', { name: 'Order escrow' })).toBeInTheDocument();
  });

  it('keeps the unticked setting for a layer that is empty now and returns later', async () => {
    await seedBare();
    useNetWorthHiddenLayers.setState({ value: ['escrow'], hydrated: true });
    const { unmount } = render(
      <MemoryRouter>
        <NetWorthPanel
          mode="single"
          characters={[A]}
          liveWallet={new Map()}
          onDrill={vi.fn()}
          onBack={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: 'Layers: 2 of 2' })).toBeInTheDocument();
    expect(useNetWorthHiddenLayers.getState().value).toEqual(['escrow']);
    unmount();
  });
});
