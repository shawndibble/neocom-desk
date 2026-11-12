/**
 * The four Corp Board widgets read across every corporation (All scope, #6100): Moon
 * extractions, Corp wallet (balances), Corp industry jobs and Corp kills.
 */
import { describe, expect, it } from 'vitest';
import type { CorporationIndustryJob } from '@/esi/endpoints';
import type { PilotStats } from '@/lib/zkillboard';
import type { MoonChunksBoardData } from '../../data/boardData';
import { corpJobs } from './corpClockModels';
import type {
  CorpAllFeed,
  CorpFeedBase,
  CorpJobsFeed,
  CorpKillsFeed,
  CorpWalletFeed,
} from './corpFeeds';
import { corpWallet } from './corpMoneyModels';
import { corpKills } from './corpOpsModels';
import { moonChunks } from './structureModels';
import type { BuildContext, FeedState, TableCell } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const NOW = Date.parse('2026-11-12T12:00:00Z');
const HOUR = 3_600_000;
const READ_AT = new Date(NOW - HOUR);

const ctx: BuildContext = {
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: true,
  notTrainingAlert: false,
  range: 30,
};

const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });

const LABELS = new Map([
  [10, { ticker: 'HOLD', name: 'Holding One' }],
  [20, { ticker: 'MOON', name: 'Moon Two' }],
]);

const BASE: CorpFeedBase = {
  readable: true,
  needsReauth: false,
  fetchedAt: READ_AT,
  fromCache: false,
};

function across<F extends CorpFeedBase>(
  reads: [number, F][],
  partlyFailed = false
): FeedState<CorpAllFeed<F>> {
  return ok({
    corporations: reads.map(([corporationId, feed]) => ({ corporationId, feed })),
    labels: LABELS,
    partlyFailed,
  });
}

const textOf = (cell: TableCell | undefined) => (typeof cell === 'string' ? cell : cell?.text);

// --- Corp wallet -----------------------------------------------------------------

const wallet = (...balances: number[]): CorpWalletFeed => ({
  ...BASE,
  divisions: balances.map((balance, i) => ({ division: i + 1, name: null, balance })),
  journalDivision: 1,
  journal: null,
});

describe('corpWallet across corporations', () => {
  it('lists each corporation with its master and total balance, and the grand total', () => {
    const view = corpWallet(
      {
        corpWalletAll: across([
          [10, wallet(100, 50)],
          [20, wallet(400)],
        ]),
      },
      ctx
    );
    expect(view.number.iskAmount).toBe(550);
    expect(view.table?.columns.map((c) => c.key)).toEqual(['corp', 'master', 'total']);
    expect(view.table?.rows.map((row) => row.cells.map(textOf))).toEqual([
      ['MOON', '400', '400'],
      ['HOLD', '100', '150'],
    ]);
    expect(view.table?.rows[0]?.cells[0]).toEqual({ text: 'MOON', hint: 'Moon Two' });
    expect(view.table?.footer).toBe('overview.widgets.corpWallet.balancesOnly');
  });

  it('draws one readable corporation as its own divisions, naming no corporation', () => {
    const view = corpWallet({ corpWalletAll: across([[10, wallet(100, 50)]]) }, ctx);
    expect(view.table?.columns.map((c) => c.key)).toEqual(['division', 'balance', 'share']);
    expect(view.number.iskAmount).toBe(150);
  });

  it("keeps the other corporations' rows when one corporation's read failed, flagged", () => {
    const view = corpWallet(
      {
        corpWalletAll: across(
          [
            [10, wallet(100)],
            [20, wallet(400)],
          ],
          true
        ),
      },
      ctx
    );
    expect(view.status.error).toBe(true);
    expect(view.table?.rows).toHaveLength(2);
  });

  it('offers Retry when every corporation that answered could not be read and one failed', () => {
    const unreadable = { ...wallet(), readable: false };
    const view = corpWallet({ corpWalletAll: across([[10, unreadable]], true) }, ctx);
    expect(view.status.error).toBe(true);
  });
});

// --- Corp industry jobs ------------------------------------------------------------

function job(jobId: number, endInHours: number, status = 'active'): CorporationIndustryJob {
  return {
    job_id: jobId,
    installer_id: 77,
    activity_id: 1,
    blueprint_id: 1,
    blueprint_type_id: 500,
    blueprint_location_id: 1,
    output_location_id: 1,
    facility_id: 1,
    location_id: 1,
    runs: 1,
    start_date: new Date(NOW - 10 * HOUR).toISOString(),
    end_date: new Date(NOW + endInHours * HOUR).toISOString(),
    status,
  } as CorporationIndustryJob;
}

const jobs = (...list: CorporationIndustryJob[]): CorpJobsFeed => ({
  ...BASE,
  jobs: list,
  typeNames: new Map([[500, 'Widget']]),
  installerNames: new Map([[77, 'Aria']]),
});

describe('corpJobs across corporations', () => {
  it('lists finished jobs first, then running, across corporations, each naming its own', () => {
    const view = corpJobs(
      {
        corpJobsAll: across([
          [10, jobs(job(1, 5), job(2, -1))],
          [20, jobs(job(3, 2), job(4, -3))],
        ]),
      },
      ctx
    );
    const table = view.table!;
    expect(table.columns.map((c) => c.key)).toEqual([
      'product',
      'corp',
      'ends',
      'installer',
      'activity',
    ]);
    expect(table.rows.map((row) => [row.key, textOf(row.cells[1])])).toEqual([
      ['4', 'MOON'],
      ['2', 'HOLD'],
      ['3', 'MOON'],
      ['1', 'HOLD'],
    ]);
    expect(view.rows[0]?.detail).toContain('MOON · ');
    expect(view.number.value).toBe('2');
  });

  it('names no corporation with one readable corporation', () => {
    const view = corpJobs({ corpJobsAll: across([[10, jobs(job(1, 5))]]) }, ctx);
    expect(view.table?.columns.map((c) => c.key)).not.toContain('corp');
  });

  it("keeps the other corporation's jobs when one corporation's read failed, flagged", () => {
    const view = corpJobs(
      {
        corpJobsAll: across(
          [
            [10, jobs(job(1, 5))],
            [20, jobs(job(2, 3))],
          ],
          true
        ),
      },
      ctx
    );
    expect(view.status.error).toBe(true);
    expect(view.table?.rows).toHaveLength(2);
  });

  it('reads the header feed outside All', () => {
    const view = corpJobs({ corpJobs: ok(jobs(job(1, 5))) }, { ...ctx, scopeAll: false });
    expect(view.table?.rows).toHaveLength(1);
  });
});

// --- Corp kills --------------------------------------------------------------------

const stats = (kills: number, losses: number, destroyed: number, lost: number): PilotStats => ({
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
});

const kills = (corporationId: number, s: PilotStats | null): CorpKillsFeed => ({
  ...BASE,
  corporationId,
  stats: s,
  failed: null,
});

describe('corpKills across corporations', () => {
  it('sums kills and losses, and lists each corporation', () => {
    const view = corpKills(
      {
        corpKillsAll: across([
          [10, kills(10, stats(10, 2, 900, 100))],
          [20, kills(20, stats(1, 5, 0, 1000))],
        ]),
      },
      ctx
    );
    expect(view.number.value).toBe('11');
    expect(view.number.secondary?.text).toContain('"losses":"7"');
    expect(view.number.secondary?.text).toContain('"efficiency":"45%"');
    expect(view.table?.rows.map((row) => row.cells.map(textOf))).toEqual([
      ['HOLD', '10', '2', '90%'],
      ['MOON', '1', '5', '0%'],
    ]);
  });

  it('names no corporation with one, and draws its one-row table', () => {
    const view = corpKills({ corpKillsAll: across([[10, kills(10, stats(3, 1, 3, 1))]]) }, ctx);
    expect(view.table?.columns.map((c) => c.key)).toEqual(['kills', 'losses', 'efficiency']);
    expect(view.number.value).toBe('3');
  });
});

// --- Moon extractions --------------------------------------------------------------

const chunk = (id: string, inHours: number, corp: number) => ({
  id,
  subject: `Refinery ${id}`,
  detail: 'arrival',
  deadlineMs: NOW + inHours * HOUR,
  corporation: { id: corp, ...LABELS.get(corp)! },
});

const moons = (data: Partial<MoonChunksBoardData>): FeedState<MoonChunksBoardData> =>
  ok({ chunks: [], needsReauth: false, fetchedAt: READ_AT, loadedAt: NOW, ...data });

describe('moonChunks across corporations', () => {
  it('lists every corporation’s drills soonest first, each naming its corporation', () => {
    const view = moonChunks(
      { moonChunksAll: moons({ chunks: [chunk('a', 30, 10), chunk('b', 5, 20)] }) },
      ctx
    );
    expect(view.table?.columns.map((c) => c.key)).toEqual(['drill', 'corp', 'in', 'event']);
    expect(view.table?.rows.map((row) => textOf(row.cells[1]))).toEqual(['MOON', 'HOLD']);
  });

  it('names no corporation when every drill is one corporation’s', () => {
    const view = moonChunks({ moonChunksAll: moons({ chunks: [chunk('a', 30, 10)] }) }, ctx);
    expect(view.table?.columns.map((c) => c.key)).toEqual(['drill', 'in', 'event']);
  });

  it("keeps the other corporation's drills when one corporation's read failed, flagged", () => {
    const view = moonChunks(
      {
        moonChunksAll: moons({
          chunks: [chunk('a', 30, 10), chunk('b', 5, 20)],
          partlyFailed: true,
        }),
      },
      ctx
    );
    expect(view.status.error).toBe(true);
    expect(view.table?.rows).toHaveLength(2);
  });
});
