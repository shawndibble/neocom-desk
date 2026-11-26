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
      title="Ship replacement (SRP) is not set up for your corporation"
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

export const Default: Story = {};
export const DefaultPhone: Story = { ...phone };

export const LostShips: Story = { render: lostList };
export const LostShipsPhone: Story = { render: lostList, ...phone };

export const BlockedAndErrors: Story = { render: blocked };
export const BlockedAndErrorsPhone: Story = { render: blocked, ...phone };

export const NoClaims: Story = { render: empty };
export const NoClaimsPhone: Story = { render: empty, ...phone };

export const NotSetUp: Story = { render: notSetUp };
export const NotSetUpPhone: Story = { render: notSetUp, ...phone };

export const Refile: Story = { render: refile };
export const RefilePhone: Story = { render: refile, ...phone };

export const ClaimDetailPhone: Story = { render: at('detail'), ...phone };
