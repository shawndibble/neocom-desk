import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { CommunityRequest, RequestPledge } from '@/engine/communities/requests';

const store = vi.hoisted(() => ({
  postRequest: vi.fn(),
  extendRequest: vi.fn(),
  setRequestClosed: vi.fn(),
  updateMyPledge: vi.fn(),
  editRequest: vi.fn(),
  removeRequest: vi.fn(),
  removePledge: vi.fn(),
}));
vi.mock('./requestStore', () => store);
const mail = vi.hoisted(() => ({
  reservePledgeMail: vi.fn(),
  confirmPledgeMail: vi.fn(),
  releasePledgeMail: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock('./pledgeMailStore', () => mail);
vi.mock('@/features/character/mail', () => ({ sendMail: mail.sendMail }));

const world = vi.hoisted(() => ({
  library: vi.fn(),
  location: vi.fn(),
  newMail: vi.fn(),
}));
vi.mock('./communityStore', () => ({
  loadMemberLibraries: world.library,
  communityRequestsUrl: (id: string) => `https://app.test/communities?community=${id}&tab=requests`,
}));
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
const SYSTEMS = new Map([
  [1, { id: 1, name: 'Jita', security: 0.9, regionId: 100 }],
  [2, { id: 2, name: 'Perimeter', security: 0.9, regionId: 100 }],
  [8, { id: 8, name: 'Badivefi', security: 0.6, regionId: 200 }],
  [9, { id: 9, name: 'Efa', security: 0.4, regionId: 200 }],
]);
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: () => Promise.resolve(SYSTEMS),
  lookupSolarSystem: (id: number) => Promise.resolve(SYSTEMS.get(id) ?? null),
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
  notify: { app: true, mail: false },
  ...over,
});

const refreshPledges = vi.fn();

function renderTab(
  requests: CommunityRequest[] | null,
  onReload = vi.fn(),
  pledges: Record<string, RequestPledge[]> = {},
  pledgesFailed = false,
  isAdmin = false,
  failed = false
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
        failed={failed}
        now={NOW}
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

/** The board's filters sit behind the funnel; open it once. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  const funnel = screen.getByRole('button', { name: /^Filters/ });
  if (funnel.getAttribute('aria-expanded') !== 'true') await user.click(funnel);
}
async function chooseFilter(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await openFilters(user);
  await user.click(screen.getByRole('button', { name }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: 1 });
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
  store.editRequest.mockResolvedValue(undefined);
  mail.reservePledgeMail.mockResolvedValue({
    communityName: 'Pals',
    pledgerName: 'Me',
    requesterName: 'Aria Voss',
    requesterCharacterId: 2,
    remaining: 99,
  });
  mail.confirmPledgeMail.mockResolvedValue(undefined);
  mail.releasePledgeMail.mockResolvedValue(undefined);
  mail.sendMail.mockResolvedValue(1);
});

describe('RequestsTab board', () => {
  it('shows the empty state with New request when nothing is posted', () => {
    renderTab([]);
    expect(screen.getByText('No requests yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New request' })).toBeInTheDocument();
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
    await chooseFilter(user, /^Mine/);
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

  it('lets the requester edit: Edit opens the dialog with the Request, and locks the items once Pledged', async () => {
    const user = userEvent.setup();
    const mine = request({ ownerUid: 'char:1', ownerName: 'Me', location: 'Efa' });
    renderTab([mine], vi.fn(), {
      r1: [
        {
          uid: 'char:3',
          lines: { 0: { quantity: 10, delivered: 0, contractIds: [] } },
          updatedAt: 1,
        },
      ],
    });
    await user.click(screen.getByText('Tritanium'));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit request' });
    expect(within(dialog).getByLabelText(/^Location/)).toHaveValue('Efa');
    expect(within(dialog).getByText(/Members have Pledged on this Request/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it('gives a Member no Edit button', async () => {
    const user = userEvent.setup();
    renderTab([request({})]);
    await user.click(screen.getByText('Tritanium'));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('offers Reopen on a closed Request of mine', async () => {
    const user = userEvent.setup();
    renderTab([request({ ownerUid: 'char:1', ownerName: 'Me', closed: true })]);
    await chooseFilter(user, /^Mine/);
    await user.click(screen.getByText('Tritanium'));
    await user.click(screen.getByRole('button', { name: 'Reopen request' }));
    expect(store.setRequestClosed).toHaveBeenCalledWith(1, 'c1', 'r1', false);
  });

  it('says so when the server refuses a reopen over the cap', async () => {
    const user = userEvent.setup();
    store.setRequestClosed.mockRejectedValue({ details: { reason: 'too-many-open-requests' } });
    renderTab([request({ ownerUid: 'char:1', ownerName: 'Me', closed: true })]);
    await chooseFilter(user, /^Mine/);
    await user.click(screen.getByText('Tritanium'));
    await user.click(screen.getByRole('button', { name: 'Reopen request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/most open Requests/);
  });
});

/** Posted from the one page: nobody is a Member here, so no mail goes out. */
async function postFromDialog(user: ReturnType<typeof userEvent.setup>) {
  const post = screen.getByRole('button', { name: 'Post request' });
  await waitFor(() => expect(post).toBeEnabled());
  await user.click(post);
}

describe('New request dialog', () => {
  it('posts a pasted list with an edited quantity and the location and terms', async () => {
    const user = userEvent.setup();
    const reload = renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request' }));
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
      notify: { app: true, mail: false },
    });
    expect(reload).toHaveBeenCalled();
  });

  it('offers systems and regions for the location and says whether it can be measured', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request' }));
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
    await user.click(screen.getByRole('button', { name: 'New request' }));
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
    await user.click(screen.getByRole('button', { name: 'New request' }));
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
    await user.click(screen.getByRole('button', { name: 'New request' }));
    await user.click(await screen.findByLabelText(/Paste a list/));
    await user.paste('Tritanium 5');
    await screen.findByLabelText('Tritanium quantity');
    await postFromDialog(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(/most open Requests/);
  });

  it('refuses to post when a paste goes over the line cap, until enough lines are removed', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request' }));
    await user.click(await screen.findByLabelText(/Paste a list/));
    await user.paste(Array.from({ length: 51 }, (_, i) => `Bulk ${i + 1} 5`).join('\n'));
    expect(await screen.findByText(/1 more than the 50-line limit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post request' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove Bulk 1' }));
    expect(screen.queryByText(/-line limit/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post request' })).toBeEnabled();
  });

  it('adds the same blueprint again as the other kind, so a copy and an original coexist', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request' }));
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
    await openFilters(user);
    const chip = screen.getByRole('button', { name: /^I can fill/ });
    await waitFor(() => expect(chip).toHaveTextContent('I can fill1'));
    await user.click(chip);
    expect(rowNames()).toHaveLength(1);
    expect(screen.getByText('Aria Voss · Khanid')).toBeInTheDocument();
  });

  it('is disabled with its reason when the shared blueprints cannot be read', async () => {
    const user = userEvent.setup();
    world.library.mockRejectedValue(new Error('offline'));
    renderTab([request({})]);
    await openFilters(user);
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
  async function pick(user: ReturnType<typeof userEvent.setup>, name: string) {
    await openFilters(user);
    await user.click(select());
    await user.click(await screen.findByRole('option', { name }));
  }

  it('limits the list to Requests within N jumps and says how many it cannot place', async () => {
    const user = userEvent.setup();
    await grant(LOCATION_SCOPE);
    renderTab([near, far, free]);
    expect(rowNames()).toHaveLength(3);
    await pick(user, 'Within 5 jumps');
    expect(
      await screen.findByText(
        '1 Request with no place to measure from isn’t listed.'.replace('’', "'")
      )
    ).toBeInTheDocument();
    expect(rowNames()).toHaveLength(1);
    expect(rowNames()[0]).toContain('near one');
    await pick(user, 'Within 10 jumps');
    await waitFor(() => expect(rowNames()).toHaveLength(2));
    await pick(user, 'Any distance');
    await waitFor(() => expect(rowNames()).toHaveLength(3));
    expect(screen.queryByText(/no place to measure from/)).not.toBeInTheDocument();
  });

  it('offers the same From system picker as every other Jump Range filter', async () => {
    const user = userEvent.setup();
    await grant(LOCATION_SCOPE);
    renderTab([near]);
    await openFilters(user);
    expect(await screen.findByRole('button', { name: /From:/ })).toBeInTheDocument();
  });

  it('explains the missing Permission with the Grant link', async () => {
    const user = userEvent.setup();
    await grant();
    // Without the Permission ESI gives no location.
    world.location.mockResolvedValue(null);
    renderTab([near]);
    await pick(user, 'Within 5 jumps');
    expect(await screen.findByText(/Distance needs your pilot's location/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Grant missing Permissions' })).toBeInTheDocument();
  });

  it('says why when the pilot location is not known, and still lists everything', async () => {
    const user = userEvent.setup();
    await grant(LOCATION_SCOPE);
    world.location.mockResolvedValue(null);
    renderTab([near, far]);
    await pick(user, 'Within 5 jumps');
    expect(await screen.findByText(/location isn't known right now/)).toBeInTheDocument();
    expect(rowNames()).toHaveLength(2);
  });
});

describe('Message the requester', () => {
  it('opens a new mail to the requester with a subject and body filled in', async () => {
    const user = userEvent.setup();
    await grant(WINDOW_SCOPE);
    renderTab([request({ ownerUid: 'char:2119000001' })]);
    await user.click(screen.getByText('Tritanium'));
    const button = await screen.findByRole('button', { name: 'Message Aria Voss' });
    await user.click(button);
    expect(world.newMail).toHaveBeenCalledWith(1, {
      recipientId: 2119000001,
      subject: 'Your Request: Tritanium',
      body: 'Hi Aria Voss, about your Request in Pals for Tritanium: ',
    });
    expect(await screen.findByText('Opened in your EVE client.')).toBeInTheDocument();
  });

  it('hides Message without the Open in EVE Permission', async () => {
    const user = userEvent.setup();
    await grant();
    renderTab([request({ ownerUid: 'char:2119000001' })]);
    await user.click(screen.getByText('Tritanium'));
    await screen.findByRole('dialog');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Message Aria Voss' })).not.toBeInTheDocument()
    );
    expect(world.newMail).not.toHaveBeenCalled();
  });

  it('says so when the game refuses, and offers no Message on my own Request', async () => {
    const user = userEvent.setup();
    await grant(WINDOW_SCOPE);
    world.newMail.mockRejectedValue(new Error('boom'));
    renderTab([request({ ownerUid: 'char:2119000001' })]);
    await user.click(screen.getByText('Tritanium'));
    await user.click(await screen.findByRole('button', { name: 'Message Aria Voss' }));
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
    await chooseFilter(user, /^Mine/);
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

describe('A failed board reload', () => {
  it('shows the retry banner above the last good board, not only before the first load', async () => {
    const user = userEvent.setup();
    const onReload = renderTab([request({ id: 'a' })], vi.fn(), {}, false, false, true);
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load this Community's Requests/);
    expect(screen.getByText('Tritanium')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onReload).toHaveBeenCalledTimes(1);
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

  it('names each Pledger in the panel and removes one Pledge once its Undo toast closes', async () => {
    const user = userEvent.setup();
    renderTab([request({})], vi.fn(), pledged, false, true);
    await user.click(screen.getByText('Tritanium'));
    const panel = screen.getByRole('dialog', { name: /Aria Voss's request/ });
    expect(within(panel).getByText('Dax Orrelin')).toBeInTheDocument();
    expect(within(panel).getByText('Former Member')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: "Remove Dax Orrelin's Pledge" }));
    expect(within(panel).queryByText('Dax Orrelin')).toBeNull();
    expect(store.removePledge).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(store.removePledge).toHaveBeenCalledWith(1, 'c1', 'r1', 'char:3'));
    expect(refreshPledges).toHaveBeenCalledWith('r1');
  });

  it('removes the Request from its panel, closes the panel and writes once the toast closes', async () => {
    const user = userEvent.setup();
    const reload = renderTab([request({})], vi.fn(), {}, false, true);
    await user.click(screen.getByText('Tritanium'));
    const panel = screen.getByRole('dialog', { name: /Aria Voss's request/ });
    await user.click(within(panel).getByRole('button', { name: 'Remove request' }));
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(store.removeRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(store.removeRequest).toHaveBeenCalledWith(1, 'c1', 'r1'));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('Undo keeps the Request and writes nothing', async () => {
    const user = userEvent.setup();
    renderTab([request({})], vi.fn(), {}, false, true);
    await user.click(screen.getByText('Tritanium'));
    const panel = screen.getByRole('dialog', { name: /Aria Voss's request/ });
    await user.click(within(panel).getByRole('button', { name: 'Remove request' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Tritanium')).toBeInTheDocument();
    expect(store.removeRequest).not.toHaveBeenCalled();
  });
});

describe('Telling the requester about a Pledge', () => {
  const SEND_MAIL_SCOPE = 'esi-mail.send_mail.v1';
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByText('Tritanium'));
    return screen.getByRole('dialog', { name: /Aria Voss's request/ });
  };
  const wantsMail = () => request({ notify: { app: true, mail: true } });
  const pledge = async (user: ReturnType<typeof userEvent.setup>, panel: HTMLElement) =>
    user.click(within(panel).getByRole('button', { name: /^(Pledge|Update pledge)$/ }));

  it('is a pair of checkboxes in compose, app on and mail off to begin with', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request' }));
    const group = await screen.findByRole('group', { name: 'Tell me when someone Pledges' });
    expect(within(group).getByRole('checkbox', { name: 'In the app' })).toBeChecked();
    expect(within(group).getByRole('checkbox', { name: 'By in-game mail' })).not.toBeChecked();
    expect(group).toHaveAccessibleDescription(/Send mail Permission/);
    expect(screen.queryByText('Mail to (optional)')).toBeNull();
  });

  it('posts the choice made, both off included', async () => {
    const user = userEvent.setup();
    renderTab([]);
    await user.click(screen.getByRole('button', { name: 'New request' }));
    await user.click(await screen.findByRole('checkbox', { name: 'By in-game mail' }));
    await user.click(screen.getByRole('checkbox', { name: 'In the app' }));
    await user.click(screen.getByLabelText(/Paste a list/));
    await user.paste('Tritanium 5');
    await postFromDialog(user);
    expect(store.postRequest.mock.calls[0][2].notify).toEqual({ app: false, mail: true });
  });

  it('shows the Request’s choice when editing, and saves a change to it', async () => {
    const user = userEvent.setup();
    renderTab([request({ ownerUid: 'char:1', notify: { app: false, mail: true } })]);
    await user.click(screen.getByText('Tritanium'));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit request' });
    expect(within(dialog).getByRole('checkbox', { name: 'In the app' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'By in-game mail' })).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: 'In the app' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(store.editRequest.mock.calls[0][3].notify).toEqual({ app: true, mail: true });
  });

  it('mails the requester once the Pledge is saved, naming what was Pledged', async () => {
    const user = userEvent.setup();
    await grant(SEND_MAIL_SCOPE);
    store.updateMyPledge.mockResolvedValue({
      uid: 'char:1',
      lines: { 0: { quantity: 600, delivered: 0, contractIds: [] } },
      updatedAt: 1,
    });
    renderTab([wantsMail()]);
    await pledge(user, await open(user));
    await waitFor(() => expect(mail.sendMail).toHaveBeenCalledTimes(1));
    const [characterId, recipients, subject, body] = mail.sendMail.mock.calls[0];
    expect(characterId).toBe(1);
    expect(recipients).toEqual([{ recipient_id: 2, recipient_type: 'character' }]);
    expect(subject).toBe('Me Pledged on your Request in Pals');
    expect(body).toContain('600 × Tritanium');
    expect(body).toContain('community=c1&tab=requests');
    expect(mail.confirmPledgeMail).toHaveBeenCalledWith(1, { communityId: 'c1', requestId: 'r1' });
    expect(await screen.findByText('Mailed Aria Voss about your Pledge.')).toBeInTheDocument();
    // The Pledge was saved before any mail went out.
    expect(store.updateMyPledge.mock.invocationCallOrder[0]).toBeLessThan(
      mail.reservePledgeMail.mock.invocationCallOrder[0]
    );
  });

  it('does not mail when the Request did not ask for it', async () => {
    const user = userEvent.setup();
    await grant(SEND_MAIL_SCOPE);
    store.updateMyPledge.mockResolvedValue({
      uid: 'char:1',
      lines: { 0: { quantity: 600, delivered: 0, contractIds: [] } },
      updatedAt: 1,
    });
    renderTab([request({})]);
    await pledge(user, await open(user));
    await waitFor(() => expect(store.updateMyPledge).toHaveBeenCalled());
    expect(mail.reservePledgeMail).not.toHaveBeenCalled();
  });

  it('asks the server only once a mail is settled, not again on an update', async () => {
    const user = userEvent.setup();
    await grant(SEND_MAIL_SCOPE);
    store.updateMyPledge.mockResolvedValue({
      uid: 'char:1',
      lines: { 0: { quantity: 600, delivered: 0, contractIds: [] } },
      updatedAt: 1,
    });
    renderTab([wantsMail()], vi.fn(), { r1: [pledgeOf('char:1', 600)] });
    const panel = await open(user);
    await pledge(user, panel);
    await screen.findByText('Mailed Aria Voss about your Pledge.');
    await pledge(user, panel);
    await waitFor(() => expect(store.updateMyPledge).toHaveBeenCalledTimes(2));
    expect(mail.reservePledgeMail).toHaveBeenCalledTimes(1);
  });

  it('keeps the Pledge and says why the mail did not go: ESI refused it', async () => {
    const user = userEvent.setup();
    await grant(SEND_MAIL_SCOPE);
    const { EsiError } = await import('@/esi/errors');
    mail.sendMail.mockRejectedValue(new EsiError(403, 'no'));
    store.updateMyPledge.mockResolvedValue({
      uid: 'char:1',
      lines: { 0: { quantity: 600, delivered: 0, contractIds: [] } },
      updatedAt: 1,
    });
    renderTab([wantsMail()]);
    await pledge(user, await open(user));
    expect(await screen.findByText('Not mailed: the game refused the mail.')).toBeInTheDocument();
    expect(mail.releasePledgeMail).toHaveBeenCalled();
    expect(screen.queryByText(/couldn't save/i)).toBeNull();
  });

  it('says the daily mails are used, and says nothing when the server had already mailed', async () => {
    const user = userEvent.setup();
    await grant(SEND_MAIL_SCOPE);
    store.updateMyPledge.mockResolvedValue({
      uid: 'char:1',
      lines: { 0: { quantity: 600, delivered: 0, contractIds: [] } },
      updatedAt: 1,
    });
    mail.reservePledgeMail.mockRejectedValueOnce(
      Object.assign(new Error('cap'), { details: { reason: 'daily-cap' } })
    );
    renderTab([wantsMail()]);
    const panel = await open(user);
    await pledge(user, panel);
    expect(await screen.findByText(/used today's 100 Request mails/)).toBeInTheDocument();
    mail.reservePledgeMail.mockRejectedValueOnce(
      Object.assign(new Error('again'), { details: { reason: 'already-mailed' } })
    );
    await pledge(user, panel);
    await waitFor(() => expect(mail.reservePledgeMail).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Request mails/)).toBeNull());
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('sends nothing and offers the Grant link when the mail Permission is missing', async () => {
    const user = userEvent.setup();
    store.updateMyPledge.mockResolvedValue({
      uid: 'char:1',
      lines: { 0: { quantity: 600, delivered: 0, contractIds: [] } },
      updatedAt: 1,
    });
    renderTab([wantsMail()]);
    const panel = await open(user);
    // The Permission state resolves asynchronously, so wait for it rather than race it.
    expect(
      await within(panel).findByText(/Sending it needs the Send mail Permission/)
    ).toBeInTheDocument();
    await pledge(user, panel);
    await waitFor(() => expect(store.updateMyPledge).toHaveBeenCalled());
    expect(mail.reservePledgeMail).not.toHaveBeenCalled();
  });

  it('is not offered to the requester on their own Request', async () => {
    const user = userEvent.setup();
    renderTab([request({ ownerUid: 'char:1', notify: { app: true, mail: true } })]);
    await user.click(screen.getByText('Tritanium'));
    expect(screen.queryByText(/Send mail Permission/)).toBeNull();
  });
});
