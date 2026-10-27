import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { NO_CORP_CAPABILITIES } from '@/engine/corpRoles';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { OrdersTab } from './OrdersTab';
import type { PageHeaderSlots } from './pageHeaderSlots';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
// The panel owns the picker; the stand-in drives its options the way the real
// `CharacterFilterControl` does, through the callbacks OrdersTab hands it.
vi.mock('./OpenOrdersPanel', () => ({
  OpenOrdersPanel: ({
    corporation,
    corporationNeedsGrant,
    onChooseCorporation,
    onLeaveCorporation,
  }: {
    corporation?: boolean;
    corporationNeedsGrant?: boolean;
    onChooseCorporation?: () => void;
    onLeaveCorporation?: () => void;
  }) => (
    <>
      <p>{corporation ? 'corp orders' : 'character orders'}</p>
      {corporationNeedsGrant && <p>corp grant asked</p>}
      {onChooseCorporation && <button onClick={onChooseCorporation}>Corporation</button>}
      {corporation && <button onClick={onLeaveCorporation}>This character</button>}
    </>
  ),
}));

const SLOTS = {} as PageHeaderSlots;

const ORDERS_SCOPE = 'esi-markets.read_corporation_orders.v1';

function access(state: string, canReadOrders: boolean, missingScopes: string[] = []) {
  vi.mocked(useCorpAccess).mockReturnValue({
    state,
    capabilities: { ...NO_CORP_CAPABILITIES, canReadOrders },
    missingScopes,
    roles: [],
    readFailed: false,
    retry: () => {},
  } as ReturnType<typeof useCorpAccess>);
}

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderTab(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <OrdersTab headerSlots={SLOTS} />
      <Search />
    </MemoryRouter>
  );
}

describe('OrdersTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers no Corporation option and no corp view without the capability, even from a link', () => {
    access('ready', false);
    renderTab('/market/orders?scope=corp');
    expect(screen.queryByRole('button', { name: 'Corporation' })).toBeNull();
    expect(screen.getByText('character orders')).toBeInTheDocument();
  });

  it('offers no Corporation option while the roles are unresolved', () => {
    access('unknown', true);
    renderTab('/market/orders');
    expect(screen.queryByRole('button', { name: 'Corporation' })).toBeNull();
  });

  it('switches to the corp view and back, holding the choice in the URL', async () => {
    access('ready', true);
    renderTab('/market/orders');
    expect(screen.getByText('character orders')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Corporation' }));
    expect(await screen.findByText('corp orders')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('scope=corp');
    await userEvent.click(screen.getByRole('button', { name: 'This character' }));
    expect(screen.getByText('character orders')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  it('offers Corporation to a role holder whose grant predates the orders scope, and asks for it', async () => {
    // A Director (or Accountant/Trader) who granted corp access before corp
    // orders shipped: the additive capability is off, the scope is missing.
    access('ready', false, [ORDERS_SCOPE]);
    renderTab('/market/orders');
    await userEvent.click(screen.getByRole('button', { name: 'Corporation' }));
    expect(await screen.findByText('corp orders')).toBeInTheDocument();
    expect(screen.getByText('corp grant asked')).toBeInTheDocument();
  });

  it('does not offer Corporation when only some other corp scope is missing', () => {
    access('ready', false, ['esi-corporations.read_divisions.v1']);
    renderTab('/market/orders');
    expect(screen.queryByRole('button', { name: 'Corporation' })).toBeNull();
  });

  it('asks for no grant when corp orders are readable', async () => {
    access('ready', true);
    renderTab('/market/orders?scope=corp');
    expect(await screen.findByText('corp orders')).toBeInTheDocument();
    expect(screen.queryByText('corp grant asked')).toBeNull();
  });

  it('opens straight on the corp view from ?scope=corp', async () => {
    access('ready', true);
    renderTab('/market/orders?scope=corp');
    expect(await screen.findByText('corp orders')).toBeInTheDocument();
  });

  it('holds a ?scope=corp visit while access resolves, mounting no Character panel', () => {
    access('unknown', false);
    renderTab('/market/orders?scope=corp');
    expect(screen.queryByText('character orders')).toBeNull();
    expect(screen.queryByText('corp orders')).toBeNull();
  });

  it('falls back to the Character view when access resolves without canReadOrders', () => {
    access('none', false);
    renderTab('/market/orders?scope=corp');
    expect(screen.getByText('character orders')).toBeInTheDocument();
  });
});
