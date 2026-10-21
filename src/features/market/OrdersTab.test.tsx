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
vi.mock('./OpenOrdersPanel', () => ({ OpenOrdersPanel: () => <p>character orders</p> }));
vi.mock('./CorpOrdersView', () => ({ CorpOrdersView: () => <p>corp orders</p> }));

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

  it('shows no toggle and no corp view without the capability, even from a link', () => {
    access('ready', false);
    renderTab('/market/orders?scope=corp');
    expect(screen.queryByRole('button', { name: 'Corp' })).toBeNull();
    expect(screen.getByText('character orders')).toBeInTheDocument();
  });

  it('shows no toggle while the roles are unresolved', () => {
    access('unknown', true);
    renderTab('/market/orders');
    expect(screen.queryByRole('button', { name: 'Corp' })).toBeNull();
  });

  it('switches to the corp view and back, holding the choice in the URL', async () => {
    access('ready', true);
    renderTab('/market/orders');
    expect(screen.getByText('character orders')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Corp' }));
    expect(await screen.findByText('corp orders')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('scope=corp');
    await userEvent.click(screen.getByRole('button', { name: 'Character' }));
    expect(screen.getByText('character orders')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  it('opens straight on the corp view from ?scope=corp', async () => {
    access('ready', true);
    renderTab('/market/orders?scope=corp');
    expect(await screen.findByText('corp orders')).toBeInTheDocument();
  });
});
