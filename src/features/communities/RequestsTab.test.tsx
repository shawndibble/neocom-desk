import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { CommunityRequest } from '@/engine/communities/requests';

const store = vi.hoisted(() => ({
  postRequest: vi.fn(),
  extendRequest: vi.fn(),
  setRequestClosed: vi.fn(),
}));
vi.mock('./requestStore', () => store);
vi.mock('@/features/market/appraisalData', () => ({
  loadAppraisalCatalogue: () =>
    Promise.resolve(
      new Map([
        ['tritanium', { typeId: 34, name: 'Tritanium' }],
        ['pyerite', { typeId: 35, name: 'Pyerite' }],
        ['ishtar blueprint', { typeId: 99, name: 'Ishtar Blueprint' }],
      ])
    ),
}));

import { RequestsTab } from './RequestsTab';

const DAY = 86_400_000;
const NOW = 100 * DAY;
const request = (over: Partial<CommunityRequest>): CommunityRequest => ({
  id: 'r1',
  ownerUid: 'char:2',
  ownerName: 'Aria Voss',
  location: 'Khanid',
  terms: 'Budget 300M',
  lines: [{ typeId: 34, name: 'Tritanium', quantity: 1000, kind: 'item' }],
  createdAt: NOW - DAY,
  lastActivityAt: NOW - DAY,
  expiresAt: NOW + 29 * DAY,
  closed: false,
  ...over,
});

function renderTab(requests: CommunityRequest[] | null, onReload = vi.fn()) {
  render(
    <RequestsTab
      characterId={1}
      communityId="c1"
      myUid="char:1"
      requests={requests}
      failed={false}
      now={NOW}
      onReload={onReload}
    />
  );
  return onReload;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.postRequest.mockResolvedValue({ requestId: 'new' });
  store.extendRequest.mockResolvedValue({ expiresAt: 1 });
  store.setRequestClosed.mockResolvedValue(undefined);
});

describe('RequestsTab board', () => {
  it('shows the empty state with New request… when nothing is posted', () => {
    renderTab([]);
    expect(screen.getByText('No requests yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New request…' })).toBeInTheDocument();
  });

  it('lists open Requests with requester, place, terms and a lines progress figure', () => {
    renderTab([
      request({}),
      request({ id: 'r2', ownerName: 'Bo Tanner', closed: true, terms: 'hidden' }),
    ]);
    expect(screen.getByText('Aria Voss · Khanid')).toBeInTheDocument();
    expect(screen.getByText('Budget 300M')).toBeInTheDocument();
    expect(screen.getByText('0 delivered · 0 pledged · 1 needed lines')).toBeInTheDocument();
    expect(screen.queryByText('Bo Tanner · Khanid')).not.toBeInTheDocument();
  });

  it('searches by item, and Mine lists my closed Requests too', async () => {
    const user = userEvent.setup();
    renderTab([
      request({}),
      request({
        id: 'mine',
        ownerUid: 'char:1',
        ownerName: 'Me',
        closed: true,
        lines: [{ typeId: 35, name: 'Pyerite', quantity: 5, kind: 'item' }],
      }),
    ]);
    await user.type(screen.getByRole('searchbox', { name: 'Search Requests' }), 'pyer');
    expect(screen.getByText('No Requests match your search')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Mine/ }));
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
  });
});

describe('Request panel', () => {
  it('gives a Member nothing to press', async () => {
    const user = userEvent.setup();
    renderTab([request({})]);
    await user.click(screen.getByText('Tritanium'));
    const panel = screen.getByRole('dialog', { name: /Aria Voss's request/ });
    expect(within(panel).getByText('Budget 300M')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /Extend|Close request/ })).toBeNull();
  });

  it('lets the requester extend and close, then asks for a refetch', async () => {
    const user = userEvent.setup();
    const reload = renderTab([request({ ownerUid: 'char:1', ownerName: 'Me' })]);
    await user.click(screen.getByText('Tritanium'));
    await user.click(screen.getByRole('button', { name: 'Extend 30 days' }));
    expect(store.extendRequest).toHaveBeenCalledWith(1, 'c1', 'r1');
    await user.click(screen.getByRole('button', { name: 'Close request' }));
    expect(store.setRequestClosed).toHaveBeenCalledWith(1, 'c1', 'r1', true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('offers Reopen on a closed Request of mine', async () => {
    const user = userEvent.setup();
    renderTab([request({ ownerUid: 'char:1', ownerName: 'Me', closed: true })]);
    await user.click(screen.getByRole('button', { name: /^Mine/ }));
    await user.click(screen.getByText('Tritanium'));
    await user.click(screen.getByRole('button', { name: 'Reopen request' }));
    expect(store.setRequestClosed).toHaveBeenCalledWith(1, 'c1', 'r1', false);
  });

  it('says so when the server refuses a reopen over the cap', async () => {
    const user = userEvent.setup();
    store.setRequestClosed.mockRejectedValue({ details: { reason: 'too-many-open-requests' } });
    renderTab([request({ ownerUid: 'char:1', ownerName: 'Me', closed: true })]);
    await user.click(screen.getByRole('button', { name: /^Mine/ }));
    await user.click(screen.getByText('Tritanium'));
    await user.click(screen.getByRole('button', { name: 'Reopen request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/most open Requests/);
  });
});

describe('New request dialog', () => {
  it('posts a pasted list with an edited quantity and the location and terms', async () => {
    const user = userEvent.setup();
    const reload = renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request…' }));
    await user.type(await screen.findByLabelText(/^Location/), 'Efa');
    await user.type(screen.getByLabelText(/^Terms/), '90% JBV');
    await user.click(screen.getByLabelText(/Paste a list/));
    await user.paste('Tritanium\t1,000\nPyerite 50\nMystery Thing 3');
    expect(await screen.findByLabelText('Tritanium quantity')).toHaveValue('1000');
    expect(screen.getByText(/1 line wasn't recognised.*Mystery Thing/)).toBeInTheDocument();
    const quantity = screen.getByLabelText('Pyerite quantity');
    await user.clear(quantity);
    await user.type(quantity, '75');
    await user.click(screen.getByRole('button', { name: 'Remove Tritanium' }));
    await user.click(screen.getByRole('button', { name: 'Post request' }));
    expect(store.postRequest).toHaveBeenCalledWith(1, 'c1', {
      location: 'Efa',
      terms: '90% JBV',
      lines: [{ typeId: 35, name: 'Pyerite', quantity: 75, kind: 'item' }],
    });
    expect(reload).toHaveBeenCalled();
  });

  it('adds an item by search and offers copy/original on a blueprint line', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request…' }));
    await user.type(await screen.findByRole('searchbox', { name: 'Add an item' }), 'ishtar');
    await user.click(await screen.findByRole('button', { name: 'Ishtar Blueprint' }));
    expect(screen.getByLabelText('Ishtar Blueprint quantity')).toHaveValue('1');
    await user.type(screen.getByLabelText('Runs'), '5');
    await user.click(screen.getByRole('button', { name: 'Post request' }));
    expect(store.postRequest.mock.calls[0][2].lines).toEqual([
      { typeId: 99, name: 'Ishtar Blueprint', quantity: 1, kind: 'bpc', runs: 5 },
    ]);
  });

  it('cannot post with no lines or a bad quantity', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request…' }));
    expect(await screen.findByRole('button', { name: 'Post request' })).toBeDisabled();
    await user.click(screen.getByLabelText(/Paste a list/));
    await user.paste('Tritanium 5');
    const quantity = await screen.findByLabelText('Tritanium quantity');
    await user.clear(quantity);
    await user.type(quantity, 'lots');
    expect(screen.getByRole('button', { name: 'Post request' })).toBeDisabled();
  });

  it('shows the cap message when the server refuses', async () => {
    const user = userEvent.setup();
    store.postRequest.mockRejectedValue({ details: { reason: 'too-many-open-requests' } });
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request…' }));
    await user.click(await screen.findByLabelText(/Paste a list/));
    await user.paste('Tritanium 5');
    await screen.findByLabelText('Tritanium quantity');
    await user.click(screen.getByRole('button', { name: 'Post request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/most open Requests/);
  });
});
