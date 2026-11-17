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

/**
 * Vetting › "Review a member": an officer asks a member for a review before a promotion.
 * Redesign: the name is picked from the corporation's roster (autocomplete), the role has
 * suggestions, and the member is told, by an in-game mail the officer sends on purpose. Also
 * the member's page top, and the review page an officer opens from the queue, before and after
 * the member shares. Decisions: docs/design/mockups/review-member/README.md.
 *
 * New components in this mockup: `MemberCombobox` (roster autocomplete, with the picked state),
 * `RoleField` (free text with suggestions), `TellMemberStep` (the result's mail offer),
 * `ReviewMailPreview` (a dialog, named here and not dashed-boxed: its dashed label would sit in
 * the modal chrome), `WaitingQueueRows` (the queue's waiting rows with mail state and menu),
 * `RequestPanel` (the review page's request block), `RequestIntro` (the member page's top).
 * The decision rail and the shared report are the real components. Everything else is a
 * primitive.
 */
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

/** The page behind every dialog story: the Vetting header, nothing to compete with the dialog. */
const behind = (
  <div className="mx-auto max-w-page px-4 pt-4">
    <PageHeader title="Vetting" meta={CORP_NAME} />
  </div>
);

/** The real decision rail of a review, from the in-memory fixture, with the asker barred. */
function Rail() {
  const [review, setReview] = useState<VettingReview | null>(null);
  useEffect(() => {
    void createVettingFixture()
      .open(2119876543, VETTING_FIXTURE_CORPORATION.corporationId, VETTING_FIXTURE_REVIEWS.waiting)
      // The real rail only draws the asker's bar for an open review; a requested one needs the same
      // line, so this shows it that way (a build change, listed in the README).
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

// ------------------------------------------------------------------- Today

/** @summary Today: two plain text inputs (exact in-game name, free-text role); a wrong name only fails after Ask. */
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
/** @summary Phone: today's dialog as a sheet. */
export const TodayPhone: Story = { ...Today, ...PHONE };

// ---------------------------------------------------------------- Proposed dialog

/** @summary Proposed, empty: the whole roster in a list (scrolls, all 187 reachable), a search field on top, role suggestions below. New components: MemberCombobox, RoleField. */
export const DialogEmpty: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog />
    </>
  ),
};
/** @summary Phone: the same in a sheet; the list sits in the flow under the field, never under the keyboard. */
export const DialogEmptyPhone: Story = { ...DialogEmpty, ...PHONE };

/** @summary Typing "ren": names starting with it first, then names containing it, the match in accent bold, a count under the list. New component: MemberCombobox. */
export const DialogTyping: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog query="ren" />
    </>
  ),
};
/** @summary Phone: typing. */
export const DialogTypingPhone: Story = { ...DialogTyping, ...PHONE };

/** @summary No match: says the name is not in this corporation before Ask, and what to do (apply link for an applicant). */
export const DialogNoMatch: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog query="Zara Quil" />
    </>
  ),
};
/** @summary Phone: no match. */
export const DialogNoMatchPhone: Story = { ...DialogNoMatch, ...PHONE };

/** @summary Already waiting (query "el"): Pell stays in the list, dimmed, "Review waiting", who asked and when; not pickable. You (the officer) are the same, "You". */
export const DialogAlreadyWaiting: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog query="el" />
    </>
  ),
};
/** @summary Phone: the waiting member in the list. */
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

/** @summary Picked + role: the member becomes a card (portrait, title, last seen, Change); typing "acc" narrows the role suggestions; Ask is ready. New components: MemberCombobox, RoleField. */
export const DialogPicked: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog picked={PICKED} role="Acc" />
    </>
  ),
};
/** @summary Phone: picked + role. */
export const DialogPickedPhone: Story = { ...DialogPicked, ...PHONE };

/** @summary Roster unreadable (no membership permission): falls back to today's exact-name box and says so. */
export const DialogRosterMissing: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog rosterMissing query="Ren Halvard" role={ROLE_PICKED} />
    </>
  ),
};

// ---------------------------------------------------------------- Tell the member

/** @summary After Ask: the review exists, and the dialog offers the in-game mail (Send, Preview mail, Copy link). Nothing is sent by itself. New component: TellMemberStep. */
export const ResultOffer: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog picked={PICKED} role={ROLE_PICKED} step="asked" />
    </>
  ),
};
/** @summary Phone: the result sheet. */
export const ResultOfferPhone: Story = { ...ResultOffer, ...PHONE };

/** @summary After Send: queued line with the paced-queue wording; Preview mail and Copy link stay; Done is now the primary. */
export const ResultMailed: Story = {
  render: () => (
    <>
      {behind}
      <ProposedReviewMemberDialog picked={PICKED} role={ROLE_PICKED} step="mailed" />
    </>
  ),
};

/** @summary Mail preview: the exact mail in a monospace box (who asked, role, what is read, decline, link, "Sign in as"), Send or Resend. New component: ReviewMailPreview. */
export const MailPreview: Story = {
  render: () => (
    <>
      {behind}
      <MailPreviewDialog onClose={() => undefined} />
    </>
  ),
};
/** @summary Phone: the mail preview as a sheet. */
export const MailPreviewPhone: Story = { ...MailPreview, ...PHONE };

// -------------------------------------------------------------------- Queue

/** @summary Queue: waiting rows now open a page (accent name, row click), say "Waiting", "Mail not sent" / "Mail sent 6 hours ago", and have a menu with Send or Resend mail and Copy link. New component: WaitingQueueRows. */
export const QueueRows: Story = {
  render: () => <ProposedQueue />,
};
/** @summary Phone: the queue as dense cards. */
export const QueueRowsPhone: Story = { ...QueueRows, ...PHONE };

// ------------------------------------------------------------ Officer's page

/** @summary Review page, requested, mail not sent: Request block (asked by, role, mail Not sent, Send mail, Preview mail, Copy link), "Nothing shared yet", the real decision rail with the asker barred. New component: RequestPanel. */
export const PageRequestedNoMail: Story = {
  render: () => <RequestedReviewPage mail="none" rail={<Rail />} />,
};
/** @summary Review page, requested, mail sent 6 hours ago: Resend waits a day. */
export const PageRequestedMailed: Story = {
  render: () => <RequestedReviewPage mail="sent" rail={<Rail />} />,
};
/** @summary Phone: the requested review page in one column. */
export const PageRequestedPhone: Story = { ...PageRequestedMailed, ...PHONE };

/** @summary Shared: the real review page of a promotion the member shared: same report an applicant gets, the sign-off block, the role, the asker barred. Unchanged. */
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
/** @summary Phone: the shared promotion report. */
export const PageSharedPhone: Story = { ...PageShared, ...PHONE };

/** @summary A review about the officer: the real closed page; the queue does not list it either. */
export const PageAboutYou: Story = { render: () => <OwnReviewPage /> };

// ------------------------------------------------------------------ Member

/** @summary Member's page top: who asked and for what in a sentence, three steps, four plain facts, then the existing characters, consent and Share / Decline. New component: RequestIntro. */
export const MemberPage: Story = { render: () => <MemberRequestPage /> };
/** @summary Phone: the member's page. */
export const MemberPagePhone: Story = { ...MemberPage, ...PHONE };
