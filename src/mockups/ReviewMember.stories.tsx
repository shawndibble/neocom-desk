import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader, Spinner } from '@/components/ui';
import { VETTING_DEFAULT_SETTINGS, type VettingReview } from '@/engine/vetting';
import { ReviewMemberDialog } from '@/features/corp/vetting/ReviewMemberDialog';
import { VettingDecision } from '@/features/corp/vetting/VettingDecision';
import {
  seedVettingCorporation,
  VETTING_SHELL_SCOPES,
  vettingShellRoutes,
} from '@/storybook/vettingShell';
import {
  createVettingFixture,
  VETTING_FIXTURE_CORPORATION,
  VETTING_FIXTURE_REVIEWS,
} from '@/storybook/vettingFixture';
import { CorpVetting } from '@/routes/CorpVetting';
import { withSampleVetting } from '@/storybook/withSampleVetting';
import { CORP_NAME, PICKED, ROLE_PICKED } from './reviewMemberFixtures';
import {
  MailPreviewDialog,
  MemberRequestPage,
  OwnReviewPage,
  ProposedQueue,
  ProposedReviewMemberDialog,
  RequestedReviewPage,
} from './reviewMemberParts';

const meta = {
  title: 'mockups/ReviewMember',
  tags: ['!manifest'],
  decorators: [withSampleVetting],
  parameters: {
    layout: 'fullscreen',
    vetting: {},
    shell: {
      path: '/corp/vetting/open',
      routes: vettingShellRoutes(['Director']),
      scopes: VETTING_SHELL_SCOPES,
      seed: seedVettingCorporation,
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { globals: { viewport: { value: 'mobile1', isRotated: false } } } as const;

const behind = (
  <div className="mx-auto max-w-page px-4 pt-4">
    <PageHeader title="Vetting" meta={CORP_NAME} />
  </div>
);

function Rail() {
  const [review, setReview] = useState<VettingReview | null>(null);
  useEffect(() => {
    void createVettingFixture()
      .open(2119876543, VETTING_FIXTURE_CORPORATION.corporationId, VETTING_FIXTURE_REVIEWS.waiting)
      .then((found) => setReview({ ...found, state: 'open', barred: true }));
  }, []);
  if (review === null) return <Spinner block="page" label="Loading" />;
  return (
    <VettingDecision
      review={review}
      reviewerId={2119876543}
      settings={VETTING_DEFAULT_SETTINGS}
      onDecide={async () => undefined}
    />
  );
}

export const Today: Story = {
  render: () => (
    <>
      {behind}
      <ReviewMemberDialog
        roster={{ status: 'unreadable' }}
        mark={(members) => [...members]}
        onClose={() => undefined}
        onRequest={async () => null}
      />
    </>
  ),
};
export const TodayPhone: Story = { ...Today, ...PHONE };

export const DialogEmpty: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog />
    </>
  ),
};
export const DialogEmptyPhone: Story = { ...DialogEmpty, ...PHONE };

export const DialogTyping: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog query="ren" />
    </>
  ),
};
export const DialogTypingPhone: Story = { ...DialogTyping, ...PHONE };

export const DialogNoMatch: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog query="Zara Quil" />
    </>
  ),
};
export const DialogNoMatchPhone: Story = { ...DialogNoMatch, ...PHONE };

export const DialogAlreadyWaiting: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog query="el" />
    </>
  ),
};
export const DialogAlreadyWaitingPhone: Story = {
  ...DialogAlreadyWaiting,
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog query="el" />
    </>
  ),
  ...PHONE,
};

export const DialogPicked: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog picked={PICKED} role="Acc" />
    </>
  ),
};
export const DialogPickedPhone: Story = { ...DialogPicked, ...PHONE };

export const DialogRosterMissing: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog rosterMissing query="Ren Halvard" role={ROLE_PICKED} />
    </>
  ),
};

export const ResultOffer: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog picked={PICKED} role={ROLE_PICKED} step="asked" />
    </>
  ),
};
export const ResultOfferPhone: Story = { ...ResultOffer, ...PHONE };

export const ResultMailed: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog picked={PICKED} role={ROLE_PICKED} step="mailed" />
    </>
  ),
};

export const MailPreview: Story = {
  render: () => (
    <>
      {behind}
      <MailPreviewDialog onClose={() => undefined} />
    </>
  ),
};
export const MailPreviewPhone: Story = { ...MailPreview, ...PHONE };

export const QueueRows: Story = {
  render: () => <ProposedQueue />,
};
export const QueueRowsPhone: Story = { ...QueueRows, ...PHONE };

export const PageRequestedNoMail: Story = {
  render: () => <RequestedReviewPage mail="none" rail={<Rail />} />,
};
export const PageRequestedMailed: Story = {
  render: () => <RequestedReviewPage mail="sent" rail={<Rail />} />,
};
export const PageRequestedPhone: Story = { ...PageRequestedMailed, ...PHONE };

export const PageShared: Story = {
  render: () => <CorpVetting />,
  parameters: {
    shell: {
      path: `/corp/vetting/open/${VETTING_FIXTURE_REVIEWS.promotion}`,
      routes: vettingShellRoutes(['Director']),
      scopes: VETTING_SHELL_SCOPES,
      seed: seedVettingCorporation,
    },
  },
};
export const PageSharedPhone: Story = { ...PageShared, ...PHONE };

export const PageAboutYou: Story = { render: () => <OwnReviewPage /> };

export const MemberPage: Story = { render: () => <MemberRequestPage /> };
export const MemberPagePhone: Story = { ...MemberPage, ...PHONE };
