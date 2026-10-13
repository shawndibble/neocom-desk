import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
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

/** @summary A Community you admin, opening on Blueprints › Everyone: the Community Library, with Manage (2 waiting) in the header. */
export const AdminEveryone: Story = {
  parameters: { shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}` } },
};

/** @summary The Community Library in the phone shell. */
export const AdminEveryonePhone: Story = { ...AdminEveryone, globals: phone };

/** @summary Fittings › Everyone: every Member's shared Fittings, each opening the editor. */
export const AdminFittingsEveryone: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=fittings` },
  },
};

/** @summary Skill plans › Everyone: the Community's shared plans with Copy to my plans. */
export const AdminPlansEveryone: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=plans` },
  },
};

/** @summary Fittings › Mine: the share-all switch, what you share with Stop sharing, and Add Fittings. */
export const AdminFittingsMine: Story = {
  parameters: {
    shell: {
      path: `/communities?community=${SAMPLE_ADMIN_COMMUNITY_ID}&tab=fittings&view=mine`,
    },
  },
};

/** @summary Skill plans › Mine in the phone shell. */
export const MemberPlansMinePhone: Story = {
  parameters: {
    shell: { path: `/communities?community=${SAMPLE_MEMBER_COMMUNITY_ID}&tab=plans&view=mine` },
  },
  globals: phone,
};

/** @summary A Community you only belong to, on Fittings › Everyone: no Manage menu. */
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
