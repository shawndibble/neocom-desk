import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  VolumeFold,
  foldHistoryBz2,
  foldHistoryCsv,
  historyDayUrl,
  historyWindow,
} from './marketHistoryVolume.js';

const CSV = [
  'average,date,highest,lowest,order_count,volume,http_last_modified,region_id,type_id',
  '1.7,2026-10-24,1.7,1.7,8,300,2026-10-25T11:03:42Z,10000002,34',
  '1.7,2026-10-24,1.7,1.7,8,30,2026-10-25T11:03:42Z,10000043,34',
  '1.7,2026-10-24,1.7,1.7,8,9,2026-10-25T11:03:42Z,10000001,34',
  '1.7,2026-10-24,1.7,1.7,8,0,2026-10-25T11:03:42Z,10000002,35',
  '',
].join('\n');

describe('historyWindow', () => {
  it('lists the days before today, newest first', () => {
    const days = historyWindow(new Date('2026-10-25T00:30:00Z'), 3);
    expect(days).toEqual(['2026-10-24', '2026-10-23', '2026-10-22']);
  });
});

describe('historyDayUrl', () => {
  it('points at the year directory of EVE Ref', () => {
    expect(historyDayUrl('2026-10-24')).toBe(
      'https://data.everef.net/market-history/2026/market-history-2026-10-24.csv.bz2'
    );
  });
});

describe('VolumeFold', () => {
  it('averages over the days given, tracking only hub regions and traded types', async () => {
    const fold = new VolumeFold();
    expect(await foldHistoryCsv(Readable.from([CSV]), fold)).toBe(4);
    await foldHistoryCsv(Readable.from([CSV]), fold);
    expect(fold.perDay(10000002, 4)).toEqual({ 34: 150 });
    expect(fold.perDay(10000043, 4)).toEqual({ 34: 15 });
    expect(fold.perDay(10000001, 4)).toEqual({});
  });

  it('never rounds a real trade down to zero', () => {
    const fold = new VolumeFold();
    fold.add(10000002, 34, 1);
    expect(fold.perDay(10000002, 30)).toEqual({ 34: 0.03 });
    fold.add(10000002, 35, 0.01);
    expect(fold.perDay(10000002, 30)[35]).toBe(0.01);
  });

  it('survives chunk boundaries and rejects a file without the columns', async () => {
    const fold = new VolumeFold();
    await foldHistoryCsv(Readable.from([CSV.slice(0, 120), CSV.slice(120)]), fold);
    expect(fold.perDay(10000002, 1)).toEqual({ 34: 300 });
    await expect(
      foldHistoryCsv(Readable.from(['date,type_id\n2026-10-24,34\n']), new VolumeFold())
    ).rejects.toThrow(/missing a column/);
  });

  it('reads a bzip2 file', async () => {
    let bz2: Buffer;
    try {
      bz2 = execFileSync('bzip2', ['-c'], { input: CSV });
    } catch {
      return; // no bzip2 binary on this machine
    }
    const fold = new VolumeFold();
    await foldHistoryBz2(Readable.from([bz2]), fold);
    expect(fold.perDay(10000002, 1)).toEqual({ 34: 300 });
  });
});

describe('VolumeFold.demandFor', () => {
  // The same points and aggregate as src/engine/market/haulingMarket.test.ts reads.
  const ASOF = '2026-10-15';
  const day = (
    date: string,
    volume: number,
    highest: number,
    lowest: number,
    orderCount: number
  ) => ({
    date,
    volume,
    highest,
    lowest,
    orderCount,
  });
  const fold = () => {
    const f = new VolumeFold();
    for (const d of [
      day('2026-10-14', 10, 120, 100, 4),
      day('2026-10-13', 30, 110, 90, 6),
      day('2026-10-12', 20, 130, 100, 2),
      day('2026-10-10', 0, 500, 1, 9),
      day('2026-10-06', 50, 100, 80, 8),
      day('2026-09-05', 999, 1, 1, 1),
    ]) {
      f.addDay(10000002, 34, d);
    }
    return f;
  };

  it('folds the facts summarizeDemand reads, over the window only', () => {
    expect(fold().demandFor(10000002, ASOF, 30)).toEqual({
      34: [110, 4, 20, 110, '2026-10-14', 120, 100],
    });
  });

  it('falls back to the window for the price when nothing traded in the last 7 days', () => {
    const f = new VolumeFold();
    f.addDay(10000002, 34, day('2026-10-01', 10, 200, 150, 5));
    f.addDay(10000002, 34, day('2026-10-02', 30, 100, 90, 5));
    expect(f.demandFor(10000002, ASOF, 30)[34]![3]).toBe(100);
  });

  it('leaves perDay as it was', () => {
    expect(fold().perDay(10000002, 30)).toEqual({ 34: Math.round(((1109 + 0) / 30) * 100) / 100 });
  });

  it('reads the price columns from a file when it has them', async () => {
    const f = new VolumeFold();
    await foldHistoryCsv(Readable.from([CSV]), f);
    expect(f.demandFor(10000002, '2026-10-24', 30)).toEqual({
      34: [300, 1, 8, 1.7, '2026-10-24', 1.7, 1.7],
    });
  });
});
