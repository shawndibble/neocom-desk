import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { setCommunityBackendOverride } from '@/features/communities/communityStore';
import {
  createCommunitiesFixture,
  SAMPLE_ADMIN_COMMUNITY_ID,
  SAMPLE_MEMBER_COMMUNITY_ID,
} from '@/storybook/communitiesFixture';
import { Communities } from './Communities';

/** Sample Communities answer in place of the backend, fresh per story so a change never leaks into the next. */
function SampleCommunities({ children }: { children: ReactNode }) {
  // A layout effect, so the override is in place before the page's own load effects run.
  useLayoutEffect(() => {
    setCommunityBackendOverride(createCommunitiesFixture());
    return () => setCommunityBackendOverride(null);
  }, []);
  return children;
}

const withSampleCommunities: Decorator = (Story) => (
  <SampleCommunities>
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
    shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=fittings` },
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
    shell: { path: `/communities?community=${SAMPLE_MEMBER_COMMUNITY_ID}&tab=fittings` },
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

/** Clicks the board row whose first line is `name`, the way a pilot opens its side panel. */
const openRequest =
  (name: string): Story['play'] =>
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(new RegExp(`^${name}`)));
  };

/** @summary Requests: the board of the Community's Requests, Open and Mine filters, search, a table. */
export const RequestsBoard: Story = {
  parameters: { shell: { path: requestsPath(SAMPLE_ADMIN_COMMUNITY_ID) } },
};

/** @summary The Requests board in the phone shell (dense cards). */
export const RequestsBoardPhone: Story = { ...RequestsBoard, globals: phone };

/** @summary A Request opened as a Member: terms and each line's progress, read-only. */
export const RequestsPanelAsMember: Story = {
  ...RequestsBoard,
  play: openRequest('Reactive Metals'),
};

/** @summary A Member's panel in the phone shell. */
export const RequestsPanelAsMemberPhone: Story = { ...RequestsPanelAsMember, globals: phone };

/** @summary Your own Request: Extend 30 days and Close request. */
export const RequestsPanelAsRequester: Story = {
  ...RequestsBoard,
  play: openRequest('Ishtar Blueprint'),
};

/** @summary New request: location, terms, pasted list, editable lines, add an item. */
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
  parameters: { shell: { path: requestsPath(SAMPLE_MEMBER_COMMUNITY_ID) } },
};
