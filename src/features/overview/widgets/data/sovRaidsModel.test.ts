import { describe, expect, it } from 'vitest';
import type { SovRaidSkyhook, SovRaidsWidgetData } from './sovRaidsLoader';
import { buildView, ensureBuilders } from './models';
import { sovRaids } from './sovRaidsModel';
import type { BuildContext, Feeds } from './types';

const HOUR = 3_600_000;
const MIN = 60_000;
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
const W = 'travel.sovRaids';

const hook = (key: string, startMs: number, endMs: number, over: Partial<SovRaidSkyhook> = {}) => ({
  key,
  systemId: 30001190,
  holderId: 99 as number | null,
  planetName: `${key} IV`,
  window: { startMs: NOW + startMs, endMs: NOW + endMs },
  ...over,
});

function data(over: Partial<SovRaidsWidgetData> = {}): SovRaidsWidgetData {
  return {
    alliance: { id: 99, name: 'Test Alliance' },
    holdsSov: true,
    skyhooks: [],
    holderNames: new Map([[77, 'Brave Collective']]),
    systemNames: new Map([[30001190, 'X-7OMU']]),
    jumps: new Map([[30001190, 7]]),
    fetchedAt: new Date(0),
    fromCache: false,
    freshForMs: 10 * MIN,
    ...over,
  };
}

const feeds = (over: Partial<SovRaidsWidgetData> = {}): Feeds => ({
  sovRaids: { loading: false, error: false, data: data(over) },
});

describe('sovRaids', () => {
  it('counts live raids, names the open one with its jumps, and goes critical', () => {
    const view = sovRaids(
      feeds({
        skyhooks: [
          hook('Efa', 100 * MIN, 340 * MIN),
          hook('X7', -2 * HOUR, 80 * MIN),
          hook('Gone', -5 * HOUR, -HOUR),
        ],
      }),
      ctx
    );
    expect(view.number.value).toBe('2');
    expect(view.number.unit).toBe(`${W}.unit{"count":2}`);
    expect(view.number.secondary).toEqual({
      text: `${W}.nextOpenNow{"subject":"X7 IV"}, ${W}.jumps{"count":7}`,
      tone: 'bad',
    });
    expect(view.number.tone).toBe('critical');
    expect(view.to).toBe('/travel/route');
  });

  it('lists the soonest first, open before upcoming, with short window and jump cells', () => {
    const view = sovRaids(
      feeds({
        skyhooks: [hook('Efa', 100 * MIN, 340 * MIN), hook('X7', -2 * HOUR, 80 * MIN)],
        jumps: new Map(),
      }),
      ctx
    );
    expect(view.table?.rows.map((row) => row.cells)).toEqual([
      ['X7 IV', { text: `${W}.windowOpen{"duration":"1h 20m"}`, tone: 'bad' }, '—'],
      ['Efa IV', { text: `${W}.windowIn{"duration":"1h 40m"}`, tone: 'caution' }, '—'],
    ]);
    expect(view.table?.rows.map((row) => row.tone)).toEqual(['critical', 'warning']);
  });

  it('times an upcoming window, and drops the jumps when the origin is unknown', () => {
    const view = sovRaids(
      feeds({ skyhooks: [hook('Efa', 100 * MIN, 340 * MIN)], jumps: new Map() }),
      ctx
    );
    expect(view.number.secondary).toEqual({
      text: `${W}.nextOpensIn{"subject":"Efa IV","duration":"1h 40m"}`,
      tone: 'caution',
    });
    expect(view.number.tone).toBe('warning');
  });

  it('never times a window to the minute under the read window', () => {
    const view = sovRaids(feeds({ skyhooks: [hook('Efa', 4 * MIN, 2 * HOUR)] }), ctx);
    expect(view.table?.rows[0]?.cells[1]).toEqual({
      text: `${W}.windowIn{"duration":"${W}.underCacheWindow{\\"duration\\":\\"10m\\"}"}`,
      tone: 'caution',
    });
  });

  it('names a skyhook by its system when the planet was not read', () => {
    const view = sovRaids(
      feeds({ skyhooks: [hook('Efa', HOUR, 3 * HOUR, { planetName: null })] }),
      ctx
    );
    expect(view.table?.rows[0]?.cells[0]).toBe('X-7OMU');
  });

  it('opens a row modal with the window, who holds it, and where it is', () => {
    const view = sovRaids(
      feeds({ skyhooks: [hook('X7', -HOUR, 80 * MIN), hook('Efa', 100 * MIN, 340 * MIN)] }),
      ctx
    );
    expect(view.table?.rows[0]?.detail).toEqual({
      title: 'X7 IV',
      facts: [
        { label: `${W}.fact.window`, value: `${W}.fact.openNow{"closes":"1h 20m"}` },
        { label: `${W}.fact.heldBy`, value: 'Test Alliance' },
      ],
      place: { systemId: 30001190, name: 'X-7OMU', jumps: 7 },
    });
    expect(view.table?.rows[1]?.detail?.facts[0]?.value).toBe(
      `${W}.fact.upcoming{"opens":"1h 40m","closes":"5h 40m"}`
    );
  });

  it('offers each upcoming window to the header Next, never one already open', () => {
    const view = sovRaids(
      feeds({ skyhooks: [hook('X7', -HOUR, HOUR), hook('Efa', 100 * MIN, 340 * MIN)] }),
      ctx
    );
    expect(view.deadlines).toEqual([
      {
        at: NOW + 100 * MIN,
        note: `${W}.deadline{"subject":"Efa IV"}`,
        severity: 'warning',
        to: '/travel/route',
      },
    ]);
  });

  it('keeps a skyhook with no readable window as unknown, never safe', () => {
    const view = sovRaids(
      feeds({ skyhooks: [{ ...hook('Efa', 0, 0), window: null }, hook('X7', HOUR, 3 * HOUR)] }),
      ctx
    );
    expect(view.number.value).toBe('2');
    expect(view.table?.rows.map((row) => row.cells.slice(0, 2))).toEqual([
      ['X7 IV', { text: `${W}.windowIn{"duration":"1h 0m"}`, tone: 'caution' }],
      ['Efa IV', '—'],
    ]);
    expect(view.table?.rows[1]?.tone).toBe('warning');
    expect(view.table?.rows[1]?.detail?.facts[0]?.value).toBe('—');
  });

  it('keeps Set destination and jumps when only the system names are unread', () => {
    const view = sovRaids(
      feeds({ skyhooks: [hook('X7', HOUR, 3 * HOUR)], systemNames: new Map() }),
      ctx
    );
    expect(view.table?.rows[0]?.detail?.place).toEqual({
      systemId: 30001190,
      name: 'X7 IV',
      jumps: 7,
    });
  });

  it('says how old an empty answer is once the read is past its window', () => {
    const fresh = sovRaids(feeds({ fetchedAt: new Date(NOW - 5 * MIN) }), ctx);
    expect(fresh.emptyHint).toBeUndefined();
    const old = sovRaids(feeds({ fetchedAt: new Date(NOW - 3 * HOUR) }), ctx);
    expect(old.status.isEmpty).toBe(true);
    expect(old.emptyHint).toMatch(/^travel\.sovRaids\.staleEmpty/);
  });

  it('is empty with nothing raidable, not a lock', () => {
    const view = sovRaids(feeds({ skyhooks: [hook('Gone', -3 * HOUR, -HOUR)] }), ctx);
    expect(view.status.isEmpty).toBe(true);
    expect(view.status.needsPermission).toBe(false);
    expect(view.number.value).toBe('0');
    expect(view.emptyMessage).toBeUndefined();
  });

  it('says why when the Character is in no alliance', () => {
    const view = sovRaids(feeds({ alliance: null, holdsSov: false }), ctx);
    expect(view.status.isEmpty).toBe(true);
    expect(view.status.needsPermission).toBe(false);
    expect(view.emptyMessage).toBe(`${W}.noAlliance`);
  });

  it('says why when the alliance holds no sov', () => {
    const view = sovRaids(feeds({ holdsSov: false }), ctx);
    expect(view.status.isEmpty).toBe(true);
    expect(view.emptyMessage).toBe(`${W}.noSov`);
  });

  it('waits for the read before saying anything', () => {
    const view = sovRaids({ sovRaids: { loading: true, error: false, data: null } }, ctx);
    expect(view.status.loading).toBe(true);
    expect(view.status.isEmpty).toBe(false);
  });
});

describe('sovRaids My alliance', () => {
  it("lists only the Character's alliance, whoever else is raidable", () => {
    const view = sovRaids(
      feeds({
        skyhooks: [hook('Ours', HOUR, 3 * HOUR), hook('Theirs', HOUR, 3 * HOUR, { holderId: 77 })],
      }),
      ctx
    );
    expect(view.table?.rows.map((row) => row.key)).toEqual(['Ours']);
    expect(view.number.value).toBe('1');
  });
});

describe('sovRaids Near me', () => {
  const near: BuildContext = { ...ctx, raidsWhere: 'near', raidsRadius: 8 };
  const FAR = 30002000;
  const jumps = new Map([
    [30001190, 3],
    [FAR, 12],
  ]);

  it('lists any holder within the radius, open first, and marks your alliance', () => {
    const view = sovRaids(
      feeds({
        jumps,
        skyhooks: [
          hook('Soon', HOUR, 3 * HOUR, { holderId: 77 }),
          hook('Open', -HOUR, 2 * HOUR, { holderId: 77 }),
          hook('Mine', 2 * HOUR, 4 * HOUR),
        ],
      }),
      near
    );
    expect(view.table?.rows.map((row) => row.cells)).toEqual([
      [
        'Open IV',
        { text: `${W}.windowOpen{"duration":"2h 0m"}`, tone: 'good' },
        '3',
        'Brave Collective',
      ],
      ['Soon IV', `${W}.windowIn{"duration":"1h 0m"}`, '3', 'Brave Collective'],
      [
        'Mine IV',
        { text: `${W}.windowIn{"duration":"2h 0m"}`, tone: 'caution' },
        '3',
        { text: `${W}.near.yourAlliance`, tone: 'caution' },
      ],
    ]);
    expect(view.table?.columns.map((c) => c.key)).toEqual(['skyhook', 'window', 'jumps', 'held']);
    expect(view.table?.columns[3]?.priority).toBe(3);
    expect(view.number.value).toBe('3');
    expect(view.number.unit).toBe(`${W}.near.unit{"count":3,"radius":8}`);
    expect(view.number.tone).toBe('clear');
    expect(view.number.secondary?.tone).toBe('good');
    expect(view.table?.footer).toBeUndefined();
  });

  it('turns an open window amber with under ten minutes left, with the words', () => {
    const view = sovRaids(
      feeds({ jumps, skyhooks: [hook('Late', -HOUR, 9 * MIN, { holderId: 77 })] }),
      near
    );
    expect(view.table?.rows[0]?.cells[1]).toEqual({
      text: `${W}.windowOpen{"duration":"${W}.underCacheWindow{\\"duration\\":\\"10m\\"}"}`,
      tone: 'caution',
    });
    expect(view.number.secondary?.tone).toBe('caution');
  });

  it('says how many the radius cut, and honours a wider radius', () => {
    const skyhooks = [
      hook('Near', HOUR, 3 * HOUR, { holderId: 77 }),
      hook('Far', HOUR, 3 * HOUR, { holderId: 77, systemId: FAR }),
    ];
    const cut = sovRaids(feeds({ jumps, skyhooks }), near);
    expect(cut.table?.footer).toBe(`${W}.near.beyond{"count":1,"radius":8}`);
    expect(cut.number.value).toBe('1');
    const wide = sovRaids(feeds({ jumps, skyhooks }), { ...near, raidsRadius: 15 });
    expect(wide.number.value).toBe('2');
    expect(wide.table?.footer).toBeUndefined();
  });

  it('works for a Character in no alliance', () => {
    const view = sovRaids(
      feeds({
        alliance: null,
        holdsSov: false,
        jumps,
        skyhooks: [hook('Open', -HOUR, 2 * HOUR, { holderId: 77 })],
      }),
      near
    );
    expect(view.number.value).toBe('1');
    expect(view.emptyMessage).toBeUndefined();
  });

  it('feeds Next only the own alliance windows still ahead', () => {
    const view = sovRaids(
      feeds({
        jumps,
        skyhooks: [
          hook('Theirs', HOUR, 3 * HOUR, { holderId: 77 }),
          hook('Mine', 2 * HOUR, 4 * HOUR),
        ],
      }),
      near
    );
    expect(view.deadlines.map((d) => d.note)).toEqual([`${W}.deadline{"subject":"Mine IV"}`]);
  });

  it('opens a row modal naming the holder', () => {
    const view = sovRaids(
      feeds({ jumps, skyhooks: [hook('Theirs', HOUR, 3 * HOUR, { holderId: 77 })] }),
      near
    );
    expect(view.table?.rows[0]?.detail?.facts[1]).toEqual({
      label: `${W}.fact.heldBy`,
      value: 'Brave Collective',
    });
    expect(view.table?.rows[0]?.detail?.place?.jumps).toBe(3);
  });

  it('says none within the radius, with the stale age once the read is old', () => {
    const fresh = sovRaids(
      feeds({
        jumps,
        skyhooks: [hook('Far', HOUR, 3 * HOUR, { systemId: FAR })],
        fetchedAt: new Date(NOW - MIN),
      }),
      near
    );
    expect(fresh.status.isEmpty).toBe(true);
    expect(fresh.emptyMessage).toBe(`${W}.near.none{"radius":8}`);
    expect(fresh.emptyHint).toBe(`${W}.near.noneHint`);
    expect(fresh.table?.footer).toBeUndefined();
    const old = sovRaids(feeds({ jumps, fetchedAt: new Date(NOW - 3 * HOUR) }), near);
    expect(old.emptyHint).toMatch(/^travel\.sovRaids\.staleEmpty/);
  });

  it('says the location is unknown, guessing nothing, when no distance is known', () => {
    const view = sovRaids(
      feeds({ jumps: new Map(), skyhooks: [hook('Open', -HOUR, 2 * HOUR, { holderId: 77 })] }),
      near
    );
    expect(view.number.value).toBe('0');
    expect(view.emptyMessage).toBe(`${W}.near.locationUnknown`);
    expect(view.emptyHint).toBe(`${W}.near.locationUnknownHint`);
  });
});

describe('the Overview stand-in', () => {
  it('reads as loading until the lazy builder lands, then draws the read', async () => {
    const read = feeds({ skyhooks: [hook('X7', -HOUR, HOUR)] });
    expect(buildView('sovRaids', read, ctx).status.loading).toBe(true);
    expect(
      buildView('sovRaids', { sovRaids: { loading: false, error: true, data: null } }, ctx).status
    ).toMatchObject({ loading: false, error: true });
    await ensureBuilders(['sovRaids']);
    expect(buildView('sovRaids', read, ctx).number.value).toBe('1');
  });
});
