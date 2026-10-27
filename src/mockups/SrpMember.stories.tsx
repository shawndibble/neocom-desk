import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState, Panel } from '@/components/ui';
import {
  FileClaimForm,
  FileClaimPanel,
  MyClaimsPanel,
  Page,
  RefileDialog,
  SrpHeader,
} from './srpMemberParts';
import {
  ClaimDetailSheet,
  PhoneClaims,
  PhoneGrantCard,
  PhoneGrantLine,
  PhoneLosses,
  PhonePaste,
} from './srpMemberPhone';
import { useIsPhone } from '@/lib/useIsPhone';
import { CLAIMS, LOST_SHIPS, SRP_PARAMS, SRP_PHONE } from './srpMemberFixtures';

/**
 * SRP, the member's side (route `/corp/srp`). Shown to a pilot with no corp
 * role and no corp scopes; their corp has SRP turned on, so the single "SRP"
 * nav item exists (hidden, never locked, when it is off). A pilot sees only
 * their own claims.
 *
 * - **Default**: File a claim (paste a killmail link, optional Fleet or FC),
 *   then "Or pick a lost ship" behind a grant prompt for the opt-in
 *   killmail scope. My claims shows all four states; a Rejected row carries
 *   its reason and Re-file (once).
 * - **Lost ships**: after the scope grant: one-tap File, Claimed rows,
 *   "Too old" past 30 days.
 * - **Blocked and errors**: a Not covered hull blocks filing with a message;
 *   inline field errors; Fleet or FC made required by the corp.
 * - **Empty**: no claims yet; and the page for a direct visit when the corp
 *   has not turned SRP on.
 * - **Re-file**: dialog with the note; a bottom sheet on a phone.
 * - **Phone** (390): different order and density. Losses first with one-tap
 *   File, paste behind a disclosure (no grant: a grant card, then paste).
 *   Dense two-line `DataTable` cards; a tap opens the detail sheet.
 *
 * Amount: fixed hull price, else killmail value x %, else Jita appraisal x %.
 * "Officer decides" shows "Officer will set the amount".
 *
 * New components in this mockup: `LostShipsList` (the pilot's losses with
 * File / Claimed / Too old / Not covered), `NotCoveredNote`. The state words
 * (Pending, Approved, Paid, Rejected) are existing `Pill` tones. Everything
 * else is `Panel`, `Fields`, `TextInput`, `Button`, `DataTable`,
 * `ReauthBanner`, `EmptyState`, `Modal`.
 */
const meta = {
  title: 'mockups/SrpMember',
  tags: ['!manifest'],
  parameters: SRP_PARAMS,
  render: () => <Screen scenario="default" />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { globals: SRP_PHONE };

type Scenario = 'default' | 'lost' | 'blocked' | 'empty' | 'notSetUp' | 'refile' | 'detail';

const BLOCKED_FORM = {
  link: 'https://zkillboard.com/kill/128840221/',
  linkError: 'Paste a killmail where you were the victim.',
  fleetRequired: true,
  fleetError: 'Fleet or FC is required by your corp.',
  blockedHull: 'Capsule',
};
const notSetUpPanel = (
  <Panel>
    <EmptyState
      title="SRP is not set up for your corporation"
      hint="Your corp has not turned on ship replacement. There is no SRP item in the menu until it does. Ask a director if you expected one."
    />
  </Panel>
);

function DesktopScreen({ scenario }: { scenario: Scenario }) {
  return (
    <Page>
      <SrpHeader />
      {scenario === 'notSetUp' ? (
        notSetUpPanel
      ) : (
        <>
          <FileClaimPanel
            form={scenario === 'blocked' ? BLOCKED_FORM : undefined}
            ships={scenario === 'lost' || scenario === 'blocked' ? LOST_SHIPS : undefined}
          />
          <MyClaimsPanel claims={scenario === 'empty' ? [] : undefined} />
        </>
      )}
      {scenario === 'refile' ? <RefileDialog /> : null}
    </Page>
  );
}

function PhoneScreen({ scenario }: { scenario: Scenario }) {
  const detail = scenario === 'detail' ? CLAIMS[3] : undefined;
  return (
    <Page>
      <SrpHeader />
      {scenario === 'notSetUp' ? (
        notSetUpPanel
      ) : (
        <>
          {scenario === 'lost' ? (
            <>
              <PhoneLosses ships={LOST_SHIPS} />
              <PhonePaste open={false} />
            </>
          ) : scenario === 'blocked' ? (
            <>
              <PhoneGrantLine />
              <Panel title="Paste a killmail link">
                <FileClaimForm state={BLOCKED_FORM} fullWidth />
              </Panel>
            </>
          ) : (
            <>
              <PhoneGrantCard />
              <Panel title="Paste a killmail link">
                <FileClaimForm fullWidth />
              </Panel>
            </>
          )}
          <PhoneClaims claims={scenario === 'empty' ? [] : undefined} />
        </>
      )}
      {scenario === 'refile' ? <RefileDialog /> : null}
      {detail ? <ClaimDetailSheet claim={detail} /> : null}
    </Page>
  );
}

function Screen({ scenario }: { scenario: Scenario }) {
  const phone = useIsPhone();
  return phone ? <PhoneScreen scenario={scenario} /> : <DesktopScreen scenario={scenario} />;
}
const at = (scenario: Scenario) => () => <Screen scenario={scenario} />;
const lostList = at('lost');
const blocked = at('blocked');
const empty = at('empty');
const notSetUp = at('notSetUp');
const refile = at('refile');

/** @summary 1 · Default: file a claim (paste link, scope grant prompt for the lost-ships list) and My claims in all four states, Rejected with reason and Re-file. New components: LostShipsList (prompt state). */
export const Default: Story = {};
/** @summary 1 · Default, phone. */
export const DefaultPhone: Story = { ...phone };

/** @summary 2 · Lost ships after the grant: one-tap File, Claimed marks, Too old past 30 days. New component: LostShipsList. */
export const LostShips: Story = { render: lostList };
/** @summary 2 · Lost ships, phone. */
export const LostShipsPhone: Story = { render: lostList, ...phone };

/** @summary 3 · Blocked hull (Not covered) with inline validation errors and a required Fleet or FC. New components: NotCoveredNote, LostShipsList. */
export const BlockedAndErrors: Story = { render: blocked };
/** @summary 3 · Blocked hull and errors, phone. */
export const BlockedAndErrorsPhone: Story = { render: blocked, ...phone };

/** @summary 4 · Empty: no claims yet. */
export const NoClaims: Story = { render: empty };
/** @summary 4 · No claims yet, phone. */
export const NoClaimsPhone: Story = { render: empty, ...phone };

/** @summary 4 · Corp has not turned SRP on: a direct URL visit explains it; no nav item. */
export const NotSetUp: Story = { render: notSetUp };
/** @summary 4 · SRP not set up, phone. */
export const NotSetUpPhone: Story = { render: notSetUp, ...phone };

/** @summary 5 · Re-file dialog for a Rejected claim, with a note. */
export const Refile: Story = { render: refile };
/** @summary 5 · Re-file bottom sheet, phone. */
export const RefilePhone: Story = { render: refile, ...phone };

/** @summary 6 · Phone: tapping a claim card opens a detail sheet (full reason, timeline, killmail link). */
export const ClaimDetailPhone: Story = { render: at('detail'), ...phone };
