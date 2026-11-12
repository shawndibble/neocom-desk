import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import {
  seedVettingCorporation,
  VETTING_SHELL_SCOPES,
  vettingShellRoutes,
} from '@/storybook/vettingShell';
import { withSampleVetting } from '@/storybook/withSampleVetting';
import { VETTING_FIXTURE_REVIEWS } from '@/storybook/vettingFixture';
import { CorpVetting } from './CorpVetting';

const directorRoutes = vettingShellRoutes(['Director']);
const recruiterRoutes = vettingShellRoutes(['Personnel_Manager']);

const shell = (path: string, routes = directorRoutes) => ({
  path,
  routes,
  scopes: VETTING_SHELL_SCOPES,
  seed: seedVettingCorporation,
});

/**
 * `/corp/vetting`, the corp's side: the queue of reviews, one review's report, and settings.
 * The real route in the app shell, against the in-memory `vettingFixture` backend (sample
 * data; reports worked out by the real checks). Kestrel Vane, a Director, is reviewing.
 */
const meta = {
  title: 'pages/CorpVetting',
  component: CorpVetting,
  decorators: [withSampleVetting],
  parameters: { layout: 'fullscreen', vetting: {}, shell: shell('/corp/vetting/open') },
} satisfies Meta<typeof CorpVetting>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'phone390', isRotated: false } } as const;
const report = (id: string) => ({ shell: shell(`/corp/vetting/open/${id}`) });

/** @summary Queue: applications and promotions in one list, result in words, sign-offs with "Yours needed". */
export const Queue: Story = {};
/** @summary Phone: the queue as dense cards under a segmented control. */
export const QueuePhone: Story = { globals: phone };

/** @summary Empty queue: how a review starts. */
export const Empty: Story = { parameters: { vetting: { empty: true } } };

/** @summary Vetting off: Copy apply link is inert with its reason, and a line says who turns it on. */
export const VettingOff: Story = { parameters: { vetting: { on: false } } };

/** @summary Application report with three flags: result line, flags with the rows behind them, could-not-check, decision rail. */
export const Flagged: Story = { parameters: report(VETTING_FIXTURE_REVIEWS.flagged) };
/** @summary Phone: the flagged report in one column, the decision after the findings. */
export const FlaggedPhone: Story = { ...Flagged, globals: phone };

/** @summary Nothing found: a neutral result line that says it is not a verdict, every check listed. */
export const NothingFound: Story = { parameters: report(VETTING_FIXTURE_REVIEWS.nothing) };

/** @summary Incomplete: the pilot did not share two sources, so three checks could not run. */
export const Incomplete: Story = { parameters: report(VETTING_FIXTURE_REVIEWS.incomplete) };

/** @summary Promotion to Director: two sign-offs, the first hidden until the caller decides, the asker barred. */
export const Promotion: Story = { parameters: report(VETTING_FIXTURE_REVIEWS.promotion) };
/** @summary Phone: the promotion report. */
export const PromotionPhone: Story = { ...Promotion, globals: phone };

/** @summary Reject: the confirm that needs a reason before it acts. */
export const RejectDialog: Story = {
  ...Flagged,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: 'Reject' }));
    await body.findByRole('dialog', { name: 'Reject Tamsin Vell' });
  },
};

/** @summary Decided: reviews that are over, kept 30 days. */
export const Decided: Story = { parameters: { shell: shell('/corp/vetting/decided') } };

/** @summary Settings (Director): on or off, sign-offs needed per kind, the watchlist. */
export const Settings: Story = { parameters: { shell: shell('/corp/vetting/settings') } };
/** @summary Phone: settings. */
export const SettingsPhone: Story = { ...Settings, globals: phone };

/** @summary A Personnel Manager reviews but has no Settings tab. */
export const Recruiter: Story = {
  parameters: {
    vetting: { canConfigure: false },
    shell: shell('/corp/vetting/open', recruiterRoutes),
  },
};

/** @summary "Review a member": the exact name and the role they are up for. */
export const ReviewMember: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: 'Review a member' }));
    await body.findByRole('dialog', { name: 'Review a member' });
  },
};
