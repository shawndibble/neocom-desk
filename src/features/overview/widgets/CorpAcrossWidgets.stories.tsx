import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import type { CorporationIndustryJob } from '@/esi/endpoints';
import type { PilotStats } from '@/lib/zkillboard';
import type { MoonChunksBoardData } from '../data/boardData';
import { Widget } from './Widget';
import { corpJobs } from './data/corpClockModels';
import type {
  CorpAllFeed,
  CorpFeedBase,
  CorpJobsFeed,
  CorpKillsFeed,
  CorpWalletFeed,
} from './data/corpFeeds';
import { corpWallet } from './data/corpMoneyModels';
import { corpKills } from './data/corpOpsModels';
import { moonChunks } from './data/structureModels';
import type { BuildContext, Feeds, KindView } from './data/types';
import type { Widget as WidgetModel } from './layout';

/**
 * Corp Board widgets scoped to All my corporations (#6100): the real builders over sample
 * reads from three corporations, drawn in the real Widget shell. Each row names its
 * corporation (ticker, full name in the tooltip). The wallet reads balances only.
 */
const meta = {
  title: 'overview/CorpAcrossWidgets',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const NOW = Date.parse('2026-11-12T12:00:00Z');
const HOUR = 3_600_000;
const BASE: CorpFeedBase = {
  readable: true,
  needsReauth: false,
  fetchedAt: new Date(NOW - HOUR),
  fromCache: false,
};

const CORPS: [number, string, string][] = [
  [98000001, 'ASHV', 'Ashen Vanguard'],
  [98000002, 'HLD1', 'Ashen Holdings One'],
  [98000003, 'HLD2', 'Ashen Holdings Two'],
];
const LABELS = new Map(CORPS.map(([id, ticker, name]) => [id, { ticker, name }]));

function across<F extends CorpFeedBase>(
  feeds: F[]
): { data: CorpAllFeed<F>; error: false; loading: false } {
  return {
    data: {
      corporations: feeds.map((feed, i) => ({ corporationId: CORPS[i]![0], feed })),
      labels: LABELS,
      partlyFailed: false,
    },
    error: false,
    loading: false,
  };
}

const wallet = (...balances: number[]): CorpWalletFeed => ({
  ...BASE,
  divisions: balances.map((balance, i) => ({ division: i + 1, name: null, balance })),
  journalDivision: 1,
  journal: null,
});

function job(jobId: number, typeId: number, endInHours: number): CorporationIndustryJob {
  return {
    job_id: jobId,
    installer_id: 77,
    activity_id: 1,
    blueprint_id: jobId,
    blueprint_type_id: typeId,
    product_type_id: typeId,
    blueprint_location_id: 1,
    output_location_id: 1,
    facility_id: 1,
    location_id: 1,
    runs: 10,
    start_date: new Date(NOW - 20 * HOUR).toISOString(),
    end_date: new Date(NOW + endInHours * HOUR).toISOString(),
    status: 'active',
  } as CorporationIndustryJob;
}

const jobs = (...list: CorporationIndustryJob[]): CorpJobsFeed => ({
  ...BASE,
  jobs: list,
  typeNames: new Map([
    [1, 'Fuel Block'],
    [2, 'Tritanium Bar'],
    [3, 'Drake'],
  ]),
  installerNames: new Map([[77, 'Aria Voss']]),
});

function stats(kills: number, losses: number, destroyed: number, lost: number): PilotStats {
  return {
    kills,
    losses,
    iskDestroyed: destroyed,
    iskLost: lost,
    iskEfficiency: destroyed / (destroyed + lost),
    soloKills: 0,
    dangerRatio: null,
    gangRatio: null,
    topShips: [],
    memberCount: null,
  };
}

const kills = (corporationId: number, s: PilotStats): CorpKillsFeed => ({
  ...BASE,
  corporationId,
  stats: s,
  failed: null,
});

const chunk = (id: string, system: string, inHours: number, corp: number) => ({
  id,
  subject: `${system} - Athanor`,
  detail: 'arrival',
  deadlineMs: NOW + inHours * HOUR,
  corporation: { id: corp, ...LABELS.get(corp)! },
});

const MOONS: MoonChunksBoardData = {
  chunks: [
    chunk('a', 'Efa', 30, CORPS[1]![0]),
    chunk('b', 'Ohide', 6, CORPS[2]![0]),
    chunk('c', 'Efa', 70, CORPS[0]![0]),
  ],
  needsReauth: false,
  fetchedAt: BASE.fetchedAt,
  loadedAt: NOW,
};

const FEEDS: Feeds = {
  corpWalletAll: across([
    wallet(2_400_000_000, 300_000_000),
    wallet(85_000_000),
    wallet(12_500_000),
  ]),
  corpJobsAll: across([jobs(job(1, 3, 40)), jobs(job(2, 1, -2)), jobs(job(3, 2, 5))]),
  corpKillsAll: across([
    kills(CORPS[0]![0], stats(1102, 204, 84e9, 16e9)),
    kills(CORPS[1]![0], stats(12, 3, 1e9, 2e9)),
    kills(CORPS[2]![0], stats(0, 1, 0, 3e8)),
  ]),
  moonChunksAll: { data: MOONS, error: false, loading: false },
};

type Kind = 'moonChunks' | 'corpWallet' | 'corpJobs' | 'corpKills';
const BUILDERS = { moonChunks, corpWallet, corpJobs, corpKills };

function Tile({ kind, view }: { kind: Kind; view: WidgetModel['view'] }): ReactNode {
  const { t } = useTranslation();
  const built: KindView = BUILDERS[kind](FEEDS, {
    t,
    now: NOW,
    range: 30,
    activeCharacterId: 1,
    scopeAll: true,
  } as unknown as BuildContext);
  return (
    <div className="mx-auto grid max-w-page gap-3 px-4 pt-3 pb-8">
      <PageHeader title="Corp Board" meta="Ashen Vanguard" />
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Widget
          widget={{ id: kind, kind, size: 'M', view, scope: 'all', showOnPhone: true }}
          previewView={built}
        />
      </div>
    </div>
  );
}

const PHONE = { viewport: { value: 'mobile1', isRotated: false } } as const;

/** @summary Moon extractions across corporations: soonest first, each drill names its corporation. */
export const MoonExtractionsAll: Story = {
  render: () => <Tile kind="moonChunks" view="table" />,
};

/** @summary Corp wallet across corporations: master wallet and total per corporation, balances only. */
export const CorpWalletAll: Story = { render: () => <Tile kind="corpWallet" view="table" /> };

/** @summary Corp wallet across corporations as a Number: the grand total. */
export const CorpWalletAllNumber: Story = {
  render: () => <Tile kind="corpWallet" view="number" />,
};

/** @summary Corp industry jobs across corporations: finished first, then running. */
export const CorpJobsAll: Story = { render: () => <Tile kind="corpJobs" view="table" /> };

/** @summary Corp industry jobs across corporations in the phone shell. */
export const CorpJobsAllPhone: Story = { ...CorpJobsAll, globals: PHONE };

/** @summary Corp kills across corporations: summed totals, one row per corporation. */
export const CorpKillsAll: Story = { render: () => <Tile kind="corpKills" view="table" /> };

/** @summary Corp kills across corporations as a Number. */
export const CorpKillsAllNumber: Story = { render: () => <Tile kind="corpKills" view="number" /> };
