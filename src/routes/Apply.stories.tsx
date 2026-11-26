import type { Meta, StoryObj } from '@storybook/react-vite';
import { ApplyPage } from '@/features/corp/vetting/ApplyPage';
import { VettingPublicFrame } from '@/features/corp/vetting/VettingPublicFrame';
import type { VettingLoginOutcome } from '@/features/corp/vetting/vettingLoginState';
import { withSampleVetting } from '@/storybook/withSampleVetting';
import {
  VETTING_FIXTURE_APPLICANT,
  VETTING_FIXTURE_CONFIGURED,
  VETTING_FIXTURE_CORPORATION,
} from '@/storybook/vettingFixture';

const noop = () => {};

interface ApplyStoryProps {
  corporationId: number | null;
  login: VettingLoginOutcome | null;
  invite?: string;
}

function ApplyStory({ corporationId, login, invite }: ApplyStoryProps) {
  return (
    <VettingPublicFrame>
      <ApplyPage
        corporationId={corporationId}
        invite={invite}
        login={login}
        onSignIn={noop}
        onOpenApp={noop}
      />
    </VettingPublicFrame>
  );
}

const meta = {
  title: 'pages/Apply',
  component: ApplyStory,
  decorators: [withSampleVetting],
  parameters: { layout: 'fullscreen', vetting: {} },
  args: { corporationId: VETTING_FIXTURE_CORPORATION.corporationId, login: null },
} satisfies Meta<typeof ApplyStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'phone390', isRotated: false } } as const;
const [main] = VETTING_FIXTURE_APPLICANT;

export const Start: Story = {};
export const StartPhone: Story = { globals: phone };

export const Reading: Story = {
  args: {
    login: {
      status: 'ok',
      accessToken: `fixture:${main.characterId}`,
      characterId: main.characterId,
      name: main.name,
    },
  },
  parameters: { vetting: { delayMs: 600_000 } },
};

export const Characters: Story = { parameters: { vetting: { application: 'draft' } } };
export const CharactersPhone: Story = { ...Characters, globals: phone };

export const Sent: Story = { parameters: { vetting: { application: 'sent' } } };
export const SentPhone: Story = { ...Sent, globals: phone };

export const Opened: Story = { parameters: { vetting: { application: 'opened' } } };

export const Accepted: Story = { parameters: { vetting: { application: 'accepted' } } };

export const LoginCancelled: Story = { args: { login: { status: 'cancelled' } } };

export const VettingOff: Story = { parameters: { vetting: { on: false } } };

export const NotFound: Story = { args: { corporationId: 1 } };

const configured = VETTING_FIXTURE_CONFIGURED;

export const StartConfigured: Story = { parameters: { vetting: { settings: configured } } };
export const StartConfiguredPhone: Story = { ...StartConfigured, globals: phone };

export const Questions: Story = {
  parameters: { vetting: { application: 'draft', settings: configured } },
};
export const QuestionsPhone: Story = { ...Questions, globals: phone };

export const BelowMinimum: Story = {
  parameters: {
    vetting: {
      application: 'draft',
      settings: { minimums: { ageDays: 3650, skillPoints: 100_000_000, characters: 5 } },
    },
  },
};

export const InviteOnly: Story = {
  parameters: { vetting: { settings: { ...configured, inviteOnly: true } } },
};
export const Invited: Story = { ...InviteOnly, args: { invite: 'inv-forum' } };

export const SentWithContact: Story = {
  parameters: { vetting: { application: 'sent', settings: configured } },
};
export const SentWithContactPhone: Story = { ...SentWithContact, globals: phone };

export const NotAtThisTime: Story = {
  parameters: { vetting: { application: 'rejected', settings: configured } },
};
export const Rejected: Story = { parameters: { vetting: { application: 'rejected' } } };
