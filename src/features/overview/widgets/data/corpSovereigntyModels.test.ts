import { describe, expect, it } from 'vitest';
import type { CorpSovereigntyFeed, CorpSovereigntyRow } from './corpFeeds';
import { corpSovereignty, toBoardHubFuel, toBoardSovereignty } from './corpSovereigntyModels';
import type { BuildContext, Feeds } from './types';

const HOUR = 3_600_000;
const NOW = 1_000 * HOUR;
const GAS = 81143;
const t = (key: string, options?: Record<string, unknown>) =>
  options && Object.keys(options).length ? `${key}${JSON.stringify(options)}` : key;
const ctx: BuildContext = {
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: false,
  notTrainingAlert: false,
  range: 30,
};

const row = (over: Partial<CorpSovereigntyRow> = {}): CorpSovereigntyRow => ({
  key: 'skyhook:1',
  kind: 'skyhook',
  structureId: 1,
  systemId: 30000142,
  planetName: 'Jita IV',
  windowStartMs: NOW + 6 * HOUR,
  windowEndMs: NOW + 8 * HOUR,
  reagents: [{ typeId: GAS, secured: 800, unsecured: 400 }],
  state: 'ShieldVulnerable',
  hubBay: null,
  ...over,
});

const hub = (over: Partial<CorpSovereigntyRow> = {}): CorpSovereigntyRow =>
  row({
    key: 'hub:9',
    kind: 'hub',
    structureId: 9,
    systemId: 30002813,
    planetName: null,
    reagents: null,
    state: null,
    hubBay: { amount: 100, burningPerHour: 10, updatedMs: NOW - 2 * HOUR },
    ...over,
  });

function feedData(over: Partial<CorpSovereigntyFeed> = {}): CorpSovereigntyFeed {
  return {
    readable: true,
    needsReauth: false,
    fetchedAt: new Date(0),
    fromCache: false,
    rows: [row()],
    systemNames: new Map([
      [30000142, 'Jita'],
      [30002813, 'Tama'],
    ]),
    typeNames: new Map([[GAS, 'Magmatic Gas']]),
    prices: new Map([[GAS, 100_000]]),
    jumps: new Map([[30000142, 4]]),
    ...over,
  };
}

const feeds = (over: Partial<CorpSovereigntyFeed> = {}): Feeds => ({
  corpSovereignty: { loading: false, error: false, data: feedData(over) },
});

describe('corpSovereignty', () => {
  it('counts skyhooks raidable within 6h and names the soonest, with what it puts at risk', () => {
    const view = corpSovereignty(
      feeds({
        rows: [
          row(),
          row({ key: 'skyhook:2', windowStartMs: NOW + 9 * HOUR, windowEndMs: NOW + 11 * HOUR }),
          row({ key: 'skyhook:4', windowStartMs: NOW + 3 * HOUR, windowEndMs: NOW + 5 * HOUR }),
          row({ key: 'skyhook:3', windowStartMs: NOW - 5 * HOUR, windowEndMs: NOW - HOUR }),
          hub(),
        ],
      }),
      ctx
    );
    expect(view.number.value).toBe('2');
    expect(view.number.unit).toBe('overview.widgets.corpSovereignty.unit{"count":2}');
    expect(view.number.secondary?.text).toBe(
      'overview.widgets.corpSovereignty.nextOpensIn{"subject":"Jita IV","duration":"3h 0m"}, ' +
        'overview.widgets.corpSovereignty.atRisk{"isk":"40M"}'
    );
  });

  it('tables one row per skyhook: planet, window, unsecured ISK; hubs stay out', () => {
    const view = corpSovereignty(feeds({ rows: [row(), hub()] }), ctx);
    expect(view.table!.rows).toHaveLength(1);
    const [first] = view.table!.rows;
    expect(first!.cells).toEqual([
      'Jita IV',
      'overview.widgets.corpSovereignty.windowIn{"duration":"6h 0m"}',
      { text: '40M', iskAmount: 40_000_000 },
    ]);
    expect(first!.tone).toBe('warning');
  });

  it('opens a detail modal instead of linking the row away', () => {
    const [first] = corpSovereignty(feeds(), ctx).table!.rows;
    expect(first!.to).toBeUndefined();
    expect(first!.detail).toMatchObject({
      title: 'Jita IV',
      place: { systemId: 30000142, name: 'Jita', jumps: 4 },
    });
    const labels = first!.detail!.facts.map((fact) => fact.label);
    expect(labels).toEqual([
      'overview.widgets.corpSovereignty.fact.window',
      'overview.widgets.corpSovereignty.fact.state',
      'overview.widgets.corpSovereignty.fact.unsecured',
      'overview.widgets.corpSovereignty.fact.secured',
    ]);
    expect(first!.detail!.facts[0]!.value).toBe(
      'overview.widgets.corpSovereignty.fact.windowUpcoming{"opens":"6h 0m","closes":"8h 0m"}'
    );
    expect(first!.detail!.facts[2]!.value).toBe('400 Magmatic Gas · 40,000,000 ISK');
  });

  it('states an open or closed window once, and an unknown structure state as unknown', () => {
    const open = corpSovereignty(
      feeds({
        rows: [row({ windowStartMs: NOW - HOUR, windowEndMs: NOW + 3 * HOUR, state: 'Odd' })],
      }),
      ctx
    ).table!.rows[0]!.detail!.facts;
    expect(open[0]!.value).toBe('overview.widgets.corpSovereignty.windowOpen{"duration":"3h 0m"}');
    expect(open[1]!.value).toBe('—');
    const closed = corpSovereignty(
      feeds({ rows: [row({ windowStartMs: NOW - 3 * HOUR, windowEndMs: NOW - HOUR })] }),
      ctx
    ).table!.rows[0]!.detail!.facts;
    expect(closed[0]!.value).toBe('overview.widgets.corpSovereignty.windowClosed');
  });

  it('shows units, never 0 ISK, when a reagent has no price or a zero one', () => {
    for (const prices of [new Map(), new Map([[GAS, 0]])]) {
      const [first] = corpSovereignty(feeds({ prices }), ctx).table!.rows;
      expect(first!.cells[2]).toBe('overview.widgets.corpSovereignty.units{"count":400}');
      expect(first!.detail!.facts[2]!.value).toBe('400 Magmatic Gas');
    }
  });

  it('says nothing is at risk when the silo holds no unsecured stock', () => {
    const view = corpSovereignty(
      feeds({ rows: [row({ reagents: [{ typeId: GAS, secured: 900, unsecured: 0 }] })] }),
      ctx
    );
    expect(view.table!.rows[0]!.cells[2]).toBe('overview.widgets.corpSovereignty.nothingAtRisk');
  });

  it('shows a skyhook with no read window or stock as unknown, not safe', () => {
    const view = corpSovereignty(
      feeds({
        rows: [row({ windowStartMs: null, windowEndMs: null, systemId: null, reagents: null })],
      }),
      ctx
    );
    const [first] = view.table!.rows;
    expect(first!.cells[1]).toBe('—');
    expect(first!.cells[2]).toBe('—');
    expect(first!.detail!.place).toBeUndefined();
    expect(first!.tone).toBe('clear');
  });

  it('falls back to the system name when the planet did not resolve', () => {
    const view = corpSovereignty(feeds({ rows: [row({ planetName: null })] }), ctx);
    expect(view.table!.rows[0]!.cells[0]).toBe('Jita');
  });

  it('marks an open window critical and keeps it out of the next deadline', () => {
    const view = corpSovereignty(
      feeds({ rows: [row({ windowStartMs: NOW - HOUR, windowEndMs: NOW + HOUR })] }),
      ctx
    );
    expect(view.table!.rows[0]!.tone).toBe('critical');
    expect(view.deadlines).toEqual([]);
  });

  it('shows a closed skyhook as closed', () => {
    const view = corpSovereignty(
      feeds({ rows: [row({ windowStartMs: NOW - 3 * HOUR, windowEndMs: NOW - HOUR })] }),
      ctx
    );
    expect(view.table!.rows[0]!.cells[1]).toBe('overview.widgets.corpSovereignty.windowClosed');
  });

  it('draws theft windows in the next 48 hours on a Gantt, with a bar fallback', () => {
    const view = corpSovereignty(
      feeds({
        rows: [
          row(),
          row({ key: 'skyhook:2', windowStartMs: NOW + 60 * HOUR, windowEndMs: NOW + 62 * HOUR }),
        ],
      }),
      ctx
    );
    const chart = view.chart;
    expect(chart?.kind).toBe('gantt');
    if (chart?.kind !== 'gantt') return;
    expect(chart.axis).toEqual({ from: NOW, to: NOW + 48 * HOUR, now: NOW });
    expect(chart.rows.map((r) => [r.label, r.startMs, r.endMs])).toEqual([
      ['Jita IV', NOW + 6 * HOUR, NOW + 8 * HOUR],
    ]);
    expect(chart.fallback.rows).toHaveLength(1);
  });

  it('has no chart when no window opens in the next 48 hours', () => {
    const view = corpSovereignty(
      feeds({ rows: [row({ windowStartMs: NOW + 60 * HOUR, windowEndMs: NOW + 62 * HOUR })] }),
      ctx
    );
    expect(view.chart).toBeUndefined();
  });

  it('feeds the next window and the soonest hub run-out to the header Next button', () => {
    const view = corpSovereignty(feeds({ rows: [row(), hub()] }), ctx);
    expect(view.deadlines.map((d) => d.at)).toEqual([NOW + 6 * HOUR, NOW + 8 * HOUR]);
  });

  it('is empty when the corporation has no skyhooks', () => {
    expect(corpSovereignty(feeds({ rows: [hub()] }), ctx).status.isEmpty).toBe(true);
  });
});

describe('toBoardSovereignty', () => {
  it('lends Due soon every window with both ends, named by planet or system', () => {
    expect(toBoardSovereignty(feedData({ rows: [row(), hub({ windowStartMs: null })] }))).toEqual([
      {
        id: 'skyhook:1',
        name: 'Jita IV',
        kind: 'skyhook',
        startMs: NOW + 6 * HOUR,
        endMs: NOW + 8 * HOUR,
      },
    ]);
  });
});

describe('toBoardHubFuel', () => {
  it('lends Due soon when each hub reagent bay runs out', () => {
    expect(toBoardHubFuel(feedData({ rows: [row(), hub()] }))).toEqual([
      { id: 'hub:9', name: 'Tama', runsOutMs: NOW + 8 * HOUR },
    ]);
  });

  it('skips a hub whose bay was not read or does not burn', () => {
    expect(
      toBoardHubFuel(
        feedData({
          rows: [
            hub({ hubBay: null }),
            hub({ key: 'hub:10', hubBay: { amount: 5, burningPerHour: 0, updatedMs: NOW } }),
          ],
        })
      )
    ).toEqual([]);
  });
});
