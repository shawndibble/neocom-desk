import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';

vi.mock('@/sync/firebaseApp', () => ({ getSyncAuth: () => ({ currentUser: { uid: 'char:1' } }) }));
const store = vi.hoisted(() => ({ loadMyCommunitiesCached: vi.fn() }));
vi.mock('@/features/communities/communityStore', () => store);
const requests = vi.hoisted(() => ({ loadRequestsSince: vi.fn() }));
vi.mock('@/features/communities/requestStore', () => requests);

import { refreshRequestBadge, resetRequestBadge } from '@/features/communities/requestBadge';
import { NavItem } from './NavItem';
import { useNavBadges } from './navBadges';

/** A nav entry built the way the rail and tab bar build theirs. */
function Entry({ to, label }: { to: '/communities' | '/market'; label: string }) {
  const badge = useNavBadges();
  return <NavItem to={to} label={label} locked={false} {...badge(to)} />;
}

const NOW = 1_000_000;
const board = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    ownerUid: 'char:2',
    ownerName: 'Two',
    location: '',
    terms: '',
    lines: [{ typeId: 1, name: 'Tritanium', quantity: 1, kind: 'item' }],
    createdAt: NOW - 10,
    lastActivityAt: NOW - 10,
    expiresAt: NOW + 1000,
    closed: false,
  }));

beforeEach(async () => {
  resetRequestBadge();
  await db.settings.clear();
  await db.settings.bulkPut([
    { key: 'communityWatch:1', value: true },
    { key: 'communityRequestsSeen:1:c1', value: 0 },
  ]);
  store.loadMyCommunitiesCached.mockResolvedValue([{ id: 'c1' }]);
});

describe('NavItem on Communities', () => {
  it('shows the count of new Requests in the link’s name, and nothing at zero', async () => {
    requests.loadRequestsSince.mockResolvedValue(board(0));
    render(
      <MemoryRouter>
        <Entry to="/communities" label="Communities" />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Communities' })).toBeInTheDocument();
    requests.loadRequestsSince.mockResolvedValue(board(3));
    await act(() => refreshRequestBadge(1, NOW));
    expect(screen.getByRole('link', { name: 'Communities, 3 new Requests' })).toBeInTheDocument();
    requests.loadRequestsSince.mockResolvedValue(board(1));
    await act(() => refreshRequestBadge(1, NOW));
    expect(screen.getByRole('link', { name: 'Communities, 1 new Request' })).toBeInTheDocument();
  });

  it('puts no count on any other destination', async () => {
    requests.loadRequestsSince.mockResolvedValue(board(3));
    render(
      <MemoryRouter>
        <Entry to="/market" label="Market" />
      </MemoryRouter>
    );
    await act(() => refreshRequestBadge(1, NOW));
    expect(screen.getByRole('link', { name: 'Market' })).toBeInTheDocument();
  });
});
