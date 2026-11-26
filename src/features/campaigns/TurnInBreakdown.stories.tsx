import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ParticipateState } from '@/engine/campaigns/participation';
import { TurnInBreakdownView, type TurnInBreakdownItem } from './TurnInBreakdown';
import { TurnInDestinationView } from './TurnInDetail';
import type { DestinationBlock, PileParticipate } from './turnInContent';
import { FAILOVER, PHONE, STEREO, STRATEGIC_INTEL } from './turnInStoryData';
import { TurnInSampleMark } from './TurnInSampleMark';

const ITEMS: TurnInBreakdownItem[] = [
  {
    name: 'Shield Failover Report',
    quantity: 300,
    offer: FAILOVER,
    note: <span className="text-success">+1.4M over Sell now</span>,
  },
  {
    name: 'Federation Strategic Intel',
    quantity: 200,
    offer: STRATEGIC_INTEL,
    note: <span className="text-success">+1.6M over Sell now</span>,
  },
  {
    name: 'Stereo-Collapse Signal',
    quantity: 200,
    offer: STEREO,
    note: <span className="text-success">+1.2M over Sell now</span>,
  },
];

const CHARACTER = 'Kestrel Vane';

function Breakdown({
  participate,
  states = {},
  destination = { kind: 'ready' },
  openMark = false,
}: {
  participate: PileParticipate;
  states?: Record<string, ParticipateState>;
  destination?: DestinationBlock;
  openMark?: boolean;
}) {
  return (
    <TurnInBreakdownView
      open
      onClose={() => {}}
      items={ITEMS}
      participate={participate}
      stateOf={(objectiveId) => states[objectiveId] ?? 'participating'}
      characterName={CHARACTER}
      surfaceLine="Items worth more handed to an Item Trader than sold now."
      participateMark={
        <TurnInSampleMark
          character={CHARACTER}
          permission="Military Campaigns"
          why={`Lets Neocom Desk see whether ${CHARACTER} pressed Participate, so it can tell you if this turn-in pays.`}
          defaultOpen={openMark}
        />
      }
      destinationFor={(group) => (
        <TurnInDestinationView
          systemName={group.lines[0]?.offer.systemName ?? ''}
          block={destination}
          permissionLabel="Autopilot waypoints"
          sending={false}
          outcome={null}
          onSend={() => {}}
          mark={
            <TurnInSampleMark
              character={CHARACTER}
              permission="Autopilot waypoints"
              why={`Lets Neocom Desk set ${CHARACTER}'s autopilot destination in the EVE client.`}
            />
          }
        />
      )}
    />
  );
}

const meta = {
  title: 'campaigns/TurnInBreakdown',
  parameters: { layout: 'fullscreen' },
  render: () => <Breakdown participate={{ kind: 'perItem' }} />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Participating: Story = {};

export const SomeNotParticipating: Story = {
  render: () => (
    <Breakdown
      participate={{ kind: 'perItem' }}
      states={{ 'obj-intel': 'notParticipating', 'obj-signal': 'notParticipating' }}
    />
  ),
};

export const NotParticipating: Story = {
  render: () => (
    <Breakdown
      participate={{ kind: 'perItem' }}
      states={{
        [FAILOVER.objectiveId]: 'notParticipating',
        [STRATEGIC_INTEL.objectiveId]: 'notParticipating',
        [STEREO.objectiveId]: 'notParticipating',
      }}
    />
  ),
};

export const MilitaryCampaignsMissing: Story = {
  render: () => <Breakdown participate={{ kind: 'paysOnlyIf', mark: true }} openMark />,
};

export const MilitaryCampaignsDismissed: Story = {
  render: () => <Breakdown participate={{ kind: 'paysOnlyIf', mark: false }} />,
};

export const WaypointsMissing: Story = {
  render: () => <Breakdown participate={{ kind: 'perItem' }} destination={{ kind: 'mark' }} />,
};

export const Phone: Story = {
  globals: PHONE,
  render: () => (
    <Breakdown participate={{ kind: 'perItem' }} states={{ 'obj-intel': 'notParticipating' }} />
  ),
};

export const WaypointsDismissed: Story = {
  render: () => (
    <Breakdown
      participate={{ kind: 'perItem' }}
      destination={{ kind: 'reason', reason: 'dismissed' }}
    />
  ),
};

export const NoCharacter: Story = {
  render: () => (
    <Breakdown
      participate={{ kind: 'paysOnlyIf', mark: false }}
      destination={{ kind: 'reason', reason: 'noCharacter' }}
    />
  ),
};
