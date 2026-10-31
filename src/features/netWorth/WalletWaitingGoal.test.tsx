import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { shiftUtcDate } from '@/engine/localDay';
import { utcDay, type NetWorthSnapshotRow } from '@/engine/netWorth/snapshot';
import type { SellOrderHealth } from '@/features/market/orderHealthSplit';
import { WalletWaitingGoal } from './WalletWaitingGoal';
import { useSellOrderHealth } from './useSellOrderHealth';
import { REQUIRED_SCOPES } from './recordSnapshots';
import { useWalletGoal } from './walletGoalSetting';

vi.mock('@/features/character/wallet', () => ({
  loadWalletJournal: vi.fn(async () => null),
}));

vi.mock('./useSellOrderHealth', () => ({ useSellOrderHealth: vi.fn(() => null) }));

const today = utcDay(Date.now());
const snap = (day: string, wallet: number): NetWorthSnapshotRow => ({
  id: `1:${day}`,
  characterId: 1,
  day,
  wallet,
  assetValue: 0,
  escrow: 861,
  sellStock: 2412,
  contractStock: 410,
  hubId: 'jita',
  updatedAt: 1,
});

beforeEach(async () => {
  vi.mocked(useSellOrderHealth).mockReturnValue(null);
  await db.delete();
  await db.open();
  useWalletGoal.setState({ value: null, hydrated: true });
  await db.tokens.put({
    characterId: 1,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: 0,
    scopes: [...REQUIRED_SCOPES],
  });
  await db.netWorthSnapshots.bulkPut([
    snap(shiftUtcDate(today, -10), 300),
    snap(shiftUtcDate(today, 0), 600),
  ]);
});

function renderPanels() {
  render(
    <MemoryRouter>
      <WalletWaitingGoal characterIds={[1]} />
    </MemoryRouter>
  );
}

describe('WalletWaitingGoal', () => {
  it('splits sell-order ISK by health and links the orders that need the pilot', async () => {
    const part = (isk: number, orders: number) => ({ isk, orders });
    const health: SellOrderHealth = {
      healthy: part(1_000, 3),
      needsYou: part(400, 1),
      watch: part(0, 0),
      notChecked: part(50, 2),
      total: part(1_450, 6),
    };
    vi.mocked(useSellOrderHealth).mockReturnValue(health);
    renderPanels();
    const panel = (await screen.findByRole('heading', { name: 'ISK waiting' })).closest(
      'section'
    ) as HTMLElement;
    expect(within(panel).getByText('Healthy')).toBeInTheDocument();
    expect(within(panel).getByText('1,000 ISK')).toBeInTheDocument();
    expect(within(panel).getByText('Needs you')).toBeInTheDocument();
    expect(within(panel).getByText('Not checked')).toBeInTheDocument();
    expect(within(panel).queryByText('Watch')).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Fix in Open Orders' })).toHaveAttribute(
      'href',
      expect.stringContaining('/market/orders')
    );
  });

  it('lists the ISK waiting in orders and contracts, with the wallet change and a Journal link', async () => {
    renderPanels();
    const panel = (await screen.findByRole('heading', { name: 'ISK waiting' })).closest(
      'section'
    ) as HTMLElement;
    expect(within(panel).getByText('2,412 ISK')).toBeInTheDocument();
    expect(within(panel).getByText('861 ISK')).toBeInTheDocument();
    expect(within(panel).getByText('410 ISK')).toBeInTheDocument();
    expect(within(panel).getByText(/Wallet, last 30 days/)).toHaveTextContent('+300');
    expect(within(panel).getByRole('link', { name: 'Open Journal' })).toHaveAttribute(
      'href',
      '/wallet/journal'
    );
  });

  it('asks for a target when there is no goal, then shows progress and pace once saved', async () => {
    const user = userEvent.setup();
    renderPanels();
    expect(await screen.findByText(/Pick an ISK target/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set goal' }));
    await user.type(screen.getByLabelText('Name (optional)'), 'Nyx fund');
    await user.type(screen.getByLabelText('Target (ISK)'), '1300');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Goal: Nyx fund' })).toBeInTheDocument();
    expect(screen.getByText('600 of 1,300 ISK')).toBeInTheDocument();
    expect(screen.getByText(/At 30 ISK a day/)).toBeInTheDocument();
  });

  it('removes the goal from its dialog', async () => {
    const user = userEvent.setup();
    useWalletGoal.setState({ value: { name: 'Ship', target: 5000 } });
    renderPanels();
    await user.click(await screen.findByRole('button', { name: 'Edit goal' }));
    await user.click(screen.getByRole('button', { name: 'Remove goal' }));
    expect(await screen.findByText(/Pick an ISK target/)).toBeInTheDocument();
  });

  it('keeps the Goal, without ISK waiting, before the first snapshot exists', async () => {
    await db.netWorthSnapshots.clear();
    renderPanels();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('heading', { name: 'ISK waiting' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Goal' })).toBeInTheDocument();
  });

  it('refuses a target too big to edit again', async () => {
    const user = userEvent.setup();
    renderPanels();
    await user.click(await screen.findByRole('button', { name: 'Set goal' }));
    await user.type(screen.getByLabelText('Target (ISK)'), '999999999999b');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
