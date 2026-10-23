import { describe, expect, it } from 'vitest';
import type { CorpSovereigntyFeed, CorpSovereigntyRow } from './corpFeeds';
import { corpSovereignty, toBoardSovereignty } from './corpSovereigntyModels';
import type { BuildContext, Feeds } from './types';

const HOUR = 3_600_000;
const NOW = 1_000 * HOUR;
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
  windowStartMs: NOW + 6 * HOUR,
  windowEndMs: NOW + 8 * HOUR,
  stock: 1200,
  hubBay: null,
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
    development: new Map([[30000142, { military: 3, industrial: 0, strategic: 5 }]]),
    jumps: new Map([[30000142, 4]]),
    ...over,
  };
}

const feeds = (over: Partial<CorpSovereigntyFeed> = {}): Feeds => ({
  corpSovereignty: { loading: false, error: false, data: feedData(over) },
});

describe('corpSovereignty', () => {
  it('counts raidable skyhooks and times the soonest opening', () => {
    const view = corpSovereignty(
      feeds({
        rows: [
          row(),
          row({ key: 'skyhook:2', windowStartMs: NOW + 9 * HOUR, windowEndMs: NOW + 11 * HOUR }),
          row({ key: 'skyhook:3', windowStartMs: NOW - 5 * HOUR, windowEndMs: NOW - HOUR }),
          row({ key: 'hub:4', kind: 'hub' }),
        ],
      }),
      ctx
    );
    expect(view.number.value).toBe('2');
    expect(view.number.unit).toBe('overview.widgets.corpSovereignty.unit{"count":2}');
    expect(view.number.secondary?.text).toContain('opensIn');
  });

  it('tables system, window, stock, development and jumps, linking the row to the route', () => {
    const view = corpSovereignty(feeds(), ctx);
    const [first] = view.table!.rows;
    expect(first!.cells).toEqual([
      'Jita',
      'overview.widgets.corpSovereignty.kind.skyhook',
      'overview.widgets.corpSovereignty.windowIn{"duration":"6h 0m"}',
      '1,200',
      '3 / 0 / 5',
      '4',
    ]);
    expect(first!.to).toContain('stops=30000142');
    expect(first!.tone).toBe('warning');
  });

  it('shows a skyhook with no read window as unknown, not safe', () => {
    const view = corpSovereignty(
      feeds({ rows: [row({ windowStartMs: null, windowEndMs: null, systemId: null })] }),
      ctx
    );
    const [first] = view.table!.rows;
    expect(first!.cells[2]).toBe('—');
    expect(first!.to).toBeUndefined();
    expect(first!.tone).toBe('clear');
  });

  it('runs a hub bay down to hours left', () => {
    const view = corpSovereignty(
      feeds({
        rows: [
          row({
            key: 'hub:9',
            kind: 'hub',
            stock: null,
            hubBay: { amount: 100, burningPerHour: 10, updatedMs: NOW - 2 * HOUR },
          }),
        ],
      }),
      ctx
    );
    expect(view.table!.rows[0]!.cells[3]).toBe(
      'overview.widgets.corpSovereignty.hubHours{"count":8}'
    );
  });

  it('marks an open window critical and keeps it out of the next deadline', () => {
    const view = corpSovereignty(
      feeds({ rows: [row({ windowStartMs: NOW - HOUR, windowEndMs: NOW + HOUR })] }),
      ctx
    );
    expect(view.table!.rows[0]!.tone).toBe('critical');
    expect(view.deadlines).toEqual([]);
  });

  it('shows a hub past its window end as overtime, critical, and not as closed', () => {
    const view = corpSovereignty(
      feeds({
        rows: [
          row({
            key: 'hub:9',
            kind: 'hub',
            stock: null,
            windowStartMs: NOW - 3 * HOUR,
            windowEndMs: NOW - HOUR,
          }),
        ],
      }),
      ctx
    );
    expect(view.table!.rows[0]!.cells[2]).toBe('overview.widgets.corpSovereignty.windowOvertime');
    expect(view.table!.rows[0]!.tone).toBe('critical');
  });

  it('shows a closed skyhook as closed', () => {
    const view = corpSovereignty(
      feeds({ rows: [row({ windowStartMs: NOW - 3 * HOUR, windowEndMs: NOW - HOUR })] }),
      ctx
    );
    expect(view.table!.rows[0]!.cells[2]).toBe('overview.widgets.corpSovereignty.windowClosed');
  });

  it('feeds the next window to the header Next button', () => {
    const view = corpSovereignty(feeds(), ctx);
    expect(view.deadlines).toHaveLength(1);
    expect(view.deadlines[0]!.at).toBe(NOW + 6 * HOUR);
  });

  it('is empty when the corporation has none', () => {
    expect(corpSovereignty(feeds({ rows: [] }), ctx).status.isEmpty).toBe(true);
  });
});

describe('toBoardSovereignty', () => {
  it('lends Due soon every window with both ends, named by system', () => {
    expect(
      toBoardSovereignty(
        feedData({ rows: [row(), row({ key: 'hub:2', kind: 'hub', windowStartMs: null })] })
      )
    ).toEqual([
      {
        id: 'skyhook:1',
        name: 'Jita',
        kind: 'skyhook',
        startMs: NOW + 6 * HOUR,
        endMs: NOW + 8 * HOUR,
      },
    ]);
  });
});
