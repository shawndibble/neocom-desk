import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import type { CampaignCompletion } from '@/engine/campaigns/participation';
import type {
  CampaignWidgetRow,
  MilitaryCampaignsWidgetData,
} from '@/features/campaigns/militaryCampaignsWidget';
import { FAILOVER, STEREO } from '@/features/campaigns/turnInStoryData';
import { Widget } from './Widget';
import { militaryCampaigns } from './data/militaryCampaignsModels';
import type { BuildContext, KindView } from './data/types';
import type { CampaignFaction, Widget as WidgetModel } from './layout';

const meta = {
  title: 'overview/MilitaryCampaignsWidget',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const campaign = (
  campaignId: string,
  title: string,
  factionId: number,
  completed: number
): CampaignCompletion => ({
  campaignId,
  title,
  factionId,
  state: 'Active',
  completed,
  target: 4,
  fraction: completed / 4,
});

const CAMPAIGNS = [
  campaign('camp-caldari', 'Secure Strength', 500001, 1),
  campaign('camp-amarr', 'Into the Light', 500003, 1),
  campaign('camp-minmatar', 'Trail of Silence', 500002, 2),
  campaign('camp-gallente', 'Equilibrium', 500004, 0),
];

const turnIn = (
  characterId: number,
  name: string,
  item: string,
  offer: typeof FAILOVER,
  held: number
): CampaignWidgetRow => ({
  key: `${characterId}:${offer.objectiveId}`,
  characterId,
  characterName: name,
  objectiveId: offer.objectiveId,
  title: offer.objectiveTitle,
  factionId: offer.factionId,
  filled: offer.filled,
  joined: null,
  turnIn: { typeId: offer.typeId, name: item, held, reward: held * offer.totalPerItem, offer },
});

const joined = (
  characterId: number,
  name: string,
  title: string,
  factionId: number,
  filled: number,
  contributed: number,
  isk: number,
  lp: number
): CampaignWidgetRow => ({
  key: `${characterId}:${title}`,
  characterId,
  characterName: name,
  objectiveId: title,
  title,
  factionId,
  filled,
  joined: { contributed, isk, lp },
  turnIn: null,
});

const ROWS: CampaignWidgetRow[] = [
  turnIn(1, 'Kestrel Vane', 'Shield Failover Report', FAILOVER, 640),
  turnIn(1, 'Kestrel Vane', 'Stereo-Collapse Signal', STEREO, 400),
  joined(1, 'Kestrel Vane', 'Mine Aberrant ore', 500001, 0.41, 48_200, 3_400_000, 0),
  joined(1, 'Kestrel Vane', 'Complete security missions', 500003, 0.08, 4, 2_000_000, 1_200),
  joined(2, 'Orsa Tellemar', 'Destroy Angel Cartel forces', 500002, 0.63, 22, 1_100_000, 0),
  joined(2, 'Orsa Tellemar', 'Hack Serpentis data sites', 500004, 0.55, 6, 900_000, 0),
];

function data(over: Partial<MilitaryCampaignsWidgetData> = {}): MilitaryCampaignsWidgetData {
  return {
    campaigns: CAMPAIGNS,
    characters: [
      { characterId: 1, name: 'Kestrel Vane', status: 'ok' },
      { characterId: 2, name: 'Orsa Tellemar', status: 'ok' },
    ],
    rows: ROWS,
    fetchedAt: new Date(0),
    fromCache: false,
    ...over,
  };
}

function Campaigns({
  feed,
  view,
  faction = 'all',
  scope = 'all',
}: {
  feed: MilitaryCampaignsWidgetData;
  view: WidgetModel['view'];
  faction?: CampaignFaction;
  scope?: WidgetModel['scope'];
}): ReactNode {
  const { t } = useTranslation();
  const built: KindView = militaryCampaigns(
    { militaryCampaigns: { data: feed, error: false, loading: false } },
    {
      t,
      now: 0,
      range: 30,
      activeCharacterId: 1,
      scopeAll: scope === 'all',
      notTrainingAlert: false,
      campaignFaction: faction,
    } as BuildContext
  );
  return (
    <div className="mx-auto grid max-w-page gap-3 px-4 pt-3 pb-8">
      <PageHeader title="Overview" meta="Kestrel Vane" />
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Widget
          widget={{
            id: 'mc',
            kind: 'militaryCampaigns',
            size: 'M',
            view,
            scope,
            showOnPhone: true,
          }}
          previewView={built}
        />
      </div>
    </div>
  );
}

const PHONE = { viewport: { value: 'mobile1', isRotated: false } } as const;

export const TableView: Story = { render: () => <Campaigns feed={data()} view="table" /> };

export const TableViewPhone: Story = { ...TableView, globals: PHONE };

export const NumberAllFactions: Story = {
  render: () => <Campaigns feed={data()} view="number" />,
};

export const NumberCaldari: Story = {
  render: () => <Campaigns feed={data()} view="number" faction="caldari" />,
};

export const TableCaldari: Story = {
  render: () => <Campaigns feed={data()} view="table" faction="caldari" />,
};

export const SomeCharactersMissing: Story = {
  render: () => (
    <Campaigns
      feed={data({
        characters: [
          { characterId: 1, name: 'Kestrel Vane', status: 'ok' },
          { characterId: 2, name: 'Mira Solenne', status: 'needsPermission' },
        ],
      })}
      view="table"
    />
  ),
};

export const NeedsPermission: Story = {
  render: () => (
    <Campaigns
      feed={data({
        characters: [{ characterId: 1, name: 'Kestrel Vane', status: 'needsPermission' }],
      })}
      view="table"
      scope="header"
    />
  ),
};

export const NothingJoined: Story = {
  render: () => <Campaigns feed={data({ rows: [] })} view="table" />,
};

export const Empty: Story = {
  render: () => <Campaigns feed={data({ campaigns: [], rows: [] })} view="table" />,
};
