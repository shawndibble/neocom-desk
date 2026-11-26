import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import {
  seedVettingCorporation,
  vettingRosterRoutes,
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

export const Queue: Story = {};
export const QueuePhone: Story = { globals: phone };

export const Empty: Story = { parameters: { vetting: { empty: true } } };

export const VettingOff: Story = { parameters: { vetting: { on: false } } };

export const Flagged: Story = { parameters: report(VETTING_FIXTURE_REVIEWS.flagged) };
export const FlaggedPhone: Story = { ...Flagged, globals: phone };

const data = (source: string, query = '') => ({
  shell: shell(`/corp/vetting/open/${VETTING_FIXTURE_REVIEWS.flagged}/data/${source}${query}`),
});

export const DataWeRead: Story = { parameters: data('wallet') };
export const DataWeReadPhone: Story = { ...DataWeRead, globals: phone };
export const DataFlaggedRows: Story = { parameters: data('wallet', '?flagged=1') };
export const DataSkills: Story = { parameters: data('skills') };
export const DataHistory: Story = { parameters: data('history') };
export const DataEmptySource: Story = { parameters: data('contact') };

export const NothingFound: Story = { parameters: report(VETTING_FIXTURE_REVIEWS.nothing) };

export const Incomplete: Story = { parameters: report(VETTING_FIXTURE_REVIEWS.incomplete) };

export const Promotion: Story = { parameters: report(VETTING_FIXTURE_REVIEWS.promotion) };
export const PromotionPhone: Story = { ...Promotion, globals: phone };

export const RejectDialog: Story = {
  ...Flagged,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: 'Reject' }));
    await body.findByRole('dialog', { name: 'Reject Tamsin Vell' });
  },
};

export const Decided: Story = { parameters: { shell: shell('/corp/vetting/decided') } };

const configured = { settings: VETTING_FIXTURE_CONFIGURED };
const inviteOnly = { settings: { ...VETTING_FIXTURE_CONFIGURED, inviteOnly: true } };
const settings = (section: string) => ({
  vetting: configured,
  shell: shell(`/corp/vetting/settings/${section}`),
});

export const Settings: Story = { parameters: { shell: shell('/corp/vetting/settings') } };
export const SettingsGeneral: Story = { parameters: settings('general') };
export const SettingsApplicants: Story = { parameters: settings('applicants') };
export const SettingsDecisions: Story = { parameters: settings('decisions') };
export const SettingsWatchlist: Story = { parameters: settings('watchlist') };
export const SettingsUnsaved: Story = {
  ...SettingsGeneral,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(await body.findByLabelText('Contact line'), ' Or mail us.');
    await body.findByText('Unsaved changes');
  },
};
export const SettingsPhone: Story = { ...SettingsApplicants, globals: phone };

export const QueueInviteOnly: Story = { parameters: { vetting: inviteOnly } };

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

export const InvitesList: Story = { ...QueueInviteOnly, play: openInvites };
export const InvitesListPhone: Story = { ...InvitesList, globals: phone };

export const ReportAnswers: Story = {
  parameters: { vetting: configured, ...report(VETTING_FIXTURE_REVIEWS.flagged) },
};
export const ReportAnswersPhone: Story = { ...ReportAnswers, globals: phone };

export const RejectDialogReasonShown: Story = { ...ReportAnswers, play: RejectDialog.play };

export const Recruiter: Story = {
  parameters: {
    vetting: { canConfigure: false },
    shell: shell('/corp/vetting/open', recruiterRoutes),
  },
};

export const ReviewMember: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: 'Review a member' }));
    await body.findByRole('dialog', { name: 'Review a member' });
  },
};

export const ReviewMemberRoster: Story = {
  parameters: {
    shell: {
      ...shell('/corp/vetting/open', () => [...directorRoutes(), ...vettingRosterRoutes()]),
      scopes: [...VETTING_SHELL_SCOPES, 'esi-mail.send_mail.v1'],
    },
  },
  play: ReviewMember.play,
};

const requests = { vetting: { extra: 'requests' as const } };

export const QueueRequests: Story = { parameters: requests };

export const RequestedNoMail: Story = {
  parameters: report(VETTING_FIXTURE_REVIEWS.waiting),
};
export const RequestedNoMailPhone: Story = { ...RequestedNoMail, globals: phone };

export const RequestedMailed: Story = {
  parameters: { ...requests, ...report(VETTING_FIXTURE_REVIEWS.mailed) },
};

export const AboutYou: Story = {
  parameters: { ...requests, ...report(VETTING_FIXTURE_REVIEWS.aboutYou) },
};
