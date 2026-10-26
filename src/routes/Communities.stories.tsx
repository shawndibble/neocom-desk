import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { walletFixtureRoutes } from '@/storybook/esiFixtureRoutes';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { setCommunityBackendOverride } from '@/features/communities/communityStore';
import {
  createCommunitiesFixture,
  SAMPLE_ADMIN_COMMUNITY_ID,
  SAMPLE_MEMBER_COMMUNITY_ID,
} from '@/storybook/communitiesFixture';
import { AskToCopyDialog } from '@/features/communities/AskToCopyDialog';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';
import { Communities } from './Communities';

/** Sample Communities answer in place of the backend, fresh per story so a change never leaks into the next. */
function SampleCommunities({
  children,
  deliveryDemo,
}: {
  children: ReactNode;
  deliveryDemo: boolean;
}) {
  // A layout effect, so the override is in place before the page's own load effects run.
  useLayoutEffect(() => {
    setCommunityBackendOverride(createCommunitiesFixture(Date.now(), { deliveryDemo }));
    return () => setCommunityBackendOverride(null);
  }, [deliveryDemo]);
  return children;
}

const withSampleCommunities: Decorator = (Story, context) => (
  <SampleCommunities deliveryDemo={context.parameters.deliveryDemo === true}>
    <Story />
  </SampleCommunities>
);

const meta = {
  title: 'pages/Communities',
  component: Communities,
  decorators: [withSampleCommunities],
  parameters: { layout: 'fullscreen', shell: { path: '/communities' } },
} satisfies Meta<typeof Communities>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The pilot's saved Fittings (My sharing › Fittings reads them from ESI): none, so the story shows what is shared. */
const fittingsRoutes = (): FixtureRoute[] => [
  { path: /^\/characters\/\d+\/fittings$/, respond: () => ({ body: [] }) },
];

const phone = { viewport: { value: 'mobile1', isRotated: false } } as const;

/** @summary Your Communities with the list only: one you admin, one you belong to. */
export const List: Story = {};

/** @summary The same list in the phone shell. */
export const ListPhone: Story = { globals: phone };

/** @summary A Community you admin, opening on Blueprints: the Community Library under your sharing line, with Manage (2 waiting) in the header card. */
export const AdminEveryone: Story = {
  parameters: { shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}` } },
};

/** @summary The Community Library in the phone shell. */
export const AdminEveryonePhone: Story = { ...AdminEveryone, globals: phone };

/** @summary Fittings: every Member's shared Fittings, each opening the editor. */
export const AdminFittingsEveryone: Story = {
  parameters: {
    shell: {
      path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=fittings`,
      routes: fittingsRoutes,
    },
  },
};

/** @summary Skill plans: the Community's shared plans with Copy to my plans. */
export const AdminPlansEveryone: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=plans` },
  },
};

/** @summary Fittings › My sharing open: the share-all switch, what you share with Stop sharing, and Add Fittings. */
export const AdminFittingsMine: Story = {
  parameters: {
    shell: {
      path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=fittings&view=mine`,
      routes: fittingsRoutes,
    },
  },
};

/** @summary Skill plans › My sharing in the phone shell. */
export const MemberPlansMinePhone: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_MEMBER_COMMUNITY_ID}&tab=plans&view=mine` },
  },
  globals: phone,
};

/** @summary A Community you only belong to, on Fittings: no Manage menu in its header card. */
export const MemberEveryone: Story = {
  parameters: {
    shell: {
      path: `/communities?community=${SAMPLE_MEMBER_COMMUNITY_ID}&tab=fittings`,
      routes: fittingsRoutes,
    },
  },
};

/** @summary A Community you admin, open on Members: a row menu on each other Member. */
export const AdminMembers: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=members` },
  },
};

/** @summary The admin's Members tab in the phone shell. */
export const AdminMembersPhone: Story = {
  ...AdminMembers,
  globals: phone,
};

/** @summary A Community you only belong to, on Members: no row menus, Leave at the foot. */
export const MemberView: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_MEMBER_COMMUNITY_ID}&tab=members` },
  },
};

/** @summary Manage › Invites (an old `?tab=invites` link opens it): join requests, approval switch, link, mail invites. */
export const AdminInvites: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=invites` },
  },
};

const requestsPath = (id: string) => `/communities?community=${id}&tab=requests`;

/** The sample pilot is in Efa (Khanid), and holds the location and Open in EVE Permissions. */
const requestsRoutes = (): FixtureRoute[] => [
  ...walletFixtureRoutes(),
  {
    path: /^\/characters\/(\d+)\/location$/,
    respond: () => ({ body: { solar_system_id: 30003892, station_id: 60012601 } }),
  },
];
const requestsScopes = [
  'esi-contracts.read_character_contracts.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-characters.read_loyalty.v1',
  'esi-location.read_location.v1',
  'esi-ui.open_window.v1',
] as const;
const requestsShell = (id: string) => ({
  path: requestsPath(id),
  routes: requestsRoutes,
  scopes: requestsScopes,
});

/** Clicks the board row whose first line is `name`, the way a pilot opens its side panel. */
const openRequest =
  (name: string): Story['play'] =>
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(new RegExp(`^${name}`)));
  };

/** @summary Requests: the board of the Community's Requests, Open and Mine filters, search, a table. */
export const RequestsBoard: Story = {
  parameters: { shell: requestsShell(SAMPLE_ADMIN_COMMUNITY_ID) },
};

/** @summary The board with "I can fill" on: open Requests with a line for a blueprint you share. */
export const RequestsBoardCanFill: Story = {
  ...RequestsBoard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /^Filters/ }));
    await userEvent.click(await canvas.findByRole('button', { name: /^I can fill/ }));
  },
};

/** @summary The board limited to Requests within 5 jumps of the pilot (in Efa), with the count of those it cannot place. */
export const RequestsBoardNearby: Story = {
  ...RequestsBoard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /^Filters/ }));
    await userEvent.click(await canvas.findByRole('combobox', { name: 'Distance' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: 'Within 5 jumps' })
    );
    await canvas.findByText(/no place to measure from/, undefined, { timeout: 8000 });
  },
};

/** @summary Distance with no location Permission: the board says why distance can't be used, with the Grant link. */
export const RequestsBoardNoLocationGrant: Story = {
  parameters: {
    shell: {
      ...requestsShell(SAMPLE_ADMIN_COMMUNITY_ID),
      scopes: ['esi-wallet.read_character_wallet.v1', 'esi-characters.read_loyalty.v1'],
    },
  },
};

/** @summary The Requests board in the phone shell (dense cards). */
export const RequestsBoardPhone: Story = { ...RequestsBoard, globals: phone };

/** @summary A Request opened as a Member: terms, each line's progress and its Pledge controls. */
export const RequestsPanelAsMember: Story = {
  ...RequestsBoard,
  play: openRequest('Reactive Metals'),
};

/** @summary A Member's panel in the phone shell. */
export const RequestsPanelAsMemberPhone: Story = { ...RequestsPanelAsMember, globals: phone };

/** @summary Delivery marked from contracts: a copy counted but flagged ("runs 5, asked 10") and a typed amount marked manual, under the delivery sentence. */
export const RequestsPanelDelivery: Story = {
  parameters: { shell: requestsShell(SAMPLE_ADMIN_COMMUNITY_ID), deliveryDemo: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(/^Scan Acquisition Array/));
    await canvas.findByText(/runs 5, asked 10/);
  },
};

/** @summary The delivery panel in the phone shell. */
export const RequestsPanelDeliveryPhone: Story = { ...RequestsPanelDelivery, globals: phone };

/** @summary Without the Contracts Permission: the grant prompt (not an error) and a delivered-amount field per Pledged line. */
export const RequestsPanelNoContractsGrant: Story = {
  parameters: {
    shell: {
      ...requestsShell(SAMPLE_ADMIN_COMMUNITY_ID),
      scopes: requestsScopes.filter((scope) => !scope.includes('contracts')),
    },
    deliveryDemo: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(/^Reactive Metals/));
    await canvas.findByText(/Delivery can't be marked without the Contracts Permission/);
  },
};

/** @summary Your own Request: Extend 30 days and Close request. */
export const RequestsPanelAsRequester: Story = {
  ...RequestsBoard,
  play: openRequest('Ishtar Blueprint'),
};

/** @summary A Request opened by the admin: each Pledger with Remove, and Remove request. */
export const RequestsPanelAsAdmin: Story = {
  ...RequestsBoard,
  play: openRequest('Reactive Metals'),
};

/** @summary The admin's panel in the phone shell. */
export const RequestsPanelAsAdminPhone: Story = { ...RequestsPanelAsAdmin, globals: phone };

/** @summary My pledges: the slide-out of this Member's Pledges, opened from the strip. */
export const RequestsMyPledges: Story = {
  ...RequestsBoard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'My pledges' }));
  },
};

/** @summary My pledges in the phone shell. */
export const RequestsMyPledgesPhone: Story = { ...RequestsMyPledges, globals: phone };

/** @summary New request: location, terms, pasted list, editable lines, add an item, and how to hear about a Pledge (in the app / by in-game mail). */
export const RequestsCompose: Story = {
  ...RequestsBoard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /new request/i }));
    const dialog = within(document.body);
    await userEvent.type(await dialog.findByLabelText(/^Location/), 'Badivefi');
    await userEvent.click(dialog.getByLabelText(/Paste a list/));
    await userEvent.paste(
      'Reactive Metals\t350,000\nToxic Metals\t300,000\nChiral Structures\t175,000'
    );
    await dialog.findByText('Chiral Structures', { selector: 'span' });
  },
};

/** @summary New request in the phone shell. */
export const RequestsComposePhone: Story = { ...RequestsCompose, globals: phone };

/** @summary A Community with no Requests yet. */
export const RequestsEmpty: Story = {
  parameters: { shell: requestsShell(SAMPLE_MEMBER_COMMUNITY_ID) },
};

/** What BPC Sourcing opens from a Community Offer row's "ask <name> to copy…": Rifter Blueprint (a BPO) held by Ilvara Nokk. */
const askToCopy = (communities: { id: string; name: string }[]): Story => ({
  render: () => (
    <AskToCopyDialog
      characterId={SAMPLE_ACTIVE_CHARACTER.characterId}
      offer={{
        source: 'community',
        typeId: 691,
        runs: -1,
        memberUid: 'char:2119000001',
        communities,
      }}
      blueprintName="Rifter Blueprint"
      holderName="Ilvara Nokk"
      onClose={() => undefined}
    />
  ),
});

const brass = { id: SAMPLE_ADMIN_COMMUNITY_ID, name: 'Brass Meridian Industrialists' };
const providence = { id: SAMPLE_MEMBER_COMMUNITY_ID, name: 'Providence Mining Co-op' };

/** @summary Ask to copy (BPC Sourcing): compose opens with one Rifter Blueprint line, quantity 1. */
export const AskToCopyCompose: Story = askToCopy([brass]);

/** @summary Ask to copy in the phone shell. */
export const AskToCopyComposePhone: Story = { ...AskToCopyCompose, globals: phone };

/** @summary Ask to copy when the holder shares it in two Communities: pick which one first. */
export const AskToCopyPickCommunity: Story = askToCopy([brass, providence]);
