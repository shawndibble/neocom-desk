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
// The panels own the picker; stand-ins drive the Corporation option the way the real
// `CharacterFilterControl` does, through the callbacks OrdersTab hands them.
vi.mock('./OpenOrdersPanel', () => ({
  OpenOrdersPanel: ({ onChooseCorporation }: { onChooseCorporation?: () => void }) => (
    <>
      <p>character orders</p>
      {onChooseCorporation && <button onClick={onChooseCorporation}>Corporation</button>}
    </>
  ),
}));
vi.mock('./CorpOrdersView', () => ({
  CorpOrdersView: ({ onLeaveCorporation }: { onLeaveCorporation: () => void }) => (
    <>
      <p>corp orders</p>
      <button onClick={onLeaveCorporation}>This character</button>
    </>
  ),
}));

const SLOTS = {} as PageHeaderSlots;

function access(state: string, canReadOrders: boolean) {
  vi.mocked(useCorpAccess).mockReturnValue({
    state,
    capabilities: { ...NO_CORP_CAPABILITIES, canReadOrders },
    missingScopes: [],
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
