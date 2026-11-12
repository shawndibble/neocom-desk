import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import {
  seedVettingCorporation,
  VETTING_SHELL_SCOPES,
  vettingShellRoutes,
} from '@/storybook/vettingShell';
import { withSampleVetting } from '@/storybook/withSampleVetting';
import { VETTING_FIXTURE_CONFIGURED, VETTING_FIXTURE_REVIEWS } from '@/storybook/vettingFixture';
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

const configured = { settings: VETTING_FIXTURE_CONFIGURED };
const inviteOnly = { settings: { ...VETTING_FIXTURE_CONFIGURED, inviteOnly: true } };
const settings = (section: string) => ({
  vetting: configured,
  shell: shell(`/corp/vetting/settings/${section}`),
});

/** @summary Settings (Director), General: on or off, the welcome message and the contact line. */
export const Settings: Story = { parameters: { shell: shell('/corp/vetting/settings') } };
/** @summary Settings, General, for a corp that wrote its welcome and contact line. */
export const SettingsGeneral: Story = { parameters: settings('general') };
/** @summary Settings, Applicants: minimums, the ordered questions, invite-only and the way to the invite links. */
export const SettingsApplicants: Story = { parameters: settings('applicants') };
/** @summary Settings, Decisions: sign-offs, how a no reads, the reason, the mail, the reviewers' notification. */
export const SettingsDecisions: Story = { parameters: settings('decisions') };
/** @summary Settings, Watchlist: who the checks look for. */
export const SettingsWatchlist: Story = { parameters: settings('watchlist') };
/** @summary Settings with an edit not yet saved: the section is marked and the bar pins Discard and Save. */
export const SettingsUnsaved: Story = {
  ...SettingsGeneral,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(await body.findByLabelText('Contact line'), ' Or mail us.');
    await body.findByText('Unsaved changes');
  },
};
/** @summary Phone: every settings section in one page, each under its heading. */
export const SettingsPhone: Story = { ...SettingsApplicants, globals: phone };

/** @summary Invite-only corp: the header makes an invite link, and the queue shows where an application came from. */
export const QueueInviteOnly: Story = { parameters: { vetting: inviteOnly } };

/** @summary "New invite link": who it is for, then the link with Copy. */
export const InviteDialog: Story = {
  ...QueueInviteOnly,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: 'New invite link' }));
    const dialog = within(await body.findByRole('dialog', { name: 'New invite link' }));
    await userEvent.type(dialog.getByLabelText('Who it is for'), 'Sio Tane');
    await userEvent.click(dialog.getByRole('button', { name: 'Create link' }));
    await dialog.findByRole('button', { name: 'Copy link for Sio Tane' });
  },
};

const openInvites: Story['play'] = async ({ canvasElement }) => {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(await body.findByRole('button', { name: 'Invites' }));
  await body.findByRole('dialog', { name: 'Invite links' });
};

/** @summary Invite links: who each is for, who made it, when, how many applications it started, Copy link and Revoke. */
export const InvitesList: Story = { ...QueueInviteOnly, play: openInvites };
/** @summary Phone: the invite links as a sheet. */
export const InvitesListPhone: Story = { ...InvitesList, globals: phone };

/** @summary Report of a corp that asks questions: "Their answers" beside "Their note". */
export const ReportAnswers: Story = {
  parameters: { vetting: configured, ...report(VETTING_FIXTURE_REVIEWS.flagged) },
};
/** @summary Phone: the note, then the answers, in one column. */
export const ReportAnswersPhone: Story = { ...ReportAnswers, globals: phone };

/** @summary Reject where the corp shows the reason: the confirm says the pilot will see it. */
export const RejectDialogReasonShown: Story = { ...ReportAnswers, play: RejectDialog.play };

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
