import type { Meta, StoryObj } from '@storybook/react-vite';
import { ApplyPage } from '@/features/corp/vetting/ApplyPage';
import { VettingPublicFrame } from '@/features/corp/vetting/VettingPublicFrame';
import type { VettingLoginOutcome } from '@/features/corp/vetting/vettingLoginState';
import { withSampleVetting } from '@/storybook/withSampleVetting';
import { VETTING_FIXTURE_APPLICANT, VETTING_FIXTURE_CORPORATION } from '@/storybook/vettingFixture';

const noop = () => {};

interface ApplyStoryProps {
  corporationId: number | null;
  login: VettingLoginOutcome | null;
}

/** The route's own frame around the page body; the EVE login round trip is the `login` arg. */
function ApplyStory({ corporationId, login }: ApplyStoryProps) {
  return (
    <VettingPublicFrame>
      <ApplyPage corporationId={corporationId} login={login} onSignIn={noop} onOpenApp={noop} />
    </VettingPublicFrame>
  );
}

/**
 * `/apply/<corporationId>`, the public apply page: no account, one EVE login per character.
 * The page body the route draws, against the in-memory `vettingFixture` backend; `login` stands
 * in for coming back from EVE.
 */
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

/** @summary Step one: how it works, what is shared and what is not, then CCP's login button. */
export const Start: Story = {};
/** @summary Phone: the same page in one column. */
export const StartPhone: Story = { globals: phone };

/** @summary Back from EVE with the first character: its row says "Reading" while the server reads it. */
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

/** @summary Three characters added (one with Mail missing), the all-my-characters statement, note, Send. */
export const Characters: Story = { parameters: { vetting: { application: 'draft' } } };
/** @summary Phone: the character list with Send below it. */
export const CharactersPhone: Story = { ...Characters, globals: phone };

/** @summary Where Send lands: waiting, what happens next, nobody has opened it, Withdraw, the optional app offer. */
export const Sent: Story = { parameters: { vetting: { application: 'sent' } } };
/** @summary Phone: the status page. */
export const SentPhone: Story = { ...Sent, globals: phone };

/** @summary A reviewer opened the report: the pilot sees who and when. */
export const Opened: Story = { parameters: { vetting: { application: 'opened' } } };

/** @summary Accepted: the in-game step, who opened the report, the day it is deleted. */
export const Accepted: Story = { parameters: { vetting: { application: 'accepted' } } };

/** @summary The login was cancelled on EVE's page: nothing was read. */
export const LoginCancelled: Story = { args: { login: { status: 'cancelled' } } };

/** @summary The corp has vetting off. */
export const VettingOff: Story = { parameters: { vetting: { on: false } } };

/** @summary A link to a corporation that is not there. */
export const NotFound: Story = { args: { corporationId: 1 } };
