import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { CommunityRequest, RequestPledge } from '@/engine/communities/requests';

const store = vi.hoisted(() => ({
  postRequest: vi.fn(),
  extendRequest: vi.fn(),
  setRequestClosed: vi.fn(),
  updateMyPledge: vi.fn(),
  loadRequestMailsToday: vi.fn(),
  reserveRequestMail: vi.fn(),
  confirmRequestMail: vi.fn(),
  releaseRequestMail: vi.fn(),
  removeRequest: vi.fn(),
  removePledge: vi.fn(),
}));
vi.mock('./requestStore', () => store);

const world = vi.hoisted(() => ({
  library: vi.fn(),
  location: vi.fn(),
  newMail: vi.fn(),
}));
vi.mock('./communityStore', () => ({ loadMemberLibraries: world.library }));
vi.mock('@/features/character/location', () => ({ loadCharacterSolarSystemId: world.location }));
vi.mock('@/esi/endpoints', () => ({ postOpenWindowNewMail: world.newMail }));
// A chain of stargates 1-2-...-8; system 9 has no gate. Perimeter is one jump
// from Jita, Badivefi seven, Efa unreachable.
vi.mock('@/sde/jumpGraph', () => ({
  loadJumpGraph: () =>
    Promise.resolve(
      new Map<number, number[]>([
        [1, [2]],
        [2, [1, 3]],
        [3, [2, 4]],
        [4, [3, 5]],
        [5, [4, 6]],
        [6, [5, 7]],
        [7, [6, 8]],
        [8, [7]],
        [9, []],
      ])
    ),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: () =>
    Promise.resolve(
      new Map([
        [1, { id: 1, name: 'Jita', security: 0.9, regionId: 100 }],
        [2, { id: 2, name: 'Perimeter', security: 0.9, regionId: 100 }],
        [8, { id: 8, name: 'Badivefi', security: 0.6, regionId: 200 }],
        [9, { id: 9, name: 'Efa', security: 0.4, regionId: 200 }],
      ])
    ),
}));
vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketRegions: () =>
    Promise.resolve([
      { id: 100, name: 'The Forge' },
      { id: 200, name: 'Khanid' },
    ]),
}));
vi.mock('@/features/market/appraisalData', () => ({
  loadAppraisalCatalogue: () =>
    Promise.resolve(
      new Map([
        ['tritanium', { typeId: 34, name: 'Tritanium' }],
        ['pyerite', { typeId: 35, name: 'Pyerite' }],
        ['ishtar blueprint', { typeId: 99, name: 'Ishtar Blueprint' }],
        ...Array.from({ length: 60 }, (_, i): [string, { typeId: number; name: string }] => [
          `bulk ${i + 1}`,
          { typeId: 1000 + i, name: `Bulk ${i + 1}` },
        ]),
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

const refreshPledges = vi.fn();

function renderTab(
  requests: CommunityRequest[] | null,
  onReload = vi.fn(),
  pledges: Record<string, RequestPledge[]> = {},
  pledgesFailed = false,
  isAdmin = false
) {
  render(
    <MemoryRouter>
      <RequestsTab
        characterId={1}
        communityId="c1"
        communityName="Pals"
        myUid="char:1"
        isAdmin={isAdmin}
        memberNames={new Map([['char:3', 'Dax Orrelin']])}
        requests={requests}
        pledges={new Map(Object.entries(pledges))}
        pledgesFailed={pledgesFailed}
        failed={false}
        now={NOW}
        members={[]}
        onReload={onReload}
        refreshPledges={refreshPledges}
      />
    </MemoryRouter>
  );
  return onReload;
}

const LOCATION_SCOPE = 'esi-location.read_location.v1';
const WINDOW_SCOPE = 'esi-ui.open_window.v1';
async function grant(...scopes: string[]) {
  await db.tokens.put({
    characterId: 1,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    scopes,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.tokens.clear();
  world.library.mockResolvedValue([{ uid: 'char:1', items: [] }]);
  world.location.mockResolvedValue(1);
  world.newMail.mockResolvedValue({ data: null });
  store.postRequest.mockResolvedValue({ requestId: 'new' });
  store.extendRequest.mockResolvedValue({ expiresAt: 1 });
  store.setRequestClosed.mockResolvedValue(undefined);
  store.updateMyPledge.mockResolvedValue(null);
  store.removeRequest.mockResolvedValue(undefined);
  store.removePledge.mockResolvedValue(undefined);
  refreshPledges.mockResolvedValue([]);
  store.loadRequestMailsToday.mockResolvedValue(0);
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
  it('gives a Member no requester controls', async () => {
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

/** Step 1 to step 2 to posted: nobody is ticked, so no mail goes out. */
async function postFromDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next: who to mail' }));
  await user.click(await screen.findByRole('button', { name: 'Post request' }));
}

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
    await postFromDialog(user);
    expect(store.postRequest).toHaveBeenCalledWith(1, 'c1', {
      location: 'Efa',
      terms: '90% JBV',
      lines: [{ typeId: 35, name: 'Pyerite', quantity: 75, kind: 'item' }],
    });
    expect(reload).toHaveBeenCalled();
  });

  it('offers systems and regions for the location and says whether it can be measured', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request…' }));
    const field = await screen.findByLabelText(/^Location/);
    await user.type(field, 'my hangar');
    expect(screen.getByText(/Not a system or region/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'badi');
    await user.click(await screen.findByRole('button', { name: 'Badivefi, Khanid' }));
    expect(field).toHaveValue('Badivefi, Khanid');
    expect(screen.getByText('Others can filter this Request by distance.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Matching systems and regions' })).toBeNull();
  });

  it('adds an item by search and offers copy/original on a blueprint line', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request…' }));
    await user.type(await screen.findByRole('searchbox', { name: 'Add an item' }), 'ishtar');
    await user.click(await screen.findByRole('button', { name: 'Ishtar Blueprint' }));
    expect(screen.getByLabelText('Ishtar Blueprint quantity')).toHaveValue('1');
    await user.type(screen.getByLabelText('Runs'), '5');
    await postFromDialog(user);
    expect(store.postRequest.mock.calls[0][2].lines).toEqual([
      { typeId: 99, name: 'Ishtar Blueprint', quantity: 1, kind: 'bpc', runs: 5 },
    ]);
  });

  it('cannot post with no lines or a bad quantity', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request…' }));
    expect(await screen.findByRole('button', { name: 'Next: who to mail' })).toBeDisabled();
    await user.click(screen.getByLabelText(/Paste a list/));
    await user.paste('Tritanium 5');
    const quantity = await screen.findByLabelText('Tritanium quantity');
    await user.clear(quantity);
    await user.type(quantity, 'lots');
    expect(screen.getByRole('button', { name: 'Next: who to mail' })).toBeDisabled();
  });

  it('shows the cap message when the server refuses', async () => {
    const user = userEvent.setup();
    store.postRequest.mockRejectedValue({ details: { reason: 'too-many-open-requests' } });
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request…' }));
    await user.click(await screen.findByLabelText(/Paste a list/));
    await user.paste('Tritanium 5');
    await screen.findByLabelText('Tritanium quantity');
    await postFromDialog(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(/most open Requests/);
  });

  it('refuses to post when a paste goes over the line cap, until enough lines are removed', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request…' }));
    await user.click(await screen.findByLabelText(/Paste a list/));
    await user.paste(Array.from({ length: 51 }, (_, i) => `Bulk ${i + 1} 5`).join('\n'));
    expect(await screen.findByText(/1 more than the 50-line limit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next: who to mail' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove Bulk 1' }));
    expect(screen.queryByText(/-line limit/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next: who to mail' })).toBeEnabled();
  });

  it('adds the same blueprint again as the other kind, so a copy and an original coexist', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request…' }));
    const search = await screen.findByRole('searchbox', { name: 'Add an item' });
    await user.type(search, 'ishtar');
    await user.click(await screen.findByRole('button', { name: 'Ishtar Blueprint' }));
    await user.type(search, 'ishtar');
    await user.click(await screen.findByRole('button', { name: 'Ishtar Blueprint' }));
    expect(screen.getAllByLabelText('Ishtar Blueprint quantity')).toHaveLength(2);
    await postFromDialog(user);
    expect(store.postRequest.mock.calls[0][2].lines.map((l: { kind: string }) => l.kind)).toEqual([
      'bpc',
      'bpo',
    ]);
  });
});

const blueprintLine = (typeId: number, name: string) => ({
  typeId,
  name,
  quantity: 2,
  kind: 'bpc' as const,
});
const rowNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent ?? '');

describe('I can fill', () => {
  it('counts and lists open Requests of others with a blueprint line the Member shares', async () => {
    const user = userEvent.setup();
    world.library.mockResolvedValue([
      { uid: 'char:1', items: [{ typeId: 99, me: 10, te: 20, runs: -1 }] },
    ]);
    renderTab([
      request({ id: 'fit', lines: [blueprintLine(99, 'Ishtar Blueprint')] }),
      request({ id: 'no', ownerName: 'Bo Tanner', lines: [blueprintLine(98, 'Other Blueprint')] }),
      request({
        id: 'own',
        ownerUid: 'char:1',
        ownerName: 'Me',
        lines: [blueprintLine(99, 'Ishtar Blueprint')],
      }),
    ]);
    const chip = screen.getByRole('button', { name: /^I can fill/ });
    await waitFor(() => expect(chip).toHaveTextContent('I can fill1'));
    await user.click(chip);
    expect(rowNames()).toHaveLength(1);
    expect(screen.getByText('Aria Voss · Khanid')).toBeInTheDocument();
  });

  it('is disabled with its reason when the shared blueprints cannot be read', async () => {
    world.library.mockRejectedValue(new Error('offline'));
    renderTab([request({})]);
    const chip = await screen.findByRole('button', { name: /^I can fill/ });
    await waitFor(() => expect(chip).toHaveAttribute('aria-disabled', 'true'));
    expect(chip).not.toHaveTextContent('I can fill0');
    // Asked strictly, so an unreadable library is not mistaken for an empty one.
    expect(world.library).toHaveBeenCalledWith(1, 'c1', ['char:1'], { strict: true });
  });
});

describe('distance', () => {
  const near = request({ id: 'near', location: 'Perimeter, The Forge', terms: 'near one' });
  const far = request({ id: 'far', location: 'Badivefi, Khanid', terms: 'far one' });
  const free = request({ id: 'free', location: 'my hangar', terms: 'free one' });
  const select = () => screen.getByRole('combobox', { name: 'Distance' });

  it('limits the list to Requests within N jumps and says how many it cannot place', async () => {
    const user = userEvent.setup();
    await grant(LOCATION_SCOPE);
    renderTab([near, far, free]);
    await waitFor(() => expect(select()).toBeEnabled());
    expect(rowNames()).toHaveLength(3);
    await user.selectOptions(select(), 'Within 5 jumps');
    expect(
      await screen.findByText(
        '1 Request with no place to measure from isn’t listed.'.replace('’', "'")
      )
    ).toBeInTheDocument();
    expect(rowNames()).toHaveLength(1);
    expect(rowNames()[0]).toContain('near one');
    await user.selectOptions(select(), 'Within 10 jumps');
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    await user.selectOptions(select(), 'Any distance');
    await waitFor(() => expect(rowNames()).toHaveLength(3));
    expect(screen.queryByText(/no place to measure from/)).not.toBeInTheDocument();
  });

  it('falls back to Any distance when the Permission goes away under a chosen limit', async () => {
    const user = userEvent.setup();
    await grant(LOCATION_SCOPE);
    renderTab([near, far]);
    await waitFor(() => expect(select()).toBeEnabled());
    await user.selectOptions(select(), 'Within 5 jumps');
    await waitFor(() => expect(rowNames()).toHaveLength(1));
    await db.tokens.clear();
    await waitFor(() => expect(select()).toBeDisabled());
    expect(select()).toHaveValue('any');
    expect(rowNames()).toHaveLength(2);
  });

  it('is disabled with the Grant link when the location Permission is missing', async () => {
    await grant();
    renderTab([near]);
    await waitFor(() => expect(select()).toBeDisabled());
    expect(screen.getByText(/Distance needs your pilot's location/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Grant missing Permissions' })).toBeInTheDocument();
  });

  it('is disabled with a reason when the pilot location is not known', async () => {
    await grant(LOCATION_SCOPE);
    world.location.mockResolvedValue(null);
    renderTab([near]);
    expect(await screen.findByText(/location isn't known right now/)).toBeInTheDocument();
    expect(select()).toBeDisabled();
  });
});

describe('Message the requester', () => {
  it('opens a new mail to the requester with a subject and body filled in', async () => {
    const user = userEvent.setup();
    await grant(WINDOW_SCOPE);
    renderTab([request({ ownerUid: 'char:2119000001' })]);
    await user.click(screen.getByText('Tritanium'));
    const button = await screen.findByRole('button', { name: 'Message Aria Voss…' });
    await user.click(button);
    expect(world.newMail).toHaveBeenCalledWith(1, {
      recipientId: 2119000001,
      subject: 'Your Request: Tritanium',
      body: 'Hi Aria Voss, about your Request in Pals for Tritanium: ',
    });
    expect(await screen.findByText('Opened in your EVE client.')).toBeInTheDocument();
  });

  it('explains the missing Permission with the Grant link instead of failing', async () => {
    const user = userEvent.setup();
    await grant();
    renderTab([request({ ownerUid: 'char:2119000001' })]);
    await user.click(screen.getByText('Tritanium'));
    const button = await screen.findByRole('button', { name: 'Message Aria Voss…' });
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    await user.click(button);
    expect(world.newMail).not.toHaveBeenCalled();
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText(/needs the Open in EVE Permission/)).toBeInTheDocument();
    expect(
      within(panel).getByRole('link', { name: 'Grant missing Permissions' })
    ).toBeInTheDocument();
  });

  it('says so when the game refuses, and offers no Message on my own Request', async () => {
    const user = userEvent.setup();
    await grant(WINDOW_SCOPE);
    world.newMail.mockRejectedValue(new Error('boom'));
    renderTab([request({ ownerUid: 'char:2119000001' })]);
    await user.click(screen.getByText('Tritanium'));
    await user.click(await screen.findByRole('button', { name: 'Message Aria Voss…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't open it in EVE/);
  });

  it('is not offered to the requester', async () => {
    const user = userEvent.setup();
    renderTab([request({ ownerUid: 'char:1', ownerName: 'Me' })]);
    await user.click(screen.getByText('Tritanium'));
    expect(screen.queryByRole('button', { name: /^Message/ })).toBeNull();
  });
});

const pledgeOf = (
  uid: string,
  quantity: number,
  over: Partial<RequestPledge> = {}
): RequestPledge => ({
  uid,
  lines: { 0: { quantity, delivered: 0, contractIds: [] } },
  updatedAt: NOW - DAY,
  ...over,
});

describe('Pledging', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByText('Tritanium'));
    return screen.getByRole('dialog', { name: /Aria Voss's request/ });
  };

  it('offers a quantity field starting at what is uncovered, and Pledges it', async () => {
    const user = userEvent.setup();
    renderTab([request({})], vi.fn(), { r1: [pledgeOf('char:3', 400)] });
    const panel = await open(user);
    const field = within(panel).getByLabelText('Quantity you can provide of Tritanium');
    expect(field).toHaveValue('600');
    await user.clear(field);
    await user.type(field, '250');
    await user.click(within(panel).getByRole('button', { name: 'Pledge' }));
    expect(store.updateMyPledge).toHaveBeenCalledTimes(1);
    const [characterId, communityId, requestId, change] = store.updateMyPledge.mock.calls[0];
    expect([characterId, communityId, requestId]).toEqual([1, 'c1', 'r1']);
    expect(change({})).toEqual({ 0: { quantity: 250, delivered: 0, contractIds: [] } });
    expect(refreshPledges).toHaveBeenCalledWith('r1');
  });

  it('shows Update pledge and Withdraw once pledged, and keeps what was delivered', async () => {
    const user = userEvent.setup();
    renderTab([request({})], vi.fn(), { r1: [pledgeOf('char:1', 300)] });
    const panel = await open(user);
    expect(within(panel).getByLabelText(/Quantity you can provide/)).toHaveValue('300');
    await user.click(within(panel).getByRole('button', { name: 'Withdraw' }));
    const withdraw = store.updateMyPledge.mock.calls[0][3];
    expect(withdraw({ 0: { quantity: 300, delivered: 0, contractIds: [] } })).toEqual({});
    await user.click(within(panel).getByRole('button', { name: 'Update pledge' }));
    const update = store.updateMyPledge.mock.calls[1][3];
    expect(update({ 0: { quantity: 300, delivered: 40, contractIds: [7] } })).toEqual({
      0: { quantity: 300, delivered: 40, contractIds: [7] },
    });
  });

  it('prints the over-pledge note and never blocks the Pledge', async () => {
    const user = userEvent.setup();
    renderTab([request({})], vi.fn(), { r1: [pledgeOf('char:3', 1400)] });
    const panel = await open(user);
    expect(
      within(panel).getByText(/Over-pledged by 400: Pledges don't reserve/)
    ).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Pledge' })).toBeEnabled();
  });

  it('refuses a quantity that is not a positive whole number', async () => {
    const user = userEvent.setup();
    renderTab([request({})]);
    const panel = await open(user);
    const field = within(panel).getByLabelText(/Quantity you can provide/);
    await user.clear(field);
    await user.type(field, '1.5');
    expect(within(panel).getByRole('button', { name: 'Pledge' })).toBeDisabled();
    expect(within(panel).getByText('Enter a whole number above 0.')).toBeInTheDocument();
  });

  it('shows the requester no Pledge controls', async () => {
    const user = userEvent.setup();
    renderTab([request({ ownerUid: 'char:1', ownerName: 'Me' })]);
    await user.click(screen.getByText('Tritanium'));
    const panel = screen.getByRole('dialog', { name: /Your request/ });
    expect(within(panel).queryByRole('textbox')).toBeNull();
    expect(within(panel).queryByRole('button', { name: /Pledge|Withdraw/ })).toBeNull();
  });

  it('shows no Pledge controls on a closed Request', async () => {
    const user = userEvent.setup();
    renderTab([request({ closed: true, ownerUid: 'char:1' })]);
    await user.click(screen.getByRole('button', { name: /^Mine/ }));
    await user.click(screen.getByText('Tritanium'));
    expect(screen.queryByLabelText(/Quantity you can provide/)).toBeNull();
  });

  it('reports a failed write', async () => {
    const user = userEvent.setup();
    store.updateMyPledge.mockRejectedValue(new Error('denied'));
    renderTab([request({})]);
    const panel = await open(user);
    await user.click(within(panel).getByRole('button', { name: 'Pledge' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/Couldn't save that Pledge/);
  });

  it('greys out a Pledge with no delivery after 14 days and says so', async () => {
    const user = userEvent.setup();
    renderTab([request({})], vi.fn(), {
      r1: [pledgeOf('char:1', 300, { updatedAt: NOW - 15 * DAY })],
    });
    const panel = await open(user);
    expect(within(panel).getByText(/No delivery in 14 days/)).toBeInTheDocument();
  });
});

describe('Board from Pledges', () => {
  it('derives progress and status from the Pledges, not from the Request alone', () => {
    renderTab([request({})], vi.fn(), { r1: [pledgeOf('char:3', 1000)] });
    expect(screen.getByText('0 delivered · 1 pledged · 1 needed lines')).toBeInTheDocument();
    expect(screen.getByText('Pledged', { selector: 'span' })).toBeInTheDocument();
  });

  it('is Part delivered, then Delivered, as deliveries are marked', () => {
    renderTab(
      [
        request({}),
        request({ id: 'r2', lines: [{ typeId: 35, name: 'Pyerite', quantity: 10, kind: 'item' }] }),
      ],
      vi.fn(),
      {
        r1: [pledgeOf('char:3', 1000, { lines: { 0: { quantity: 1000, delivered: 10 } } })],
        r2: [pledgeOf('char:3', 10, { lines: { 0: { quantity: 10, delivered: 10 } } })],
      }
    );
    expect(screen.getByText('Part delivered')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });
});

describe('A failed Pledge read', () => {
  it('says so and offers a retry instead of passing Requests off as Open', async () => {
    const user = userEvent.setup();
    const reload = renderTab([request({})], vi.fn(), {}, true);
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load some Pledges/);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reload).toHaveBeenCalled();
  });
});

describe('My pledges', () => {
  it('counts Pledges in progress in the strip and lists them in a slide-out', async () => {
    const user = userEvent.setup();
    renderTab([request({})], vi.fn(), {
      r1: [pledgeOf('char:1', 300, { updatedAt: NOW - 20 * DAY })],
    });
    expect(
      screen.getByText('You have no open Requests and 1 Pledge in progress.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'My pledges' }));
    const panel = screen.getByRole('dialog', { name: 'My pledges' });
    expect(within(panel).getByText('Tritanium')).toBeInTheDocument();
    expect(within(panel).getByText('300 pledged · 0 delivered')).toBeInTheDocument();
    expect(within(panel).getByText(/Stale: no delivery in 14 days/)).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: /Open request for Aria Voss/ }));
    expect(screen.getByRole('dialog', { name: /Aria Voss's request/ })).toBeInTheDocument();
  });

  it('says so when there are none', async () => {
    const user = userEvent.setup();
    renderTab([request({})]);
    await user.click(screen.getByRole('button', { name: 'My pledges' }));
    expect(screen.getByText('You have no Pledges on open Requests')).toBeInTheDocument();
  });
});

describe('Admin removal', () => {
  const pledged = { r1: [pledgeOf('char:3', 400), pledgeOf('char:9', 100)] };

  it('offers no remove control to a Member who is not the admin', async () => {
    const user = userEvent.setup();
    renderTab([request({})], vi.fn(), pledged);
    await user.click(screen.getByText('Tritanium'));
    const panel = screen.getByRole('dialog', { name: /Aria Voss's request/ });
    expect(within(panel).queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(within(panel).queryByText('Pledges on this request')).toBeNull();
  });

  it('names each Pledger in the panel and removes one Pledge after a confirm', async () => {
    const user = userEvent.setup();
    renderTab([request({})], vi.fn(), pledged, false, true);
    await user.click(screen.getByText('Tritanium'));
    const panel = screen.getByRole('dialog', { name: /Aria Voss's request/ });
    expect(within(panel).getByText('Dax Orrelin')).toBeInTheDocument();
    expect(within(panel).getByText('Former Member')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: "Remove Dax Orrelin's Pledge" }));
    const confirm = await screen.findByRole('dialog', { name: "Remove Dax Orrelin's Pledge?" });
    await user.click(within(confirm).getByRole('button', { name: 'Remove Pledge' }));
    await waitFor(() => expect(store.removePledge).toHaveBeenCalledWith(1, 'c1', 'r1', 'char:3'));
    expect(refreshPledges).toHaveBeenCalledWith('r1');
  });

  it('removes the Request from its panel and closes the panel', async () => {
    const user = userEvent.setup();
    const reload = renderTab([request({})], vi.fn(), {}, false, true);
    await user.click(screen.getByText('Tritanium'));
    const panel = screen.getByRole('dialog', { name: /Aria Voss's request/ });
    await user.click(within(panel).getByRole('button', { name: 'Remove request…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove this request?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove request' }));
    await waitFor(() => expect(store.removeRequest).toHaveBeenCalledWith(1, 'c1', 'r1'));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('says the removal failed and keeps the dialog open', async () => {
    store.removeRequest.mockRejectedValue(new Error('denied'));
    const user = userEvent.setup();
    renderTab([request({})], vi.fn(), {}, false, true);
    await user.click(screen.getByText('Tritanium'));
    const panel = screen.getByRole('dialog', { name: /Aria Voss's request/ });
    await user.click(within(panel).getByRole('button', { name: 'Remove request…' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove this request?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove request' }));
    expect(await within(confirm).findByRole('alert')).toBeInTheDocument();
  });
});
