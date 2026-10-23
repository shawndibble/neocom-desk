import { describe, expect, it } from 'vitest';
import type { SovRaidSkyhook, SovRaidsWidgetData } from './sovRaidsLoader';
import { buildView, registerKindDefs } from './models';
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
  planetName: `${key} IV`,
  window: { startMs: NOW + startMs, endMs: NOW + endMs },
  ...over,
});

function data(over: Partial<SovRaidsWidgetData> = {}): SovRaidsWidgetData {
  return {
    alliance: { id: 99, name: 'Test Alliance' },
    holdsSov: true,
    skyhooks: [],
    systemNames: new Map([[30001190, 'X-7OMU']]),
    jumps: new Map([[30001190, 7]]),
    fetchedAt: new Date(0),
    fromCache: false,
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

describe('the Overview stand-in', () => {
  it('reads as loading until the lazy builder registers, then draws the read', () => {
    const read = feeds({ skyhooks: [hook('X7', -HOUR, HOUR)] });
    expect(buildView('sovRaids', read, ctx).status.loading).toBe(true);
    expect(
      buildView('sovRaids', { sovRaids: { loading: false, error: true, data: null } }, ctx).status
    ).toMatchObject({ loading: false, error: true });
    registerKindDefs({ sovRaids: { feeds: ['sovRaids'], build: sovRaids } });
    expect(buildView('sovRaids', read, ctx).number.value).toBe('1');
  });
});
