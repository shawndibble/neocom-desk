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

function SampleCommunities({
  children,
  deliveryDemo,
}: {
  children: ReactNode;
  deliveryDemo: boolean;
}) {
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

const fittingsRoutes = (): FixtureRoute[] => [
  { path: /^\/characters\/\d+\/fittings$/, respond: () => ({ body: [] }) },
];

const phone = { viewport: { value: 'mobile1', isRotated: false } } as const;

export const List: Story = {};

export const ListPhone: Story = { globals: phone };

export const AdminEveryone: Story = {
  parameters: { shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}` } },
};

export const AdminEveryonePhone: Story = { ...AdminEveryone, globals: phone };

export const AdminFittingsEveryone: Story = {
  parameters: {
    shell: {
      path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=fittings`,
      routes: fittingsRoutes,
    },
  },
};

export const AdminPlansEveryone: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=plans` },
  },
};

export const AdminFittingsMine: Story = {
  parameters: {
    shell: {
      path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=fittings&view=mine`,
      routes: fittingsRoutes,
    },
  },
};

export const MemberPlansMinePhone: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_MEMBER_COMMUNITY_ID}&tab=plans&view=mine` },
  },
  globals: phone,
};

export const MemberEveryone: Story = {
  parameters: {
    shell: {
      path: `/communities?community=${SAMPLE_MEMBER_COMMUNITY_ID}&tab=fittings`,
      routes: fittingsRoutes,
    },
  },
};

export const AdminMembers: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=members` },
  },
};

export const AdminMembersPhone: Story = {
  ...AdminMembers,
  globals: phone,
};

export const MemberView: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_MEMBER_COMMUNITY_ID}&tab=members` },
  },
};

export const AdminInvites: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=invites` },
  },
};

const requestsPath = (id: string) => `/communities?community=${id}&tab=requests`;

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

const openRequest =
  (name: string): Story['play'] =>
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(new RegExp(`^${name}`)));
  };

export const RequestsBoard: Story = {
  parameters: { shell: requestsShell(SAMPLE_ADMIN_COMMUNITY_ID) },
};

export const RequestsBoardCanFill: Story = {
  ...RequestsBoard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /^Filters/ }));
    await userEvent.click(await canvas.findByRole('button', { name: /^I can fill/ }));
  },
};

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

export const RequestsBoardNoLocationGrant: Story = {
  parameters: {
    shell: {
      ...requestsShell(SAMPLE_ADMIN_COMMUNITY_ID),
      scopes: ['esi-wallet.read_character_wallet.v1', 'esi-characters.read_loyalty.v1'],
    },
  },
};

export const RequestsBoardPhone: Story = { ...RequestsBoard, globals: phone };

export const RequestsPanelAsMember: Story = {
  ...RequestsBoard,
  play: openRequest('Reactive Metals'),
};

export const RequestsPanelAsMemberPhone: Story = { ...RequestsPanelAsMember, globals: phone };

export const RequestsPanelDelivery: Story = {
  parameters: { shell: requestsShell(SAMPLE_ADMIN_COMMUNITY_ID), deliveryDemo: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(/^Scan Acquisition Array/));
    await canvas.findByText(/runs 5, asked 10/);
  },
};

export const RequestsPanelDeliveryPhone: Story = { ...RequestsPanelDelivery, globals: phone };

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
    await canvas.findByText(
      /Without the Contracts Permission, deliveries aren't counted automatically/
    );
  },
};

export const RequestsPanelAsRequester: Story = {
  ...RequestsBoard,
  play: openRequest('Ishtar Blueprint'),
};

export const RequestsPanelAsAdmin: Story = {
  ...RequestsBoard,
  play: openRequest('Reactive Metals'),
};

export const RequestsPanelAsAdminPhone: Story = { ...RequestsPanelAsAdmin, globals: phone };

export const RequestsMyPledges: Story = {
  ...RequestsBoard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'My pledges' }));
  },
};

export const RequestsMyPledgesPhone: Story = { ...RequestsMyPledges, globals: phone };

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

export const RequestsComposePhone: Story = { ...RequestsCompose, globals: phone };

export const RequestsEmpty: Story = {
  parameters: { shell: requestsShell(SAMPLE_MEMBER_COMMUNITY_ID) },
};

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

export const AskToCopyCompose: Story = askToCopy([brass]);

export const AskToCopyComposePhone: Story = { ...AskToCopyCompose, globals: phone };

export const AskToCopyPickCommunity: Story = askToCopy([brass, providence]);
