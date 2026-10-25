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
