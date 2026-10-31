import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { shiftUtcDate } from '@/engine/localDay';
import { utcDay, type NetWorthSnapshotRow } from '@/engine/netWorth/snapshot';
import { loadFittingPrice } from '@/features/fittings/fittingPrice';
import type { SellOrderHealth } from '@/features/market/orderHealthSplit';
import { WalletWaitingGoal } from './WalletWaitingGoal';
import { useSellOrderHealth } from './useSellOrderHealth';
import { REQUIRED_SCOPES } from './recordSnapshots';
import { useWalletGoals } from './walletGoalSetting';

vi.mock('@/features/character/wallet', () => ({
  loadWalletJournal: vi.fn(async () => null),
}));
vi.mock('./useSellOrderHealth', () => ({ useSellOrderHealth: vi.fn(() => null) }));
vi.mock('@/features/fittings/fittingPrice', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/fittings/fittingPrice')>()),
  loadFittingPrice: vi.fn(),
}));
vi.mock('@/features/fittings/useFittingChoices', () => {
  const resolve = vi.fn(async (id: string) => ({ name: id, fitting: {} }));
  const choices = {
    saved: [],
    inGame: [],
    all: [
      { id: 'fit-1', name: 'Raven PvE' },
      { id: 'fit-2', name: 'Nyx' },
    ],
    ready: true,
    resolve,
  };
  return { useFittingChoices: () => choices };
});

const today = utcDay(Date.now());
const snap = (day: string, wallet: number): NetWorthSnapshotRow => ({
  id: `1:${day}`,
  characterId: 1,
  day,
  wallet,
  assetValue: 0,
  escrow: 861_000_000,
  sellStock: 2_412_000_000,
  contractStock: 410_000_000,
  hubId: 'jita',
  updatedAt: 1,
});

beforeEach(async () => {
  vi.mocked(useSellOrderHealth).mockReturnValue(null);
  vi.mocked(loadFittingPrice).mockResolvedValue({
    rows: [{ sellTotal: 5_000_000_000 }],
    totals: { sell: 5_000_000_000 },
  } as never);
  await db.delete();
  await db.open();
  useWalletGoals.setState({ value: [], hydrated: true });
  await db.tokens.put({
    characterId: 1,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: 0,
    scopes: [...REQUIRED_SCOPES],
  });
  await db.netWorthSnapshots.bulkPut([
    snap(shiftUtcDate(today, -10), 300_000_000),
    snap(shiftUtcDate(today, 0), 600_000_000),
  ]);
});

function renderPanels() {
  render(
    <MemoryRouter>
      <WalletWaitingGoal characterIds={[1]} />
    </MemoryRouter>
  );
}

async function addGoal(
  user: ReturnType<typeof userEvent.setup>,
  { name, amount, fitting }: { name?: string; amount?: string; fitting?: string }
) {
  await user.click(await screen.findByRole('button', { name: 'Add goal' }));
  if (name) await user.type(screen.getByLabelText('Name (optional)'), name);
  if (amount) await user.type(screen.getByLabelText('Target'), amount);
  if (fitting) {
    await user.click(screen.getByRole('combobox', { name: 'Or aim at a fitting' }));
    await user.click(await screen.findByRole('option', { name: fitting }));
  }
  await user.click(screen.getByRole('button', { name: 'Save' }));
}

describe('WalletWaitingGoal', () => {
  it('lists the ISK waiting in shorthand, with no unit after the numbers and no Journal link', async () => {
    renderPanels();
    const panel = (await screen.findByRole('heading', { name: 'ISK waiting' })).closest(
      'section'
    ) as HTMLElement;
    expect(within(panel).getByText('2.4B')).toBeInTheDocument();
    expect(within(panel).getByText('861M')).toBeInTheDocument();
    expect(within(panel).getByText('410M')).toBeInTheDocument();
    expect(within(panel).getByText(/Wallet, last 30 days/)).toHaveTextContent('+300M');
    expect(screen.queryByRole('link', { name: 'Open Journal' })).not.toBeInTheDocument();
  });

  it('splits sell-order ISK by health and links the orders that need the pilot', async () => {
    const part = (isk: number, orders: number) => ({ isk, orders });
    const health: SellOrderHealth = {
      healthy: part(1_000_000, 3),
      needsYou: part(400_000, 1),
      watch: part(0, 0),
      notChecked: part(50_000, 2),
      total: part(1_450_000, 6),
    };
    vi.mocked(useSellOrderHealth).mockReturnValue(health);
    renderPanels();
    const panel = (await screen.findByRole('heading', { name: 'ISK waiting' })).closest(
      'section'
    ) as HTMLElement;
    expect(within(panel).getByText('Fine')).toBeInTheDocument();
    expect(within(panel).getByText('Needs you')).toBeInTheDocument();
    expect(within(panel).getByText('Not checked')).toBeInTheDocument();
    expect(within(panel).queryByText('Watch')).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Fix in Open Orders' })).toHaveAttribute(
      'href',
      expect.stringContaining('/market/orders')
    );
  });

  it('adds a goal with a typed target, shows its 30 day average and ETA, and lets a second one in', async () => {
    const user = userEvent.setup();
    renderPanels();
    expect(await screen.findByText(/Add an ISK target/)).toBeInTheDocument();
    await addGoal(user, { name: 'Nyx fund', amount: '1.3b' });
    const goals = (await screen.findByRole('heading', { name: 'Goals' })).closest(
      'section'
    ) as HTMLElement;
    expect(within(goals).getByText('Nyx fund')).toBeInTheDocument();
    expect(within(goals).getByText('600M')).toBeInTheDocument();
    expect(within(goals).getByText('1.3B')).toBeInTheDocument();
    expect(within(goals).getByText(/30 day avg:/)).toHaveTextContent(/30 day avg: 30M/);
    expect(within(goals).getByText(/^ETA: /)).toBeInTheDocument();

    await addGoal(user, { name: 'Second', amount: '2b' });
    expect(await within(goals).findByText('Second')).toBeInTheDocument();
    expect(within(goals).getByText('Nyx fund')).toBeInTheDocument();
  });

  it('prices a goal from a fitting when the target is left blank', async () => {
    const user = userEvent.setup();
    renderPanels();
    await addGoal(user, { fitting: 'Raven PvE' });
    expect(await screen.findByText('Raven PvE')).toBeInTheDocument();
    expect(await screen.findByText('5B')).toBeInTheDocument();
    expect(screen.getByText(/price of Raven PvE at/)).toBeInTheDocument();
  });

  it('refuses to price a goal from a fitting with items nobody sells', async () => {
    vi.mocked(loadFittingPrice).mockResolvedValue({
      rows: [{ sellTotal: 10 }, { sellTotal: null }],
      totals: { sell: 10 },
    } as never);
    const user = userEvent.setup();
    renderPanels();
    await addGoal(user, { fitting: 'Raven PvE' });
    expect(await screen.findByText(/have no sell order/)).toBeInTheDocument();
  });

  it('turns the fitting pick off while a target is typed, and needs one or the other to save', async () => {
    const user = userEvent.setup();
    renderPanels();
    await user.click(await screen.findByRole('button', { name: 'Add goal' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(screen.getByLabelText('Target'), '5');
    expect(screen.getByRole('combobox', { name: 'Or aim at a fitting' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('removes a goal from its edit dialog', async () => {
    const user = userEvent.setup();
    useWalletGoals.setState({
      value: [{ id: 'a', name: 'Ship', target: 5_000_000_000, fittingId: null, fittingName: null }],
    });
    renderPanels();
    await user.click(await screen.findByRole('button', { name: /^Edit Ship/ }));
    await user.click(screen.getByRole('button', { name: 'Remove goal' }));
    const confirm = await screen.findAllByRole('button', { name: 'Remove goal' });
    await user.click(confirm[confirm.length - 1]!);
    expect(await screen.findByText(/Add an ISK target/)).toBeInTheDocument();
  });

  it('keeps the Goals, without ISK waiting, before the first snapshot exists', async () => {
    await db.netWorthSnapshots.clear();
    renderPanels();
    expect(await screen.findByRole('heading', { name: 'Goals' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ISK waiting' })).not.toBeInTheDocument();
  });
});
