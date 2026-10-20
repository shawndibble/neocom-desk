import { describe, expect, it } from 'vitest';
import type { BoardStructureSource } from '@/engine/corp/board';
import { visibleColumns } from '../tableModel';
import { buildView } from './models';
import { elapsedShare } from './industryModels';
import { FUEL_BAR_HORIZON_MS, shortStructureName } from './structureModels';
import type { BuildContext, FeedState, Feeds, KindView, TableCell } from './types';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;

const ctx = (patch: Partial<BuildContext> = {}): BuildContext => ({
  t,
  now: NOW,
  activeCharacterId: 91,
  scopeAll: false,
  notTrainingAlert: false,
  range: 30,
  ...patch,
});

const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });
const text = (cell: TableCell | undefined) => (typeof cell === 'string' ? cell : cell?.text);
const column = (view: KindView, key: string) => view.table!.columns.findIndex((c) => c.key === key);

describe('elapsedShare', () => {
  it('is how far along a span the clock is, clamped, and null for a span that is not one', () => {
    expect(elapsedShare(0, 100, 25)).toBe(0.25);
    expect(elapsedShare(0, 100, 500)).toBe(1);
    expect(elapsedShare(0, 100, -5)).toBe(0);
    expect(elapsedShare(Number.NaN, 100, 5)).toBeNull();
    expect(elapsedShare(100, 100, 5)).toBeNull();
  });
});

describe('industry', () => {
  const job = (id: number, endOffset: number, durationH: number, over: object = {}) => ({
    job_id: id,
    activity_id: 1,
    runs: id,
    blueprint_type_id: 5,
    product_type_id: 6,
    station_id: 60003760,
    start_date: iso(NOW + endOffset - durationH * HOUR),
    end_date: iso(NOW + endOffset),
    status: 'active',
    ...over,
  });
  const feeds = (jobs: object[], locationNames?: Map<number, string>): Feeds => ({
    industry: ok({
      jobs,
      productNames: new Map(
        jobs.map((j) => [
          (j as { job_id: number }).job_id,
          `Item ${(j as { job_id: number }).job_id}`,
        ])
      ),
      locationNames,
      needsReauth: false,
      fetchedAt: new Date(NOW),
    }) as never,
  });
  const jobs = () => [
    job(1, 4 * HOUR, 8),
    job(2, -25 * MIN, 10),
    job(3, -3 * HOUR, 6),
    job(4, 90 * MIN, 3),
  ];

  it('is a record per job: finished ones first (oldest first), then the soonest to finish', () => {
    const view = buildView('industry', feeds(jobs()), ctx());
    expect(view.table!.rows.map((r) => r.key)).toEqual(['3', '2', '4', '1']);
    // no aggregate "N jobs ready" row any more
    expect(view.rows.map((r) => r.key)).toEqual(['3', '2', '4', '1']);
  });

  it('puts the job, then Ends in, then Done first so a Small tile keeps job and clock', () => {
    const view = buildView('industry', feeds(jobs()), ctx());
    const small = visibleColumns(view.table!.columns, 'S').map((c) => c.key);
    expect(small).toEqual(['job', 'ends']);
    const medium = visibleColumns(view.table!.columns, 'M').map((c) => c.key);
    expect(medium).toEqual(['job', 'ends', 'progress', 'activity']);
  });

  it('says Ready for a finished job and a share done for a running one', () => {
    const view = buildView('industry', feeds(jobs()), ctx());
    const [ready, , running] = view.table!.rows;
    expect(text(ready!.cells[column(view, 'ends')])).toBe('overview.board.ready');
    expect(text(ready!.cells[column(view, 'progress')])).toBe('100%');
    expect(ready!.tone).toBe('warning');
    // 90 minutes left of a 3 hour job: half done
    expect(text(running!.cells[column(view, 'progress')])).toBe('50%');
  });

  it('adds a Location column only when a name resolved', () => {
    const without = buildView('industry', feeds(jobs()), ctx());
    expect(without.table!.columns.map((c) => c.key)).not.toContain('location');
    const withNames = buildView('industry', feeds(jobs(), new Map([[60003760, 'Jita IV']])), ctx());
    const at = column(withNames, 'location');
    expect(at).toBeGreaterThan(0);
    expect(text(withNames.table!.rows[0]!.cells[at])).toBe('Jita IV');
  });

  it('charts jobs on a time axis holding now, a finished one in the ready colour', () => {
    const view = buildView('industry', feeds(jobs()), ctx());
    if (view.chart?.kind !== 'gantt') throw new Error('gantt');
    expect(view.chart.rows.map((r) => r.key)).toEqual(['3', '2', '4', '1']);
    expect(view.chart.rows[0]).toMatchObject({ color: 'warning', text: 'overview.board.ready' });
    expect(view.chart.rows[2]).toMatchObject({ color: 'accent' });
    // The earliest start is job 2 (10 h job that ended 25 min ago); the latest end is job 1.
    expect(view.chart.axis).toEqual({
      from: NOW - 10 * HOUR - 25 * MIN,
      to: NOW + 4 * HOUR,
      now: NOW,
    });
    expect(view.chart.summary).toContain('overview.widgets.chart.industry.ganttJob');
  });

  it('keeps one progress bar per job as the Small fallback', () => {
    const view = buildView('industry', feeds(jobs()), ctx());
    if (view.chart?.kind !== 'gantt') throw new Error('gantt');
    const { fallback } = view.chart;
    expect(fallback.rows.map((r) => r.key)).toEqual(['3', '2', '4', '1']);
    expect(fallback.rows[0]).toMatchObject({ share: 1, color: 'warning' });
    expect(fallback.rows[2]!.share).toBeCloseTo(0.5);
  });

  it('draws Done as a bar of the job elapsed share, the text stating the same percent', () => {
    const view = buildView('industry', feeds(jobs()), ctx());
    const col = column(view, 'progress');
    const byKey = Object.fromEntries(view.table!.rows.map((r) => [r.key, r.cells[col]]));
    expect(byKey['4']).toMatchObject({ text: '50%', bar: 0.5 });
    expect(byKey['3']).toMatchObject({ text: '100%', bar: 1 });
  });

  it('keeps the headline a count and the next clock as the fact it lacks', () => {
    const view = buildView('industry', feeds(jobs()), ctx());
    expect(view.number.value).toBe('2');
    expect(view.number.secondary?.text).toContain('overview.widgets.industry.next');
  });
});

describe('planetary', () => {
  const colony = (planetId: number, name: string, expiryMs: number | null, programCount = 2) => ({
    planetId,
    name,
    status: { idle: false, soonestExpiryMs: expiryMs },
    programCount,
  });
  const batch = (
    kind: 'running' | 'expired' | 'idle',
    severity: 'clear' | 'warning' | 'critical' | 'watch',
    colonies: ReturnType<typeof colony>[]
  ) => ({ kind, severity, expiryMs: colonies[0]?.status.soonestExpiryMs ?? null, colonies });
  const feeds = (batches: ReturnType<typeof batch>[]): Feeds => ({
    planetary: ok({
      batches,
      colonyCount: batches.reduce((n, b) => n + b.colonies.length, 0),
      programCount: 0,
      needsReauth: false,
      fetchedAt: new Date(NOW),
      loadedAt: NOW,
    }) as never,
  });
  const soon = NOW + 2 * HOUR;
  const later = NOW + 30 * HOUR;
  const base = () => [
    batch('running', 'warning', [colony(1, 'Efa I', soon), colony(2, 'Efa III', soon + MIN)]),
    batch('running', 'clear', [colony(3, 'Efa IX', later)]),
    batch('idle', 'watch', [colony(4, 'Efa XI', null, 0)]),
  ];

  it('leads with the first expiry and says how many colonies end together', () => {
    const view = buildView('planetary', feeds(base()), ctx());
    expect(view.number.value).toBe('2h 0m');
    expect(view.number.unit).toBe('overview.widgets.planetary.untilNext');
    expect(view.number.secondary?.text).toContain('overview.widgets.planetary.together');
    expect(view.number.secondary?.text).toContain('"count":2');
    expect(view.number.secondary?.text).toContain('"total":4');
  });

  it('flattens the batches to a row per colony, soonest first, idle last', () => {
    const view = buildView('planetary', feeds(base()), ctx());
    expect(view.table!.rows.map((r) => r.key)).toEqual(['1', '2', '3', '4']);
    expect(text(view.table!.rows[0]!.cells[column(view, 'programs')])).toBe('2');
    expect(text(view.table!.rows[3]!.cells[column(view, 'ends')])).toBe('—');
    expect(visibleColumns(view.table!.columns, 'S').map((c) => c.key)).toEqual(['colony', 'ends']);
  });

  it('charts each colony on its own bar, short-fused ones in warning colour, idle with an empty bar', () => {
    const view = buildView('planetary', feeds(base()), ctx());
    if (view.chart?.kind !== 'hbars') throw new Error('hbars');
    expect(view.chart.rows.map((r) => r.label)).toEqual(['Efa I', 'Efa III', 'Efa IX', 'Efa XI']);
    expect(view.chart.rows.map((r) => r.color)).toEqual([
      'warning',
      'warning',
      'accent',
      undefined,
    ]);
    expect(view.chart.rows[3]).toMatchObject({ share: 0 });
  });

  it('keeps the chart when every colony has stopped, as empty bars saying so', () => {
    const view = buildView(
      'planetary',
      feeds([batch('expired', 'critical', [colony(5, 'Efa V', NOW - HOUR)])]),
      ctx()
    );
    if (view.chart?.kind !== 'hbars') throw new Error('hbars');
    expect(view.chart.rows).toEqual([
      expect.objectContaining({
        label: 'Efa V',
        share: 0,
        color: 'warning',
        text: 'overview.widgets.planetary.state.stopped',
      }),
    ]);
  });

  it('names what has stopped before anything else, and leads with the count when nothing runs', () => {
    const stopped = buildView(
      'planetary',
      feeds([batch('expired', 'critical', [colony(5, 'Efa V', NOW - HOUR)]), ...base()]),
      ctx()
    );
    expect(stopped.number.secondary).toMatchObject({ tone: 'bad' });
    expect(stopped.number.secondary?.text).toContain('overview.widgets.planetary.stopped');
    const none = buildView(
      'planetary',
      feeds([batch('expired', 'critical', [colony(5, 'Efa V', NOW - HOUR)])]),
      ctx()
    );
    expect(none.number.value).toBe('1');
    expect(none.number.unit).toBe('overview.widgets.planetary.stoppedUnit');
  });
});

describe('structures', () => {
  const source = (
    id: number,
    name: string,
    over: Partial<BoardStructureSource> = {}
  ): BoardStructureSource => ({
    structureId: id,
    name,
    fuelExpiresMs: NOW + 20 * DAY,
    state: 'shield_vulnerable',
    stateTimerEndMs: null,
    unanchorsAtMs: null,
    services: [],
    ...over,
  });
  const feeds = (structures: BoardStructureSource[]): Feeds => ({
    structures: ok({
      structures,
      structureCount: structures.length,
      needsReauth: false,
      fetchedAt: new Date(NOW),
    }),
  });
  const fleet = () => [
    source(1, 'Efa - Helios Prime'),
    source(2, 'Efa - Lowfuel Keepstar', { fuelExpiresMs: NOW + 2 * DAY }),
    source(3, 'Efa - Offline Athanor', { services: [{ name: 'Reprocessing', state: 'offline' }] }),
  ];

  it('shortens a structure name by the system prefix', () => {
    expect(shortStructureName('Efa - Helios Prime')).toBe('Helios Prime');
    expect(shortStructureName('Helios')).toBe('Helios');
    expect(shortStructureName('A - ')).toBe('A - ');
  });

  it('lists every structure, healthy ones too, the worst first', () => {
    const view = buildView('structures', feeds(fleet()), ctx());
    expect(view.table!.rows).toHaveLength(3);
    expect(view.table!.rows.map((r) => text(r.cells[0]))).toContain('Helios Prime');
    const states = Object.fromEntries(
      view.table!.rows.map((r) => [text(r.cells[0]), text(r.cells[column(view, 'state')])])
    );
    expect(states['Helios Prime']).toBe('overview.widgets.structures.state.ok');
    expect(states['Lowfuel Keepstar']).toBe('overview.widgets.structures.state.lowFuel');
    expect(states['Offline Athanor']).toBe('overview.widgets.structures.state.offline');
    expect(view.table!.rows.at(-1)!.key).toBe('1');
  });

  it('draws Fuel left as a bar against the 30-day horizon, and no bar for a dry or stale clock', () => {
    const view = buildView(
      'structures',
      feeds([
        source(1, 'Efa - Full', { fuelExpiresMs: NOW + 15 * DAY }),
        source(2, 'Efa - Dry', { fuelExpiresMs: null }),
      ]),
      ctx()
    );
    const col = column(view, 'fuel');
    const byName = Object.fromEntries(
      view.table!.rows.map((r) => [text(r.cells[0]), r.cells[col]])
    );
    expect(byName['Full']).toMatchObject({ bar: 15 / 30 });
    expect(FUEL_BAR_HORIZON_MS).toBe(30 * DAY);
    expect(typeof byName['Dry']).toBe('string');
  });

  it('charts fuel with short names', () => {
    const view = buildView('structures', feeds(fleet()), ctx());
    if (view.chart?.kind !== 'hbars') throw new Error('hbars');
    expect(view.chart.rows.map((r) => r.label)).toContain('Lowfuel Keepstar');
  });

  it('names the structure with the least fuel when no timer runs', () => {
    const view = buildView('structures', feeds(fleet()), ctx());
    expect(view.number.secondary?.text).toBe('Lowfuel Keepstar');
  });
});

describe('moonChunks', () => {
  const chunk = (id: string, detail: 'arrival' | 'decay', at: number) => ({
    id,
    subject: 'Efa Moon Drill',
    detail,
    deadlineMs: at,
  });
  const feeds = (chunks: ReturnType<typeof chunk>[]): Feeds => ({
    moonChunks: ok({
      chunks,
      needsReauth: false,
      fetchedAt: new Date(NOW),
      loadedAt: NOW,
    }) as never,
  });

  it('tells two chunks on one refinery apart by event and clock', () => {
    const view = buildView(
      'moonChunks',
      feeds([chunk('a', 'arrival', NOW + DAY), chunk('b', 'arrival', NOW + 3 * DAY)]),
      ctx()
    );
    const inAt = column(view, 'in');
    expect(view.table!.rows.map((r) => text(r.cells[inAt]))).toEqual(['1d 0h', '3d 0h']);
    expect(visibleColumns(view.table!.columns, 'S').map((c) => c.key)).toEqual(['drill', 'in']);
  });

  it('shows the drill and the queue behind it as the fact the countdown lacks', () => {
    const view = buildView(
      'moonChunks',
      feeds([chunk('a', 'arrival', NOW + DAY), chunk('b', 'arrival', NOW + 3 * DAY)]),
      ctx()
    );
    expect(view.number.secondary?.text).toContain('overview.widgets.moonChunks.queued');
    expect(view.number.secondary?.text).toContain('"count":2');
  });
});

describe('incursions', () => {
  const row = (
    constellationId: number,
    stagingSystemId: number,
    jumps: number | null,
    over = {}
  ) => ({
    constellationId,
    stagingSystemId,
    state: 'established' as const,
    influence: 0.62,
    hasBoss: true,
    systemCount: 3,
    jumps,
    ...over,
  });
  const feeds = (rows: object[], jumpsStatus = 'ready'): Feeds => ({
    incursions: ok({
      status: 'ready',
      rows,
      jumpsStatus,
      systemNames: new Map([
        [100, 'Perimeter'],
        [200, 'Otela'],
      ]),
      constellationNames: new Map([[1, 'Kimotoro']]),
    }) as never,
  });

  it('leads with the jumps to the nearest and names it with the active count', () => {
    const view = buildView('incursions', feeds([row(1, 100, 1), row(2, 200, 6)]), ctx());
    expect(view.number.value).toBe('1');
    expect(view.number.unit).toContain('overview.widgets.incursions.jumpsAway');
    expect(view.number.secondary?.text).toContain('Perimeter');
    expect(view.number.secondary?.text).toContain('"count":2');
  });

  it('falls back to the active count with no origin to count from', () => {
    const view = buildView('incursions', feeds([row(1, 100, null)], 'no-origin'), ctx());
    expect(view.number.value).toBe('1');
    expect(view.number.unit).toBe('overview.widgets.incursions.unit');
    expect(view.number.secondary).toBeUndefined();
  });

  it('has system, jumps, state with a boss marker, and influence', () => {
    const view = buildView('incursions', feeds([row(1, 100, 1)]), ctx());
    const cells = view.table!.rows[0]!.cells.map(text);
    expect(cells[0]).toBe('Perimeter');
    expect(cells[column(view, 'influence')]).toBe('62%');
    expect(cells[column(view, 'state')]).toContain('withBoss');
    expect(visibleColumns(view.table!.columns, 'S').map((c) => c.key)).toEqual(['system', 'jumps']);
  });

  it('drops influence and constellation on a narrow box so the system name keeps its width', () => {
    const view = buildView('incursions', feeds([row(1, 100, 1)]), ctx());
    expect(view.table!.columns.filter((c) => c.hideNarrow).map((c) => c.key)).toEqual([
      'influence',
      'constellation',
    ]);
  });
});

describe('profit (world)', () => {
  const run = (id: string, ago: number, profit: number, productTypeID = 1, quantity = 4) => ({
    runId: id,
    productTypeID,
    quantity,
    loggedAt: NOW - ago,
    profit,
    status: 'closed' as const,
  });
  const feeds = (runs: ReturnType<typeof run>[]): Feeds => ({
    profit: ok({ runs, names: new Map([[1, 'Raven']]) }),
  });

  it('compares with the window before and says whether it is up or down', () => {
    const view = buildView(
      'profit',
      feeds([run('a', DAY, 300), run('b', 40 * DAY, 100)]),
      ctx({ range: 30 })
    );
    expect(view.number.secondary).toMatchObject({ direction: 'up', tone: 'good' });
    expect(view.number.secondary?.text).toContain('"count":30');
    const down = buildView(
      'profit',
      feeds([run('a', DAY, 50), run('b', 40 * DAY, 100)]),
      ctx({ range: 30 })
    );
    expect(down.number.secondary).toMatchObject({ direction: 'down', tone: 'bad' });
  });

  it('claims no change against a window with no runs', () => {
    const view = buildView('profit', feeds([run('a', DAY, 300)]), ctx({ range: 30 }));
    expect(view.number.secondary).toBeUndefined();
  });

  it('has per-unit profit and draws a loss below the axis', () => {
    const view = buildView(
      'profit',
      feeds([run('a', DAY, 400, 1, 4), run('b', 10 * DAY, -100, 1, 1)]),
      ctx({ range: 30 })
    );
    const row = view.table!.rows[0]!;
    expect(row.cells[column(view, 'built')]).toBe('5');
    expect(text(row.cells[column(view, 'perUnit')])).toBe('+60');
    expect(row.cells[column(view, 'perUnit')]).toMatchObject({ tone: 'good' });
    const loss = buildView('profit', feeds([run('c', DAY, -100, 1, 2)]), ctx({ range: 30 }));
    expect(loss.table!.rows[0]!.cells[column(loss, 'perUnit')]).toMatchObject({
      text: '-50',
      tone: 'bad',
    });
    if (view.chart?.kind !== 'bars') throw new Error('bars');
    expect(view.chart.values.some((v) => v < 0)).toBe(true);
  });
});

describe('miningYield (world)', () => {
  const data = (ores: { typeId: number; isk: number; units?: number }[]) =>
    ok({
      rows: [
        { characterId: 91, date: '2026-10-11', isk: ores.reduce((s, o) => s + o.isk, 0), ores },
      ],
      typeNames: new Map([
        [1, 'Veldspar'],
        [2, 'Scordite'],
      ]),
      trackedIds: [91],
      reauthIds: [],
      oldestSaved: '2026-10-01',
      fetchedAt: new Date(NOW),
    });

  it('draws the average as a reference line on the bars', () => {
    const view = buildView(
      'miningYield',
      { miningYield: data([{ typeId: 1, isk: 700 }]) },
      ctx({ range: 7 })
    );
    if (view.chart?.kind !== 'bars') throw new Error('bars');
    expect(view.chart.ref?.value).toBe(100);
  });

  it('has an ISK and share column, and Units only when the ledger carried them', () => {
    const without = buildView(
      'miningYield',
      { miningYield: data([{ typeId: 1, isk: 700 }]) },
      ctx({ range: 7 })
    );
    expect(without.table!.columns.map((c) => c.key)).toEqual(['ore', 'isk', 'share']);
    const withUnits = buildView(
      'miningYield',
      {
        miningYield: data([
          { typeId: 1, isk: 600, units: 12000 },
          { typeId: 2, isk: 200, units: 3000 },
        ]),
      },
      ctx({ range: 7 })
    );
    expect(withUnits.table!.columns.map((c) => c.key)).toEqual(['ore', 'isk', 'share', 'units']);
    expect(text(withUnits.table!.rows[0]!.cells[2])).toBe('75%');
  });
});

describe('industry job slots', () => {
  const skills = (massProduction: number) => ({
    massProduction,
    advancedMassProduction: 0,
    laboratoryOperation: 0,
    advancedLaboratoryOperation: 0,
    massReactions: 0,
    advancedMassReactions: 0,
  });
  const job = (id: number, endOffset: number) => ({
    job_id: id,
    activity_id: 1,
    runs: 1,
    blueprint_type_id: 5,
    product_type_id: 6,
    station_id: 60003760,
    start_date: iso(NOW + endOffset - HOUR),
    end_date: iso(NOW + endOffset),
    status: 'active',
  });
  // Header Character 91: 2 Mfg slots, one busy. Character 92: base slots, nothing running.
  const own = [job(1, 2 * HOUR)];
  const other = [job(2, -10 * MIN)];
  const feeds = (): Feeds => ({
    industry: ok({
      jobs: own,
      allJobs: [...own, ...other],
      productNames: new Map([
        [1, 'Item 1'],
        [2, 'Item 2'],
      ]),
      slots: [
        {
          characterId: 91,
          characterName: 'Kestrel Vane',
          skills: skills(1),
          jobs: [{ activityId: 1, endMs: NOW + 2 * HOUR }],
        },
        { characterId: 92, characterName: 'Orsa Tellemar', skills: skills(0), jobs: [] },
      ],
      needsReauth: false,
      fetchedAt: new Date(NOW),
    }) as never,
  });

  it('adds the header Character’s free slots to the Number view and keeps the jobs table', () => {
    const view = buildView('industry', feeds(), ctx());
    expect(view.number.notes).toEqual(['overview.widgets.industry.slotsFree{"count":3}']);
    expect(view.number.value).toBe('1');
    expect(view.number.unit).toBe('overview.widgets.industry.running');
    expect(view.table!.columns[0].key).toBe('job');
    expect(view.chart!.kind).toBe('gantt');
  });

  it('on All characters counts every Character’s jobs and free slots', () => {
    const view = buildView('industry', feeds(), ctx({ scopeAll: true }));
    expect(view.number.notes).toEqual(['overview.widgets.industry.slotsFree{"count":6}']);
    expect(view.number.value).toBe('1');
    expect(view.number.unit).toBe('overview.widgets.industry.ready');
  });

  it('on All characters tables free / max slots per Character and pool', () => {
    const view = buildView('industry', feeds(), ctx({ scopeAll: true }));
    const table = view.table!;
    expect(table.columns.map((c) => c.key)).toEqual(['character', 'mfg', 'sci', 'react']);
    expect(table.rows.map((row) => row.cells.map(text))).toEqual([
      ['Kestrel Vane', '1/2', '1/1', '1/1'],
      ['Orsa Tellemar', '1/1', '1/1', '1/1'],
    ]);
    expect(table.footer).toBe('overview.widgets.industry.slotsFooter');
  });

  it('on All characters charts free slots per Character as bars', () => {
    const chart = buildView('industry', feeds(), ctx({ scopeAll: true })).chart!;
    expect(chart.kind).toBe('hbars');
    if (chart.kind !== 'hbars') return;
    expect(chart.rows.map((row) => [row.label, row.text, row.share])).toEqual([
      ['Kestrel Vane', 'overview.widgets.industry.slotsOf{"free":3,"max":4}', 1],
      ['Orsa Tellemar', 'overview.widgets.industry.slotsOf{"free":3,"max":3}', 1],
    ]);
  });

  it('never counts an over-capacity pool as negative free slots', () => {
    const view = buildView(
      'industry',
      {
        industry: ok({
          jobs: [],
          productNames: new Map(),
          slots: [
            {
              characterId: 91,
              characterName: 'Kestrel Vane',
              skills: skills(0),
              jobs: [
                { activityId: 1, endMs: NOW + HOUR },
                { activityId: 1, endMs: NOW + HOUR },
              ],
            },
          ],
          needsReauth: false,
          fetchedAt: new Date(NOW),
        }) as never,
      },
      ctx()
    );
    expect(view.number.notes).toEqual(['overview.widgets.industry.slotsFree{"count":2}']);
  });

  it('says nothing about slots when no Character’s skills are known', () => {
    const view = buildView(
      'industry',
      {
        industry: ok({
          jobs: own,
          productNames: new Map([[1, 'Item 1']]),
          needsReauth: false,
          fetchedAt: new Date(NOW),
        }) as never,
      },
      ctx()
    );
    expect(view.number.notes).toBeUndefined();
  });
});
