import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState, Panel } from '@/components/ui';
import {
  AboutReport,
  CharactersPanel,
  ClearChecks,
  Decision,
  FactsPanel,
  FlagList,
  MissingChecks,
  PHONE,
  QueuePage,
  ReportPage,
  ResultLine,
  VETTING_PARAMS,
} from './vettingReviewParts';
import {
  APPLICANT_CHARACTERS,
  APPLICATION_SIGNOFFS,
  CLEAR_CHECKS,
  CORP,
  FLAGS,
  IN_CORP,
  MEMBER_CHARACTERS,
  MISSING_CHECKS,
  PROMOTION_FLAGS,
  PROMOTION_SIGNOFFS,
  SINCE_LAST,
} from './vettingFixtures';

/**
 * Vetting, the corp's side, `/corp/vetting` (recruiters and officers). First
 * draft; sample data. One story throughout: 12 Nov 2026 16:00 EVE, Kestrel
 * Vane (Director) reviewing.
 *
 * - **Queue.** One row per pilot: who, what for (Application, or Promotion to
 *   a role), the result in words, sign-offs "1 of 2" with "Yours needed". A
 *   row click opens the report; there are no per-row Accept or Reject buttons,
 *   because a decision needs the report read. Tabs: Open, Decided, Watchlist.
 * - **Result line.** Three states, never "safe": "3 flags in 11 checks",
 *   "Nothing found in 11 checks", and "1 check could not run" beside either.
 *   "Nothing found" is neutral, not green: a clean read is not proof.
 * - **Flag.** Severity glyph and word, a title, one sentence a recruiter can
 *   act on (who, what, how much), which character and source, and the rows
 *   behind it under a disclosure. Entity names are entity links.
 * - **Could not check** is its own panel, apart from the checks that ran
 *   clean, with "Ask for a fresh read" (the corp holds no sign-in).
 * - **Decision rail.** Who must sign and where each stands. A second
 *   reviewer's row says "Decided, shown once you decide"; whoever asked for a
 *   promotion review cannot sign it off. The no-button ends in an ellipsis
 *   (it opens a dialog for the reason); the yes-button acts at once.
 * - **Promotion report** adds "Since the last review" and "In this corp"
 *   (tenure, mining tax, SRP), which the app already holds.
 * - **About this report**: when it was read, when it is deleted, who opened
 *   it. The pilot sees the same "who opened it" list.
 *
 * Not drawn yet: the Decided and Watchlist tabs, the Reject and Decline
 * dialogs, "Review a member…".
 *
 * New components in this mockup: `VettingResultLine`, `VettingFlag` (flag
 * with evidence disclosure), `VettingSignOffs`, `VettingViewLog`. The queue,
 * check lists, character table and facts are `DataTable`, `Panel`,
 * `CollapsiblePanel`, `Disclosure`, `ValueList`, `Pill`, `SeverityIcon`,
 * `Tabs` and `Button`.
 */
const meta = {
  title: 'mockups/VettingReview',
  tags: ['!manifest'],
  parameters: VETTING_PARAMS,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Queue: applications and promotions, result in words, sign-offs with "Yours needed". */
export const Queue1440: Story = { render: () => <QueuePage /> };
/** @summary Phone: the queue as cards. */
export const Queue390: Story = {
  render: () => <QueuePage />,
  globals: { viewport: PHONE.viewport },
};

const APPLY = { yes: 'Accept', no: 'Reject' };
const PROMOTE = { yes: 'Approve', no: 'Object' };

function FlaggedReport() {
  return (
    <ReportPage
      pilot="Tamsin Vell"
      from="Hollow Reach Mining"
      kind="Application"
      note="Vell Hauling is my Jita hauler. Orrin is my brother, we share ISK sometimes."
      main={
        <>
          <ResultLine flags={3} checks={11} missing={1} worst="critical" />
          <Panel title="Flags" padded={false}>
            <FlagList flags={FLAGS} />
          </Panel>
          <MissingChecks checks={MISSING_CHECKS} />
          <ClearChecks checks={CLEAR_CHECKS} />
          <CharactersPanel characters={APPLICANT_CHARACTERS} />
        </>
      }
      rail={
        <>
          <Decision signOffs={APPLICATION_SIGNOFFS} needed={1} verb={APPLY} />
          <AboutReport read="12 Nov 14:02 EVE, 2h ago" kept="30 days after the decision" />
        </>
      }
    />
  );
}

/** @summary Application report with 3 flags: result line, flags with evidence rows, could-not-check, decision rail. */
export const Flagged1440: Story = { render: () => <FlaggedReport /> };
/** @summary Phone: the flagged report in one column, Accept and Reject at the end, after the findings. */
export const Flagged390: Story = {
  render: () => <FlaggedReport />,
  globals: { viewport: PHONE.viewport },
};

function CleanReport() {
  return (
    <ReportPage
      pilot="Pell Okonru"
      from="Science and Trade Institute"
      kind="Application"
      main={
        <>
          <ResultLine flags={0} checks={11} missing={0} worst="clear" />
          <ClearChecks
            checks={[
              ...CLEAR_CHECKS,
              { name: 'ISK with the watchlist', detail: 'None in 412 wallet rows' },
              {
                name: 'Undeclared characters',
                detail: 'No repeat counterparty outside the 2 declared',
              },
              { name: 'Cyno skills without a capital pilot', detail: 'No cyno skills' },
              { name: 'Mail with the watchlist', detail: 'None in 96 mails' },
            ]}
            open
          />
          <CharactersPanel
            characters={APPLICANT_CHARACTERS.slice(0, 2).map((c) => ({
              ...c,
              missing: undefined,
              state: 'read' as const,
            }))}
          />
        </>
      }
      rail={
        <>
          <Decision signOffs={APPLICATION_SIGNOFFS} needed={1} verb={APPLY} />
          <AboutReport read="11 Nov 09:30 EVE, 1d ago" kept="30 days after the decision" />
        </>
      }
    />
  );
}

/** @summary Report with nothing found: neutral result line that says it is not a verdict, every check listed with what it looked at. */
export const NothingFound1440: Story = { render: () => <CleanReport /> };
/** @summary Phone: nothing found. */
export const NothingFound390: Story = {
  render: () => <CleanReport />,
  globals: { viewport: PHONE.viewport },
};

function PromotionReport() {
  return (
    <ReportPage
      pilot="Joss Arden"
      from={CORP.name}
      kind="Promotion to Director"
      main={
        <>
          <ResultLine flags={1} checks={12} missing={0} worst="warning" />
          <Panel title="Flags" padded={false}>
            <FlagList flags={PROMOTION_FLAGS} />
          </Panel>
          <div className="grid gap-4 md:grid-cols-2">
            <FactsPanel title="Since the last review" meta="14 Mar 2026" rows={SINCE_LAST} />
            <FactsPanel title="In this corp" rows={IN_CORP} />
          </div>
          <ClearChecks checks={CLEAR_CHECKS} />
          <CharactersPanel
            characters={MEMBER_CHARACTERS.map((c) => ({ ...c, missing: undefined }))}
          />
        </>
      }
      rail={
        <>
          <Decision signOffs={PROMOTION_SIGNOFFS} needed={2} verb={PROMOTE} />
          <AboutReport read="11 Nov 20:15 EVE, 1d ago" kept="30 days after the decision" />
        </>
      }
    />
  );
}

/** @summary Promotion to Director: new-since-last-review flag, what changed, corp-held record, two sign-offs with the first hidden. */
export const Promotion1440: Story = { render: () => <PromotionReport /> };
/** @summary Phone: the promotion report, Approve and Object at the end. */
export const Promotion390: Story = {
  render: () => <PromotionReport />,
  globals: { viewport: PHONE.viewport },
};

function Empty() {
  return (
    <QueuePage
      rows={[]}
      empty={
        <Panel title="Open reviews">
          <EmptyState
            title="Nobody to review"
            hint="Send applicants the apply link. They sign in with EVE and their report lands here. Use Review a member before a promotion."
          />
        </Panel>
      }
    />
  );
}

/** @summary Empty queue: an EmptyState that says how a review starts. */
export const Empty1440: Story = { render: () => <Empty /> };
/** @summary Phone: empty queue. */
export const Empty390: Story = { render: () => <Empty />, globals: { viewport: PHONE.viewport } };
