import { describe, expect, it, vi } from 'vitest';
import {
  OpenPriceFold,
  SNAPSHOT_HUBS,
  StationPriceFold,
} from '../../functions/src/marketOpenPrices.ts';
import {
  OpenPriceTable,
  checkBucket,
  foldDays,
  parseArgs,
  runBackfill,
} from './backfillMarketOpenPrices.mjs';

const base = ['--from', '2026-10-01', '--to', '2026-10-03'];

describe('parseArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseArgs(base)).toMatchObject({ write: false, yes: false });
  });
  it('--write needs a bucket', () => {
    expect(() => parseArgs([...base, '--write'])).toThrow(/--bucket/);
    expect(parseArgs([...base, '--write', '--bucket', 'b'])).toMatchObject({
      write: true,
      bucket: 'b',
    });
  });
  it('reads --yes and lets --dry-run turn writing off', () => {
    expect(parseArgs([...base, '--write', '--bucket', 'b', '--yes'])).toMatchObject({ yes: true });
    expect(parseArgs([...base, '--write', '--bucket', 'b', '--dry-run']).write).toBe(false);
  });
  it('rejects bad dates, order and flags, including the retired --project and --chunk-days', () => {
    expect(() => parseArgs(['--to', '2026-10-03'])).toThrow(/YYYY-MM-DD/);
    expect(() => parseArgs(['--from', '2026-10-04', '--to', '2026-10-03'])).toThrow(/after/);
    expect(() => parseArgs([...base, '--x'])).toThrow(/unknown/);
    expect(() => parseArgs([...base, '--project', 'p'])).toThrow(/unknown/);
    expect(() => parseArgs([...base, '--chunk-days', '30'])).toThrow(/unknown/);
    expect(() => parseArgs([...base, '--write-only'])).toThrow(/unknown/);
  });
});

describe('checkBucket', () => {
  it('refuses a missing or different R2_BUCKET', () => {
    expect(checkBucket({ envBucket: undefined, bucket: 'b', yes: true })).toEqual({
      refuse: expect.stringMatching(/not set/),
    });
    expect(checkBucket({ envBucket: 'other', bucket: 'b', yes: true })).toEqual({
      refuse: expect.stringMatching(/different bucket/),
    });
  });
  it('a matching bucket asks for the typed name unless --yes', () => {
    expect(checkBucket({ envBucket: 'b', bucket: 'b', yes: false })).toEqual({ prompt: true });
    expect(checkBucket({ envBucket: 'b', bucket: 'b', yes: true })).toEqual({ prompt: false });
  });
});

const JITA = 60003760;
const AMARR = 60008494;

// A region fold that passes the plausibility guard: every tracked region with a few types.
function plausible(price, types = 2000) {
  const fold = new OpenPriceFold();
  for (const region of [10000002, 10000043, 10000032, 10000030, 10000042]) {
    for (let t = 1; t <= types; t++) fold.add(region, t, true, price);
  }
  return fold;
}

describe('OpenPriceTable', () => {
  it('regroups the folded station days by object, days ascending, nulls kept per side', () => {
    const a = new StationPriceFold(SNAPSHOT_HUBS);
    a.add(JITA, 34, true, 1);
    a.add(JITA, 34, false, 2);
    const b = new StationPriceFold(SNAPSHOT_HUBS);
    b.add(JITA, 34, false, 3);
    b.add(AMARR, 35, true, 4);
    const table = new OpenPriceTable();
    table.addDay('2026-10-01', a);
    table.addDay('2026-10-02', b);
    expect(table.size).toBe(2); // types 34 and 35
    expect(table.dates).toEqual(['2026-10-01', '2026-10-02']);
    // Two Float64Arrays (buy, sell) per day, sized to the station/type pairs known that day.
    expect(table.bytes).toBe((1 + 2) * 2 * 8);
    expect([...table.documents()]).toEqual([
      {
        typeId: 34,
        days: [
          { date: '2026-10-01', stations: { [JITA]: { buy: 1, sell: 2 } } },
          { date: '2026-10-02', stations: { [JITA]: { buy: null, sell: 3 } } },
        ],
      },
      {
        typeId: 35,
        days: [{ date: '2026-10-02', stations: { [AMARR]: { buy: 4, sell: null } } }],
      },
    ]);
  });
  it('gathers every hub station of a type into its one object', () => {
    const a = new StationPriceFold(SNAPSHOT_HUBS);
    a.add(JITA, 34, true, 1);
    a.add(AMARR, 35, true, 2);
    const b = new StationPriceFold(SNAPSHOT_HUBS);
    b.add(AMARR, 34, false, 3);
    const table = new OpenPriceTable();
    table.addDay('2026-10-01', a);
    table.addDay('2026-10-02', b);
    expect([...table.documents()][0]).toEqual({
      typeId: 34,
      days: [
        { date: '2026-10-01', stations: { [JITA]: { buy: 1, sell: null } } },
        { date: '2026-10-02', stations: { [AMARR]: { buy: null, sell: 3 } } },
      ],
    });
  });
  it('a pair a later day drops gets no entry for that day', () => {
    const a = new StationPriceFold(SNAPSHOT_HUBS);
    a.add(JITA, 34, true, 1);
    const table = new OpenPriceTable();
    table.addDay('2026-10-01', a);
    table.addDay('2026-10-02', new StationPriceFold(SNAPSHOT_HUBS));
    expect([...table.documents()][0].days).toEqual([
      { date: '2026-10-01', stations: { [JITA]: { buy: 1, sell: null } } },
    ]);
  });
});

function deps(over = {}) {
  return {
    from: '2026-10-01',
    to: '2026-10-03',
    write: true,
    snapshotUrlFor: vi.fn(async (d) => `https://x/${d}`),
    foldUrl: vi.fn(async (url, fold, stations) => {
      const price = Number(url.slice(-2));
      for (const e of plausible(price).entries()) fold.add(e.regionId, e.typeId, true, e.buy);
      for (let t = 1; t <= 2000; t++) stations.add(JITA, t, true, price);
      return 10;
    }),
    writeDocuments: vi.fn(async (docs) => [...docs].length),
    log: vi.fn(),
    ...over,
  };
}

describe('foldDays', () => {
  it('folds every day into the table and names the snapshot each came from', async () => {
    const d = deps();
    const table = new OpenPriceTable();
    expect(await foldDays({ ...d, table })).toEqual({ skipped: [] });
    expect(table.dates).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('from https://x/2026-10-01'));
  });
  it('keeps the hub-station prices, not the region-wide ones', async () => {
    const d = deps({
      to: '2026-10-01',
      foldUrl: async (url, fold, stations) => {
        for (const e of plausible(99).entries()) fold.add(e.regionId, e.typeId, true, e.buy);
        stations.add(JITA, 34, false, 7);
        return 1;
      },
    });
    const table = new OpenPriceTable();
    await foldDays({ ...d, table });
    expect([...table.documents()]).toEqual([
      { typeId: 34, days: [{ date: '2026-10-01', stations: { [JITA]: { buy: null, sell: 7 } } }] },
    ]);
  });
  it('skips missing and implausible days without keeping them', async () => {
    const d = deps({
      snapshotUrlFor: async (date) => (date === '2026-10-02' ? null : `https://x/${date}`),
      foldUrl: async (url, fold, stations) => {
        fold.add(10000002, 1, true, 1); // thin: fails the plausibility guard
        stations.add(JITA, 1, true, 1);
        return 1;
      },
    });
    const table = new OpenPriceTable();
    expect(await foldDays({ ...d, table })).toEqual({
      skipped: ['2026-10-01', '2026-10-02', '2026-10-03'],
    });
    expect(d.log).toHaveBeenCalledWith('2026-10-02: no final snapshot listed, skipped');
    expect(table.size).toBe(0);
  });
});

describe('runBackfill', () => {
  it('folds every day, then writes each document once with all its days', async () => {
    const d = deps();
    const result = await runBackfill(d);
    expect(d.writeDocuments).toHaveBeenCalledTimes(1);
    const [docs, total] = d.writeDocuments.mock.calls[0];
    expect(total).toBe(2000); // 2,000 types priced at Jita
    expect(result).toEqual({ written: 2000, skipped: [] });
    const first = docs[Symbol.iterator]().next().value;
    expect(first.days.map((x) => x.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });
  it('dry run folds the days but never writes', async () => {
    const d = deps({ write: false });
    expect((await runBackfill(d)).written).toBe(0);
    expect(d.writeDocuments).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/dry run: would write 2000 doc/));
  });
  it('says a stopped download resumes by re-running from --from, since nothing is written yet', async () => {
    const d = deps({
      foldUrl: async (url) => {
        if (url.endsWith('02')) throw new Error('reset');
        return 0;
      },
    });
    await expect(runBackfill(d)).rejects.toThrow('reset');
    expect(d.writeDocuments).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith(
      expect.stringContaining('nothing written; re-run with --from 2026-10-01')
    );
  });
  it('says a failed write is re-run as is, the merge being idempotent', async () => {
    const d = deps({
      writeDocuments: async () => {
        throw new Error('boom');
      },
    });
    await expect(runBackfill(d)).rejects.toThrow('boom');
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('re-run the same command'));
  });
  it('writes nothing when every day was skipped', async () => {
    const d = deps({ snapshotUrlFor: async () => null });
    expect(await runBackfill(d)).toMatchObject({ written: 0 });
    expect(d.writeDocuments).not.toHaveBeenCalled();
  });
});
