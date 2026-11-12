import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ApplyCharacters,
  ApplySent,
  ApplyStart,
  PHONE,
  PromotionRequest,
} from './vettingApplicantParts';
import { APPLICANT_CHARACTERS, MEMBER_CHARACTERS } from './vettingFixtures';

/**
 * Vetting, the pilot's side. First draft; sample data.
 *
 * - **Apply link** (`/apply/<corp>`, public like `/survey`): a visitor with no
 *   account sees the mark and the page, not the rail. One EVE sign-in per
 *   character, and that sign-in asks for exactly what the report reads, so
 *   there is no separate "log in to the app" step.
 * - What is read, what is not, and how long it is kept are stated before the
 *   sign-in button. Mail is "who and subject, never the message".
 * - The character list is the page's working state. A character that declined
 *   a Permission stays in the list as "Part missing" with Sign in again; the
 *   report then says that check could not run.
 * - "These are all my characters" is a statement the applicant makes, with the
 *   reason it matters said plainly.
 * - Send is the one primary action. After it: what was kept, who has opened
 *   the report, and Withdraw.
 * - **Promotion request** (inside the app): who asked and for which role,
 *   characters already signed in on this device are ticked with no second
 *   sign-in, and Decline is a real choice the reviewers are told about.
 *
 * New components in this mockup: `VettingConsentTerms` (will see / not read,
 * not kept / you stay in control), `VettingCharacterList` (portrait, name,
 * corp, read state, fix line), `VettingOpenedBy` (who opened the report, when
 * it is deleted). Everything else is `Panel`, `PageHeader`, `Button`,
 * `Checkbox`, `TextArea`, `Pill`, `Spinner` and `EveSsoButton`.
 */
const meta = {
  title: 'mockups/VettingApplicant',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Apply link, step one: how it works, what is shared and what is not, then CCP's sign-in button. */
export const Start1440: Story = { render: () => <ApplyStart /> };
/** @summary Phone: the same page in one column. */
export const Start390: Story = {
  render: () => <ApplyStart />,
  globals: { viewport: PHONE.viewport },
};

/** @summary Step two: three characters added (one with Mail missing), all-my-characters statement, note, Send. */
export const Characters1440: Story = {
  render: () => <ApplyCharacters characters={APPLICANT_CHARACTERS} />,
};
/** @summary Phone: the character list with Send below it. */
export const Characters390: Story = {
  render: () => <ApplyCharacters characters={APPLICANT_CHARACTERS} />,
  globals: { viewport: PHONE.viewport },
};

/** @summary Sent: what was kept, who has opened the report, Withdraw. */
export const Sent1440: Story = { render: () => <ApplySent /> };
/** @summary Phone: sent. */
export const Sent390: Story = {
  render: () => <ApplySent />,
  globals: { viewport: PHONE.viewport },
};

const SHELL = { layout: 'fullscreen', shell: { path: '/corp/vetting/request' } };

/** @summary Member's promotion-review request in the app: who asked, for which role, characters ticked, Share or Decline. */
export const Promotion1440: Story = {
  parameters: SHELL,
  render: () => <PromotionRequest characters={MEMBER_CHARACTERS} />,
};
/** @summary Phone: the promotion request in one column. */
export const Promotion390: Story = {
  parameters: SHELL,
  render: () => <PromotionRequest characters={MEMBER_CHARACTERS} />,
  globals: { viewport: PHONE.viewport },
};
