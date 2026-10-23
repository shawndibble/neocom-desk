import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { FleetPayout, FleetShare } from '@/engine/communities/fleetPayouts';

const store = vi.hoisted(() => ({
  loadFleetShares: vi.fn(),
  loadMyFleetShare: vi.fn(),
  createFleetPayout: vi.fn(),
  setFleetShareDone: vi.fn(),
  removeFleetPayout: vi.fn(),
}));
vi.mock('./fleetPayoutStore', () => store);
const roster = vi.hoisted(() => ({ resolveFleetRoster: vi.fn() }));
vi.mock('./fleetRoster', () => roster);
const market = vi.hoisted(() => ({ appraisePaste: vi.fn() }));
vi.mock('@/features/market/appraisalData', () => market);

import { FleetPayoutsTab } from './FleetPayoutsTab';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const payout = (over: Partial<FleetPayout>): FleetPayout => ({
  id: 'p1',
  ownerUid: 'char:1',
  ownerName: 'Me Boss',
  name: 'Tuesday fleet',
  totalIsk: 1_000_000,
  holdBackPct: 10,
  rule: 'equal',
  memberUids: [],
  shareCount: 3,
  paidCount: 1,
  createdAt: NOW - DAY,
  expiresAt: NOW + 29 * DAY,
  ...over,
});
const share = (over: Partial<FleetShare>): FleetShare => ({
  id: '0',
  pilotName: 'Aria Voss',
  characterId: 11,
  memberUid: 'char:11',
  weight: 1,
  isk: 300_000,
  paid: false,
  paidAt: 0,
  ...over,
});

function renderTab(payouts: FleetPayout[] | null, onReload = vi.fn()) {
  render(
    <MemoryRouter>
      <FleetPayoutsTab
        characterId={1}
        communityId="c1"
        myUid="char:1"
        members={[{ uid: 'char:11', characterName: 'Aria Voss', joinedAt: 0, libraryAsOf: null }]}
        payouts={payouts}
        failed={false}
        now={NOW}
        onReload={onReload}
      />
    </MemoryRouter>
  );
  return onReload;
}

beforeEach(() => vi.clearAllMocks());

describe('FleetPayoutsTab', () => {
  it('says when there are none', () => {
    renderTab([]);
    expect(screen.getByText('No payouts yet')).toBeInTheDocument();
  });

  it('shows the boss progress, a listed Member only their own share, and hides the rest', async () => {
    store.loadMyFleetShare.mockResolvedValue(share({ isk: 123_456, paid: true }));
    renderTab([
      payout({ id: 'p1' }),
      payout({
        id: 'p2',
        name: 'Their fleet',
        ownerUid: 'char:9',
        ownerName: 'Dax',
        memberUids: ['char:1'],
      }),
      payout({ id: 'p3', name: 'Not mine', ownerUid: 'char:9', ownerName: 'Dax' }),
    ]);
    expect(screen.getByText('1 of 3 paid')).toBeInTheDocument();
    expect(await screen.findByText('123,456 ISK')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Boss: Dax')).toBeInTheDocument();
    expect(screen.queryByText('Not mine')).not.toBeInTheDocument();
    expect(store.loadMyFleetShare).toHaveBeenCalledTimes(1);
    expect(store.loadMyFleetShare).toHaveBeenCalledWith(1, 'c1', 'p2');
  });

  it('boss toggles a share paid, then reloads', async () => {
    store.loadFleetShares.mockResolvedValue([
      share({ id: '0' }),
      share({ id: '1', pilotName: 'Dax', memberUid: null, characterId: null }),
    ]);
    store.setFleetShareDone.mockResolvedValue(undefined);
    const onReload = renderTab([payout({})]);
    await userEvent.click(screen.getByText('Tuesday fleet'));
    const box = await screen.findByRole('checkbox', { name: 'Paid: Aria Voss' });
    expect(screen.getByText('Typed name')).toBeInTheDocument();
    await userEvent.click(box);
    await waitFor(() =>
      expect(store.setFleetShareDone).toHaveBeenCalledWith(1, 'c1', 'p1', '0', true)
    );
    await waitFor(() => expect(onReload).toHaveBeenCalled());
    expect(store.loadFleetShares).toHaveBeenCalledTimes(2);
  });

  it('a Member opening a payout sees their own share and the boss', async () => {
    store.loadMyFleetShare.mockResolvedValue(share({ isk: 500, pilotName: 'Me Pilot' }));
    renderTab([payout({ ownerUid: 'char:9', ownerName: 'Dax', memberUids: ['char:1'] })]);
    await userEvent.click(screen.getByText('Tuesday fleet'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Pilot: Me Pilot')).toBeInTheDocument();
    expect(within(dialog).getByText('Not paid yet')).toBeInTheDocument();
    expect(store.loadFleetShares).not.toHaveBeenCalled();
  });

  it('composes a payout: roster, priced loot, preview, create', async () => {
    roster.resolveFleetRoster.mockResolvedValue([
      { pilotName: 'Aria Voss', characterId: 11, isMember: true, notFound: false },
      { pilotName: 'Zed', characterId: null, isMember: false, notFound: true },
    ]);
    market.appraisePaste.mockResolvedValue({
      appraisal: { totals: { buy: 1_000_000, sell: 2_000_000 } },
      unmatched: [{ name: 'junk', lines: [3] }],
      pricesUnreachable: false,
    });
    store.createFleetPayout.mockResolvedValue({ payoutId: 'new1' });
    store.loadFleetShares.mockResolvedValue([]);
    const onReload = renderTab([]);
    await userEvent.click(screen.getByRole('button', { name: 'New payout…' }));
    const dialog = await screen.findByRole('dialog');
    const create = within(dialog).getByRole('button', { name: 'Create payout' });
    expect(create).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText('Name'), 'Havens');
    await userEvent.type(
      within(dialog).getByLabelText(/Paste the fleet list/),
      'Aria Voss{Enter}Zed'
    );
    expect(
      await within(dialog).findByText('Member', undefined, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Typed name')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Paste the loot'), '1 Tritanium');
    expect(
      await within(dialog).findByText('Loot value: 1,000,000 ISK', undefined, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(within(dialog).getByText("1 line wasn't read and is left out.")).toBeInTheDocument();
    // 10% held back, 900,000 split two ways.
    expect(within(dialog).getAllByText('450,000 ISK')).toHaveLength(2);

    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Include Zed' }));
    expect(within(dialog).getByText('900,000 ISK')).toBeInTheDocument();

    expect(create).toBeEnabled();
    await userEvent.click(create);
    await waitFor(() => expect(store.createFleetPayout).toHaveBeenCalledTimes(1));
    expect(store.createFleetPayout).toHaveBeenCalledWith(1, 'c1', {
      name: 'Havens',
      totalIsk: 1_000_000,
      holdBackPct: 10,
      rule: 'equal',
      shares: [{ pilotName: 'Aria Voss', characterId: 11, weight: 1, isk: 900_000 }],
    });
    await waitFor(() => expect(onReload).toHaveBeenCalled());
  }, 9000);
});
